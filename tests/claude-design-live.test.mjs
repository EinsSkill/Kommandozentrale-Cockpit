import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const mobile = await readFile(join(root, 'src', 'MobileIndex.html'), 'utf8');
const runtime = await readFile(join(root, 'src', 'ClaudeRuntime.html'), 'utf8');
const adapter = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');

test('Claude Design source and runtime remain traceable and design-locked', () => {
  assert.match(index, /Claude Design source SHA-256: f4f5124103eb7d6ef0afe0f78eeb170fc97f505f5de13d3cbca04ea04da53d8e/);
  assert.match(index, /<x-dc>/);
  assert.match(index, /data-screen-label="Boot-Sequenz"/);
  assert.match(index, /data-screen-label="Kommandozentrale"/);
  const style = index.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style, 'Claude Design stylesheet missing');
  assert.equal(createHash('sha256').update(style).digest('hex'), '4f21a5f1c758bfb4480c7ed27d8b53079a6677f399922a74e3b84b7de0de70b9');
  const match = runtime.match(/^<script>\n([\s\S]*)\n<\/script>\n?$/);
  assert.ok(match, 'ClaudeRuntime.html must only wrap support.js in a script element');
  assert.equal(createHash('sha256').update(match[1]).digest('hex'), '8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe');
});

test('Apps Script evaluates the design template and includes both repository-owned fragments', () => {
  assert.match(code, /const view = e && e\.parameter && e\.parameter\.view === 'mobile' \? 'MobileIndex' : 'Index';/);
  assert.match(code, /createTemplateFromFile\(view\)/);
  assert.match(code, /template\.evaluate\(\)/);
  assert.match(code, /function includeHtml_\(fileName\)/);
  assert.match(index, /includeHtml_\('ClaudeRuntime'\)/);
  assert.match(index, /includeHtml_\('LiveAdapter'\)/);
});

test('live adapter covers every visible source and every authorized cockpit write', () => {
  for (const endpoint of [
    'getDashboardBaseV31', 'getPersonalOperatorContextV1', 'getFinanceV33',
    'getHealthV31', 'getWellbeingV1', 'getCalendarWeekV3', 'getMailV3',
    'setTaskDone', 'acknowledgeAlert', 'reviewAiInbox', 'saveWellbeingEntryV1',
    'searchSecondBrainV1'
  ]) assert.match(adapter, new RegExp(endpoint));
  assert.match(adapter, /externe Folgeaktion nicht automatisch ausgeführt/);
  assert.match(adapter, /searchSecondBrainV1',\s*value,\s*false/);
});

test('every dashboard card keeps an expanded Claude module view', () => {
  const modules = [
    'operator', 'tasks', 'alerts', 'weather', 'finance', 'health', 'calendar',
    'inbox', 'mail', 'projects', 'briefing', 'goals', 'system', 'wellbeing'
  ];
  for (const module of modules) {
    assert.match(index, new RegExp(`openTile\\('${module}'\\)`), `missing open handler for ${module}`);
  }
  assert.match(index, /jumpDetail/);
  assert.match(index, /detail\.filter/);
  assert.match(index, /detail\.sort/);
  assert.match(index, /taskOrder/);
  assert.match(index, /dragStart/);
  assert.match(index, /drop:/);
  assert.match(index, /window\.KZLive\.completeTask/);
  assert.match(index, /window\.KZLive\.searchSecondBrain/);
});

test('the operator identity is consistently Lukes on desktop and mobile', () => {
  for (const source of [index, mobile]) {
    assert.match(source, /Guten Morgen, Lukes\./);
    assert.doesNotMatch(source, /Guten Morgen, Luke\./);
    assert.doesNotMatch(source, /VERLIEHEN AN LUKE ·/);
  }
  assert.match(index, /keys\.endsWith\('lukes'\)/);
});

test('known Claude demo records are absent from the live cockpit', () => {
  const frontend = `${index}\n${adapter}`;
  for (const demo of [
    'Angebot Weber', 'Nordlicht anstoßen', 'Frau Sander', 'Website-Relaunch',
    'Inbox auf Null', 'Token expired', 'Woche vor der Woche', 'Lüneburg'
  ]) assert.doesNotMatch(frontend, new RegExp(demo, 'i'));
});
