/**
 * Phase 4B – Personal Operator Layer.
 *
 * Fast path:
 * - reads only a small allowlist of normal, canonical Second-Brain pages;
 * - does not scan the complete vault during dashboard startup;
 * - returns decision-oriented context, not a biography;
 * - leaves full-vault search to searchSecondBrainV1() on demand;
 * - never writes, renames, moves or deletes Drive files.
 *
 * Required Apps-Script project property:
 *   SECOND_BRAIN_ROOT_ID=<inner Second Brain folder ID>
 */
const PLO_CACHE_KEY = 'KZ_V4B_PERSONAL_OPERATOR';
const PLO_ROOT_PROPERTY = 'SECOND_BRAIN_ROOT_ID';
const PLO_CACHE_SECONDS = 900;
const PLO_MAX_TEXT = 260;

const PLO_CORE_PATHS = [
  '_System/SCHEMA.md',
  '_System/Wissenslandkarte.md',
  'Selbstentwicklung/Persoenliches-Betriebssystem.md',
  'Business/Business-Betriebssystem.md',
  'Ausbildung/Lernsystem.md'
];

function refreshPersonalOperatorContextV1() {
  return getPersonalOperatorContextV1(true);
}

function getPersonalOperatorContextV1(force) {
  return cachedJson_(PLO_CACHE_KEY, PLO_CACHE_SECONDS, !!force, function () {
    const started = new Date().getTime();
    const rootId = String(PropertiesService.getScriptProperties().getProperty(PLO_ROOT_PROPERTY) || '').trim();

    if (!rootId) {
      return {
        ok: false,
        configured: false,
        status: 'NOT_CONFIGURED',
        code: 'SECOND_BRAIN_ROOT_ID_MISSING',
        message: 'SECOND_BRAIN_ROOT_ID fehlt.',
        readOnly: true,
        mode: 'curated',
        timingMs: new Date().getTime() - started
      };
    }

    try {
      const root = DriveApp.getFolderById(rootId);
      const sources = {};
      PLO_CORE_PATHS.forEach(function (path) {
        const file = ploReadPath_(root, path);
        if (file) sources[path] = file;
      });

      const result = ploBuildContext_(root, sources);
      result.timingMs = new Date().getTime() - started;
      return result;
    } catch (e) {
      return {
        ok: false,
        configured: true,
        status: 'ERROR',
        code: 'PERSONAL_OPERATOR_READ_FAILED',
        message: String(e && e.message ? e.message : e),
        readOnly: true,
        mode: 'curated',
        timingMs: new Date().getTime() - started
      };
    }
  });
}

function ploReadPath_(root, path) {
  const parts = String(path).split('/');
  const fileName = parts.pop();
  let folder = root;

  parts.forEach(function (part) {
    if (!folder) return;
    const folders = folder.getFoldersByName(part);
    folder = folders.hasNext() ? folders.next() : null;
  });

  if (!folder) return null;
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return null;

  const file = files.next();
  let body = '';
  try {
    body = file.getBlob().getDataAsString();
  } catch (e) {
    body = '';
  }

  return {
    path: path,
    title: fileName.replace(/\.md$/i, ''),
    body: body,
    updated: file.getLastUpdated() && !isNaN(file.getLastUpdated().getTime())
      ? file.getLastUpdated().toISOString()
      : ''
  };
}

function ploBuildContext_(root, sources) {
  const schema = sources['_System/SCHEMA.md'];
  const map = sources['_System/Wissenslandkarte.md'];
  const operating = sources['Selbstentwicklung/Persoenliches-Betriebssystem.md'];
  const business = sources['Business/Business-Betriebssystem.md'];
  const learning = sources['Ausbildung/Lernsystem.md'];

  const sourcePurposes = [
    [schema, 'Wahrheits-, Datenschutz- und Schreibregeln'],
    [map, 'Bereichsprioritäten und passende Wissensrouten'],
    [operating, 'Arbeitsweise, Fokus und Kapazitätsregeln'],
    [business, 'Business-Portfolio und aktuelle Erkenntnisengpässe'],
    [learning, 'Lernlogik und prüfbares Können']
  ].filter(function (item) {
    return !!item[0];
  }).map(function (item) {
    return {
      path: item[0].path,
      title: item[0].title,
      purpose: item[1],
      updated: item[0].updated
    };
  });

  const priorityLines = ploNumbered_(
    ploSection_(map && map.body, 'Priorität der Bereiche'),
    5
  );
  const focusRules = ploBullets_(
    ploSection_(operating && operating.body, 'Regeln gegen Überlastung und Endlosbau'),
    5
  );
  const dayStructure = ploBullets_(
    ploSection_(operating && operating.body, 'Tagesplanung'),
    4
  );
  const ideaRules = ploBullets_(
    ploSection_(operating && operating.body, 'Entscheidung bei neuen Vorhaben'),
    6
  );
  const projectCompass = ploPortfolio_(business && business.body);
  const learningRules = ploBullets_(
    ploSection_(learning && learning.body, 'Fehlerliste statt falschem Selbstvertrauen'),
    3
  );
  const learningRhythm = ploBullets_(
    ploSection_(learning && learning.body, 'Wochenrhythmus'),
    4
  );

  return {
    ok: true,
    configured: true,
    status: 'READY',
    readOnly: true,
    mode: 'curated',
    generatedAt: new Date().toISOString(),
    sourceCount: sourcePurposes.length,
    sources: sourcePurposes,
    vault: {
      rootName: root.getName(),
      mode: 'curated allowlist',
      fullVaultSearch: 'on-demand'
    },
    personal: {
      compass: ploFirstParagraph_(operating && operating.body),
      priorities: priorityLines,
      focusRules: focusRules,
      dayStructure: dayStructure,
      ideaRules: ideaRules,
      projectCompass: projectCompass,
      learning: {
        summary: ploFirstParagraph_(learning && learning.body),
        errorRules: learningRules,
        weeklyRhythm: learningRhythm
      }
    },
    policy: {
      retrieval: 'kleinste passende Quellenmenge im Schnellpfad',
      fullSearch: 'gesamter Vault nur auf ausdrücklichen Abruf',
      writes: 'keine Schreib-, Lösch-, Verschiebe- oder Umbenennungsaktionen',
      sensitiveDefault: 'sensible Profilseiten werden im Schnellpfad nicht gelesen oder an den Browser übertragen',
      operationalTruth: 'OPS Sheet',
      projectTruth: 'Repository, Git, Tests und sichtbares Verhalten'
    }
  };
}

function ploSection_(body, headingText) {
  if (!body) return [];
  const lines = String(body).replace(/\r/g, '').split('\n');
  const needle = ploNormalize_(headingText);
  let active = false;
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) {
      if (active) break;
      if (ploNormalize_(line.replace(/^##\s+/, '')).indexOf(needle) >= 0) {
        active = true;
      }
      continue;
    }
    if (active) out.push(line);
  }
  return out;
}

function ploBullets_(lines, max) {
  return (lines || []).map(function (line) {
    return ploCompact_(String(line).trim());
  }).filter(function (line) {
    return /^([-*]|\d+\.)\s+/.test(line) || /^\*\*[^*]+\*\*:\s+/.test(line);
  }).map(function (line) {
    return line.replace(/^([-*]|\d+\.)\s+/, '').trim();
  }).filter(Boolean).slice(0, max || 6);
}

function ploNumbered_(lines, max) {
  return (lines || []).map(function (line) {
    return ploCompact_(String(line).trim());
  }).filter(function (line) {
    return /^\d+\.\s+/.test(line);
  }).map(function (line) {
    return line.replace(/^\d+\.\s+/, '').trim();
  }).filter(Boolean).slice(0, max || 6);
}

function ploPortfolio_(body) {
  const lines = ploSection_(body, 'Portfolio und aktueller Engpass');
  const rows = [];

  (lines || []).forEach(function (line) {
    if (!/^\|/.test(line)) return;
    const cells = line.split('|').slice(1, -1).map(function (cell) {
      return ploCompact_(cell.trim());
    });
    if (cells.length < 4 || /^[-: ]+$/.test(cells[0])) return;
    if (/Vorhaben/i.test(cells[0])) return;

    rows.push({
      project: cells[0],
      role: cells[1],
      current: cells[2],
      bottleneck: cells[3]
    });
  });

  return rows.slice(0, 6);
}

function ploFirstParagraph_(body) {
  if (!body) return '';
  const clean = String(body)
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/\r/g, '');
  const paragraphs = clean.split(/\n\s*\n/).map(function (paragraph) {
    return ploCompact_(paragraph.replace(/^#.*$/gm, '').trim());
  }).filter(Boolean);
  return paragraphs[0] || '';
}

function ploCompact_(value) {
  return String(value || '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(String.fromCharCode(96), '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLO_MAX_TEXT);
}

function ploNormalize_(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
