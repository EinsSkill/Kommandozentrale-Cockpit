from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
code_path = root / 'src' / 'Code.gs'
ext_path = root / 'src' / 'ZZ_CalendarWellbeingEnhancements.gs'
test_path = root / 'tests' / 'single-doget-contract.test.mjs'

code = code_path.read_text(encoding='utf-8')
old = """function doGet(e) {
  const view = e && e.parameter && e.parameter.view === 'mobile' ? 'MobileIndex' : 'Index';
  const template = HtmlService.createTemplateFromFile(view);
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  return template.evaluate()
    .setTitle('Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
"""
new = """function doGet(e) {
  const view = e && e.parameter && e.parameter.view === 'mobile' ? 'MobileIndex' : 'Index';
  const template = HtmlService.createTemplateFromFile(view);
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  const evaluated = template.evaluate();
  const enhancement = HtmlService.createHtmlOutputFromFile('CalendarWellbeingEnhancements').getContent();
  // Mobile currently labels the card \"Heute im Kalender\"; normalize it so the
  // shared enhancement layer can address the same calendar surface on both views.
  const rendered = evaluated.getContent().replace('Heute im Kalender', 'Kalenderwoche');
  const content = rendered.replace(/<\\/body>\\s*<\\/html>\\s*$/i, enhancement + '\\n</body>\\n</html>');
  return HtmlService.createHtmlOutput(content)
    .setTitle('Lukes Kommandozentrale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
"""
if old not in code:
    raise SystemExit('Expected original Code.gs doGet block not found; aborting safely.')
code_path.write_text(code.replace(old, new, 1), encoding='utf-8')

ext = ext_path.read_text(encoding='utf-8')
pattern = re.compile(r"^/\*\*[\s\S]*?\*/\nfunction doGet\(e\) \{[\s\S]*?\n\}\n\n(?=/\*\*)")
replacement = """/**
 * Kommandozentrale – modular calendar + dated wellbeing extension.
 *
 * The web entry point lives exclusively in Code.gs. This file only provides
 * the calendar and wellbeing endpoints used by the shared enhancement layer.
 */

"""
ext2, count = pattern.subn(replacement, ext, count=1)
if count != 1:
    raise SystemExit(f'Expected exactly one extension doGet block, replaced {count}.')
ext_path.write_text(ext2, encoding='utf-8')

test_path.write_text("""import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

test('Apps Script project exposes exactly one doGet entry point', async () => {
  const files = (await readdir(src)).filter(name => name.endsWith('.gs'));
  let count = 0;
  for (const name of files) {
    const content = await readFile(join(src, name), 'utf8');
    count += (content.match(/function\\s+doGet\\s*\\(/g) || []).length;
  }
  assert.equal(count, 1);
});

test('Code.gs owns enhancement injection and extension has no web entry point', async () => {
  const code = await readFile(join(src, 'Code.gs'), 'utf8');
  const ext = await readFile(join(src, 'ZZ_CalendarWellbeingEnhancements.gs'), 'utf8');
  assert.match(code, /CalendarWellbeingEnhancements/);
  assert.match(code, /Heute im Kalender/);
  assert.match(code, /HtmlService\\.createHtmlOutput\\(content\\)/);
  assert.doesNotMatch(ext, /function\\s+doGet\\s*\\(/);
  assert.match(ext, /getCalendarViewV4/);
  assert.match(ext, /saveWellbeingEntryV2/);
});
""", encoding='utf-8')

print('single doGet patch applied')
