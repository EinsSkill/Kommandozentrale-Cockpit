/**
 * Kommandozentrale – Live Cockpit V3
 * Performance architecture:
 * - OPS core, Calendar and EMAIL_REFS mail layer load independently / concurrently.
 * - Short server caches avoid repeated expensive service calls.
 * - Sheet ranges are bounded by actual content, not full grid size.
 * - Writes invalidate the OPS cache and return enough data for optimistic UI.
 */

// The live spreadsheet ID is injected through Apps Script project properties.
// Never commit the real personal OPS identifier to the repository.
const OPS_SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('OPS_SPREADSHEET_ID') || 'REPLACE_WITH_SCRIPT_PROPERTY';
const TZ = 'Europe/Berlin';
const CACHE_CORE = 'KZ_V3_CORE';
const CACHE_MAIL = 'KZ_V34_EMAIL_REFS';
const CACHE_BASE_V31 = 'KZ_V31_BASE';
const CACHE_FIN_V31 = 'KZ_V31_FIN';
const CACHE_FIN_V33 = 'KZ_V33_FIN';
const CACHE_HEALTH_V31 = 'KZ_V31_HEALTH';
const CACHE_WELLBEING_V1 = 'KZ_V5_WELLBEING';
const WELLBEING_SHEET = 'WELLBEING_LOG';
const WELLBEING_HEADERS = [
  'entry_id','entry_date','recorded_at',
  'mood','energy','inner_pressure','sleep_quality','motivation','recovery',
  'feeling','feeling_intensity','influence_factor','reflection','routine_status','source'
];
const WELLBEING_FEELINGS = [
  'ruhig / ausgeglichen',
  'zufrieden / verbunden',
  'motiviert / zuversichtlich',
  'angespannt / unter Druck',
  'überfordert / voll im Kopf',
  'frustriert / blockiert',
  'traurig / niedergeschlagen',
  'leer / abgestumpft',
  'erschöpft / antriebslos'
];
const WELLBEING_INFLUENCES = [
  'Arbeit / Schule',
  'Beziehung / Soziales',
  'Finanzen',
  'Schlaf / Gesundheit',
  'Projekt / Überforderung',
  'Freizeit / Erholung',
  'unklar'
];

function doGet(e) {
  const requestedView = e && e.parameter ? String(e.parameter.view || '') : '';
  const view = requestedView === 'food' ? 'FoodIndex'
    : requestedView === 'food-mobile' ? 'FoodMobileIndex'
    : requestedView === 'mobile' ? 'MobileIndex'
    : 'Index';
  const isFoodView = view === 'FoodIndex' || view === 'FoodMobileIndex';
  const template = HtmlService.createTemplateFromFile(view);
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  const evaluated = template.evaluate();
  let enhancement = '';
  if (!isFoodView) {
    enhancement = [
      safeIncludeHtml_('CalendarWellbeingEnhancements'),
      safeIncludeHtml_('FoodTrackingEnhancements')
    ].filter(Boolean).join('\n');
  }
  // Mobile currently labels the card "Heute im Kalender"; normalize it so the
  // shared enhancement layer can address the same calendar surface on both views.
  const rendered = evaluated.getContent().replace('Heute im Kalender', 'Kalenderwoche');
  const content = rendered.replace(/<\/body>\s*<\/html>\s*$/i, enhancement + '\n</body>\n</html>');
  return HtmlService.createHtmlOutput(content)
    .setTitle(isFoodView ? 'Ernährung · Lukes Kommandozentrale' : 'Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Reads an optional UI fragment without allowing one missing file to break doGet().
 * The core cockpit must remain available even during partial Apps-Script syncs.
 */
function safeIncludeHtml_(fileName) {
  try {
    return HtmlService.createHtmlOutputFromFile(fileName).getContent();
  } catch (error) {
    Logger.log('Optional enhancement unavailable [' + fileName + ']: ' + String(error && error.message ? error.message : error));
    return '';
  }
}

/** Includes repository-owned HTML fragments into the evaluated Apps-Script template. */
function includeHtml_(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

/** OPS-only payload. Fastest and most important dashboard layer. */

/**
 * V3.1 progressive endpoints.
 * The cockpit no longer depends on one monolithic OPS response:
 * - base: small operational tables
 * - finance: heavy transaction aggregation
 * - health: health history aggregation
 * Each endpoint returns its own timing and errors.
 */
function getDashboardBaseV31(force) {
  return cachedJson_(CACHE_BASE_V31, 45, !!force, function () {
    const started = new Date().getTime();
    const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
    const rd = reader_(ss);
    const now = new Date();
    const out = { generatedAt: now.toISOString(), errors: {} };
    safeAssign_(out, 'system', function(){ return readConfig_(rd); }, {});
    safeAssign_(out, 'tasks', function(){ return getTasks_(rd, now); }, []);
    safeAssign_(out, 'projects', function(){ return getProjects_(rd); }, []);
    safeAssign_(out, 'aiInbox', function(){ return getAiInbox_(rd); }, []);
    safeAssign_(out, 'briefing', function(){ return getLatestBriefing_(rd); }, null);
    safeAssign_(out, 'weather', function(){ return getWeatherSnapshot_(rd); }, {available:false,status:'UNKNOWN',current:null,hours:[]});
    safeAssign_(out, 'alerts', function(){ return getAlerts_(rd); }, []);
    safeAssign_(out, 'syncState', function(){ return rd.rows('SYNC_STATE'); }, []);
    safeAssign_(out, 'goals', function(){ return getGoals_(rd); }, []);
    out.timingMs = new Date().getTime() - started;
    return out;
  });
}

function getFinanceV31(force) {
  return cachedJson_(CACHE_FIN_V31, 90, !!force, function () {
    const started = new Date().getTime();
    try {
      const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
      const rd = reader_(ss);
      return { ok: true, finance: getFinance_(rd, new Date()), timingMs: new Date().getTime() - started };
    } catch (e) {
      return { ok: false, finance: null, error: String(e && e.message ? e.message : e), timingMs: new Date().getTime() - started };
    }
  });
}


/**
 * V3.3 finance endpoint.
 * Dedicated reader: avoids the generic object-table conversion for ~1.5k transactions,
 * aggregates all finance metrics in a single pass, and returns an exact failure stage.
 */
function getFinanceV33(force) {
  return cachedJson_(CACHE_FIN_V33, 300, !!force, function () {
    const started = new Date().getTime();
    let stage = 'open spreadsheet';
    try {
      const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
      stage = 'read FINANCE_TX';
      const sh = ss.getSheetByName('FINANCE_TX');
      if (!sh) throw new Error('Tab FINANCE_TX fehlt.');

      const lastRow = sh.getLastRow();
      if (lastRow < 2) {
        return { ok:true, finance:emptyFinance_(), timingMs:new Date().getTime()-started, stage:'empty' };
      }

      // Only schema columns A:S are finance data. Helper formulas farther right are ignored.
      const width = Math.min(19, sh.getLastColumn());
      const values = sh.getRange(1, 1, lastRow, width).getValues();
      const headers = values[0].map(v => String(v || '').trim());
      const idx = {};
      headers.forEach((h,i)=>{ if(h) idx[h]=i; });
      ['transaction_id','booking_date','amount','direction','merchant','category','subcategory','notes'].forEach(h=>{
        if (idx[h] == null) throw new Error('Pflichtspalte fehlt: ' + h);
      });

      const now = new Date();
      const monthKeys = [];
      const monthMap = {};
      for (let offset=5; offset>=0; offset--) {
        const d = new Date(now.getFullYear(), now.getMonth()-offset, 1);
        const key = Utilities.formatDate(d, TZ, 'yyyy-MM');
        const item = {key:key,label:Utilities.formatDate(d,TZ,'MMM'),income:0,expense:0,net:0,pending:0};
        monthKeys.push(key); monthMap[key]=item;
      }
      const currentKey = monthKeys[monthKeys.length-1];
      const cats = {};
      const recent = [];
      let transactionCount = 0;

      stage = 'aggregate FINANCE_TX';
      for (let r=1; r<values.length; r++) {
        const row = values[r];
        const txId = row[idx.transaction_id];
        if (!txId) continue;
        transactionCount++;

        const bd = financeDate_(row[idx.booking_date]);
        const amount = financeNum_(row[idx.amount]);
        const direction = String(row[idx.direction] || '').toUpperCase();
        const notes = String(row[idx.notes] || '');
        const pending = /VORGEMERKT/i.test(notes);
        const key = bd ? Utilities.formatDate(bd, TZ, 'yyyy-MM') : '';

        if (monthMap[key]) {
          const m = monthMap[key];
          if (pending) m.pending += amount;
          else {
            if (direction === 'INCOME' || amount > 0) m.income += amount;
            if (direction === 'EXPENSE' || amount < 0) m.expense += Math.abs(amount);
          }
        }

        if (key === currentKey && !pending && (direction === 'EXPENSE' || amount < 0)) {
          const cat = String(row[idx.category] || 'Sonstiges');
          cats[cat] = (cats[cat] || 0) + Math.abs(amount);
        }

        recent.push({
          id:String(txId),
          date:bd ? Utilities.formatDate(bd,TZ,'yyyy-MM-dd') : '',
          _ts:bd ? bd.getTime() : 0,
          amount:amount,
          merchant:String(row[idx.merchant] || ''),
          category:String(row[idx.category] || ''),
          subcategory:String(row[idx.subcategory] || ''),
          direction:direction,
          pending:pending
        });
      }

      const monthSeries = monthKeys.map(k=>{
        const m=monthMap[k];
        return {key:m.key,label:m.label,income:round2_(m.income),expense:round2_(m.expense),net:round2_(m.income-m.expense),pending:round2_(m.pending)};
      });
      const current = monthSeries[monthSeries.length-1] || {income:0,expense:0,net:0,pending:0};

      stage = 'read FINANCE_BUDGETS';
      const bsh = ss.getSheetByName('FINANCE_BUDGETS');
      const budgets = [];
      if (bsh && bsh.getLastRow() >= 2) {
        const blr=bsh.getLastRow(), blc=Math.min(10,bsh.getLastColumn());
        const bv=bsh.getRange(1,1,blr,blc).getValues();
        const bh=bv[0].map(v=>String(v||'').trim()), bi={}; bh.forEach((h,i)=>{if(h)bi[h]=i;});
        for(let r=1;r<bv.length;r++){
          if(bi.budget_id==null || !bv[r][bi.budget_id]) continue;
          budgets.push({
            id:String(bv[r][bi.budget_id]),
            month:bi.month!=null?String(bv[r][bi.month]||''):'',
            category:bi.category!=null?String(bv[r][bi.category]||''):'',
            planned:bi.planned_amount!=null?financeNum_(bv[r][bi.planned_amount]):0,
            actual:bi.actual_amount!=null?financeNum_(bv[r][bi.actual_amount]):0,
            remaining:bi.remaining_amount!=null?financeNum_(bv[r][bi.remaining_amount]):0,
            status:bi.status!=null?String(bv[r][bi.status]||''):''
          });
        }
      }

      recent.sort((a,b)=>b._ts-a._ts);
      const recent10 = recent.slice(0,10).map(x=>{delete x._ts;return x;});
      const categorySpend = Object.keys(cats).map(k=>({category:k,amount:round2_(cats[k])})).sort((a,b)=>b.amount-a.amount).slice(0,7);

      stage = 'build response';
      return {
        ok:true,
        finance:{monthSeries:monthSeries,current:current,budgets:budgets,recent:recent10,categorySpend:categorySpend,transactionCount:transactionCount},
        timingMs:new Date().getTime()-started,
        stage:'done'
      };
    } catch (e) {
      return {
        ok:false,
        finance:null,
        stage:stage,
        error:'Finance @ '+stage+': '+String(e && e.message ? e.message : e),
        timingMs:new Date().getTime()-started
      };
    }
  });
}

function emptyFinance_(){
  return {monthSeries:[],current:{income:0,expense:0,net:0,pending:0},budgets:[],recent:[],categorySpend:[],transactionCount:0};
}
function financeNum_(v){
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  let s=String(v).trim().replace(/\s/g,'').replace(/€/g,'');
  if (s.indexOf(',')>=0) s=s.replace(/\./g,'').replace(',','.');
  const n=Number(s.replace(/[^0-9.\-]/g,''));
  return isFinite(n)?n:0;
}
function financeDate_(v){
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Defensive support for raw Sheets serial dates.
    const d=new Date(Date.UTC(1899,11,30)+v*86400000);
    return isNaN(d.getTime())?null:d;
  }
  const s=String(v).trim();
  let m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if(m){const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));return isNaN(d.getTime())?null:d;}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));return isNaN(d.getTime())?null:d;}
  const d=new Date(s); return isNaN(d.getTime())?null:d;
}

function getHealthV31(force) {
  return cachedJson_(CACHE_HEALTH_V31, 90, !!force, function () {
    const started = new Date().getTime();
    try {
      const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
      const rd = reader_(ss);
      return { ok: true, health: getHealth_(rd, new Date()), timingMs: new Date().getTime() - started };
    } catch (e) {
      return { ok: false, health: null, error: String(e && e.message ? e.message : e), timingMs: new Date().getTime() - started };
    }
  });
}

/**
 * Phase 5 – read/write wellbeing log.
 *
 * WELLBEING_LOG is an explicit user-owned OPS log. The dashboard only reads
 * the recent history and writes after a direct user save action.
 * No Second-Brain writes happen here.
 */
function getWellbeingV1(force) {
  return cachedJson_(CACHE_WELLBEING_V1, 60, !!force, function () {
    const started = new Date().getTime();
    try {
      const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
      const sh = ss.getSheetByName(WELLBEING_SHEET);
      if (!sh) {
        return {
          ok: true,
          available: false,
          configured: false,
          status: 'NOT_CONFIGURED',
          code: 'WELLBEING_LOG_MISSING',
          message: 'Tab WELLBEING_LOG fehlt. Einmal ensureWellbeingLogV1() ausführen.',
          history: [],
          summary: wellbeingSummary_([]),
          pattern: wellbeingPattern_([]),
          morningGuidance: { active: false, message: '' },
          options: { feelings: WELLBEING_FEELINGS, influences: WELLBEING_INFLUENCES },
          timingMs: new Date().getTime() - started
        };
      }

      const rows = table_(sh).rows
        .map(wellbeingRow_)
        .filter(function (row) { return !!row.id; })
        .sort(function (a, b) { return dateSort_(b.date) - dateSort_(a.date); });

      const history = rows.slice(0, 30);
      const pattern = wellbeingPattern_(history);
      return {
        ok: true,
        available: true,
        configured: true,
        status: 'READY',
        generatedAt: new Date().toISOString(),
        history: history,
        summary: wellbeingSummary_(history),
        pattern: pattern,
        morningGuidance: wellbeingMorningGuidance_(pattern),
        options: { feelings: WELLBEING_FEELINGS, influences: WELLBEING_INFLUENCES },
        timingMs: new Date().getTime() - started
      };
    } catch (e) {
      return {
        ok: false,
        available: false,
        status: 'ERROR',
        code: 'WELLBEING_READ_FAILED',
        error: String(e && e.message ? e.message : e),
        history: [],
        summary: wellbeingSummary_([]),
        pattern: wellbeingPattern_([]),
        morningGuidance: { active: false, message: '' },
        options: { feelings: WELLBEING_FEELINGS, influences: WELLBEING_INFLUENCES },
        timingMs: new Date().getTime() - started
      };
    }
  });
}

function ensureWellbeingLogV1() {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const wellbeingSetupPermission = authorizeActionV1_(ss, 'unknown_action', {
    triggerType: 'USER_RUN_FUNCTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  let sh = ss.getSheetByName(WELLBEING_SHEET);
  const created = !sh;
  if (!sh) sh = ss.insertSheet(WELLBEING_SHEET);
  ensureWellbeingHeaders_(sh);
  appendAudit_(ss, {
    action_type: 'WELLBEING_LOG_SETUP',
    target_system: 'OPS Sheet',
    target_id: WELLBEING_SHEET,
    trigger_type: wellbeingSetupPermission.triggerType,
    permission_class: wellbeingSetupPermission.permissionClass,
    status: 'SUCCESS',
    previous_value: created ? 'missing' : 'existing',
    new_value: 'headers_ready',
    rollback_available: true,
    note: 'WELLBEING_LOG durch den Nutzer eingerichtet; keine echten Werte wurden angelegt.'
  });
  return {
    ok: true,
    sheetName: WELLBEING_SHEET,
    created: created,
    headers: WELLBEING_HEADERS,
    note: 'Keine echten Werte wurden angelegt.'
  };
}

function saveWellbeingEntryV1(payload) {
  const entry = normalizeWellbeingPayload_(payload);
  if (!entry.hasData) throw new Error('Mindestens eine Wohlbefindensangabe ist erforderlich.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const wellbeingSavePermission = authorizeActionV1_(ss, 'wellbeing_save', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName(WELLBEING_SHEET);
  if (!sh) throw new Error('Tab WELLBEING_LOG fehlt. Einmal ensureWellbeingLogV1() ausführen.');

  ensureWellbeingHeaders_(sh);
  const table = table_(sh);
  const existing = table.rows.find(function (row) {
    return dateText_(row.entry_date) === entry.entryDate;
  });

  const record = {
    entry_id: existing ? String(existing.entry_id || entry.entryId) : entry.entryId,
    entry_date: entry.entryDate,
    recorded_at: entry.recordedAt,
    mood: entry.mood,
    energy: entry.energy,
    inner_pressure: entry.innerPressure,
    sleep_quality: entry.sleepQuality,
    motivation: entry.motivation,
    recovery: entry.recovery,
    feeling: entry.feeling,
    feeling_intensity: entry.feelingIntensity,
    influence_factor: entry.influenceFactor,
    reflection: entry.reflection,
    routine_status: entry.routineStatus,
    source: 'DASHBOARD_USER_ACTION'
  };

  let action = 'CREATE';
  if (existing) {
    action = 'UPDATE';
    WELLBEING_HEADERS.forEach(function (header) {
      setByHeader_(sh, table, existing.__row, header, record[header] != null ? record[header] : '');
    });
  } else {
    sh.appendRow(table.headers.map(function (header) {
      return record[header] != null ? record[header] : '';
    }));
  }

  appendAudit_(ss, {
    action_type: 'WELLBEING_ENTRY_' + action,
    target_system: 'OPS Sheet',
    target_id: record.entry_id,
    trigger_type: wellbeingSavePermission.triggerType,
    permission_class: wellbeingSavePermission.permissionClass,
    status: 'SUCCESS',
    previous_value: existing ? 'same-day entry' : '',
    new_value: entry.routineStatus,
    rollback_available: true,
    note: 'Wohlbefindenscheck direkt durch den Nutzer gespeichert; keine Second-Brain-Änderung.'
  });

  invalidateWellbeing_();
  return {
    ok: true,
    action: action,
    entryId: record.entry_id,
    entryDate: record.entry_date,
    data: getWellbeingV1(true)
  };
}

function ensureWellbeingHeaders_(sh) {
  const lastColumn = sh.getLastColumn();
  if (lastColumn < 1 || sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, WELLBEING_HEADERS.length).setValues([WELLBEING_HEADERS]);
  } else {
    const current = sh.getRange(1, 1, 1, lastColumn).getValues()[0]
      .map(function (value) { return String(value || '').trim(); });
    const missing = WELLBEING_HEADERS.filter(function (header) {
      return current.indexOf(header) < 0;
    });
    if (missing.length) {
      sh.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
    }
  }
  sh.setFrozenRows(1);
}

function normalizeWellbeingPayload_(payload) {
  const p = payload || {};
  const entryDate = String(p.entryDate || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('entryDate muss YYYY-MM-DD sein.');

  const entry = {
    entryId: 'WB_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss_SSS'),
    entryDate: entryDate,
    recordedAt: isoLocal_(new Date()),
    mood: wellbeingMetric_(p.mood, 'Stimmung'),
    energy: wellbeingMetric_(p.energy, 'Energie'),
    innerPressure: wellbeingMetric_(p.innerPressure, 'Innerer Druck'),
    sleepQuality: wellbeingMetric_(p.sleepQuality, 'Schlafqualität'),
    motivation: wellbeingMetric_(p.motivation, 'Motivation'),
    recovery: wellbeingMetric_(p.recovery, 'Erholung'),
    feeling: wellbeingEnum_(p.feeling, WELLBEING_FEELINGS),
    feelingIntensity: wellbeingIntensity_(p.feelingIntensity),
    influenceFactor: wellbeingEnum_(p.influenceFactor, WELLBEING_INFLUENCES),
    reflection: wellbeingText_(p.reflection, 500)
  };

  if (!entry.feeling) entry.feelingIntensity = '';
  entry.routineStatus = Object.keys({
    mood: entry.mood,
    energy: entry.energy,
    innerPressure: entry.innerPressure,
    sleepQuality: entry.sleepQuality,
    motivation: entry.motivation,
    recovery: entry.recovery,
    feeling: entry.feeling,
    influenceFactor: entry.influenceFactor,
    reflection: entry.reflection
  }).some(function (key) {
    return entry[key] !== '' && entry[key] != null;
  }) ? 'PARTIAL_OR_COMPLETE' : 'EMPTY';

  entry.hasData = entry.routineStatus !== 'EMPTY';
  return entry;
}

function wellbeingMetric_(value, label) {
  if (value == null || value === '' || Number(value) === 0) return '';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error(label + ' muss zwischen 1 und 10 liegen.');
  return n;
}

function wellbeingIntensity_(value) {
  if (value == null || value === '' || Number(value) === 0) return '';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Die Gefühlsintensität muss zwischen 1 und 5 liegen.');
  return n;
}

function wellbeingEnum_(value, allowed) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  return allowed.indexOf(text) >= 0 ? text : '';
}

function wellbeingText_(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 500);
}

function wellbeingRow_(row) {
  return {
    id: String(row.entry_id || ''),
    date: dateText_(row.entry_date || row.recorded_at),
    recordedAt: String(row.recorded_at || ''),
    mood: numOrNull_(row.mood),
    energy: numOrNull_(row.energy),
    innerPressure: numOrNull_(row.inner_pressure),
    sleepQuality: numOrNull_(row.sleep_quality),
    motivation: numOrNull_(row.motivation),
    recovery: numOrNull_(row.recovery),
    feeling: String(row.feeling || ''),
    feelingIntensity: numOrNull_(row.feeling_intensity),
    influenceFactor: String(row.influence_factor || ''),
    reflection: String(row.reflection || ''),
    routineStatus: String(row.routine_status || '')
  };
}

function wellbeingAverage_(rows, key) {
  const values = rows.map(function (row) { return Number(row[key]); })
    .filter(function (value) { return Number.isFinite(value); });
  if (!values.length) return null;
  return round2_(values.reduce(function (sum, value) { return sum + value; }, 0) / values.length);
}

function wellbeingSummary_(history) {
  const rows = (history || []).slice(0, 7).reverse();
  return {
    count: (history || []).length,
    last7Count: rows.length,
    averages: {
      mood: wellbeingAverage_(rows, 'mood'),
      energy: wellbeingAverage_(rows, 'energy'),
      innerPressure: wellbeingAverage_(rows, 'innerPressure'),
      sleepQuality: wellbeingAverage_(rows, 'sleepQuality'),
      motivation: wellbeingAverage_(rows, 'motivation'),
      recovery: wellbeingAverage_(rows, 'recovery')
    },
    latest: history && history.length ? history[0] : null,
    last7: rows.map(function (row) {
      return {
        date: row.date,
        mood: row.mood,
        energy: row.energy,
        innerPressure: row.innerPressure
      };
    })
  };
}

function wellbeingPattern_(history) {
  const recent = (history || []).slice(0, 3);
  if (recent.length < 3) {
    return { candidate: false, status: 'INSUFFICIENT_DATA', days: recent.length, reason: '' };
  }

  const lowMood = recent.every(function (row) { return row.mood != null && row.mood <= 4; });
  const lowEnergy = recent.every(function (row) { return row.energy != null && row.energy <= 4; });
  const highPressure = recent.every(function (row) { return row.innerPressure != null && row.innerPressure >= 7; });
  const candidate = highPressure && (lowMood || lowEnergy);
  const reasons = [];
  if (candidate) {
    if (lowMood) reasons.push('niedrige Stimmung');
    if (lowEnergy) reasons.push('wenig Energie');
    reasons.push('hoher innerer Druck');
  }

  return {
    candidate: candidate,
    status: candidate ? 'PROPOSAL' : 'NO_CLEAR_PATTERN',
    days: recent.length,
    reason: reasons.join(', '),
    requiresConfirmation: candidate
  };
}

function wellbeingMorningGuidance_(pattern) {
  if (!pattern || !pattern.candidate) return { active: false, message: '' };
  return {
    active: true,
    message: 'Die letzten drei Einträge zeigen ' + pattern.reason + '. Soll der heutige Tag bewusst leichter geplant werden?',
    mode: 'gentle_check_in'
  };
}

function safeAssign_(out, key, fn, fallback) {
  try { out[key] = fn(); }
  catch (e) {
    out[key] = fallback;
    out.errors[key] = String(e && e.message ? e.message : e);
  }
}

function getDashboardCoreV3(force) {
  return cachedJson_(CACHE_CORE, 25, !!force, function () {
    const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
    const rd = reader_(ss);
    const now = new Date();
    return {
      generatedAt: now.toISOString(),
      system: readConfig_(rd),
      dashboardState: rd.rows('DASHBOARD_STATE'),
      tasks: getTasks_(rd, now),
      projects: getProjects_(rd),
      aiInbox: getAiInbox_(rd),
      briefing: getLatestBriefing_(rd),
      alerts: getAlerts_(rd),
      syncState: rd.rows('SYNC_STATE'),
      finance: getFinance_(rd, now),
      health: getHealth_(rd, now),
      goals: getGoals_(rd)
    };
  });
}

/**
 * @deprecated Compatibility wrapper for older callers.
 * The canonical Calendar runtime is getCalendarViewV4 in CalendarService.gs.
 */
function getCalendarWeekV3(force) {
  const calendar = getCalendarViewV4({ view: 'week' }, !!force);
  return {
    generatedAt: calendar.generatedAt,
    weekStart: calendar.rangeStart,
    weekEnd: calendar.rangeEnd,
    events: calendar.events || [],
    calendars: calendar.calendars || [],
    selectedCalendarIds: calendar.selectedCalendarIds || [],
    compatibilitySource: 'getCalendarViewV4'
  };
}

/** Operative mail references load separately from OPS.EMAIL_REFS. */
function getMailV3(force) {
  return cachedJson_(CACHE_MAIL, 120, !!force, function () {
    return getMailFromRefs_();
  });
}

/** Compatibility helper. V3 client normally does not use this. */
function getDashboardData() {
  const core = getDashboardCoreV3(false);
  core.calendar = getCalendarWeekV3(false);
  core.mail = getMailV3(false);
  core.wellbeing = getWellbeingV1(false);
  return core;
}

function setTaskDone(taskId, done) {
  if (!taskId) throw new Error('taskId fehlt.');
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const taskPermission = authorizeActionV1_(ss, 'task_complete_cancel', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName('TASKS');
  const table = table_(sh);
  const row = table.rows.find(r => String(r.task_id) === String(taskId));
  if (!row) throw new Error('Aufgabe nicht gefunden: ' + taskId);

  const previousStatus = String(row.status || '');
  const nextStatus = done ? 'DONE' : (previousStatus === 'DONE' ? 'OPEN' : previousStatus || 'OPEN');
  const stamp = isoLocal_(new Date());
  setByHeader_(sh, table, row.__row, 'status', nextStatus);
  setByHeader_(sh, table, row.__row, 'updated_at', stamp);
  setByHeader_(sh, table, row.__row, 'completed_at', done ? stamp : '');
  appendAudit_(ss, {
    action_type: 'TASK_STATUS_CHANGE', target_system: 'OPS Sheet', target_id: taskId,
    trigger_type: taskPermission.triggerType, permission_class: taskPermission.permissionClass, status: 'SUCCESS',
    previous_value: previousStatus, new_value: nextStatus, rollback_available: true,
    note: 'Direkte Nutzeraktion im HTML-Cockpit.'
  });
  invalidateCore_();
  return { ok: true, taskId: taskId, status: nextStatus, completedAt: done ? stamp : '' };
}

function reviewAiInbox(inboxId, decision, reviewerNote) {
  const normalized = String(decision || '').toUpperCase();
  if (!['ACCEPTED', 'REJECTED', 'DEFERRED'].includes(normalized)) throw new Error('Ungültige Entscheidung.');
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const inboxPermission = authorizeActionV1_(ss, 'ai_inbox_review', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName('AI_INBOX');
  const table = table_(sh);
  const row = table.rows.find(r => String(r.inbox_id) === String(inboxId));
  if (!row) throw new Error('AI-Inbox-Eintrag nicht gefunden: ' + inboxId);

  const stamp = isoLocal_(new Date());
  const before = String(row.status || '');
  setByHeader_(sh, table, row.__row, 'status', normalized);
  setByHeader_(sh, table, row.__row, 'reviewed_at', stamp);
  setByHeader_(sh, table, row.__row, 'review_decision', normalized);
  setByHeader_(sh, table, row.__row, 'reviewer_note', reviewerNote || 'Entscheidung im HTML-Cockpit. Externe Folgeaktion noch nicht automatisch ausgeführt.');
  appendAudit_(ss, {
    action_type: 'AI_INBOX_REVIEW', target_system: 'OPS Sheet', target_id: inboxId,
    trigger_type: inboxPermission.triggerType, permission_class: inboxPermission.permissionClass, status: 'SUCCESS',
    previous_value: before, new_value: normalized, rollback_available: true,
    note: 'Entscheidung protokolliert; proposed_action wird nicht automatisch extern ausgeführt.'
  });
  invalidateCore_();
  return { ok: true, inboxId: inboxId, status: normalized, reviewedAt: stamp };
}

function acknowledgeAlert(alertId) {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const alertPermission = authorizeActionV1_(ss, 'alert_user_ack_dismiss', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName('ALERTS');
  const table = table_(sh);
  const row = table.rows.find(r => String(r.alert_id) === String(alertId));
  if (!row) throw new Error('Alert nicht gefunden: ' + alertId);
  const stamp = isoLocal_(new Date());
  setByHeader_(sh, table, row.__row, 'status', 'ACKNOWLEDGED');
  setByHeader_(sh, table, row.__row, 'acknowledged_at', stamp);
  appendAudit_(ss, {
    action_type: 'ALERT_ACKNOWLEDGED', target_system: 'OPS Sheet', target_id: alertId,
    trigger_type: alertPermission.triggerType, permission_class: alertPermission.permissionClass, status: 'SUCCESS',
    previous_value: String(row.status || ''), new_value: 'ACKNOWLEDGED', rollback_available: true,
    note: 'Alert im Cockpit bestätigt.'
  });
  invalidateCore_();
  return { ok: true, alertId: alertId, status: 'ACKNOWLEDGED' };
}

function getTasks_(rd, now) {
  const rows = rd.rows('TASKS').filter(r => !truthy_(r.archived));
  return rows.filter(r => !['DONE','CANCELLED','ARCHIVED'].includes(String(r.status)))
    .sort((a,b) => num_(b.ai_priority)-num_(a.ai_priority) || dateSort_(a.deadline)-dateSort_(b.deadline))
    .map(r => ({
      id:r.task_id, title:r.title, status:r.status, area:r.area||'', projectId:r.project_id||'',
      aiPriority:num_(r.ai_priority), userPriority:r.user_priority||'', reason:r.ai_priority_reason||'',
      deadline:dateText_(r.deadline), dueLabel:dueLabel_(r.deadline,now), nextAction:r.next_action||'',
      estimatedMinutes:num_(r.estimated_minutes), energy:r.energy_required||'', context:r.context||'',
      tags:r.tags||'', blockedBy:r.blocked_by||''
    }));
}

function getProjects_(rd) {
  return rd.rows('PROJECTS').filter(r => !truthy_(r.archived) && !['COMPLETED','ARCHIVED'].includes(String(r.status)))
    .sort((a,b)=>num_(b.ai_priority)-num_(a.ai_priority))
    .map(r=>({id:r.project_id,title:r.title,status:r.status,area:r.area||'',aiPriority:num_(r.ai_priority),reason:r.ai_priority_reason||'',health:r.health_status||'UNKNOWN',progress:num_(r.progress_percent),deadline:dateText_(r.deadline),targetDate:dateText_(r.target_date),nextAction:r.next_action||'',blocker:r.blocker||'',lastActivity:dateText_(r.last_activity_at),notes:r.notes||''}));
}

function getAiInbox_(rd) {
  return rd.rows('AI_INBOX').filter(r=>['NEW','REVIEW'].includes(String(r.status)))
    .sort((a,b)=>confidence_(b.confidence)-confidence_(a.confidence))
    .map(r=>({id:r.inbox_id,status:r.status,type:r.detected_type,information:r.detected_information||'',confidence:Math.round(confidence_(r.confidence)*100),reasoning:r.reasoning||'',impact:r.possible_impact||'',proposedAction:r.proposed_action||'',suggestedTarget:r.suggested_target||'',dueCandidate:dateText_(r.due_candidate),sourceType:r.source_type||'',sourceReference:r.source_reference||'',relatedTaskId:r.related_task_id||'',relatedProjectId:r.related_project_id||''}));
}

function getLatestBriefing_(rd) {
  const rows = rd.rows('BRIEFINGS').filter(r=>String(r.generation_status||'').toUpperCase()==='SUCCESS');
  rows.sort((a,b)=>dateSort_(b.created_at)-dateSort_(a.created_at));
  const r=rows[0]; if(!r) return null;
  return {id:r.briefing_id,type:r.briefing_type,createdAt:dateTimeText_(r.created_at),summary:r.summary||'',topPriorities:r.top_priorities||'',calendarSummary:r.calendar_summary||'',taskSummary:r.task_summary||'',projectSummary:r.project_summary||'',mailSummary:r.mail_summary||'',financeSummary:r.finance_summary||'',healthSummary:r.health_summary||'',aiInboxSummary:r.ai_inbox_summary||'',alertsSummary:r.alerts_summary||'',recommendation:r.recommendation||'',freshness:r.data_freshness||''};
}

function getAlerts_(rd) {
  return rd.rows('ALERTS').filter(r=>['OPEN','ACKNOWLEDGED'].includes(String(r.status)))
    .sort((a,b)=>severityRank_(b.severity)-severityRank_(a.severity))
    .map(r=>({id:r.alert_id,severity:r.severity,category:r.category||'',title:r.title||'',message:r.message||'',status:r.status,recommendedAction:r.recommended_action||'',createdAt:dateTimeText_(r.created_at),sourceType:r.source_type||''}));
}

function getGoals_(rd) {
  return rd.rows('GOALS').filter(r=>r.goal_id).map(r=>({id:r.goal_id,title:r.title,area:r.area||'',status:r.status||'',targetDate:dateText_(r.target_date),metric:r.metric||'',currentValue:r.current_value,targetValue:r.target_value,unit:r.unit||'',assessment:r.ai_assessment||'',note:r.note||''}));
}

function getFinance_(rd, now) {
  const rows=rd.rows('FINANCE_TX').filter(r=>r.transaction_id);
  const monthSeries=[];
  for(let offset=5;offset>=0;offset--){
    const d=new Date(now.getFullYear(),now.getMonth()-offset,1), key=Utilities.formatDate(d,TZ,'yyyy-MM'), label=Utilities.formatDate(d,TZ,'MMM');
    let income=0,expense=0,pending=0;
    rows.forEach(r=>{const bd=asDate_(r.booking_date);if(!bd||Utilities.formatDate(bd,TZ,'yyyy-MM')!==key)return;const amount=num_(r.amount),isPending=String(r.notes||'').toUpperCase().indexOf('VORGEMERKT')>=0;if(isPending){pending+=amount;return;}if(String(r.direction)==='INCOME'||amount>0)income+=amount;if(String(r.direction)==='EXPENSE'||amount<0)expense+=Math.abs(amount);});
    monthSeries.push({key:key,label:label,income:round2_(income),expense:round2_(expense),net:round2_(income-expense),pending:round2_(pending)});
  }
  const current=monthSeries[monthSeries.length-1]||{income:0,expense:0,net:0,pending:0};
  const budgets=rd.rows('FINANCE_BUDGETS').filter(r=>r.budget_id).map(r=>({id:r.budget_id,month:r.month,category:r.category,planned:num_(r.planned_amount),actual:num_(r.actual_amount),remaining:num_(r.remaining_amount),status:r.status||''}));
  const recent=rows.slice().sort((a,b)=>dateSort_(b.booking_date)-dateSort_(a.booking_date)).slice(0,10).map(r=>({id:r.transaction_id,date:dateText_(r.booking_date),amount:num_(r.amount),merchant:r.merchant||'',category:r.category||'',subcategory:r.subcategory||'',direction:r.direction||'',pending:String(r.notes||'').toUpperCase().indexOf('VORGEMERKT')>=0}));
  const currentKey=Utilities.formatDate(now,TZ,'yyyy-MM'), cats={};
  rows.forEach(r=>{const bd=asDate_(r.booking_date);if(!bd||Utilities.formatDate(bd,TZ,'yyyy-MM')!==currentKey)return;if(String(r.notes||'').toUpperCase().indexOf('VORGEMERKT')>=0)return;const amount=num_(r.amount);if(!(String(r.direction)==='EXPENSE'||amount<0))return;const c=String(r.category||'Sonstiges');cats[c]=(cats[c]||0)+Math.abs(amount);});
  const categorySpend=Object.keys(cats).map(k=>({category:k,amount:round2_(cats[k])})).sort((a,b)=>b.amount-a.amount).slice(0,7);
  return {monthSeries:monthSeries,current:current,budgets:budgets,recent:recent,categorySpend:categorySpend,transactionCount:rows.length};
}

function getHealth_(rd, now) {
  const rows=rd.rows('HEALTH_DAILY').filter(r=>r.health_id).sort((a,b)=>dateSort_(a.date)-dateSort_(b.date));
  const recent=rows.slice(-14), last=recent[recent.length-1]||null;
  const latestWeight=rows.slice().reverse().find(r=>r.weight_kg!==''&&r.weight_kg!=null), latestBodyFat=rows.slice().reverse().find(r=>r.body_fat_percent!==''&&r.body_fat_percent!=null);
  const last14=recent.map(r=>({date:dateText_(r.date),day:dayShort_(r.date),steps:num_(r.steps),distance:num_(r.distance_km),activeMinutes:num_(r.active_minutes),sleepMinutes:num_(r.sleep_duration_minutes),deepSleepMinutes:num_(r.deep_sleep_minutes),restingHr:numOrNull_(r.resting_hr),hrv:numOrNull_(r.hrv),weight:numOrNull_(r.weight_kg),bodyFat:numOrNull_(r.body_fat_percent)}));
  const last7=last14.slice(-7);
  const avgSteps=last7.length?Math.round(last7.reduce((s,r)=>s+r.steps,0)/last7.length):0;
  const workoutRows=rd.rows('WORKOUTS').filter(r=>r.workout_id).sort((a,b)=>dateSort_(b.date)-dateSort_(a.date)).slice(0,7);
  const weightRows=rows.filter(r=>r.weight_kg!==''&&r.weight_kg!=null).slice(-10);
  const weightSeries=weightRows.map(r=>({date:dateText_(r.date),weight:numOrNull_(r.weight_kg),bodyFat:numOrNull_(r.body_fat_percent)}));
  const sleepSeries=rows.filter(r=>num_(r.sleep_duration_minutes)>0).slice(-7).map(r=>({date:dateText_(r.date),day:dayShort_(r.date),minutes:num_(r.sleep_duration_minutes),deep:num_(r.deep_sleep_minutes)}));
  return {latestDate:last?dateText_(last.date):'',latestSteps:last?num_(last.steps):0,latestDistance:last?num_(last.distance_km):0,avgSteps7:avgSteps,latestWeight:latestWeight?numOrNull_(latestWeight.weight_kg):null,latestWeightDate:latestWeight?dateText_(latestWeight.date):'',latestBodyFat:latestBodyFat?numOrNull_(latestBodyFat.body_fat_percent):null,sleepAvailable:sleepSeries.length>0,hrAvailable:last7.some(r=>r.restingHr!==null&&r.restingHr>0),last7:last7,last14:last14,sleepSeries:sleepSeries,weightSeries:weightSeries,sync:healthSyncDashboard_(rd),workouts:workoutRows.map(r=>({date:dateText_(r.date),type:r.workout_type||'',duration:num_(r.duration_minutes),distance:num_(r.distance_km),avgHr:numOrNull_(r.avg_hr),notes:r.notes||''}))};
}

function healthSyncDashboard_(rd) {
  var row = rd.rows('SYNC_STATE').filter(function(item) {
    return String(item.system_name || '') === 'Fitness Source';
  })[0] || {};
  return {
    available:!!row.system_name,
    status:row.status || 'UNKNOWN',
    source:row.connection_state || '',
    dataFreshness:row.data_freshness || '',
    lastSuccessAt:row.last_success_at || '',
    lastAttemptAt:row.last_attempt_at || '',
    lastError:row.last_error || '',
    warningLevel:row.warning_level || '',
    note:row.note || ''
  };
}

function getMailFromRefs_() {
  const started = new Date().getTime();
  try {
    const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
    const rd = reader_(ss);
    const rows = rd.rows('EMAIL_REFS')
      .filter(r => r.email_ref_id)
      .sort((a,b) => num_(b.relevance) - num_(a.relevance) || dateSort_(b.received_at) - dateSort_(a.received_at))
      .slice(0, 8);

    const messages = rows.map(r => {
      const received = asDate_(r.received_at);
      return {
        refId: String(r.email_ref_id || ''),
        threadId: String(r.thread_reference || ''),
        messageId: String(r.message_reference || ''),
        from: String(r.sender || ''),
        subject: String(r.subject || ''),
        date: received ? received.toISOString() : String(r.received_at || ''),
        // EMAIL_REFS does not mirror Gmail read/star state. Do not invent it.
        unread: false,
        starred: false,
        relevanceScore: Math.round(num_(r.relevance)),
        category: emailRefCategory_(r),
        reason: String(r.ai_summary || 'Operativ relevant'),
        summary: String(r.ai_summary || ''),
        followUpRequired: truthy_(r.follow_up_required),
        relatedTaskId: String(r.related_task_id || ''),
        relatedProjectId: String(r.related_project_id || ''),
        lastCheckedAt: String(r.last_checked_at || '')
      };
    });

    return {
      available: true,
      generatedAt: new Date().toISOString(),
      timingMs: new Date().getTime() - started,
      messages: messages,
      filterVersion: 'email-refs-v1',
      source: 'OPS.EMAIL_REFS',
      sourceOfTruth: 'Gmail'
    };
  } catch(e) {
    return {available:false,error:String(e),messages:[],source:'OPS.EMAIL_REFS',sourceOfTruth:'Gmail'};
  }
}

function emailRefCategory_(row) {
  if (row.related_task_id) return 'Aufgabe';
  if (row.related_project_id) return 'Projekt';
  if (truthy_(row.follow_up_required)) return 'Follow-up';
  return 'Relevant';
}

function readConfig_(rd){const cfg={};rd.rows('SYS_CONFIG').forEach(r=>{if(r.config_key)cfg[String(r.config_key)]=r.config_value;});return cfg;}

/** One per-request table reader with memoization. */
function reader_(ss){
  const cache={};
  return { rows:function(name){ if(!cache[name]){const sh=ss.getSheetByName(name);cache[name]=sh?table_(sh):{headers:[],index:{},rows:[]};} return cache[name].rows; } };
}

/** Bounded content read. This avoids pulling unused 1000/2500-row grids. */
function table_(sh){
  const lr=sh.getLastRow(), lc=sh.getLastColumn();
  if(lr<1||lc<1)return {headers:[],index:{},rows:[]};
  const values=sh.getRange(1,1,lr,lc).getValues();
  const headers=values[0].map(v=>String(v).trim()),index={};headers.forEach((h,i)=>{if(h)index[h]=i;});
  const rows=[];
  for(let r=1;r<values.length;r++){const obj={__row:r+1};let has=false;headers.forEach((h,c)=>{if(!h)return;obj[h]=values[r][c];if(values[r][c]!==''&&values[r][c]!=null)has=true;});if(has)rows.push(obj);}
  return {headers:headers,index:index,rows:rows};
}

function setByHeader_(sh,table,rowIndex,header,value){if(table.index[header]==null)return;sh.getRange(rowIndex,table.index[header]+1).setValue(value);}
function appendAudit_(ss,data){const sh=ss.getSheetByName('AUDIT_LOG');if(!sh)return;const input=Object.assign({},data||{});input.permission_class=assertAuditPermissionClassV1_(input.permission_class);const t=table_(sh),headers=t.headers,stamp=isoLocal_(new Date()),id='AUDIT_'+Utilities.formatDate(new Date(),TZ,'yyyyMMdd_HHmmss_SSS'),record=Object.assign({audit_id:id,timestamp:stamp,actor:'USER',error_message:'',rollback_reference:''},input);sh.appendRow(headers.map(h=>record[h]!=null?record[h]:''));}

function cachedJson_(key,seconds,force,producer){const c=CacheService.getScriptCache();if(!force){const raw=c.get(key);if(raw){try{return JSON.parse(raw);}catch(e){}}}const value=producer();try{const raw=JSON.stringify(value);if(raw.length<95000)c.put(key,raw,seconds);}catch(e){}return value;}
function invalidateWellbeing_(){
  CacheService.getScriptCache().remove(CACHE_WELLBEING_V1);
}

function invalidateCore_(){
  const c=CacheService.getScriptCache();
  c.remove(CACHE_CORE);
  c.remove(CACHE_BASE_V31);
  c.remove(CACHE_FIN_V31);
  c.remove(CACHE_FIN_V33);
  c.remove(CACHE_HEALTH_V31);
  c.remove(CACHE_WELLBEING_V1);
}

function confidence_(v){const n=num_(v);return n>1?n/100:n;}
function num_(v){if(typeof v==='number')return isFinite(v)?v:0;if(v==null||v==='')return 0;const n=Number(String(v).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return isFinite(n)?n:0;}
function numOrNull_(v){if(v==null||v==='')return null;const n=num_(v);return isFinite(n)?n:null;}
function truthy_(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1';}
function round2_(n){return Math.round(n*100)/100;}
function dateSort_(v){const d=asDate_(v);return d?d.getTime():8640000000000000;}
function asDate_(v){if(v instanceof Date&&!isNaN(v))return v;if(!v)return null;const d=new Date(v);return isNaN(d)?null:d;}
function dateText_(v){const d=asDate_(v);if(!d)return v?String(v):'';return Utilities.formatDate(d,TZ,'yyyy-MM-dd');}
function dateTimeText_(v){const d=asDate_(v);if(!d)return v?String(v):'';return Utilities.formatDate(d,TZ,'yyyy-MM-dd HH:mm');}
function isoLocal_(d){return Utilities.formatDate(d,TZ,"yyyy-MM-dd'T'HH:mm:ssXXX");}
function dayShort_(v){const d=asDate_(v);if(!d)return '';return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()];}
function severityRank_(s){return ({CRITICAL:4,IMPORTANT:3,NORMAL:2,LOW:1})[String(s)]||0;}
function dueLabel_(v,now){const d=asDate_(v);if(!d)return'offen';const a=new Date(now);a.setHours(0,0,0,0);const b=new Date(d);b.setHours(0,0,0,0);const diff=Math.round((b-a)/86400000);if(diff<0)return'überfällig';if(diff===0)return'heute';if(diff===1)return'morgen';return Utilities.formatDate(b,TZ,'dd.MM.');}
