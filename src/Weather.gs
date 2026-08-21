/**
 * Weather -> OPS integration.
 *
 * Open-Meteo is queried by Apps Script on a time-driven trigger. The current
 * snapshot and a small hourly projection live in OPS; the cockpit only reads
 * that projection and never calls the weather provider from the browser.
 *
 * Location values are configuration, not source code.
 */
var WEATHER_V1_SOURCE = 'Open-Meteo';
var WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS = 10 * 60;
var WEATHER_V1_429_COOLDOWN_SECONDS = 30 * 60;
var WEATHER_V1_LAST_REQUEST_PROPERTY = 'WEATHER_V1_LAST_REQUEST_AT';
var WEATHER_V1_NEXT_ALLOWED_PROPERTY = 'WEATHER_V1_NEXT_ALLOWED_AT';

function previewWeatherSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  var cfg = weatherConfigV1_(ss);
  if (!cfg.enabled) return {ok:false, status:'DISABLED'};
  if (cfg.latitude == null || cfg.longitude == null) {
    return {ok:false, status:'NOT_CONFIGURED', message:'Wetterkoordinaten in SYS_CONFIG fehlen.'};
  }
  var payload;
  try {
    payload = weatherFetchV1_(cfg);
  } catch (error) {
    var previewMessage = String(error && error.message ? error.message : error);
    return {
      ok:false,
      status:error && error.code === 'WEATHER_THROTTLED' ? 'THROTTLED' : 'ERROR',
      source:WEATHER_V1_SOURCE,
      error:previewMessage,
      retryAt:error && error.retryAt ? error.retryAt : ''
    };
  }
  return {
    ok:true,
    status:'PREVIEW',
    source:WEATHER_V1_SOURCE,
    location:cfg.locationLabel,
    current:weatherCurrentV1_(payload),
    hourlyCount:payload.hourly && payload.hourly.time ? payload.hourly.time.length : 0
  };
}

function runWeatherSyncV1() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return {ok:false, status:'BUSY', message:'Ein anderer Live-Daten-Lauf ist noch aktiv.'};
  var ss = null;
  try {
    ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
    var cfg = weatherConfigV1_(ss);
    if (!cfg.enabled) return {ok:false, status:'DISABLED'};
    if (cfg.latitude == null || cfg.longitude == null) {
      throw new Error('Wetterkoordinaten in SYS_CONFIG fehlen.');
    }
    var payload = weatherFetchV1_(cfg);
    var written = weatherWriteV1_(ss, cfg, payload);
    weatherUpdateStateV1_(ss, cfg, payload, null);
    appendAudit_(ss, {
      actor:'APPS_SCRIPT',
      action_type:'WEATHER_SYNC',
      target_system:'OPEN_METEO',
      target_id:'WEATHER_CURRENT/WEATHER_HOURLY',
      trigger_type:'TIME_DRIVEN',
      permission_class:'AUTO_IF_REVERSIBLE',
      status:'SUCCESS',
      previous_value:'',
      new_value:JSON.stringify({hourly:written.hourly, current:written.current})
    });
    invalidateCore_();
    return {
      ok:true,
      status:'OK',
      source:WEATHER_V1_SOURCE,
      location:cfg.locationLabel,
      current:weatherCurrentV1_(payload),
      written:written
    };
  } catch (error) {
    if (error && error.code === 'WEATHER_THROTTLED') {
      return {
        ok:true,
        status:'THROTTLED',
        source:WEATHER_V1_SOURCE,
        retryAt:error.retryAt || '',
        message:error.message || 'Wetter-Refresh pausiert.'
      };
    }
    var message = String(error && error.message ? error.message : error);
    if (ss) {
      try {
        weatherUpdateStateV1_(ss, null, null, message);
        appendAudit_(ss, {
          actor:'APPS_SCRIPT',
          action_type:'WEATHER_SYNC',
          target_system:'OPEN_METEO',
          target_id:'WEATHER_CURRENT/WEATHER_HOURLY',
          trigger_type:'TIME_DRIVEN',
          permission_class:'AUTO_IF_REVERSIBLE',
          status:'ERROR',
          previous_value:'',
          new_value:message
        });
      } catch (ignored) {}
    }
    return {ok:false, status:'ERROR', source:WEATHER_V1_SOURCE, error:message};
  } finally {
    lock.releaseLock();
  }
}

function setupWeatherSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  var cfg = weatherConfigV1_(ss);
  if (!cfg.enabled) return {ok:false, status:'DISABLED'};
  if (cfg.latitude == null || cfg.longitude == null) {
    return {ok:false, status:'NOT_CONFIGURED', message:'Wetterkoordinaten in SYS_CONFIG fehlen.'};
  }
  weatherEnsureSheetV1_(ss, 'WEATHER_CURRENT', [
    'weather_id','observed_at','location_label','latitude','longitude','timezone',
    'temperature_c','feels_like_c','condition_code','condition_text',
    'precipitation_mm','wind_kmh','humidity_percent','is_day','source',
    'sync_status','last_error'
  ]);
  weatherEnsureSheetV1_(ss, 'WEATHER_HOURLY', [
    'forecast_time','location_label','temperature_c','feels_like_c',
    'precipitation_probability_percent','precipitation_mm','wind_kmh',
    'condition_code','condition_text','source','synced_at'
  ]);
  weatherNormalizeTriggersV1_();
  var result = runWeatherSyncV1();
  result.triggerInstalled = true;
  result.intervalMinutes = 30;
  result.triggerStatus = weatherTriggerStatusV1();
  return result;
}

function setupLiveDataV1() {
  var health = setupHealthSyncV1();
  var weather = setupWeatherSyncV1();
  return {ok:!!(health.ok && weather.ok), health:health, weather:weather};
}

function runLiveDataSyncV1() {
  return {health:runHealthSyncV1(), weather:runWeatherSyncV1()};
}

function weatherTriggerStatusV1() {
  var triggers = ScriptApp.getProjectTriggers();
  return {
    weather:triggers.filter(function(trigger) {
      return trigger.getHandlerFunction() === 'runWeatherSyncV1';
    }).length,
    legacyLiveData:triggers.filter(function(trigger) {
      return trigger.getHandlerFunction() === 'runLiveDataSyncV1';
    }).length,
    handlers:triggers.map(function(trigger) {
      return trigger.getHandlerFunction();
    })
  };
}

function weatherNormalizeTriggersV1_() {
  var triggers = ScriptApp.getProjectTriggers();
  var weatherTriggerKept = false;
  triggers.forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'runLiveDataSyncV1') {
      ScriptApp.deleteTrigger(trigger);
      return;
    }
    if (handler === 'runWeatherSyncV1') {
      if (weatherTriggerKept) {
        ScriptApp.deleteTrigger(trigger);
      } else {
        weatherTriggerKept = true;
      }
    }
  });
  if (!weatherTriggerKept) {
    ScriptApp.newTrigger('runWeatherSyncV1').timeBased().everyMinutes(30).create();
  }
}

function weatherConfigV1_(ss) {
  var cfg = readConfig_(reader_(ss));
  var latitude = healthSyncNumberV1_(cfg.weather_latitude);
  var longitude = healthSyncNumberV1_(cfg.weather_longitude);
  return {
    enabled:cfg.weather_enabled == null ? true : truthy_(cfg.weather_enabled),
    locationLabel:String(cfg.weather_location_label || 'Holzheim / Neuss'),
    latitude:latitude,
    longitude:longitude,
    timezone:String(cfg.weather_timezone || TZ),
    forecastHours:Math.max(6, Math.min(48, Math.round(healthSyncNumberV1_(cfg.weather_forecast_hours) || 24)))
  };
}

function weatherFetchV1_(cfg) {
  var guard = weatherRequestGuardV1_();
  if (!guard.allowed) {
    var throttled = new Error('Open-Meteo Refresh pausiert bis ' + guard.retryAt + '.');
    throttled.code = 'WEATHER_THROTTLED';
    throttled.retryAt = guard.retryAt;
    throw throttled;
  }
  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + encodeURIComponent(cfg.latitude) +
    '&longitude=' + encodeURIComponent(cfg.longitude) +
    '&timezone=' + encodeURIComponent(cfg.timezone) +
    '&forecast_days=2' +
    '&forecast_hours=' + encodeURIComponent(cfg.forecastHours) +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m' +
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m';
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions:true,
    headers:{Accept:'application/json'}
  });
  var status = response.getResponseCode();
  if (status === 429) {
    weatherSetCooldownV1_(weatherRetryAfterSecondsV1_(response));
    var rateLimitError = new Error('Open-Meteo HTTP 429');
    rateLimitError.code = 'OPEN_METEO_RATE_LIMIT';
    throw rateLimitError;
  }
  if (status < 200 || status >= 300) throw new Error('Open-Meteo HTTP ' + status);
  var payload = JSON.parse(response.getContentText());
  if (!payload || !payload.current || !payload.hourly) throw new Error('Open-Meteo Antwort unvollständig.');
  weatherClearCooldownV1_();
  return payload;
}

function weatherRequestGuardV1_() {
  var properties = PropertiesService.getScriptProperties();
  var now = Date.now();
  var lastRequestAt = Number(properties.getProperty(WEATHER_V1_LAST_REQUEST_PROPERTY) || 0);
  var nextAllowedAt = Number(properties.getProperty(WEATHER_V1_NEXT_ALLOWED_PROPERTY) || 0);
  var intervalAllowedAt = lastRequestAt ? lastRequestAt + WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS * 1000 : 0;
  var allowedAt = Math.max(intervalAllowedAt, nextAllowedAt);
  if (allowedAt > now) {
    return {allowed:false, retryAt:new Date(allowedAt).toISOString()};
  }
  properties.setProperty(WEATHER_V1_LAST_REQUEST_PROPERTY, String(now));
  return {allowed:true};
}

function weatherSetCooldownV1_(seconds) {
  var properties = PropertiesService.getScriptProperties();
  var now = Date.now();
  var duration = Number(seconds);
  if (!(duration > 0)) duration = WEATHER_V1_429_COOLDOWN_SECONDS;
  duration = Math.max(5 * 60, Math.min(60 * 60, Math.ceil(duration)));
  var existing = Number(properties.getProperty(WEATHER_V1_NEXT_ALLOWED_PROPERTY) || 0);
  var retryAt = Math.max(existing, now + duration * 1000);
  properties.setProperty(WEATHER_V1_NEXT_ALLOWED_PROPERTY, String(retryAt));
  return new Date(retryAt).toISOString();
}

function weatherClearCooldownV1_() {
  PropertiesService.getScriptProperties().deleteProperty(WEATHER_V1_NEXT_ALLOWED_PROPERTY);
}

function weatherRetryAfterSecondsV1_(response) {
  var headers = {};
  try {
    headers = response.getHeaders ? response.getHeaders() || {} : {};
  } catch (ignored) {}
  var raw = headers['Retry-After'] || headers['retry-after'];
  var seconds = Number(raw);
  if (!(seconds > 0)) seconds = WEATHER_V1_429_COOLDOWN_SECONDS;
  return Math.max(5 * 60, Math.min(60 * 60, Math.ceil(seconds)));
}

function weatherCurrentV1_(payload) {
  var current = payload.current || {};
  var code = current.weather_code == null ? null : Number(current.weather_code);
  return {
    time:current.time || '',
    temperatureC:current.temperature_2m == null ? null : Number(current.temperature_2m),
    feelsLikeC:current.apparent_temperature == null ? null : Number(current.apparent_temperature),
    humidityPercent:current.relative_humidity_2m == null ? null : Number(current.relative_humidity_2m),
    precipitationMm:current.precipitation == null ? null : Number(current.precipitation),
    windKmh:current.wind_speed_10m == null ? null : Number(current.wind_speed_10m),
    code:code,
    text:weatherCodeTextV1_(code),
    isDay:current.is_day == null ? null : Number(current.is_day)
  };
}

function weatherWriteV1_(ss, cfg, payload) {
  var currentSheet = weatherEnsureSheetV1_(ss, 'WEATHER_CURRENT', [
    'weather_id','observed_at','location_label','latitude','longitude','timezone',
    'temperature_c','feels_like_c','condition_code','condition_text',
    'precipitation_mm','wind_kmh','humidity_percent','is_day','source',
    'sync_status','last_error'
  ]);
  var hourlySheet = weatherEnsureSheetV1_(ss, 'WEATHER_HOURLY', [
    'forecast_time','location_label','temperature_c','feels_like_c',
    'precipitation_probability_percent','precipitation_mm','wind_kmh',
    'condition_code','condition_text','source','synced_at'
  ]);
  var current = weatherCurrentV1_(payload);
  var syncedAt = isoLocal_(new Date());
  var currentRow = [[
    'WEATHER_CURRENT', current.time, cfg.locationLabel, cfg.latitude, cfg.longitude, cfg.timezone,
    current.temperatureC, current.feelsLikeC, current.code, current.text,
    current.precipitationMm, current.windKmh, current.humidityPercent, current.isDay,
    WEATHER_V1_SOURCE, 'OK', ''
  ]];
  if (currentSheet.getLastRow() > 1) currentSheet.getRange(2, 1, currentSheet.getLastRow() - 1, 17).clearContent();
  currentSheet.getRange(2, 1, 1, 17).setValues(currentRow);

  var hourly = payload.hourly || {};
  var times = hourly.time || [];
  var rows = [];
  var count = Math.min(cfg.forecastHours, times.length);
  for (var i = 0; i < count; i++) {
    var code = hourly.weather_code && hourly.weather_code[i] != null ? Number(hourly.weather_code[i]) : null;
    rows.push([
      times[i], cfg.locationLabel,
      hourly.temperature_2m && hourly.temperature_2m[i] != null ? hourly.temperature_2m[i] : '',
      hourly.apparent_temperature && hourly.apparent_temperature[i] != null ? hourly.apparent_temperature[i] : '',
      hourly.precipitation_probability && hourly.precipitation_probability[i] != null ? hourly.precipitation_probability[i] : '',
      hourly.precipitation && hourly.precipitation[i] != null ? hourly.precipitation[i] : '',
      hourly.wind_speed_10m && hourly.wind_speed_10m[i] != null ? hourly.wind_speed_10m[i] : '',
      code, weatherCodeTextV1_(code), WEATHER_V1_SOURCE, syncedAt
    ]);
  }
  if (hourlySheet.getLastRow() > 1) hourlySheet.getRange(2, 1, hourlySheet.getLastRow() - 1, 11).clearContent();
  if (rows.length) hourlySheet.getRange(2, 1, rows.length, 11).setValues(rows);
  return {current:1, hourly:rows.length};
}

function weatherEnsureSheetV1_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function weatherUpdateStateV1_(ss, cfg, payload, errorMessage) {
  var sheet = ss.getSheetByName('SYNC_STATE');
  if (!sheet) return;
  var table = table_(sheet);
  var row = table.rows.filter(function(item) { return String(item.system_name) === 'Weather'; })[0];
  var nowText = isoLocal_(new Date());
  var current = payload ? weatherCurrentV1_(payload) : null;
  var values = {
    system_name:'Weather',
    status:errorMessage ? 'ERROR' : 'OK',
    last_attempt_at:nowText,
    last_error:errorMessage || '',
    data_freshness:current ? 'CURRENT ' + current.time : 'UNKNOWN',
    connection_state:'CONNECTED_VIA_OPEN_METEO',
    warning_level:errorMessage ? 'IMPORTANT' : 'NORMAL',
    note:errorMessage || ('Open-Meteo · ' + (cfg ? cfg.locationLabel : 'Konfiguration') + ' · stündliche Vorschau in WEATHER_HOURLY')
  };
  if (!errorMessage) values.last_success_at = nowText;
  if (!row) {
    var record = {};
    Object.keys(values).forEach(function(key) { record[key] = values[key]; });
    sheet.appendRow(table.headers.map(function(header) { return record[header] == null ? '' : record[header]; }));
  } else {
    Object.keys(values).forEach(function(header) { healthSyncWriteFieldV1_(sheet, table, row.__row, header, values[header]); });
  }
}

function getWeatherSnapshot_(rd) {
  var current = rd.rows('WEATHER_CURRENT').filter(function(row) { return row.weather_id; })[0] || null;
  var hourly = rd.rows('WEATHER_HOURLY').filter(function(row) { return row.forecast_time; }).slice(0, 24);
  var sync = rd.rows('SYNC_STATE').filter(function(row) {
    return String(row.system_name || '') === 'Weather';
  })[0] || null;
  var storedStatus = String(current && current.sync_status || 'UNKNOWN').toUpperCase();
  var syncStatus = String(sync && sync.status || storedStatus).toUpperCase();
  var stale = syncStatus !== 'OK';
  if (sync && sync.last_success_at) {
    var lastSuccessMs = new Date(String(sync.last_success_at)).getTime();
    if (isFinite(lastSuccessMs) && Date.now() - lastSuccessMs > 90 * 60 * 1000) stale = true;
  } else if (sync) {
    stale = true;
  }
  var lastError = String(sync && sync.last_error || current && current.last_error || '');
  var lastSuccessAt = String(sync && sync.last_success_at || '');
  if (!current) {
    return {
      available:false,
      stale:stale,
      status:syncStatus,
      source:'',
      location:'',
      lastError:lastError,
      lastSuccessAt:lastSuccessAt,
      current:null,
      hours:[]
    };
  }
  return {
    available:storedStatus === 'OK',
    stale:stale,
    status:syncStatus,
    source:current.source || WEATHER_V1_SOURCE,
    location:current.location_label || '',
    lastError:lastError,
    lastSuccessAt:lastSuccessAt,
    current:{
      time:current.observed_at || '',
      temperatureC:healthSyncNumberV1_(current.temperature_c),
      feelsLikeC:healthSyncNumberV1_(current.feels_like_c),
      humidityPercent:healthSyncNumberV1_(current.humidity_percent),
      precipitationMm:healthSyncNumberV1_(current.precipitation_mm),
      windKmh:healthSyncNumberV1_(current.wind_kmh),
      code:healthSyncNumberV1_(current.condition_code),
      text:current.condition_text || ''
    },
    hours:hourly.map(function(row) {
      return {
        time:row.forecast_time || '',
        temperatureC:healthSyncNumberV1_(row.temperature_c),
        precipitationProbability:healthSyncNumberV1_(row.precipitation_probability_percent),
        code:healthSyncNumberV1_(row.condition_code),
        text:row.condition_text || ''
      };
    })
  };
}

function weatherCodeTextV1_(code) {
  var map = {
    0:'Klar', 1:'Überwiegend klar', 2:'Teilweise bewölkt', 3:'Bedeckt',
    45:'Nebel', 48:'Reifnebel',
    51:'Leichter Nieselregen', 53:'Nieselregen', 55:'Starker Nieselregen',
    56:'Gefrierender Nieselregen', 57:'Starker gefrierender Nieselregen',
    61:'Leichter Regen', 63:'Regen', 65:'Starker Regen',
    66:'Gefrierender Regen', 67:'Starker gefrierender Regen',
    71:'Leichter Schneefall', 73:'Schneefall', 75:'Starker Schneefall', 77:'Schneekörner',
    80:'Leichte Regenschauer', 81:'Regenschauer', 82:'Starke Regenschauer',
    85:'Leichte Schneeschauer', 86:'Starke Schneeschauer',
    95:'Gewitter', 96:'Gewitter mit leichtem Hagel', 99:'Gewitter mit starkem Hagel'
  };
  return code == null || map[code] == null ? 'Unbekannt' : map[code];
}
