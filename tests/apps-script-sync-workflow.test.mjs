import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await readFile(join(root, '.github', 'workflows', 'sync-apps-script.yml'), 'utf8');

test('Apps Script sync is manual-only and main-only', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:\s*\n/);
  assert.match(workflow, /refs\/heads\/main/);
});

test('Apps Script sync keeps deployment separate', () => {
  assert.match(workflow, /clasp@3\.4\.0 push --force/);
  assert.doesNotMatch(workflow, /clasp@3\.4\.0 deploy/);
  assert.doesNotMatch(workflow, /create-deployment|update-deployment|deployments\.create/);
  assert.match(workflow, /Keine Web-App-Version wurde erstellt oder deployed/);
});

test('Apps Script sync preserves manifest and verifies exact runtime content', () => {
  assert.match(workflow, /\.apps-script-current\/appsscript\.json/);
  assert.match(workflow, /cp \.apps-script-current\/appsscript\.json src\/appsscript\.json/);
  assert.match(workflow, /live-only Dateien würden beim vollständigen Push gelöscht/);
  assert.match(workflow, /Apps-Script-Verifikation fehlgeschlagen/);
  assert.match(workflow, /"scriptExtensions": \["\.gs"\]/);
  assert.match(workflow, /"htmlExtensions": \["\.html"\]/);
});

test('Apps Script sync requires secret-backed credentials and Node 24', () => {
  assert.match(workflow, /secrets\.APPS_SCRIPT_ID/);
  assert.match(workflow, /secrets\.CLASPRC_JSON/);
  assert.match(workflow, /node-version: 24/);
  assert.doesNotMatch(workflow, /refresh_token\s*:/i);
  assert.doesNotMatch(workflow, /client_secret\s*:/i);
});
