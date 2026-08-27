from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'{label}: expected marker not found')


# 1) Remove unused DASHBOARD_STATE runtime dependency from the progressive base endpoint.
code_path = Path('src/Code.gs')
code = code_path.read_text()
code = re.sub(
    r"\n\s*safeAssign_\(out, 'dashboardState', function\(\)\{ return rd\.rows\('DASHBOARD_STATE'\); \}, \[\]\);",
    '',
    code,
    count=1,
)
base_match = re.search(r'function getDashboardBaseV31\(force\) \{([\s\S]*?)\n\}\n\nfunction getFinanceV31', code)
if not base_match:
    raise SystemExit('getDashboardBaseV31 block not found')
if 'DASHBOARD_STATE' in base_match.group(1):
    raise SystemExit('DASHBOARD_STATE still referenced by getDashboardBaseV31')
code_path.write_text(code)


# 2) Add combined system-truth state while preserving sourceState() for frontend boot progress.
adapter_path = Path('src/LiveAdapter.html')
adapter = adapter_path.read_text()
if 'systemTruthState()' not in adapter:
    marker = re.search(r'(\n    sourceState\(\) \{[\s\S]*?\n    \},)(\n\n    bootLog\(\) \{)', adapter)
    if not marker:
        raise SystemExit('sourceState/bootLog marker not found')
    method = r'''

    systemTruthState() {
      const frontend = this.sourceState();
      const backend = asArray(this.raw.syncRows);
      const backendErrors = backend.filter(row => statusUpper(row.status) === 'ERROR').length;
      const backendWarnings = backend.filter(row => {
        const status = statusUpper(row.status || 'UNKNOWN');
        return status !== 'OK' && status !== 'ERROR';
      }).length;
      const backendOk = backend.filter(row => statusUpper(row.status) === 'OK').length;
      const backendState = { ok: backendOk, warnings: backendWarnings, errors: backendErrors, total: backend.length };

      if (frontend.errors || backendErrors) {
        const errors = Number(frontend.errors || 0) + backendErrors;
        return {
          level: 'error',
          label: errors === 1 ? '1 Systemfehler' : `${errors} Systemfehler`,
          color: '#C56E3A', glow: 'rgba(197,110,58,.75)', frontend, backend: backendState
        };
      }
      if (frontend.loading || frontend.waiting) {
        return {
          level: 'loading', label: `${frontend.ok}/${SOURCE_KEYS.length} Datenpfade bereit`,
          color: '#DDB65C', glow: 'rgba(221,182,92,.75)', frontend, backend: backendState
        };
      }
      if (!backend.length) {
        return {
          level: 'warn', label: 'Sync-Status nicht verfügbar',
          color: '#DDB65C', glow: 'rgba(221,182,92,.75)', frontend, backend: backendState
        };
      }
      if (backendWarnings) {
        return {
          level: 'warn',
          label: backendWarnings === 1 ? '1 System eingeschränkt' : `${backendWarnings} Systeme eingeschränkt`,
          color: '#DDB65C', glow: 'rgba(221,182,92,.75)', frontend, backend: backendState
        };
      }
      return {
        level: 'ok', label: 'Alle Quellen aktuell',
        color: '#5FBF8A', glow: 'rgba(95,191,138,.8)', frontend, backend: backendState
      };
    },'''
    adapter = adapter[:marker.end(1)] + method + adapter[marker.start(2):]
adapter_path.write_text(adapter)


# 3) Bind desktop/mobile status surfaces to the combined truth state.
def patch_template(path_name, desktop=False):
    path = Path(path_name)
    text = path.read_text()
    text = replace_once(
        text,
        'const sourceState=window.KZLive.sourceState();',
        'const sourceState=window.KZLive.sourceState();\n    const systemTruth=window.KZLive.systemTruthState();',
        f'{path_name} systemTruth declaration'
    )
    if desktop:
        text = replace_once(
            text,
            "showApp:S.phase!=='boot',sourceState,",
            "showApp:S.phase!=='boot',sourceState,systemTruth,",
            f'{path_name} systemTruth return binding'
        )
        old_dot = '<span style="width:6px;height:6px;border-radius:50%;background:#5FBF8A;box-shadow:0 0 8px #5FBF8A;animation:kBreathe 2.6s ease-in-out infinite"></span>'
        new_dot = '<span style="width:6px;height:6px;border-radius:50%;background:{{ systemTruth.color }};box-shadow:0 0 8px {{ systemTruth.glow }};animation:kBreathe 2.6s ease-in-out infinite"></span>'
        text = replace_once(text, old_dot, new_dot, f'{path_name} desktop status dot')
        text = replace_once(
            text,
            '<span style="font-size:11.5px;color:#DFD5BE;letter-spacing:.02em">Alle Quellen synchron</span>',
            '<span style="font-size:11.5px;color:#DFD5BE;letter-spacing:.02em">{{ systemTruth.label }}</span>',
            f'{path_name} desktop status label'
        )
        if 'Alle Quellen synchron' in text:
            raise SystemExit('desktop template still contains false static sync label')
    else:
        text = replace_once(
            text,
            "showApp:S.phase!=='boot',ambient:amb,",
            "showApp:S.phase!=='boot',ambient:amb,systemTruth,",
            f'{path_name} systemTruth return binding'
        )
        old_dot = '<span style="width:6px;height:6px;border-radius:50%;background:#5FBF8A;box-shadow:0 0 8px #5FBF8A;animation:kBreathe 2.6s ease-in-out infinite;flex:0 0 auto"></span>'
        new_dot = '<span title="{{ systemTruth.label }}" aria-label="{{ systemTruth.label }}" style="width:6px;height:6px;border-radius:50%;background:{{ systemTruth.color }};box-shadow:0 0 8px {{ systemTruth.glow }};animation:kBreathe 2.6s ease-in-out infinite;flex:0 0 auto"></span>'
        text = replace_once(text, old_dot, new_dot, f'{path_name} mobile status dot')
    path.write_text(text)


patch_template('src/Index.html', desktop=True)
patch_template('src/MobileIndex.html', desktop=False)


# 4) Regression tests.
Path('tests/system-status-truth.test.mjs').write_text(r'''import assert from 'node:assert/strict';
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
''')


Path('docs/system-status-truth-contract.md').write_text(r'''# System Status Truth Contract – KZ 1.0

## Status

Phase 7 Wave 4 canonical status-surface distinction.

## Frontend path state

`KZLive.sourceState()` describes only the browser-to-Apps-Script endpoint load state for the seven progressive cockpit paths. It remains the correct signal for boot/progress UI and latency diagnostics.

A successful endpoint call does **not** imply that the underlying domain source is healthy or fresh.

## Combined system truth

`KZLive.systemTruthState()` is the status used for visible system-health indicators. It combines:

- current frontend endpoint states; and
- authoritative operational statuses from `OPS.SYNC_STATE` returned by `getDashboardBaseV31()`.

Precedence is conservative:

1. frontend or backend `ERROR` → error;
2. frontend paths still loading/waiting → loading;
3. missing `SYNC_STATE` evidence → warning;
4. any non-`OK` backend status such as `DEGRADED` or `UNKNOWN` → warning;
5. only all-ready frontend paths plus present all-`OK` backend rows → OK.

Therefore the cockpit must never render a fully green/all-current claim merely because its API calls succeeded.

## DASHBOARD_STATE

`DASHBOARD_STATE` remains untouched in OPS for migration/history safety, but it is no longer read by `getDashboardBaseV31()` and is not a runtime authority for the current cockpit.

## Presentation

- Desktop header label, dot color and glow use the combined system truth state.
- Mobile header dot uses the same combined state and exposes its label via `title`/`aria-label`.
- The existing System detail view continues to show per-source and per-path rows.

## Out of scope

This wave does not change sync writers, source freshness rules, OPS schema, visual design, Food, permissions, or Apps Script deployment.
''')
