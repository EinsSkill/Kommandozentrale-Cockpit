import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGasModule } from './helpers/gas-runtime.mjs';

const gas = await loadGasModule(['Code.gs', 'HealthSync.gs']);
const { healthSyncBuildTrendsV1_ } = gas;
assert.equal(typeof healthSyncBuildTrendsV1_, 'function', 'healthSyncBuildTrendsV1_ must exist');

function dayRow(date, overrides) {
  return Object.assign({
    health_id: 'HEALTH_' + date,
    date,
    steps: 8000,
    sleep_duration_minutes: 420,
    resting_hr: 55,
    hrv: 40,
    weight_kg: 78,
    workout_count: 0
  }, overrides);
}

const completeWeekDays = [
  '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
  '2026-08-05', '2026-08-07', '2026-08-08', '2026-08-09'
].map(date => dayRow(date));

test('abgeschlossene Woche → period_complete = TRUE', () => {
  const output = healthSyncBuildTrendsV1_(completeWeekDays, new Date('2026-08-17T12:00:00Z'));
  const week = output.find(r => r.data_through === '2026-08-09');
  assert.ok(week);
  assert.equal(week.period_complete, true);
});

test('laufende Woche → period_complete = FALSE', () => {
  const output = healthSyncBuildTrendsV1_(completeWeekDays, new Date('2026-08-06T12:00:00Z'));
  const week = output.find(r => r.data_through === '2026-08-09');
  assert.ok(week);
  assert.equal(week.period_complete, false);
});

test('coverage_days zählt eindeutige Tage ohne Doppelzählung', () => {
  const week = healthSyncBuildTrendsV1_(completeWeekDays, new Date('2026-08-17T12:00:00Z')).find(r => r.data_through === '2026-08-09');
  assert.equal(week.coverage_days, 7);
});

test('data_through entspricht dem neuesten tatsächlich genutzten Datum', () => {
  const partialWeek = [dayRow('2026-08-03'), dayRow('2026-08-04'), dayRow('2026-08-05')];
  const week = healthSyncBuildTrendsV1_(partialWeek, new Date('2026-08-06T12:00:00Z'))[0];
  assert.equal(week.data_through, '2026-08-05');
  assert.equal(week.coverage_days, 3);
  assert.equal(week.period_complete, false);
});

test('wiederholter Rebuild erzeugt deterministisch dieselben Coverage-Werte', () => {
  const now = new Date('2026-08-17T12:00:00Z');
  const first = healthSyncBuildTrendsV1_(completeWeekDays, now);
  const second = healthSyncBuildTrendsV1_(completeWeekDays, now);
  assert.deepEqual(
    first.map(r => ({ coverage_days: r.coverage_days, data_through: r.data_through, period_complete: r.period_complete })),
    second.map(r => ({ coverage_days: r.coverage_days, data_through: r.data_through, period_complete: r.period_complete }))
  );
});

test('bestehende Trendwerte bleiben durch Coverage-Erweiterung unverändert', () => {
  const week = healthSyncBuildTrendsV1_(completeWeekDays, new Date('2026-08-17T12:00:00Z')).find(r => r.data_through === '2026-08-09');
  assert.equal(week.avg_steps, 8000);
  assert.equal(week.avg_sleep, 420);
  assert.equal(week.avg_resting_hr, 55);
  assert.equal(week.avg_hrv, 40);
  assert.equal(week.avg_weight, 78);
  assert.equal(week.ai_summary, 'Berechnet aus HEALTH_DAILY; fehlende Messfelder bleiben leer.');
});

test('fehlende Rohmetriken bleiben leer statt erfunden', () => {
  const sparseWeek = [dayRow('2026-08-03', { steps: '', sleep_duration_minutes: 0, resting_hr: 0, hrv: 0, weight_kg: 0 })];
  const week = healthSyncBuildTrendsV1_(sparseWeek, new Date('2026-08-17T12:00:00Z'))[0];
  assert.equal(week.avg_steps, '');
  assert.equal(week.avg_sleep, '');
  assert.equal(week.avg_resting_hr, '');
  assert.equal(week.avg_hrv, '');
  assert.equal(week.avg_weight, '');
  assert.equal(week.coverage_days, 1);
  assert.equal(week.data_through, '2026-08-03');
});

test('Europe/Berlin boundary: Monday after midnight Berlin completes prior week even while UTC is Sunday', () => {
  const week = healthSyncBuildTrendsV1_(completeWeekDays, new Date('2026-08-09T22:30:00Z')).find(r => r.data_through === '2026-08-09');
  assert.ok(week);
  assert.equal(week.period_complete, true);
});

test('Europe/Berlin boundary: Sunday before midnight Berlin keeps current week incomplete', () => {
  const week = healthSyncBuildTrendsV1_(completeWeekDays, new Date('2026-08-09T21:30:00Z')).find(r => r.data_through === '2026-08-09');
  assert.ok(week);
  assert.equal(week.period_complete, false);
});
