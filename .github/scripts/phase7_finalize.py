from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# Wave 6 — Food is a canonical in-cockpit surface, not a parallel demo application.
code_path = Path('src/Code.gs')
code = code_path.read_text()
old = """function doGet(e) {
  const requestedView = e && e.parameter ? String(e.parameter.view || '') : '';
  const view = requestedView === 'food' ? 'FoodIndex'
    : requestedView === 'food-mobile' ? 'FoodMobileIndex'
    : requestedView === 'mobile' ? 'MobileIndex'
    : 'Index';
  const isFoodView = view === 'FoodIndex' || view === 'FoodMobileIndex';
  const template = HtmlService.createTemplateFromFile(view);
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  const evaluated = template.evaluate();
  let enhancement = '';
  if (!isFoodView) {
    enhancement = [
      safeIncludeHtml_('CalendarWellbeingEnhancements'),
      safeIncludeHtml_('FoodTrackingEnhancements')
    ].filter(Boolean).join('\\n');
  }
  // Mobile currently labels the card \"Heute im Kalender\"; normalize it so the
  // shared enhancement layer can address the same calendar surface on both views.
  const rendered = evaluated.getContent().replace('Heute im Kalender', 'Kalenderwoche');
  const content = rendered.replace(/<\\/body>\\s*<\\/html>\\s*$/i, enhancement + '\\n</body>\\n</html>');
  return HtmlService.createHtmlOutput(content)
    .setTitle(isFoodView ? 'Ernährung · Lukes Kommandozentrale' : 'Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}"""
new = """function doGet(e) {
  const requestedView = e && e.parameter ? String(e.parameter.view || '') : '';
  // Legacy food URLs remain compatible but resolve into the canonical cockpit.
  // Food itself is rendered by FoodTrackingEnhancements from OPS.FOOD_*.
  const view = requestedView === 'mobile' || requestedView === 'food-mobile' ? 'MobileIndex' : 'Index';
  const template = HtmlService.createTemplateFromFile(view);
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  const evaluated = template.evaluate();
  const enhancement = [
    safeIncludeHtml_('CalendarWellbeingEnhancements'),
    safeIncludeHtml_('FoodTrackingEnhancements')
  ].filter(Boolean).join('\\n');
  // Mobile currently labels the card \"Heute im Kalender\"; normalize it so the
  // shared enhancement layer can address the same calendar surface on both views.
  const rendered = evaluated.getContent().replace('Heute im Kalender', 'Kalenderwoche');
  const content = rendered.replace(/<\\/body>\\s*<\\/html>\\s*$/i, enhancement + '\\n</body>\\n</html>');
  return HtmlService.createHtmlOutput(content)
    .setTitle('Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}"""
code = replace_once(code, old, new, 'canonical food routing')
if "createTemplateFromFile('FoodIndex')" in code or "createTemplateFromFile('FoodMobileIndex')" in code:
    raise SystemExit('parallel Food template routing remains')
code_path.write_text(code)

Path('tests/food-cockpit-integration.test.mjs').write_text(r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [code, enhancement] = await Promise.all([
  readFile(join(root, 'src', 'Code.gs'), 'utf8'),
  readFile(join(root, 'src', 'FoodTrackingEnhancements.html'), 'utf8')
]);

function doGetBlock() {
  const match = code.match(/function doGet\(e\) \{([\s\S]*?)\n\}\n\n\/\*\*/);
  assert.ok(match, 'doGet block missing');
  return match[1];
}

test('legacy food URLs resolve to canonical Index/MobileIndex rather than FoodIndex templates', () => {
  const block = doGetBlock();
  assert.doesNotMatch(block, /'FoodIndex'|'FoodMobileIndex'/);
  assert.match(block, /requestedView === 'mobile' \|\| requestedView === 'food-mobile'/);
  assert.match(block, /'MobileIndex' : 'Index'/);
});

test('Food integration reads only canonical getFoodV1 runtime data and does not navigate to a food subapp', () => {
  assert.match(enhancement, /getFoodV1\(!!force\)/);
  assert.match(enhancement, /OPS\.FOOD_\*/);
  assert.doesNotMatch(enhancement, /window\.location\.assign/);
  assert.doesNotMatch(enhancement, /FoodIndex|FoodMobileIndex/);
  assert.doesNotMatch(enhancement, /MEALS_DEMO|PANTRY_DEMO|RECIPES_DEMO|HISTORY_WEEK/);
});

test('Food panel is shared and can open from canonical or legacy URL state', () => {
  assert.match(enhancement, /data-kz-food-panel/);
  assert.match(enhancement, /params\.get\('section'\)==='food'/);
  assert.match(enhancement, /params\.get\('view'\)==='food'/);
  assert.match(enhancement, /params\.get\('view'\)==='food-mobile'/);
});

test('Food empty/error states never substitute demo data', () => {
  assert.match(enhancement, /Es werden keine Ersatz- oder Demodaten angezeigt/);
  assert.match(enhancement, /bewusst leer statt Beispieldaten zu erfinden/);
});
''')

Path('docs/food-cockpit-integration.md').write_text(r'''# Food Cockpit Integration – KZ 1.0

## Canonical path

Food is part of the normal Kommandozentrale runtime:

`OPS.FOOD_* → getFoodV1() → FoodTrackingEnhancements → canonical desktop/mobile cockpit`

`FoodIndex.html` and `FoodMobileIndex.html` remain repository-owned legacy design artifacts for migration safety, but `doGet()` no longer routes the productive application into those parallel templates.

## Legacy URLs

- `?view=food` resolves to the canonical desktop cockpit and opens the Food surface.
- `?view=food-mobile` resolves to the canonical mobile cockpit and opens the Food surface.
- new in-cockpit navigation uses `?section=food` only as optional URL state; it does not perform a page navigation.

## Truth behavior

The integrated surface uses only `getFoodV1()` / `OPS.FOOD_*` data. Missing or failed data remains visibly missing/failed. Demo meals, pantry items, recipes, calorie history and inferred preferences from the former design pages are not used as runtime truth.

## Scope

This wave integrates existing Food data presentation into the canonical cockpit. It deliberately does not invent a weekly-plan data model, add nutrition targets, or create new behavioral features during the KZ 1.0 feature freeze.
''')
