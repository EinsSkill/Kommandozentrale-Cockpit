import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const operator = await readFile(join(root, 'src', 'PersonalOperator.gs'), 'utf8');
const html = await readFile(join(root, 'src', 'Index.html'), 'utf8');

test('personal operator uses a small canonical allowlist', () => {
  assert.match(operator, /function getPersonalOperatorContextV1\(force\)/);
  assert.match(operator, /const PLO_CORE_PATHS/);
  assert.match(operator, /_System\/SCHEMA\.md/);
  assert.match(operator, /_System\/Wissenslandkarte\.md/);
  assert.match(operator, /Selbstentwicklung\/Persoenliches-Betriebssystem\.md/);
  assert.match(operator, /Business\/Business-Betriebssystem\.md/);
  assert.match(operator, /Ausbildung\/Lernsystem\.md/);
  assert.match(operator, /cachedJson_\(/);
  assert.match(operator, /fullVaultSearch: 'on-demand'/);
  assert.doesNotMatch(operator, /_System\/Project_Instructions\.md/);
  assert.doesNotMatch(operator, /Selbstentwicklung\/Interessen-und-Tech\.md/);
  assert.doesNotMatch(operator, /TASKS\.md/);
});

test('personal operator is read-only and sensitive by default', () => {
  assert.match(operator, /sensitiveDefault/);
  assert.match(operator, /operationalTruth: 'OPS Sheet'/);
  assert.doesNotMatch(operator, /createFile\(|setContent\(|moveTo\(|setTrashed\(|createFolder\(/);
});

test('frontend shows decisions and keeps full-vault search on demand', () => {
  assert.match(html, /getPersonalOperatorContextV1/);
  assert.match(html, /Persönlicher Operator/);
  assert.match(html, /Nächster sichtbarer Schritt/);
  assert.match(html, /Bewusst nicht jetzt/);
  assert.ok(html.indexOf('card-persoenlich') < html.indexOf('<footer'), 'personal operator card should render directly before the footer');
  assert.match(html, /searchSecondBrainV1/);
  assert.doesNotMatch(html, /getPersonalContextV1/);
});
