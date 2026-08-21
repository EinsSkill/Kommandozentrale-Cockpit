/**
 * Phase 4 – personal Second-Brain context.
 *
 * Read-only by design:
 * - scans the configured inner Second-Brain folder in Drive;
 * - never writes, renames, moves or deletes files;
 * - keeps the complete vault as a retrieval scope, but returns only compact,
 *   source-linked context to the cockpit;
 * - sensitive pages are indexed for coverage but their content is blocked by
 *   default search/context responses.
 *
 * Required Apps-Script project property:
 *   SECOND_BRAIN_ROOT_ID=<inner Second Brain folder ID>
 */
const SBV4_CACHE_KEY = 'KZ_V4_SB_PERSONAL_CONTEXT';
const SBV4_ROOT_PROPERTY = 'SECOND_BRAIN_ROOT_ID';
const SBV4_ALLOW_SENSITIVE_PROPERTY = 'SECOND_BRAIN_ALLOW_SENSITIVE_SEARCH';
const SBV4_CACHE_SECONDS = 300;
const SBV4_MAX_SCAN_FILES = 400;
const SBV4_MAX_MATCHES = 10;
const SBV4_MAX_LINE_LENGTH = 360;

function refreshPersonalContextV1() {
  return getPersonalContextV1(true);
}

function getPersonalContextV1(force) {
  return cachedJson_(SBV4_CACHE_KEY, SBV4_CACHE_SECONDS, !!force, function () {
    const started = new Date().getTime();
    const rootId = String(PropertiesService.getScriptProperties().getProperty(SBV4_ROOT_PROPERTY) || '').trim();

    if (!rootId) {
      return {
        ok: false,
        configured: false,
        status: 'NOT_CONFIGURED',
        code: 'SECOND_BRAIN_ROOT_ID_MISSING',
        message: 'Second Brain ist noch nicht konfiguriert. Script Property SECOND_BRAIN_ROOT_ID setzen.',
        readOnly: true,
        timingMs: new Date().getTime() - started
      };
    }

    try {
      const root = DriveApp.getFolderById(rootId);
      const scan = sbv4Scan_(root);
      const schemaPresent = scan.files.some(function (file) {
        return file.path === '_System/SCHEMA.md';
      });
      const indexPresent = scan.files.some(function (file) {
        return file.path === '_System/index.md';
      });

      if (!schemaPresent || !indexPresent) {
        return {
          ok: false,
          configured: true,
          status: 'WRONG_ROOT',
          code: 'SECOND_BRAIN_CANONICAL_FILES_MISSING',
          message: 'Der konfigurierte Ordner ist nicht der innere kanonische Second-Brain-Vault.',
          readOnly: true,
          indexedFiles: scan.files.length,
          timingMs: new Date().getTime() - started
        };
      }

      const result = sbv4BuildContext_(root, scan);
      result.timingMs = new Date().getTime() - started;
      return result;
    } catch (e) {
      return {
        ok: false,
        configured: true,
        status: 'ERROR',
        code: 'SECOND_BRAIN_READ_FAILED',
        message: String(e && e.message ? e.message : e),
        readOnly: true,
        timingMs: new Date().getTime() - started
      };
    }
  });
}

/**
 * Search the complete indexed vault on demand.
 * includeSensitive remains false for the cockpit's normal UI path.
 */
function searchSecondBrainV1(query, includeSensitive) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return {
      ok: false,
      code: 'QUERY_TOO_SHORT',
      message: 'Bitte mindestens zwei Zeichen suchen.',
      matches: []
    };
  }

  const rootId = String(PropertiesService.getScriptProperties().getProperty(SBV4_ROOT_PROPERTY) || '').trim();
  if (!rootId) {
    return {
      ok: false,
      configured: false,
      code: 'SECOND_BRAIN_ROOT_ID_MISSING',
      message: 'SECOND_BRAIN_ROOT_ID fehlt.',
      matches: []
    };
  }

  try {
    const root = DriveApp.getFolderById(rootId);
    const scan = sbv4Scan_(root);
    const sensitiveSearchEnabled = String(PropertiesService.getScriptProperties().getProperty(SBV4_ALLOW_SENSITIVE_PROPERTY) || '').toUpperCase() === 'TRUE';
    const allowSensitive = sensitiveSearchEnabled && (includeSensitive === true || String(includeSensitive || '').toUpperCase() === 'TRUE');
    const terms = sbv4Normalize_(q).split(/\s+/).filter(function (term) {
      return term.length >= 2;
    });
    const matches = [];
    let blockedSensitive = 0;

    scan.files.forEach(function (file) {
      if (file.sensitivity === 'sensitive' && !allowSensitive) {
        blockedSensitive++;
        return;
      }

      const titleText = sbv4Normalize_(file.title + ' ' + file.path);
      const headingText = sbv4Normalize_(file.headings.join(' '));
      const bodyText = sbv4Normalize_(file.body);
      let score = 0;

      terms.forEach(function (term) {
        if (titleText.indexOf(term) >= 0) score += 10;
        if (headingText.indexOf(term) >= 0) score += 5;
        if (bodyText.indexOf(term) >= 0) score += 1;
      });

      if (score > 0) {
        matches.push({
          score: score,
          title: file.title,
          path: file.path,
          url: file.url,
          type: file.type,
          status: file.status,
          sensitivity: file.sensitivity,
          updated: file.updated,
          excerpt: sbv4Excerpt_(file.body, terms)
        });
      }
    });

    matches.sort(function (a, b) {
      return b.score - a.score || String(b.updated).localeCompare(String(a.updated));
    });

    return {
      ok: true,
      configured: true,
      readOnly: true,
      query: q,
      scannedFiles: scan.files.length,
      blockedSensitive: blockedSensitive,
      matches: matches.slice(0, SBV4_MAX_MATCHES).map(function (match) {
        delete match.score;
        return match;
      })
    };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      code: 'SECOND_BRAIN_SEARCH_FAILED',
      message: String(e && e.message ? e.message : e),
      matches: []
    };
  }
}

function sbv4Scan_(root) {
  const files = [];
  const visitedFolders = {};

  function walk(folder, prefix) {
    const folderId = String(folder.getId());
    if (visitedFolders[folderId]) return;
    visitedFolders[folderId] = true;

    const folders = folder.getFolders();
    while (folders.hasNext()) {
      const child = folders.next();
      const childName = child.getName();
      if (childName === '.obsidian') continue;
      walk(child, prefix ? prefix + '/' + childName : childName);
    }

    const iterator = folder.getFiles();
    while (iterator.hasNext() && files.length < SBV4_MAX_SCAN_FILES) {
      const file = iterator.next();
      const name = file.getName();
      if (!/\.md$/i.test(name)) continue;

      let body = '';
      try {
        body = file.getBlob().getDataAsString();
      } catch (e) {
        body = '';
      }

      files.push(sbv4ParseFile_(file, prefix ? prefix + '/' + name : name, body));
    }
  }

  walk(root, '');
  files.sort(function (a, b) {
    return a.path.localeCompare(b.path);
  });
  return { files: files };
}

function sbv4ParseFile_(file, path, body) {
  const frontmatterMatch = body.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
  const title = String(file.getName()).replace(/\.md$/i, '');
  const headings = [];
  body.replace(/^(#{1,3})\s+(.+)$/gm, function (_, marks, heading) {
    headings.push(String(heading).trim());
    return _;
  });

  const fileUpdated = file.getLastUpdated();
  const updated = sbv4Yaml_(frontmatter, 'updated') ||
    sbv4Yaml_(frontmatter, 'aktualisiert') ||
    (fileUpdated && !isNaN(fileUpdated.getTime()) ? fileUpdated.toISOString() : '');

  return {
    id: String(file.getId()),
    title: title,
    path: path,
    url: String(file.getUrl() || ''),
    type: sbv4Yaml_(frontmatter, 'type') || 'note',
    status: String(sbv4Yaml_(frontmatter, 'status') || 'active').toLowerCase(),
    sensitivity: String(sbv4Yaml_(frontmatter, 'sensitivity') || 'normal').toLowerCase(),
    tags: sbv4List_(sbv4Yaml_(frontmatter, 'tags')),
    updated: updated,
    headings: headings,
    body: body,
    bytes: body.length
  };
}

function sbv4BuildContext_(root, scan) {
  const files = scan.files;
  const schema = sbv4Find_(files, '_System/SCHEMA.md');
  const index = sbv4Find_(files, '_System/index.md');
  const map = sbv4Find_(files, '_System/Wissenslandkarte.md');
  const profile = sbv4Find_(files, '_System/Project_Instructions.md');
  const operating = sbv4Find_(files, 'Selbstentwicklung/Persoenliches-Betriebssystem.md');
  const interests = sbv4Find_(files, 'Selbstentwicklung/Interessen-und-Tech.md');
  const business = sbv4Find_(files, 'Business/Business-Betriebssystem.md');
  const learning = sbv4Find_(files, 'Ausbildung/Lernsystem.md');
  const technology = sbv4Find_(files, 'Ressourcen/Technologie-und-KI-Landkarte.md');
  const tasks = sbv4Find_(files, 'TASKS.md');

  const selected = [];
  [
    [schema, 'verbindliche Wahrheits-, Datenschutz- und Schreibregeln'],
    [index, 'kanonischer Wissenskatalog'],
    [map, 'Fragenrouten und Bereichsprioritäten'],
    [profile, 'bestätigte Kommunikations- und Profilregeln'],
    [operating, 'persönliches Arbeits- und Wochenmodell'],
    [interests, 'Interessen, Stil, Freizeit und Werkzeuge'],
    [business, 'Business-Portfolio und echte Engpässe'],
    [learning, 'Lernsystem und Nachweislogik'],
    [technology, 'KI-, Coding- und Automationsentscheidungen'],
    [tasks, 'langfristige Aufgabenübersicht']
  ].forEach(function (item) {
    const source = sbv4Source_(item[0], item[1]);
    if (source) selected.push(source);
  });

  [
    ['Business/AzubiPass.md', 'Business-Projekt'],
    ['Business/KitchenRise.md', 'Business-Projekt'],
    ['Business/Worksheet-Projekt.md', 'Business-Projekt'],
    ['Business/n8n.md', 'Lern- und Business-Projekt'],
    ['Ausbildung/KfB/KfB-Pruefungslandkarte.md', 'Ausbildungsroute'],
    ['Selbstentwicklung/Calisthenics.md', 'persönliches Körperprojekt']
  ].forEach(function (item) {
    const source = sbv4Source_(sbv4Find_(files, item[0]), item[1]);
    if (source) selected.push(source);
  });

  const uniqueSources = [];
  const sourcePaths = {};
  selected.forEach(function (source) {
    const key = source.path || source.title;
    if (sourcePaths[key]) return;
    sourcePaths[key] = true;
    uniqueSources.push(source);
  });

  const priorityLines = sbv4Numbered_(sbv4Section_(map && map.body, 'Priorität der Bereiche'), 5);
  const operatingRules = sbv4Bullets_(sbv4Section_(operating && operating.body, 'Regeln gegen Überlastung und Endlosbau'), 8);
  const dayStructure = sbv4Bullets_(sbv4Section_(operating && operating.body, 'Tagesplanung'), 6);
  const communication = sbv4Bullets_(sbv4Section_(profile && profile.body, 'Wie du mit mir kommunizierst'), 8);
  const goals = sbv4Numbered_(sbv4Section_(profile && profile.body, 'Hauptziele'), 5);
  const projectPortfolio = sbv4TableRows_(business && business.body, 'Portfolio und aktueller Engpass', 6);
  const toolRows = sbv4TableRows_(interests && interests.body, 'Tech-Stack', 8);

  const interestItems = [];
  const style = sbv4LabelValue_(interests && interests.body, 'Richtung');
  if (style) interestItems.push('Style: ' + style);
  const music = sbv4Bullets_(sbv4Section_(interests && interests.body, 'Musik'), 2);
  if (music.length) interestItems.push('Musik: ' + music.join(' · '));
  const gaming = sbv4Bullets_(sbv4Section_(interests && interests.body, 'Gaming'), 3);
  if (gaming.length) interestItems.push('Gaming: ' + gaming.join(' · '));
  const languages = sbv4Bullets_(sbv4Section_(interests && interests.body, 'Sprachen'), 2);
  if (languages.length) interestItems.push('Sprachen: ' + languages.join(' · '));

  const activeFiles = files.filter(function (file) {
    return file.status !== 'archived' && file.status !== 'superseded' && file.path.indexOf('_Archive/') !== 0;
  });
  const sensitiveFiles = files.filter(function (file) {
    return file.sensitivity === 'sensitive';
  });
  const archivedFiles = files.filter(function (file) {
    return file.status === 'archived' || file.path.indexOf('_Archive/') === 0;
  });

  return {
    ok: true,
    configured: true,
    status: 'READY',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    vault: {
      rootName: root.getName(),
      indexedFiles: files.length,
      activeFiles: activeFiles.length,
      sensitiveFiles: sensitiveFiles.length,
      archivedFiles: archivedFiles.length,
      normalFiles: files.length - sensitiveFiles.length,
      canonicalEntryPoints: [schema, index, map, profile, operating].filter(Boolean).length
    },
    personal: {
      displayName: sbv4DisplayName_(profile && profile.body) || 'Lukes',
      compass: sbv4FirstParagraph_(operating && operating.body),
      goals: goals,
      operatingRules: operatingRules,
      dayStructure: dayStructure,
      communication: communication,
      priorities: priorityLines,
      interests: interestItems,
      tools: toolRows,
      projectPortfolio: projectPortfolio
    },
    sources: uniqueSources.slice(0, 24),
    policy: {
      retrieval: 'gesamter Vault als Suchraum, relevante Seiten bedarfsgerecht',
      writes: 'keine Schreib-, Lösch-, Verschiebe- oder Umbenennungsaktionen',
      sourceRequired: true,
      sensitiveDefault: 'sensible Seiten werden nie als Volltext übertragen; nur ausdrücklich freigegebene, kompakte Profilfelder werden genutzt, Suchtreffer bleiben standardmäßig blockiert',
      operationalTruth: 'OPS Sheet',
      projectTruth: 'Repository, Git, Tests und sichtbares Verhalten'
    }
  };
}

function sbv4Find_(files, path) {
  return files.find(function (file) {
    return file.path === path;
  }) || null;
}

function sbv4Source_(file, reason) {
  if (!file) return null;
  if (file.sensitivity === 'sensitive') {
    return {
      title: 'Persönliches Profil',
      path: file.path,
      sensitivity: 'sensitive',
      access: 'geschützt',
      updated: file.updated,
      reason: reason
    };
  }
  return {
    title: file.title,
    path: file.path,
    url: file.url,
    type: file.type,
    status: file.status,
    sensitivity: file.sensitivity,
    updated: file.updated,
    reason: reason
  };
}

function sbv4Section_(body, headingText) {
  if (!body) return [];
  const lines = String(body).replace(/\r/g, '').split('\n');
  const needle = sbv4Normalize_(headingText);
  let active = false;
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) {
      if (active) break;
      if (sbv4Normalize_(line.replace(/^##\s+/, '')).indexOf(needle) >= 0) active = true;
      continue;
    }
    if (active) out.push(line);
  }
  return out;
}

function sbv4Bullets_(lines, max) {
  return (lines || []).map(function (line) {
    return String(line).trim();
  }).filter(function (line) {
    return /^([-*]|\d+\.)\s+/.test(line) || /^\*\*[^*]+\*\*:\s+/.test(line);
  }).map(sbv4Compact_).filter(Boolean).slice(0, max || 6);
}

function sbv4Numbered_(lines, max) {
  return (lines || []).map(function (line) {
    return String(line).trim();
  }).filter(function (line) {
    return /^\d+\.\s+/.test(line);
  }).map(sbv4Compact_).filter(Boolean).slice(0, max || 6);
}

function sbv4TableRows_(body, headingText, max) {
  const rows = sbv4Section_(body, headingText).filter(function (line) {
    return /^\s*\|/.test(line) && !/^\s*\|\s*-/.test(line);
  });
  return rows.map(function (line) {
    const cells = line.split('|').slice(1, -1).map(function (cell) {
      return sbv4Compact_(cell);
    }).filter(Boolean);
    if (cells.length < 2) return '';
    if (/^(vorhaben|tool|bedarf|bereich)$/i.test(cells[0])) return '';
    return cells.slice(0, 2).join(' · ');
  }).filter(Boolean).slice(0, max || 6);
}

function sbv4LabelValue_(body, label) {
  if (!body) return '';
  const re = new RegExp('\\*\\*' + label.replace(/[^A-Za-z0-9_-]/g, '\\$&') + ':\\*\\*\\s*(.+)', 'i');
  const match = String(body).match(re);
  return match ? sbv4Compact_(match[1]) : '';
}

function sbv4DisplayName_(body) {
  if (!body) return '';
  const match = String(body).match(/\*\*Name:\*\*\s*([^(\n]+)/i);
  return match ? sbv4Compact_(match[1]).split(' ')[0] : '';
}

function sbv4FirstParagraph_(body) {
  if (!body) return '';
  const lines = String(body).replace(/^---[\s\S]*?---\s*/m, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^#/.test(line) || /^>/.test(line) || /^\|/.test(line) || /^[-*]/.test(line)) continue;
    const value = sbv4Compact_(line);
    if (value.length >= 40) return value.slice(0, SBV4_MAX_LINE_LENGTH);
  }
  return '';
}

function sbv4Excerpt_(body, terms) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const normalized = sbv4Normalize_(lines[i]);
    if (terms.some(function (term) { return normalized.indexOf(term) >= 0; })) {
      const excerpt = sbv4Compact_(lines[i]);
      if (excerpt.length >= 24) return excerpt.slice(0, SBV4_MAX_LINE_LENGTH);
    }
  }
  return sbv4FirstParagraph_(body).slice(0, SBV4_MAX_LINE_LENGTH);
}

function sbv4Compact_(value) {
  return String(value || '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (_, target, label) {
      return label || target;
    })
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SBV4_MAX_LINE_LENGTH);
}

function sbv4Normalize_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sbv4Yaml_(frontmatter, key) {
  const re = new RegExp('^' + key.replace(/[^A-Za-z0-9_-]/g, '\\$&') + '\\s*:\\s*(.*)$', 'im');
  const match = String(frontmatter || '').match(re);
  if (!match) return '';
  return String(match[1]).trim().replace(/^['"]|['"]$/g, '');
}

function sbv4List_(value) {
  if (!value) return [];
  const text = String(value).replace(/^\[|\]$/g, '');
  return text.split(',').map(function (item) {
    return item.trim().replace(/^['"]|['"]$/g, '');
  }).filter(Boolean);
}
