import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const weatherSource = fs.readFileSync(new URL('../src/Weather.gs', import.meta.url), 'utf8');

function makeWeatherContext(responseStatus = 200, headers = {}) {
  const values = new Map();
  let fetches = 0;
  const response = {
    getResponseCode: () => responseStatus,
    getHeaders: () => headers,
    getContentText: () => JSON.stringify({current: {time: '2026-08-22T00:00'}, hourly: {time: []}})
  };
  const context = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => values.get(key) ?? null,
        setProperty: (key, value) => values.set(key, String(value)),
        deleteProperty: key => values.delete(key)
      })
    },
    UrlFetchApp: {
      fetch: () => {
        fetches += 1;
        return response;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(weatherSource, context);
  return {context, getFetches: () => fetches};
}

test('weather fetch enforces a minimum interval between provider requests', () => {
  const fixture = makeWeatherContext();
  const cfg = {latitude: 51.16, longitude: 6.67, timezone: 'Europe/Berlin', forecastHours: 24};

  assert.equal(fixture.context.weatherFetchV1_(cfg).current.time, '2026-08-22T00:00');
  assert.throws(() => fixture.context.weatherFetchV1_(cfg), error => {
    assert.equal(error.code, 'WEATHER_THROTTLED');
    return true;
  });
  assert.equal(fixture.getFetches(), 1);
});

test('weather fetch pauses after Open-Meteo rate limiting', () => {
  const fixture = makeWeatherContext(429, {'Retry-After': '600'});
  const cfg = {latitude: 51.16, longitude: 6.67, timezone: 'Europe/Berlin', forecastHours: 24};

  assert.throws(() => fixture.context.weatherFetchV1_(cfg), error => {
    assert.equal(error.code, 'OPEN_METEO_RATE_LIMIT');
    return true;
  });
  assert.throws(() => fixture.context.weatherFetchV1_(cfg), error => {
    assert.equal(error.code, 'WEATHER_THROTTLED');
    return true;
  });
  assert.equal(fixture.getFetches(), 1);
});


test('weather sync uses hourly cadence and multi-hour 429 cooldown', () => {
  assert.match(weatherSource, /WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS = 60 \* 60/);
  assert.match(weatherSource, /WEATHER_V1_429_COOLDOWN_SECONDS = 2 \* 60 \* 60/);
  assert.match(weatherSource, /everyHours\(1\)/);
  assert.match(weatherSource, /Math\.min\(6 \* 60 \* 60/);
  assert.match(weatherSource, /status:errorMessage \? 'DEGRADED' : 'OK'/);
  assert.match(weatherSource, /available:true/);
});
