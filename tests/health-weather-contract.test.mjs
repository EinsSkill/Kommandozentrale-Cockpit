import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const health = fs.readFileSync(new URL('../src/HealthSync.gs', root), 'utf8');
const weather = fs.readFileSync(new URL('../src/Weather.gs', root), 'utf8');
const code = fs.readFileSync(new URL('../src/Code.gs', root), 'utf8');
const index = fs.readFileSync(new URL('../src/Index.html', root), 'utf8');
const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/health_sync_sample.json', root), 'utf8'));

for (const name of ['previewHealthSyncV1','runHealthSyncV1','setupHealthSyncV1','healthSyncParseStepsV1_','healthSyncParseActivitiesV1_','healthSyncUpsertHealthV1_','healthSyncUpsertWorkoutsV1_']) {
  assert.match(health, new RegExp('function\\s+' + name + '\\b'), name);
}
assert.match(health, /healthSyncFilePriorityV1_/);
assert.match(health, /HEALTH_SYNC_V1_SOURCE/);
assert.match(health, /CONNECTED_VIA_HEALTH_SYNC_DRIVE/);
assert.match(health, /everyMinutes\(cfg\.intervalMinutes\)/);
assert.match(health, /HEALTH_SYNC_V1_MISSING/);

for (const name of ['previewWeatherSyncV1','runWeatherSyncV1','setupWeatherSyncV1','setupLiveDataV1','runLiveDataSyncV1','getWeatherSnapshot_']) {
  assert.match(weather, new RegExp('function\\s+' + name + '\\b'), name);
}
assert.match(weather, /api\.open-meteo\.com\/v1\/forecast/);
assert.match(weather, /WEATHER_CURRENT/);
assert.match(weather, /WEATHER_HOURLY/);
assert.match(weather, /CONNECTED_VIA_OPEN_METEO/);

assert.match(code, /safeAssign_\(out, 'weather'/);
assert.match(code, /sync:healthSyncDashboard_\(rd\)/);
assert.match(index, /function renderWeather\(\)/);
assert.match(index, /Wetterquelle noch nicht angebunden/);

assert.ok(fixture.stepsCsv.includes('Schritte'));
assert.ok(fixture.activityCsv.includes('Aktivitätstyp'));
assert.ok(fixture.tcx.includes('TotalTimeSeconds'));
assert.ok(fixture.weightCsv.includes('Körperfettanteil'));

for (const forbidden of [
  '1vfQZN9qLmGeE__Nyt2PdpxBw3bSiBgIR',
  '1sYn_RuXoxx8d3Jk3zaXfleq0euvNqB4G',
  '1PPQgjurSpUYgCiwBrnwYS6vBqZ59BOeT',
  '1wIgebOEGKY5Oufb3Qp8o8z7r33SN0g7jEHXAq2Mwp1w'
]) {
  assert.equal(health.includes(forbidden) || weather.includes(forbidden) || code.includes(forbidden), false);
}
console.log('health/weather integration contract: ok');
