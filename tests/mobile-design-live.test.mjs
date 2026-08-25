import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = await readFile(join(root, 'src', 'MobileIndex.html'), 'utf8');
const index = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');
const adapterFile = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const adapterScript = adapterFile.replace(/^\s*<script>\s*/i, '').replace(/\s*<\/script>\s*$/i, '');
const logic = mobile.match(/<script type="text\/x-dc"[\s\S]*?>([\s\S]*?)<\/script>\s*<\/body>/i)?.[1];
assert.ok(logic, 'mobile x-dc logic missing');

test('mobile Claude source is retained and routed without external support.js', () => {
  assert.match(mobile, /Claude Mobile Design source SHA-256: be6acce773c2b8be4706c25a66a9ef44686e182909be360612852c8d0c9171cc/);
  assert.match(mobile, /includeHtml_\('ClaudeRuntime'\)/);
  assert.match(mobile, /includeHtml_\('LiveAdapter'\)/);
  assert.doesNotMatch(mobile, /<script[^>]+src=["'][^"']*support\.js/i);
  assert.match(mobile, /data-screen-label="Kommandozentrale Mobil" style="[^"]*width:100%;max-width:100%/);
  assert.match(mobile, /position:fixed;left:0;right:0;bottom:0;width:100%/);
  assert.match(mobile, /viewport-fit=cover/);
  assert.match(mobile, /min-height:100dvh/);
  assert.match(mobile, /min-height:62px/);
  assert.match(mobile, /font-size:30\.7px/);
  assert.match(mobile, /prefers-reduced-motion: reduce/);
  const style = mobile.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style, 'mobile Claude stylesheet missing');
  assert.equal(createHash('sha256').update(style).digest('hex'), '5adc33a567a3c3f99c247ecdbd7619a085d84a26cd23af492e03a8777fbd4f3a');
  assert.match(code, /requestedView === 'mobile' \? 'MobileIndex'/);
  assert.match(code, /: 'Index';/);
  assert.match(code, /template\.webAppUrl = ScriptApp\.getService\(\)\.getUrl\(\)/);
  assert.match(index, /searchParams\.set\('view', 'mobile'\)/);
  assert.match(index, /publishedUrl = '[^']*webAppUrl[^']*'/);
  assert.match(index, /window\.top\.location\.replace/);
  assert.match(index, /window\.location\.replace\(target\)/);
  assert.match(index, /setTimeout\(function \(\)/);
  assert.match(index, /mobileAgent/);
  assert.match(index, /screenWidth <= 720/);
  // The new original Claude desktop source intentionally uses a fixed 1600px design canvas.
  // Mobile safety comes from the routing script above plus the dedicated MobileIndex surface.
  assert.match(index, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(index, /<meta name="viewport" content="width=1600">/);
});

test('mobile live surface exposes the existing read and write contracts', () => {
  for (const endpoint of [
    'getDashboardBaseV31', 'getPersonalOperatorContextV1', 'getFinanceV33',
    'getHealthV31', 'getWellbeingV1', 'getCalendarWeekV3', 'getMailV3',
    'setTaskDone', 'acknowledgeAlert', 'reviewAiInbox', 'saveWellbeingEntryV1',
    'searchSecondBrainV1'
  ]) assert.match(mobile + adapterFile, new RegExp(endpoint));
  for (const action of ['completeTask', 'acknowledgeAlert', 'reviewInbox', 'saveWellbeing', 'searchSecondBrain']) {
    assert.match(mobile, new RegExp(action));
  }
  assert.match(mobile, /read-only/);
  for (const demo of [
    'Angebot Weber', 'Nordlicht anstoßen', 'Frau Sander', 'Website-Relaunch',
    'Inbox auf Null', 'Token expired', 'Woche vor der Woche', 'Lüneburg',
    'Stress liegt an Werkstatt-Tagen'
  ]) assert.doesNotMatch(mobile, new RegExp(demo, 'i'));
  assert.match(mobile, /Second Brain/);
  assert.match(mobile, /searchSecondBrain/);
});

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

test('mobile live values render safely before any source has loaded', () => {
  const { component } = harness();
  component.state.p = 1;
  component.state.dp = 1;
  const values = component.renderVals();
  assert.equal(values.tasks.length, 0);
  assert.equal(values.projects.length, 0);
  assert.equal(values.mails.length, 0);
  assert.equal(values.finLedger[0].val, '–');
  assert.equal(values.heaRings[0].pctLabel, '–');
  assert.equal(values.weather.temp, '–');
  assert.match(values.sourceState?.label || values.boot.readyLabel, /warten|bereit/i);
});

test('mobile live values receive real endpoint-shaped data and keep details callable', () => {
  const { component, adapter } = harness();
  component.state.p = 1;
  component.state.dp = 1;
  Object.keys(adapter.loads).forEach(key => { adapter.loads[key] = { state: 'ok', ms: 12, error: '' }; });

  adapter.applyBase({
    tasks: [{ id: 'TASK_1', title: 'Live-Aufgabe', status: 'OPEN', aiPriority: 88, deadline: '2026-08-22', dueLabel: 'Heute', nextAction: 'Live-Schritt', estimatedMinutes: 45 }],
    projects: [{ id: 'PROJECT_1', title: 'Live-Projekt', progress: 42, health: 'YELLOW', blocker: 'Live-Blocker' }],
    aiInbox: [{ id: 'INBOX_1', information: 'Live-Erkenntnis', confidence: 73, sourceType: 'OPS' }],
    alerts: [{ id: 'ALERT_1', title: 'Live-Alert', severity: 'IMPORTANT', status: 'OPEN' }],
    goals: [
      { id: 'GOAL_1', title: 'Schritte', metric: 'steps', currentValue: 7000, targetValue: 10000, unit: '' },
      { id: 'GOAL_2', title: 'Schlaf', metric: 'sleep', currentValue: 7, targetValue: 8, unit: 'h' },
      { id: 'GOAL_3', title: 'Aktivminuten', metric: 'active minutes', currentValue: 30, targetValue: 60, unit: 'Min' }
    ],
    briefing: { type: 'MORNING', createdAt: '2026-08-22 06:40', summary: 'Live-Briefing', recommendation: 'Live-Empfehlung' },
    weather: { available: true, location: 'Live-Ort', current: { temperatureC: 20, feelsLikeC: 19, text: 'klar' }, hours: [{ time: '2026-08-22T12:00:00Z', temperatureC: 21, precipitationProbability: 10, text: 'klar' }] },
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
  assert.equal(values.weather.place, 'Live-Ort · gefühlt 19 °C');
  assert.equal(values.heaRings[0].pctLabel, '70%');
  assert.equal(values.finLedger[0].val, '800 €');
  assert.equal(values.wbFeeling, 'ruhig / ausgeglichen');

  for (const tab of ['heute', 'finanzen', 'gesundheit', 'wellbeing', 'mehr']) {
    component.state.tab = tab;
    assert.doesNotThrow(() => component.renderVals(), `mobile tab must render: ${tab}`);
  }
});
