import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [adapterFile, codeFile, desktopFile, mobileFile] = await Promise.all([
  readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8'),
  readFile(join(root, 'src', 'Code.gs'), 'utf8'),
  readFile(join(root, 'src', 'Index.html'), 'utf8'),
  readFile(join(root, 'src', 'MobileIndex.html'), 'utf8')
]);
const adapterScript = adapterFile.replace(/^\s*<script>\s*/i, '').replace(/\s*<\/script>\s*$/i, '');

function harness() {
  const window = {};
  new Function('window', adapterScript)(window);
  return window.KZLive;
}

function setFrontend(adapter, state = 'ok') {
  Object.keys(adapter.loads).forEach(key => {
    adapter.loads[key] = { state, ms: state === 'ok' ? 12 : 0, error: state === 'error' ? 'boom' : '' };
  });
}

test('base dashboard endpoint no longer reads DASHBOARD_STATE shadow data', () => {
  const match = codeFile.match(/function getDashboardBaseV31\(force\) \{([\s\S]*?)\n\}\n\nfunction getFinanceV31/);
  assert.ok(match, 'getDashboardBaseV31 block missing');
  assert.doesNotMatch(match[1], /DASHBOARD_STATE/);
  assert.match(match[1], /SYNC_STATE/);
});

test('all successful frontend paths plus all-OK SYNC_STATE yields truthful green state', () => {
  const adapter = harness();
  setFrontend(adapter, 'ok');
  adapter.raw.syncRows = [{ status: 'OK' }, { status: 'OK' }];
  const state = adapter.systemTruthState();
  assert.equal(state.level, 'ok');
  assert.equal(state.label, 'Alle Quellen aktuell');
  assert.equal(state.color, '#5FBF8A');
});

test('DEGRADED backend source remains warning even when every frontend endpoint loaded', () => {
  const adapter = harness();
  setFrontend(adapter, 'ok');
  adapter.raw.syncRows = [{ status: 'OK' }, { status: 'DEGRADED' }];
  const state = adapter.systemTruthState();
  assert.equal(state.level, 'warn');
  assert.match(state.label, /eingeschränkt/);
  assert.notEqual(state.color, '#5FBF8A');
});

test('backend ERROR or frontend endpoint error yields error state', () => {
  const backendError = harness();
  setFrontend(backendError, 'ok');
  backendError.raw.syncRows = [{ status: 'ERROR' }];
  assert.equal(backendError.systemTruthState().level, 'error');

  const frontendError = harness();
  setFrontend(frontendError, 'ok');
  frontendError.loads.mail = { state: 'error', ms: 20, error: 'mail failed' };
  frontendError.raw.syncRows = [{ status: 'OK' }];
  assert.equal(frontendError.systemTruthState().level, 'error');
});

test('loading paths or missing backend status never claim all sources are current', () => {
  const loading = harness();
  setFrontend(loading, 'ok');
  loading.loads.health = { state: 'loading', ms: 0, error: '' };
  loading.raw.syncRows = [{ status: 'OK' }];
  assert.equal(loading.systemTruthState().level, 'loading');
  assert.doesNotMatch(loading.systemTruthState().label, /Alle Quellen aktuell/);

  const missing = harness();
  setFrontend(missing, 'ok');
  missing.raw.syncRows = [];
  assert.equal(missing.systemTruthState().level, 'warn');
  assert.equal(missing.systemTruthState().label, 'Sync-Status nicht verfügbar');
});

test('desktop and mobile status indicators bind to systemTruth instead of static green claims', () => {
  assert.doesNotMatch(desktopFile, /Alle Quellen synchron/);
  assert.match(desktopFile, /\{\{ systemTruth\.label \}\}/);
  assert.match(desktopFile, /background:\{\{ systemTruth\.color \}\}/);
  assert.match(desktopFile, /box-shadow:0 0 8px \{\{ systemTruth\.glow \}\}/);

  assert.match(mobileFile, /title="\{\{ systemTruth\.label \}\}"/);
  assert.match(mobileFile, /aria-label="\{\{ systemTruth\.label \}\}"/);
  assert.match(mobileFile, /background:\{\{ systemTruth\.color \}\}/);
});
