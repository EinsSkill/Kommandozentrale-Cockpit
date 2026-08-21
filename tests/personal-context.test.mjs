import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secondBrain = await readFile(join(root, 'src', 'SecondBrain.gs'), 'utf8');
const html = await readFile(join(root, 'src', 'Index.html'), 'utf8');

test('Second Brain context is read-only and property-configured', () => {
  assert.match(secondBrain, /function getPersonalContextV1\(force\)/);
  assert.match(secondBrain, /function searchSecondBrainV1\(query, includeSensitive\)/);
  assert.match(secondBrain, /DriveApp\.getFolderById/);
  assert.match(secondBrain, /SECOND_BRAIN_ROOT_ID/);
  assert.match(secondBrain, /SECOND_BRAIN_CANONICAL_FILES_MISSING/);
  assert.doesNotMatch(secondBrain, /createFile\(|setContent\(|moveTo\(|setTrashed\(|createFolder\(/);
});

test('personal context scans broadly but blocks sensitive search results by default', () => {
  assert.match(secondBrain, /sensitivity === 'sensitive'/);
  assert.match(secondBrain, /blockedSensitive/);
  assert.match(secondBrain, /includeSensitive/);
  assert.match(secondBrain, /SECOND_BRAIN_ALLOW_SENSITIVE_SEARCH/);
  assert.match(secondBrain, /gesamter Vault als Suchraum/);
});

test('frontend loads the curated personal operator without copying the vault', () => {
  assert.match(html, /card-persoenlich/);
  assert.match(html, /Persönlicher Operator/);
  assert.match(html, /Nächster sichtbarer Schritt/);
  assert.match(html, /callServer\('getPersonalOperatorContextV1',force\)/);
  assert.match(html, /callServer\('searchSecondBrainV1',query,false\)/);
  assert.match(html, /read-only/);
  assert.doesNotMatch(html, /SECOND_BRAIN_ROOT_ID\s*=\s*['"][^'"]+['"]/);
});
