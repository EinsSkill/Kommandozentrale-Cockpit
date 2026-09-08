import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGasModule, makeFakeSheet, makeFakeSpreadsheet } from './helpers/gas-runtime.mjs';

function assertTransportSafe(value, path = 'response') {
  assert.ok(!(value instanceof Date), `${path} contains a Date rejected by google.script.run`);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertTransportSafe(child, `${path}.${key}`);
  }
}

async function backend({ cacheDisabled = false } = {}) {
  const cache = new Map();
  const stamp = new Date('2026-09-08T10:00:00Z');
  const ss = makeFakeSpreadsheet({
    SYS_CONFIG: makeFakeSheet(['config_key', 'config_value'], [['last_review', stamp]]),
    SYNC_STATE: makeFakeSheet(['system_name', 'status', 'last_success_at'], [['OPS Sheet', 'OK', stamp]]),
    TASKS: makeFakeSheet(['task_id', 'title', 'status', 'deadline'], [['TASK_TEST', 'Fixture task', 'OPEN', stamp]])
  });
  const gas = await loadGasModule(['Code.gs', 'Weather.gs'], {
    SpreadsheetApp: { openById: () => ss },
    CacheService: { getScriptCache: () => ({
      get: key => cache.get(key) || null,
      put: (key, value) => { if (cacheDisabled) throw new Error('cache unavailable'); cache.set(key, value); },
      remove: key => cache.delete(key)
    }) }
  });
  return gas;
}

for (const cacheDisabled of [false, true]) {
  test(`OPS first load and forced reload return transport-safe dates (cache disabled: ${cacheDisabled})`, async () => {
    const gas = await backend({ cacheDisabled });
    for (const force of [false, false, true]) {
      const result = gas.getDashboardBaseV31(force);
      assertTransportSafe(result);
      assert.equal(result.runtimeVersion, 'PHASE7_LIVE_HOTFIX_2');
      assert.equal(result.syncState[0].last_success_at, '2026-09-08T10:00:00.000Z');
      assert.equal(result.system.last_review, '2026-09-08T10:00:00.000Z');
      assert.equal(result.tasks[0].id, 'TASK_TEST');
      assert.equal(result.integrity.openTaskCandidates, 1);
      assert.deepEqual(result.errors, {});
    }
  });
}

test('fresh and cached JSON responses agree, including nested dates and large uncached payloads', async () => {
  const gas = await backend();
  for (const length of [1, 100000]) {
    const producer = () => ({ nested: [{ at: new Date('2026-09-08T10:00:00Z') }], text: 'x'.repeat(length) });
    const fresh = gas.cachedJson_(`fixture-${length}`, 45, false, producer);
    const next = gas.cachedJson_(`fixture-${length}`, 45, false, producer);
    assertTransportSafe(fresh);
    assert.deepEqual(fresh, next);
  }
});
