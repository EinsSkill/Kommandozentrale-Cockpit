import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adapterFile = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const adapterScript = adapterFile.replace(/^\s*<script>\s*/i, '').replace(/\s*<\/script>\s*$/i, '');

function harness() {
  const window = {};
  new Function('window', adapterScript)(window);
  const adapter = window.KZLive;
  const component = { D: adapter.emptyData(), state: { tick: 0 }, setState() {} };
  adapter.component = component;
  return { adapter, component };
}

function basePayload(overrides = {}) {
  return Object.assign({
    tasks: [], projects: [], aiInbox: [], alerts: [], goals: [], syncState: [], errors: {},
    briefing: { type: 'MORNING', createdAt: '2026-08-20 07:00', summary: 'STALE BRIEFING CORE', recommendation: 'STALE BRIEFING RECOMMENDATION' },
    weather: { available: false, current: null, hours: [] }
  }, overrides);
}

test('live Operator implementation has no Briefing dependency while Briefing mapping remains independent', () => {
  const match = adapterFile.match(/    applyOperator\(\) \{([\s\S]*?)\n    \},\n\n    applySyncRows/);
  assert.ok(match, 'applyOperator block missing');
  assert.doesNotMatch(match[1], /briefing/i);
  assert.match(adapterFile, /mapBriefing\(briefing\)/);
});

test('task-first Operator ignores stale Briefing prose', () => {
  const { adapter, component } = harness();
  adapter.applyBase(basePayload({
    tasks: [
      { id: 'TASK_1', title: 'Aktuelle Aufgabe', status: 'OPEN', aiPriority: 90, dueLabel: 'Heute', nextAction: 'Aktuellen Schritt tun', reason: 'Aktuelle OPS-Begründung' },
      { id: 'TASK_2', title: 'Später', status: 'OPEN', aiPriority: 70 }
    ]
  }));
  adapter.applyPersonal({ ok: true, personal: { focusRules: ['Aktuelle Fokusregel'] } });
  assert.equal(component.D.operator.step, 'Aktuellen Schritt tun');
  assert.equal(component.D.operator.why, 'Aktuelle OPS-Begründung');
  assert.equal(component.D.operator.mode, 'Aktuelle Fokusregel');
  assert.deepEqual(component.D.operator.notNow, ['Später']);
  assert.equal(component.D.operator.sourceMode, 'LIVE_DERIVED');
  assert.doesNotMatch(JSON.stringify(component.D.operator), /STALE BRIEFING/);
  assert.equal(component.D.briefing.core, 'STALE BRIEFING CORE');
});

test('open alert becomes the live fallback when there is no task', () => {
  const { adapter, component } = harness();
  adapter.applyBase(basePayload({
    alerts: [{ id: 'ALERT_1', title: 'Aktueller Alert', severity: 'CRITICAL', status: 'OPEN', message: 'Aktuelles Risiko', recommendedAction: 'Risiko prüfen' }]
  }));
  assert.equal(component.D.operator.step, 'Risiko prüfen');
  assert.equal(component.D.operator.why, 'Aktuelles Risiko');
  assert.doesNotMatch(JSON.stringify(component.D.operator), /STALE BRIEFING/);
});

test('wellbeing guidance overrides generic personal mode guidance', () => {
  const { adapter, component } = harness();
  adapter.applyBase(basePayload({ tasks: [{ id: 'TASK_1', title: 'Aufgabe', status: 'OPEN', aiPriority: 90 }] }));
  adapter.applyPersonal({ ok: true, personal: { dayStructure: ['Normale Tagesregel'], focusRules: ['Normale Fokusregel'] } });
  adapter.applyWellbeing({
    available: true, history: [], summary: { latest: {}, averages: {} }, pattern: {},
    morningGuidance: { active: true, message: 'Heute bewusst leichter planen.' }, options: {}
  });
  assert.equal(component.D.operator.mode, 'Heute bewusst leichter planen.');
});

test('acknowledging the only alert recomputes the fallback immediately', async () => {
  const { adapter, component } = harness();
  adapter.applyBase(basePayload({
    alerts: [{ id: 'ALERT_1', title: 'Alert', severity: 'IMPORTANT', status: 'OPEN', recommendedAction: 'Alert bearbeiten' }]
  }));
  adapter.call = async () => ({ ok: true });
  await adapter.acknowledgeAlert('ALERT_1');
  assert.equal(component.D.operator.step, 'Keine offene Aufgabe im OPS.');
});
