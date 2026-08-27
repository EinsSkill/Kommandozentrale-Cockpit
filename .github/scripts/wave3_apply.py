from pathlib import Path
import re

adapter_path = Path('src/LiveAdapter.html')
adapter = adapter_path.read_text()

adapter = adapter.replace(
    "throw new Error(value && value.message ? value.message : 'Personal Operator nicht verfügbar.');",
    "throw new Error(value && value.message ? value.message : 'Persönlicher Kontext nicht verfügbar.');",
    1,
)

new_operator = r'''    applyOperator() {
      if (!this.component) return;
      const data = this.component.D;
      const tasks = asArray(data.tasks);
      const task = tasks[0];
      const alerts = asArray(data.alerts)
        .filter(item => !['ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].includes(statusUpper(item.status)))
        .slice()
        .sort((a, b) => number(b.sev) - number(a.sev));
      const alert = alerts[0];
      const personal = this.raw.personal && this.raw.personal.ok !== false ? (this.raw.personal.personal || {}) : {};
      const wellbeing = data.wb || {};
      const guidance = wellbeing.guidance || {};
      const taskStep = task ? (task.next && !/^Kein nächster Schritt/.test(task.next) ? task.next : task.title) : '';
      const taskWhy = task
        ? (task.reason || [task.due !== '–' ? task.due : '', task.blockedBy].filter(Boolean).join(' · ') || 'Die Aufgabe steht im OPS aktuell an erster Stelle.')
        : '';
      const alertStep = alert ? (alert.action || alert.title) : '';
      const alertWhy = alert
        ? (alert.message || `Offener ${alert.severity || 'Alert'} aus dem aktuellen OPS-Stand.`)
        : '';
      data.operator = {
        step: taskStep || alertStep || 'Keine offene Aufgabe im OPS.',
        why: task ? taskWhy : (alertWhy || 'Der aktuelle OPS-Stand enthält keine offene Aufgabe oder unbehandelte Warnung.'),
        notNow: tasks.slice(1, 4).map(item => item.title),
        mode: guidance.active
          ? text(guidance.message)
          : text(asArray(personal.dayStructure)[0] || asArray(personal.focusRules)[0] || 'Einen sichtbaren Schritt abschließen und Puffer lassen.'),
        sourceMode: 'LIVE_DERIVED',
        sources: ['OPS_TASKS', 'OPS_ALERTS', 'WELLBEING', 'PERSONAL_CONTEXT']
      };
    },

    applySyncRows'''

pattern = r"    applyOperator\(\) \{[\s\S]*?\n    \},\n\n    applySyncRows"
adapter, count = re.subn(pattern, new_operator, adapter, count=1)
if count != 1:
    raise SystemExit(f'applyOperator replacement count={count}')

if not re.search(r"if \(alert\) alert\.status = 'ACKNOWLEDGED';\s*\n\s*this\.applyOperator\(\);", adapter):
    adapter, count = re.subn(
        r"(if \(alert\) alert\.status = 'ACKNOWLEDGED';)(\s*\n)(\s*)this\.touch\(\);",
        r"\1\2\3this.applyOperator();\2\3this.touch();",
        adapter,
        count=1,
    )
    if count != 1:
        raise SystemExit(f'acknowledge replacement count={count}')

adapter_path.write_text(adapter)

render_path = Path('tests/live-adapter-render.test.mjs')
render = render_path.read_text()
old = "  assert.match(values.op.why, /Live-Briefing/);\n  assert.match(values.op.mode, /Live-Empfehlung/);"
new = "  assert.doesNotMatch(values.op.why, /Live-Briefing/);\n  assert.doesNotMatch(values.op.mode, /Live-Empfehlung/);\n  assert.equal(values.op.mode, 'Live-Fokusregel');\n  assert.equal(component.D.operator.sourceMode, 'LIVE_DERIVED');"
if old in render:
    render = render.replace(old, new, 1)
elif "assert.equal(component.D.operator.sourceMode, 'LIVE_DERIVED');" not in render:
    raise SystemExit('live-adapter render assertions not found')
render_path.write_text(render)

Path('tests/operator-briefing-separation.test.mjs').write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adapterFile = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const adapterScript = adapterFile.replace(/^\\s*<script>\\s*/i, '').replace(/\\s*<\\/script>\\s*$/i, '');

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
  const match = adapterFile.match(/    applyOperator\\(\\) \\{([\\s\\S]*?)\\n    \\},\\n\\n    applySyncRows/);
  assert.ok(match, 'applyOperator block missing');
  assert.doesNotMatch(match[1], /briefing/i);
  assert.match(adapterFile, /mapBriefing\\(briefing\\)/);
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
""")

Path('docs/operator-briefing-contract.md').write_text("""# Operator / Briefing Contract – KZ 1.0

## Status

Phase 7 Wave 3 canonical distinction.

## Briefing

A Briefing is a persisted point-in-time output from `OPS.BRIEFINGS`. It may summarize Calendar, tasks, projects, mail, finance, health, AI Inbox, alerts and freshness as they were assessed when that briefing was created.

The cockpit may display that snapshot with its creation metadata. Briefing prose is **not** an input into the live Personal Operator decision.

## Personal Operator

The visible Operator is an ephemeral ViewModel. It is derived from the current cockpit state and is not persisted as a new source of truth.

Current inputs are:
- ordered OPS tasks;
- current, unacknowledged alerts as fallback when there is no task;
- current wellbeing guidance;
- curated read-only Personal Context from `getPersonalOperatorContextV1`.

The ViewModel exposes the existing presentation fields `step`, `why`, `notNow` and `mode`, plus lightweight provenance (`sourceMode = LIVE_DERIVED`).

## Source-of-truth boundary

Operational truth remains in OPS and the domain Sources of Truth. Long-term personal rules remain in the Second Brain. The Operator only derives a current recommendation from those inputs; it does not turn that recommendation into stored truth.

## Out of scope

This wave does not change Briefing generation, routine scheduling, Calendar/Mail services, visual design, permission runtime or persistence rules.
""")
