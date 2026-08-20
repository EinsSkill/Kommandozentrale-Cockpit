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
const CACHE_CAL = 'KZ_V3_CAL';
const CACHE_MAIL = 'KZ_V34_EMAIL_REFS';
const CACHE_BASE_V31 = 'KZ_V31_BASE';
const CACHE_FIN_V31 = 'KZ_V31_FIN';
const CACHE_FIN_V33 = 'KZ_V33_FIN';
const CACHE_HEALTH_V31 = 'KZ_V31_HEALTH';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
    safeAssign_(out, 'dashboardState', function(){ return rd.rows('DASHBOARD_STATE'); }, []);
    safeAssign_(out, 'tasks', function(){ return getTasks_(rd, now); }, []);
    safeAssign_(out, 'projects', function(){ return getProjects_(rd); }, []);
    safeAssign_(out, 'aiInbox', function(){ return getAiInbox_(rd); }, []);
    safeAssign_(out, 'briefing', function(){ return getLatestBriefing_(rd); }, null);
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

/** Calendar loads separately so it can never block the OPS cockpit. */
function getCalendarWeekV3(force) {
  return cachedJson_(CACHE_CAL, 60, !!force, function () {
    return getCalendarWeek_(new Date());
  });
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
  return core;
}

function setTaskDone(taskId, done) {
  if (!taskId) throw new Error('taskId fehlt.');
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
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
    trigger_type: 'DASHBOARD_USER_ACTION', permission_class: 'USER_APPROVED', status: 'SUCCESS',
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
    trigger_type: 'DASHBOARD_USER_ACTION', permission_class: 'USER_APPROVED', status: 'SUCCESS',
    previous_value: before, new_value: normalized, rollback_available: true,
    note: 'Entscheidung protokolliert; proposed_action wird nicht automatisch extern ausgeführt.'
  });
  invalidateCore_();
  return { ok: true, inboxId: inboxId, status: normalized, reviewedAt: stamp };
}

function acknowledgeAlert(alertId) {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sh = ss.getSheetByName('ALERTS');
  const table = table_(sh);
  const row = table.rows.find(r => String(r.alert_id) === String(alertId));
  if (!row) throw new Error('Alert nicht gefunden: ' + alertId);
  const stamp = isoLocal_(new Date());
  setByHeader_(sh, table, row.__row, 'status', 'ACKNOWLEDGED');
  setByHeader_(sh, table, row.__row, 'acknowledged_at', stamp);
  appendAudit_(ss, {
    action_type: 'ALERT_ACKNOWLEDGED', target_system: 'OPS Sheet', target_id: alertId,
    trigger_type: 'DASHBOARD_USER_ACTION', permission_class: 'USER_APPROVED', status: 'SUCCESS',
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
      energy:r.energy_required||'', context:r.context||'', tags:r.tags||'', blockedBy:r.blocked_by||''
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
  const last7=recent.slice(-7).map(r=>({date:dateText_(r.date),day:dayShort_(r.date),steps:num_(r.steps),distance:num_(r.distance_km),activeMinutes:num_(r.active_minutes),sleepMinutes:num_(r.sleep_duration_minutes),deepSleepMinutes:num_(r.deep_sleep_minutes),restingHr:numOrNull_(r.resting_hr),hrv:numOrNull_(r.hrv),weight:numOrNull_(r.weight_kg),bodyFat:numOrNull_(r.body_fat_percent)}));
  const avgSteps=last7.length?Math.round(last7.reduce((s,r)=>s+r.steps,0)/last7.length):0;
  const workoutRows=rd.rows('WORKOUTS').filter(r=>r.workout_id).sort((a,b)=>dateSort_(b.date)-dateSort_(a.date)).slice(0,7);
  const weightRows=rows.filter(r=>r.weight_kg!==''&&r.weight_kg!=null).slice(-10);
  const weightSeries=weightRows.map(r=>({date:dateText_(r.date),weight:numOrNull_(r.weight_kg),bodyFat:numOrNull_(r.body_fat_percent)}));
  const sleepSeries=rows.filter(r=>num_(r.sleep_duration_minutes)>0).slice(-7).map(r=>({date:dateText_(r.date),day:dayShort_(r.date),minutes:num_(r.sleep_duration_minutes),deep:num_(r.deep_sleep_minutes)}));
  return {latestDate:last?dateText_(last.date):'',latestSteps:last?num_(last.steps):0,latestDistance:last?num_(last.distance_km):0,avgSteps7:avgSteps,latestWeight:latestWeight?numOrNull_(latestWeight.weight_kg):null,latestWeightDate:latestWeight?dateText_(latestWeight.date):'',latestBodyFat:latestBodyFat?numOrNull_(latestBodyFat.body_fat_percent):null,sleepAvailable:sleepSeries.length>0,hrAvailable:last7.some(r=>r.restingHr!==null&&r.restingHr>0),last7:last7,sleepSeries:sleepSeries,weightSeries:weightSeries,workouts:workoutRows.map(r=>({date:dateText_(r.date),type:r.workout_type||'',duration:num_(r.duration_minutes),distance:num_(r.distance_km),avgHr:numOrNull_(r.avg_hr),notes:r.notes||''}))};
}

function getCalendarWeek_(now) {
  const day=now.getDay()||7, start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-day+1);const end=new Date(start);end.setDate(end.getDate()+7);
  const events=[];
  CalendarApp.getAllCalendars().forEach(cal=>{try{cal.getEvents(start,end).forEach(ev=>events.push({id:ev.getId(),title:ev.getTitle()||'(ohne Titel)',start:ev.getStartTime().toISOString(),end:ev.getEndTime().toISOString(),allDay:ev.isAllDayEvent(),calendar:cal.getName(),color:cal.getColor()||'#1B4332',location:ev.getLocation()||''}));}catch(e){}});
  events.sort((a,b)=>new Date(a.start)-new Date(b.start));
  return {generatedAt:new Date().toISOString(),weekStart:start.toISOString(),weekEnd:end.toISOString(),events:events};
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
function appendAudit_(ss,data){const sh=ss.getSheetByName('AUDIT_LOG');if(!sh)return;const t=table_(sh),headers=t.headers,stamp=isoLocal_(new Date()),id='AUDIT_'+Utilities.formatDate(new Date(),TZ,'yyyyMMdd_HHmmss_SSS'),record=Object.assign({audit_id:id,timestamp:stamp,actor:'USER',error_message:'',rollback_reference:''},data);sh.appendRow(headers.map(h=>record[h]!=null?record[h]:''));}

function cachedJson_(key,seconds,force,producer){const c=CacheService.getScriptCache();if(!force){const raw=c.get(key);if(raw){try{return JSON.parse(raw);}catch(e){}}}const value=producer();try{const raw=JSON.stringify(value);if(raw.length<95000)c.put(key,raw,seconds);}catch(e){}return value;}
function invalidateCore_(){
  const c=CacheService.getScriptCache();
  c.remove(CACHE_CORE);
  c.remove(CACHE_BASE_V31);
  c.remove(CACHE_FIN_V31);
  c.remove(CACHE_FIN_V33);
  c.remove(CACHE_HEALTH_V31);
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
