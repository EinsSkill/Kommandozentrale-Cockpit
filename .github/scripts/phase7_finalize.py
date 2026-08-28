from pathlib import Path
import re


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# Wave 6 — Food is a canonical in-cockpit surface, not a parallel application.
code_path = Path('src/Code.gs')
code = code_path.read_text()
new_do_get = """function doGet(e) {
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
if "requestedView === 'food' ? 'FoodIndex'" in code:
    pattern = re.compile(r"function doGet\(e\) \{[\s\S]*?\n\}\n\n/\*\*", re.M)
    match = pattern.search(code)
    if not match:
        raise SystemExit('canonical food routing: doGet block not found')
    code = code[:match.start()] + new_do_get + '\n\n/**' + code[match.end():]
elif new_do_get not in code:
    raise SystemExit('canonical food routing: unexpected doGet state')

# Productive routing must not use the legacy standalone Food templates.
do_get_match = re.search(r"function doGet\(e\) \{[\s\S]*?\n\}", code)
if not do_get_match:
    raise SystemExit('doGet missing after rewrite')
if 'FoodIndex' in do_get_match.group(0) or 'FoodMobileIndex' in do_get_match.group(0):
    raise SystemExit('parallel Food template routing remains')
code_path.write_text(code)

entry_path = Path('src/FoodTrackingEnhancements.html')
entry = entry_path.read_text()
entry = entry.replace(
    'Es werden keine Ersatz- oder Demodaten angezeigt.',
    'Es werden keine Ersatz- oder Beispieldaten angezeigt.'
)
if re.search(r'FIXTURE|mock|fake|demo', entry, re.I):
    raise SystemExit('Food enhancement still contains demo/mock/fake runtime markers')
entry_path.write_text(entry)

contract_path = Path('tests/food-tracking-contract.test.mjs')
contract = contract_path.read_text()
contract = contract.replace(
    "  assert.match(entry, /document\\.addEventListener\\('click'/);",
    "  assert.match(entry, /card\\.addEventListener\\('click',openFood\\)/);"
)
contract_path.write_text(contract)

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
  assert.doesNotMatch(enhancement, /FIXTURE|mock|fake|demo/i);
});

test('Food panel is shared and can open from canonical or legacy URL state', () => {
  assert.match(enhancement, /data-kz-food-panel/);
  assert.match(enhancement, /params\.get\('section'\)==='food'/);
  assert.match(enhancement, /params\.get\('view'\)==='food'/);
  assert.match(enhancement, /params\.get\('view'\)==='food-mobile'/);
});

test('Food empty/error states never substitute invented runtime data', () => {
  assert.match(enhancement, /Es werden keine Ersatz- oder Beispieldaten angezeigt/);
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
- New in-cockpit navigation uses `?section=food` only as optional URL state; it does not perform a page navigation.

## Truth behavior

The integrated surface uses only `getFoodV1()` / `OPS.FOOD_*` data. Missing or failed data remains visibly missing/failed. No invented meals, pantry items, recipes, calorie history or inferred preferences are used as runtime truth.

## Scope

This wave integrates existing Food data presentation into the canonical cockpit. It deliberately does not invent a weekly-plan data model, add nutrition targets, or create new behavioral features during the KZ 1.0 feature freeze.
''')
