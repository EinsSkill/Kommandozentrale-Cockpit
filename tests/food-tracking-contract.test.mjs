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
const cockpitDesktop = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const cockpitMobile = await readFile(join(root, 'src', 'MobileIndex.html'), 'utf8');

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

test('Ernährung ist in die kanonische Desktop-/Mobile-Route integriert', () => {
  const doGet = code.match(/function doGet\(e\) \{([\s\S]*?)\n\}/)?.[0] || '';
  assert.doesNotMatch(doGet, /FoodIndex|FoodMobileIndex|isFoodView/);
  assert.match(doGet, /requestedView === 'mobile' \|\| requestedView === 'food-mobile'/);
  assert.match(doGet, /'MobileIndex' : 'Index'/);
  for (const source of [cockpitDesktop, cockpitMobile]) {
    assert.match(source, /includeHtml_\('FoodTrackingEnhancements'\)/);
    assert.match(source, /includeHtml_\('CalendarWellbeingEnhancements'\)/);
  }
  // Legacy visual artifacts remain traceable during migration, but are not productive routes.
  assert.match(desktop, /data-screen-label="Ernährung — Desktop"/);
  assert.match(mobile, /data-screen-label="Ernährung — Mobil"/);
  assert.doesNotMatch(desktop, /support\.js/);
  assert.doesNotMatch(mobile, /support\.js/);
});

test('Hauptseite enthält nur einen kompakten Einstieg ohne erfundene Live-Werte', () => {
  assert.match(entry, /data-kz-food-entry/);
  assert.match(entry, /openFood/);
  assert.match(entry, /getFoodV1/);
  assert.match(entry, /food-mobile/);
  assert.doesNotMatch(entry, /FIXTURE|mock|fake|demo/i);
  assert.doesNotMatch(entry, /data-kz-food-entry-nav|ensureNav/);
  assert.match(entry, /card\.addEventListener\('click',openFood\)/);
  assert.match(entry, /aria-label'\s*,\s*'Ernährungsbereich öffnen'/);
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
