import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');
const backend = await readFile(join(root, 'src', 'FoodTracking.gs'), 'utf8');
const entry = await readFile(join(root, 'src', 'FoodTrackingEnhancements.html'), 'utf8');
const desktop = await readFile(join(root, 'src', 'FoodIndex.html'), 'utf8');
const mobile = await readFile(join(root, 'src', 'FoodMobileIndex.html'), 'utf8');

test('Food-Tracking definiert den OPS-Datenvertrag', () => {
  assert.match(backend, /const FOOD_SHEETS_V1/);
  for (const sheet of ['FOOD_PANTRY', 'FOOD_LOG', 'FOOD_RECIPES', 'FOOD_SHOPPING']) {
    assert.match(backend, new RegExp(sheet));
  }
  for (const fn of [
    'getFoodV1', 'setupFoodTrackingV1', 'saveFoodEntryV1',
    'saveFoodPantryItemV1', 'consumeFoodPantryItemV1',
    'saveFoodShoppingItemV1', 'saveFoodRecipeV1'
  ]) assert.match(backend, new RegExp('function ' + fn + '\\('));
  assert.match(backend, /sourceOfTruth: 'OPS\.FOOD_\*'/);
  assert.match(backend, /setupRequired: !configured/);
  assert.match(backend, /calories_estimate/);
  assert.match(backend, /protein_estimate/);
});

test('Ernährung ist als getrennte Desktop-/Mobile-Route eingebunden', () => {
  assert.match(code, /FoodIndex/);
  assert.match(code, /FoodMobileIndex/);
  assert.match(code, /isFoodView/);
  assert.match(code, /let enhancement = ''/);
  assert.match(code, /safeIncludeHtml_\(/);
  assert.match(code, /Logger\.log/);
  assert.match(desktop, /data-screen-label="Ernährung — Desktop"/);
  assert.match(mobile, /data-screen-label="Ernährung — Mobil"/);
  assert.match(desktop, /includeHtml_\('ClaudeRuntime'\)/);
  assert.match(mobile, /includeHtml_\('ClaudeRuntime'\)/);
  assert.doesNotMatch(desktop, /support\.js/);
  assert.doesNotMatch(mobile, /support\.js/);
  assert.match(desktop, /preview/);
  assert.match(mobile, /preview/);
});

test('Hauptseite enthält nur einen kompakten Einstieg ohne erfundene Live-Werte', () => {
  assert.match(entry, /data-kz-food-entry/);
  assert.match(entry, /openFood/);
  assert.match(entry, /getFoodV1/);
  assert.match(entry, /food-mobile/);
  assert.doesNotMatch(entry, /FIXTURE|mock|fake|demo/i);
  assert.doesNotMatch(entry, /data-kz-food-entry-nav|ensureNav/);
  assert.match(entry, /document\.addEventListener\('click'/);
  assert.match(entry, /aria-label', 'Ernährungsbereich öffnen'/);
});

test('Backend, Routen und eingebettete Scripts sind syntaktisch parsebar', () => {
  assert.doesNotThrow(() => new Function(code));
  assert.doesNotThrow(() => new Function(backend));
  const scripts = [
    ...desktop.matchAll(/<script(?:\s[^>]*)?data-dc-script[^>]*>([\s\S]*?)<\/script>/gi),
    ...mobile.matchAll(/<script(?:\s[^>]*)?data-dc-script[^>]*>([\s\S]*?)<\/script>/gi),
    ...entry.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)
  ].map(match => match[1]);
  assert.equal(scripts.length, 3);
  scripts.forEach(script => assert.doesNotThrow(() => new Function(script)));
});
