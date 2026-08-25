import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(join(root, 'src', 'FoodTracking.gs'), 'utf8');
const enhancement = await readFile(join(root, 'src', 'FoodTrackingEnhancements.html'), 'utf8');

test('Food-Tracking definiert den OPS-Datenvertrag', () => {
  assert.match(code, /const FOOD_SHEETS_V1/);
  assert.match(code, /FOOD_PANTRY/);
  assert.match(code, /FOOD_LOG/);
  assert.match(code, /FOOD_RECIPES/);
  assert.match(code, /FOOD_SHOPPING/);
  assert.match(code, /function getFoodV1\(force\)/);
  assert.match(code, /function setupFoodTrackingV1\(\)/);
  assert.match(code, /function saveFoodEntryV1\(payload\)/);
  assert.match(code, /function saveFoodPantryItemV1\(payload\)/);
  assert.match(code, /function consumeFoodPantryItemV1\(payload\)/);
  assert.match(code, /function saveFoodShoppingItemV1\(payload\)/);
  assert.match(code, /function saveFoodRecipeV1\(payload\)/);
  assert.match(code, /sourceOfTruth: 'OPS\.FOOD_\*'/);
  assert.match(code, /setupRequired: !configured/);
  assert.match(code, /calories_estimate/);
  assert.match(code, /protein_estimate/);
});

test('Frontend zeigt keine erfundenen Ernährungswerte', () => {
  assert.match(enhancement, /data-kz-food-card/);
  assert.match(enhancement, /Ernährung & Vorrat/);
  assert.match(enhancement, /getFoodV1/);
  assert.match(enhancement, /setupFoodTrackingV1/);
  assert.match(enhancement, /saveFoodEntryV1/);
  assert.match(enhancement, /saveFoodPantryItemV1/);
  assert.match(enhancement, /Noch keine FOOD_\*-Tabellen/);
  assert.doesNotMatch(enhancement, /FIXTURE|mock|fake|demo/i);
});

test('Apps-Script-Backend und Enhancement sind syntaktisch parsebar', () => {
  assert.doesNotThrow(() => new Function(code));
  const scripts = [...enhancement.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach(script => assert.doesNotThrow(() => new Function(script)));
});
