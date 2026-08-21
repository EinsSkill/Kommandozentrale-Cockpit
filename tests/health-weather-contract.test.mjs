import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
const health = read('HealthSync.gs');
const weather = read('Weather.gs');
const code = read('Code.gs');
const index = read('Index.html');

for (const name of ['previewHealthSyncV1','runHealthSyncV1','setupHealthSyncV1','healthSyncParseStepsV1_','healthSyncParseActivitiesV1_','healthSyncUpsertHealthV1_','healthSyncUpsertWorkoutsV1_','healthSyncRebuildTrendsV1_']) {
  assert.match(health, new RegExp('function\\s+' + name + '\\b'), name);
}
assert.match(health, /healthSyncFilePriorityV1_/);
assert.match(health, /HEALTH_SYNC_V1_MISSING/);
assert.match(health, /CONNECTED_VIA_HEALTH_SYNC_DRIVE/);
assert.match(health, /everyMinutes\(cfg\.intervalMinutes\)/);

for (const name of ['previewWeatherSyncV1','runWeatherSyncV1','setupWeatherSyncV1','setupLiveDataV1','runLiveDataSyncV1','weatherTriggerStatusV1','getWeatherSnapshot_']) {
  assert.match(weather, new RegExp('function\\s+' + name + '\\b'));
}
assert.match(weather, /api\.open-meteo\.com\/v1\/forecast/);
assert.match(weather, /WEATHER_CURRENT/);
assert.match(weather, /WEATHER_HOURLY/);
assert.match(weather, /CONNECTED_VIA_OPEN_METEO/);
assert.match(weather, /WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS/);
assert.match(weather, /PropertiesService\.getScriptProperties\(\)/);
assert.match(weather, /Open-Meteo HTTP 429/);
assert.match(weather, /WEATHER_THROTTLED/);
assert.match(weather, /ScriptApp\.deleteTrigger/);
assert.match(weather, /lastSuccessAt/);
assert.match(weather, /stale/);
assert.match(code, /safeAssign_\(out, 'weather'/);
assert.match(code, /sync:healthSyncDashboard_\(rd\)/);
assert.match(index, /function renderWeather\(\)/);
assert.match(index, /Veralteter Stand/);
assert.doesNotMatch(index, /api\.open-meteo\.com/);
assert.doesNotMatch(health + weather + code, /1vfQZN9qLmGeE__Nyt2PdpxBw3bSiBgIR|1sYn_RuXoxx8d3Jk3zaXfleq0euvNqB4G|1PPQgjurSpUYgCiwBrnwYS6vBqZ59BOeT|1wIgebOEGKY5Oufb3Qp8o8z7r33SN0g7jEHXAq2Mwp1w/);
console.log('health/weather integration contract: ok');
