import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secondBrain = await readFile(join(root, 'src', 'SecondBrain.gs'), 'utf8');
const html = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const adapter = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const frontend = `${html}\n${adapter}`;

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
  assert.match(html, /data-tile="operator"/);
  assert.match(html, /Personal Operator/);
  assert.match(frontend, /Nächster sichtbarer Schritt/);
  assert.match(adapter, /\['personal',\s*'getPersonalOperatorContextV1'/);
  assert.match(adapter, /this\.call\('searchSecondBrainV1',\s*value,\s*false\)/);
  assert.match(html, /Read-only/);
  assert.doesNotMatch(frontend, /SECOND_BRAIN_ROOT_ID\s*=\s*['"][^'"]+['"]/);
});
