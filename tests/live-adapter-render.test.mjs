import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const adapterFile = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const adapterScript = adapterFile.replace(/^\s*<script>\s*/i, '').replace(/\s*<\/script>\s*$/i, '');
const logic = index.match(/<script(?:\s[^>]*)?data-dc-script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(logic, 'x-dc logic missing');

function harness() {
  const window = {};
  new Function('window', adapterScript)(window);
  class DCLogic {}
  const Component = new Function('DCLogic', 'window', `${logic}\nreturn Component;`)(DCLogic, window);
  const component = new Component();
  component.props = { bootSequence: false, bootSpeed: 1, customCursor: false, timeOfDay: 'morgen', accentGold: '#B8912F' };
  component.setState = update => {
    const next = typeof update === 'function' ? update(component.state) : update;
    Object.assign(component.state, next || {});
  };
  window.KZLive.component = component;
  return { window, component, adapter: window.KZLive };
}

test('empty live state renders without fabricated fallback records', () => {
  const { component } = harness();
  component.state.p = 1;
  component.state.dp = 1;
  const values = component.renderVals();
  assert.equal(values.tasks.length, 0);
  assert.equal(values.mails.length, 0);
  assert.equal(values.projects.length, 0);
  assert.equal(values.fin.net, '–');
  assert.equal(values.hea.steps, '–');
  assert.match(values.sourceState.label, /warten/);
});

test('real endpoint-shaped payloads flow through the adapter into Claude Design values', () => {
  const { component, adapter } = harness();
  component.state.p = 1;
  component.state.dp = 1;
  Object.keys(adapter.loads).forEach(key => { adapter.loads[key] = { state: 'ok', ms: 12, error: '' }; });

  adapter.applyBase({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_2',
    integrity: { openTaskCandidates: 1, activeProjectCandidates: 1, successfulBriefings: 1, weatherSnapshots: 1 },
    tasks: [{ id: 'TASK_1', title: 'Live-Aufgabe', status: 'OPEN', aiPriority: 88, deadline: '2026-08-22', dueLabel: 'Heute', nextAction: 'Live-Schritt', estimatedMinutes: 45 }],
    projects: [{ id: 'PROJECT_1', title: 'Live-Projekt', progress: 42, health: 'YELLOW', blocker: 'Live-Blocker' }],
    aiInbox: [{ id: 'INBOX_1', detectedInformation: 'Live-Erkenntnis', confidence: 73, sourceType: 'OPS' }],
    alerts: [{ id: 'ALERT_1', title: 'Live-Alert', severity: 'IMPORTANT', status: 'OPEN' }],
    goals: [
      { id: 'GOAL_1', title: 'Schritte', metric: 'steps', currentValue: 7000, targetValue: 10000, unit: '' },
      { id: 'GOAL_2', title: 'Schlaf', metric: 'sleep', currentValue: 7, targetValue: 8, unit: 'h' },
      { id: 'GOAL_3', title: 'Aktivminuten', metric: 'active minutes', currentValue: 30, targetValue: 60, unit: 'Min' }
    ],
    briefing: { type: 'MORNING', createdAt: '2026-08-22 06:40', summary: 'Live-Briefing', recommendation: 'Live-Empfehlung' },
    weather: { available: false, stale: true, status: 'DEGRADED', location: 'Live-Ort', current: { temperatureC: 20, feelsLikeC: 19, text: 'klar' }, hours: [{ time: '2026-08-22T12:00:00Z', temperatureC: 21, precipitationProbability: 10, text: 'klar' }] },
    syncState: [], errors: {}
  });
  adapter.applyFinance({
    monthSeries: [{ key: '2026-08', label: 'Aug', income: 2000, expense: 1200 }],
    current: { income: 2000, expense: 1200 },
    budgets: [{ id: 'B_1', category: 'Betrieb', actual: 300, planned: 500, remaining: 200 }],
    categorySpend: [{ category: 'Betrieb', amount: 300 }],
    recent: [{ date: '2026-08-21', merchant: 'Live-Händler', category: 'Betrieb', amount: 30, direction: 'EXPENSE' }],
    transactionCount: 1
  });
  adapter.applyHealth({
    latestSteps: 7000, latestWeight: 78.4,
    last7: [{ date: '2026-08-22', day: 'SA', steps: 7000, activeMinutes: 30, sleepMinutes: 420 }],
    last14: [{ date: '2026-08-22', day: 'SA', steps: 7000, activeMinutes: 30, sleepMinutes: 420 }],
    sleepSeries: [{ date: '2026-08-22', day: 'SA', minutes: 420, deep: 90 }],
    weightSeries: [{ date: '2026-08-22', weight: 78.4 }],
    workouts: [{ date: '2026-08-21', type: 'Laufen', duration: 35 }], sync: {}
  });
  adapter.applyWellbeing({
    available: true,
    history: [{ date: '2026-08-21', mood: 7, energy: 6, innerPressure: 4, sleepQuality: 7, motivation: 6, recovery: 7, feeling: 'ruhig / ausgeglichen', influenceFactor: 'Freizeit / Erholung' }],
    summary: { latest: { mood: 7, energy: 6, innerPressure: 4, sleepQuality: 7, motivation: 6, recovery: 7, feeling: 'ruhig / ausgeglichen', influenceFactor: 'Freizeit / Erholung' }, averages: {} },
    pattern: { candidate: false, status: 'INSUFFICIENT_DATA', days: 1 }, morningGuidance: { active: false },
    options: { feelings: ['ruhig / ausgeglichen'], influences: ['Freizeit / Erholung'] }
  });
  adapter.applyCalendar({ weekStart: '2026-08-17T00:00:00Z', events: [{ id: 'EVENT_1', title: 'Live-Termin', start: '2026-08-22T10:00:00Z', end: '2026-08-22T11:00:00Z' }] });
  adapter.applyMail({ messages: [{ refId: 'MAIL_1', from: 'person@example.invalid', subject: 'Live-Mail', reason: 'Live-Grund' }] });
  adapter.applyPersonal({ ok: true, personal: { focusRules: ['Live-Fokusregel'] } });
  adapter.refreshSystem();

  const values = component.renderVals();
  assert.equal(values.tasks[0].title, 'Live-Aufgabe');
  assert.equal(values.projects[0].title, 'Live-Projekt');
  assert.equal(values.mails[0].subject, 'Live-Mail');
  assert.equal(values.brief.core, 'Live-Briefing');
  assert.equal(component.D.weather.available, true);
  assert.equal(component.D.weather.stale, true);
  assert.doesNotMatch(values.op.why, /Live-Briefing/);
  assert.doesNotMatch(values.op.mode, /Live-Empfehlung/);
  assert.equal(values.op.mode, 'Live-Fokusregel');
  assert.equal(component.D.operator.sourceMode, 'LIVE_DERIVED');
  assert.equal(values.weather.place, 'Live-Ort · gefühlt 19 °C');
  assert.equal(values.hea.steps, '7.000');
  assert.equal(values.wb.mood, 'ruhig / ausgeglichen');
  assert.equal(values.finD.tx[0].amount, '−30,00 €');
  assert.match(values.sourceState.label, /Alle 7 Datenpfade bereit/);

  for (const detail of ['operator', 'tasks', 'alerts', 'weather', 'finance', 'health', 'calendar', 'inbox', 'mail', 'projects', 'briefing', 'goals', 'system', 'wellbeing']) {
    component.state.detail = detail;
    assert.doesNotThrow(() => component.renderVals(), `detail must render: ${detail}`);
  }
});


test('base integrity rejects a green-but-empty canonical payload', () => {
  const { adapter } = harness();
  assert.match(adapter.baseIntegrityProblem({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_2',
    integrity: { openTaskCandidates: 12, activeProjectCandidates: 6, successfulBriefings: 4, weatherSnapshots: 1 },
    tasks: [], projects: [], briefing: null, weather: { current: null }
  }), /offene Tasks fehlen.*aktive Projekte fehlen.*Briefing fehlt.*Wetter-Snapshot fehlt/);
  assert.equal(adapter.baseIntegrityProblem({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_2',
    integrity: { openTaskCandidates: 0, activeProjectCandidates: 0, successfulBriefings: 0, weatherSnapshots: 0 },
    tasks: [], projects: [], briefing: null, weather: { current: null }
  }), '');
});

test('cached live data is replayed into a replacement component after a runtime remount', () => {
  const first = harness();
  first.adapter.applyBase({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_2',
    integrity: { openTaskCandidates: 1, activeProjectCandidates: 1, successfulBriefings: 1, weatherSnapshots: 1 },
    tasks: [{ id: 'TASK_REPLAY', title: 'Replay-Aufgabe', status: 'OPEN', aiPriority: 90 }],
    projects: [{ id: 'PROJ_REPLAY', title: 'Replay-Projekt', status: 'ACTIVE' }],
    briefing: { type: 'AD_HOC', summary: 'Replay-Briefing' },
    weather: { available: true, status: 'OK', current: { temperatureC: 20, text: 'Bedeckt' }, hours: [] },
    alerts: [], aiInbox: [], goals: [], syncState: []
  });
  const replacement = new first.component.constructor();
  replacement.props = first.component.props;
  replacement.setState = update => {
    const next = typeof update === 'function' ? update(replacement.state) : update;
    Object.assign(replacement.state, next || {});
  };
  first.adapter.component = replacement;
  first.adapter.replayRaw();
  assert.equal(replacement.D.tasks[0].title, 'Replay-Aufgabe');
  assert.equal(replacement.D.projects[0].title, 'Replay-Projekt');
  assert.equal(replacement.D.briefing.core, 'Replay-Briefing');
  assert.equal(replacement.D.weather.available, true);
});
