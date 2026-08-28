import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');
const adapter = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const food = await readFile(join(root, 'src', 'FoodTrackingEnhancements.html'), 'utf8');

test('Phase-7 live hotfix carries an explicit backend version and integrity proof', () => {
  assert.match(code, /KZ_V31_BASE_LIVE_HOTFIX_2/);
  assert.match(code, /runtimeVersion = 'PHASE7_LIVE_HOTFIX_2'/);
  assert.match(code, /function dashboardBaseIntegrityV1_/);
  for (const key of ['openTaskCandidates','activeProjectCandidates','successfulBriefings','weatherSnapshots']) assert.match(code, new RegExp(key));
});

test('LiveAdapter retries suspicious OPS base data and guards remount races', () => {
  assert.match(adapter, /generation: 0/);
  assert.match(adapter, /replayRaw\(\)/);
  assert.match(adapter, /baseIntegrityProblem\(value\)/);
  assert.match(adapter, /value = await this\.call\(endpoint, true\)/);
  assert.match(adapter, /isCurrent\(generation, component\)/);
  assert.match(adapter, /OPS-Backend-Stand/);
  assert.match(adapter, /PHASE7_LIVE_HOTFIX_2/);
});

test('Food entry can no longer become a viewport-fixed duplicate', () => {
  assert.match(food, /__KZ_FOOD_ENHANCEMENT_V2__/);
  assert.doesNotMatch(food, /document\.body\.appendChild\(card\)/);
  assert.doesNotMatch(food, /kz-food-entry-mobile\{position:fixed/);
});
