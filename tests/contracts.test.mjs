import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');
const html = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const adapter = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const frontend = `${html}\n${adapter}`;
const fixtures = JSON.parse(await readFile(join(root, 'fixtures', 'email_refs.json'), 'utf8'));

test('backend mail endpoint uses the OPS EMAIL_REFS contract', () => {
  assert.match(code, /function getMailV3\(force\)/);
  assert.match(code, /return getMailFromRefs_\(\);/);
  assert.match(code, /source:\s*'OPS\.EMAIL_REFS'/);
  assert.match(code, /sourceOfTruth:\s*'Gmail'/);
  assert.doesNotMatch(code, /GmailApp\./);
  assert.doesNotMatch(code, /classifyCockpitMail_/);
});

test('frontend calls the compatible getMailV3 endpoint', () => {
  assert.match(adapter, /\['mail',\s*'getMailV3'/);
  assert.match(adapter, /sourceOfTruth|OPS\.EMAIL_REFS|E-Mail-Referenzen/);
});

test('repository source contains no live OPS identifier or personal Gmail address', () => {
  assert.doesNotMatch(code, /docs\.google\.com\/spreadsheets\/d\//);
  assert.doesNotMatch(`${code}\n${frontend}`, /[A-Z0-9._%+-]+@gmail\.com/i);
  assert.match(code, /OPS_SPREADSHEET_ID/);
  assert.match(code, /REPLACE_WITH_SCRIPT_PROPERTY/);
  assert.match(code, /getScriptProperties\(\)/);
});

test('fixtures are anonymized and satisfy the EMAIL_REFS minimum contract', () => {
  assert.equal(fixtures.length, 6);
  for (const row of fixtures) {
    for (const field of ['email_ref_id', 'sender', 'subject', 'received_at', 'relevance', 'ai_summary']) {
      assert.ok(row[field] !== undefined && row[field] !== '', `${field} missing`);
    }
    assert.match(row.sender, /@example\.invalid$/);
    assert.equal(typeof row.relevance, 'number');
    assert.ok(row.relevance >= 0 && row.relevance <= 100);
  }
});
