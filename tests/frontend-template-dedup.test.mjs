import assert from 'node:assert/strict';
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
