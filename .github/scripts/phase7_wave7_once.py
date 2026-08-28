from pathlib import Path
import re

BRANCH = 'refactor/kz-1-0-phase7-finalization'


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def require(condition, message):
    if not condition:
        raise SystemExit(message)


# ---------------------------------------------------------------------------
# Wave 6: canonical Food route
# ---------------------------------------------------------------------------
code_path = 'src/Code.gs'
code = read(code_path)
start = code.find('function doGet(e) {')
marker = '/**\n * Reads an optional UI fragment'
end = code.find(marker, start)
require(start >= 0 and end > start, 'Code.gs doGet/safe-include markers not found')

new_do_get = """function doGet(e) {
  const requestedView = e && e.parameter ? String(e.parameter.view || '') : '';
  // Legacy food URLs stay compatible, but Food is rendered inside the canonical cockpit.
  const view = requestedView === 'mobile' || requestedView === 'food-mobile' ? 'MobileIndex' : 'Index';
  const template = HtmlService.createTemplateFromFile(view);
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  return template.evaluate()
    .setTitle('Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

"""
code = code[:start] + new_do_get + code[end:]

# The source templates now own their runtime fragments, so this fallback injector is dead code.
safe_start = code.find(marker)
include_marker = '/** Includes repository-owned HTML fragments into the evaluated Apps-Script template. */'
safe_end = code.find(include_marker, safe_start)
require(safe_start >= 0 and safe_end > safe_start, 'safeIncludeHtml_ block markers not found')
code = code[:safe_start] + code[safe_end:]
require('FoodIndex' not in code[start:code.find(include_marker, start)], 'productive FoodIndex routing remains')
require('rendered.replace' not in code and 'isFoodView' not in code, 'post-render routing logic remains')
write(code_path, code)

food_path = 'src/FoodTrackingEnhancements.html'
food = read(food_path)
require('Demodaten' in food or 'Beispieldaten' in food, 'Food empty-state marker missing')
food = food.replace('Es werden keine Ersatz- oder Demodaten angezeigt.', 'Es werden keine Ersatz- oder Beispieldaten angezeigt.')
require(not re.search(r'FIXTURE|mock|fake|demo', food, re.I), 'Food enhancement still contains demo/mock/fake runtime markers')
write(food_path, food)

# ---------------------------------------------------------------------------
# Wave 7: explicit shared runtime fragments; no rendered HTML surgery.
# ---------------------------------------------------------------------------
shared_includes = "<?!= includeHtml_('CalendarWellbeingEnhancements'); ?>\n<?!= includeHtml_('FoodTrackingEnhancements'); ?>"
close = '\n</body>\n</html>'
for path in ['src/Index.html', 'src/MobileIndex.html']:
    html = read(path)
    require(html.rstrip().endswith('</body>\n</html>'), f'{path}: final body/html marker missing')
    if shared_includes not in html:
        pos = html.rfind(close)
        require(pos >= 0, f'{path}: closing marker not found')
        html = html[:pos] + '\n' + shared_includes + html[pos:]
    require(html.count("includeHtml_('CalendarWellbeingEnhancements')") == 1, f'{path}: calendar enhancement must be included exactly once')
    require(html.count("includeHtml_('FoodTrackingEnhancements')") == 1, f'{path}: Food enhancement must be included exactly once')
    if path.endswith('MobileIndex.html'):
        count = html.count('Heute im Kalender')
        require(count in (0, 1), f'{path}: unexpected calendar label count {count}')
        html = html.replace('Heute im Kalender', 'Kalenderwoche')
    write(path, html)

# ---------------------------------------------------------------------------
# Update contract tests to the canonical runtime architecture.
# ---------------------------------------------------------------------------
food_test_path = 'tests/food-tracking-contract.test.mjs'
food_test = read(food_test_path)
anchor = "const mobile = await readFile(join(root, 'src', 'FoodMobileIndex.html'), 'utf8');\n"
require(anchor in food_test, 'food test read anchor missing')
if 'const cockpitDesktop' not in food_test:
    food_test = food_test.replace(anchor, anchor + "const cockpitDesktop = await readFile(join(root, 'src', 'Index.html'), 'utf8');\nconst cockpitMobile = await readFile(join(root, 'src', 'MobileIndex.html'), 'utf8');\n")
old_start = food_test.find("test('Ernährung ist als getrennte Desktop-/Mobile-Route eingebunden'")
next_start = food_test.find("test('Hauptseite enthält nur einen kompakten Einstieg ohne erfundene Live-Werte'", old_start)
require(old_start >= 0 and next_start > old_start, 'legacy Food route test block not found')
new_route_test = r'''test('Ernährung ist in die kanonische Desktop-/Mobile-Route integriert', () => {
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
});'''
food_test = food_test[:old_start] + new_route_test + '\n\n' + food_test[next_start:]
food_test = food_test.replace("assert.match(entry, /document\\.addEventListener\\('click'/);", "assert.match(entry, /card\\.addEventListener\\('click',openFood\\)/);")
write(food_test_path, food_test)

cal_test_path = 'tests/calendar-wellbeing-enhancements.test.mjs'
cal_test = read(cal_test_path)
old_start = cal_test.find("test('Code.gs owns the single web entry point and injects the enhancement without modifying design sources'")
next_start = cal_test.find("test('calendar endpoint supports day week month and hides Möglichkeiten by default'", old_start)
require(old_start >= 0 and next_start > old_start, 'calendar entrypoint test block not found')
new_entry_test = r'''test('Code.gs owns the single web entry point while canonical templates own shared enhancement includes', async () => {
  const gsFiles = (await readdir(src)).filter(name => name.endsWith('.gs'));
  let doGetCount = 0;
  for (const name of gsFiles) {
    const content = await readFile(join(src, name), 'utf8');
    doGetCount += (content.match(/function\s+doGet\s*\(/g) || []).length;
  }
  assert.equal(doGetCount, 1);
  const doGet = code.match(/function doGet\(e\) \{([\s\S]*?)\n\}/)?.[0] || '';
  assert.match(doGet, /createTemplateFromFile\(view\)/);
  assert.match(doGet, /template\.evaluate\(\)/);
  assert.doesNotMatch(doGet, /getContent|rendered\.replace|safeIncludeHtml_|Heute im Kalender/);
  assert.doesNotMatch(calendarServer, /function\s+doGet\s*\(/);
  assert.doesNotMatch(wellbeingServer, /function\s+doGet\s*\(/);
  for (const source of [desktop, mobile]) {
    assert.equal((source.match(/includeHtml_\('CalendarWellbeingEnhancements'\)/g) || []).length, 1);
    assert.equal((source.match(/includeHtml_\('FoodTrackingEnhancements'\)/g) || []).length, 1);
  }
  assert.match(desktop, /Claude Design source SHA-256/);
  assert.match(desktop, /data-kz-calendar-detail-host/);
  assert.match(desktop, /showLedger:dk!=='calendar'/);
  assert.match(mobile, /Claude Mobile Design source SHA-256/);
  assert.match(mobile, /Kalenderwoche/);
});'''
cal_test = cal_test[:old_start] + new_entry_test + '\n\n' + cal_test[next_start:]
write(cal_test_path, cal_test)

claude_test_path = 'tests/claude-design-live.test.mjs'
claude_test = read(claude_test_path)
old_start = claude_test.find("test('Apps Script evaluates the design template and includes both repository-owned fragments'")
next_start = claude_test.find("test('live adapter covers every visible source and every authorized cockpit write'", old_start)
require(old_start >= 0 and next_start > old_start, 'Claude template test block not found')
new_template_test = r'''test('Apps Script evaluates one canonical desktop/mobile template and templates own shared runtime fragments', () => {
  assert.match(code, /const requestedView = e && e\.parameter \? String\(e\.parameter\.view \|\| ''\) : ''/);
  assert.match(code, /requestedView === 'mobile' \|\| requestedView === 'food-mobile'/);
  assert.match(code, /'MobileIndex' : 'Index'/);
  assert.match(code, /createTemplateFromFile\(view\)/);
  assert.match(code, /template\.evaluate\(\)/);
  assert.match(code, /function includeHtml_\(fileName\)/);
  const doGet = code.match(/function doGet\(e\) \{([\s\S]*?)\n\}/)?.[0] || '';
  assert.doesNotMatch(doGet, /getContent|rendered\.replace|FoodIndex|FoodMobileIndex/);
  for (const source of [index, mobile]) {
    assert.match(source, /includeHtml_\('ClaudeRuntime'\)/);
    assert.match(source, /includeHtml_\('LiveAdapter'\)/);
    assert.match(source, /includeHtml_\('CalendarWellbeingEnhancements'\)/);
    assert.match(source, /includeHtml_\('FoodTrackingEnhancements'\)/);
  }
});'''
claude_test = claude_test[:old_start] + new_template_test + '\n\n' + claude_test[next_start:]
write(claude_test_path, claude_test)

# Dedicated regression guard for Wave 7.
write('tests/frontend-template-dedup.test.mjs', r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [code, desktop, mobile] = await Promise.all([
  readFile(join(root, 'src', 'Code.gs'), 'utf8'),
  readFile(join(root, 'src', 'Index.html'), 'utf8'),
  readFile(join(root, 'src', 'MobileIndex.html'), 'utf8')
]);

function doGetBlock() {
  const block = code.match(/function doGet\(e\) \{([\s\S]*?)\n\}/)?.[0];
  assert.ok(block, 'doGet block missing');
  return block;
}

test('productive routing has only canonical desktop and mobile templates', () => {
  const block = doGetBlock();
  assert.match(block, /'MobileIndex' : 'Index'/);
  assert.doesNotMatch(block, /FoodIndex|FoodMobileIndex/);
});

test('doGet does not mutate evaluated HTML after template rendering', () => {
  const block = doGetBlock();
  assert.match(block, /return template\.evaluate\(\)/);
  assert.doesNotMatch(block, /getContent|\.replace\(|safeIncludeHtml_|enhancement/);
});

test('canonical templates each include shared runtime fragments exactly once', () => {
  const fragments = ['ClaudeRuntime', 'LiveAdapter', 'CalendarWellbeingEnhancements', 'FoodTrackingEnhancements'];
  for (const source of [desktop, mobile]) {
    for (const fragment of fragments) {
      const pattern = new RegExp(`includeHtml_\\('${fragment}'\\)`, 'g');
      assert.equal((source.match(pattern) || []).length, 1, `${fragment} must appear once`);
    }
  }
});

test('desktop and mobile remain intentionally distinct presentation templates', () => {
  assert.match(desktop, /data-screen-label="Kommandozentrale"/);
  assert.match(mobile, /data-screen-label="Kommandozentrale Mobil"/);
  assert.notEqual(desktop, mobile);
});
''')

write('docs/frontend-runtime-architecture.md', '''# Frontend Runtime Architecture – KZ 1.0\n\n## Productive templates\n\nThe productive Apps Script web entry point renders exactly one of two presentation templates:\n\n- `Index.html` — desktop presentation\n- `MobileIndex.html` — mobile presentation\n\nLegacy `FoodIndex.html` / `FoodMobileIndex.html` remain migration artifacts only. Legacy Food URLs resolve into the canonical cockpit.\n\n## Shared runtime layer\n\nBoth productive templates explicitly include the same repository-owned runtime fragments:\n\n1. `ClaudeRuntime.html`\n2. `LiveAdapter.html`\n3. `CalendarWellbeingEnhancements.html`\n4. `FoodTrackingEnhancements.html`\n\n`Code.gs` selects and evaluates the template only. It no longer reads rendered HTML back with `getContent()`, rewrites labels, or injects fragments using a closing-body regular expression.\n\n## Design boundary\n\nDesktop and mobile are intentionally separate presentation surfaces. KZ 1.0 does **not** force them into one visual template. Deduplication is applied to runtime/data behavior, while presentation-specific markup and interaction layout remain independent.\n\n## Food path\n\n`OPS.FOOD_* → getFoodV1() → FoodTrackingEnhancements → canonical cockpit`\n\nNo separate productive Food application path remains. Missing data stays missing instead of being replaced with invented sample values.\n''')

print('Phase 7 Wave 6/7 one-shot patch prepared successfully.')
