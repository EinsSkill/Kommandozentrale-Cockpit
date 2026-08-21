/**
 * Health Sync -> Drive -> OPS integration.
 *
 * The Health Sync app remains the device-side exporter. This module reads the
 * configured Drive folders, normalizes overlapping CSV/TCX exports and writes
 * only the structured projection needed by OPS. Raw exports stay in Drive.
 *
 * Configure the folder IDs in SYS_CONFIG; never commit personal IDs here.
 */
var HEALTH_SYNC_V1_SOURCE = 'Health Sync / Health Connect (Drive)';
var HEALTH_SYNC_V1_MISSING = ['sleep', 'heart_rate', 'hrv', 'spo2'];

function previewHealthSyncV1() {
  return healthSyncRunV1_(true);
}

function runHealthSyncV1() {
  return healthSyncRunV1_(false);
}

function setupHealthSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  var cfg = healthSyncConfigV1_(ss);
  if (!cfg.enabled) {
    return {ok:false, status:'DISABLED', message:'health_sync_enabled ist nicht TRUE.'};
  }
  if (!cfg.stepsFolderId || !cfg.activitiesFolderId || !cfg.weightFolderId) {
    return {ok:false, status:'NOT_CONFIGURED', message:'Health-Sync-Ordner in SYS_CONFIG fehlen.'};
  }
  var existing = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === 'runHealthSyncV1';
  });
  if (!existing) {
    ScriptApp.newTrigger('runHealthSyncV1')
      .timeBased()
      .everyMinutes(cfg.intervalMinutes)
      .create();
  }
  var result = runHealthSyncV1();
  result.triggerInstalled = true;
  result.intervalMinutes = cfg.intervalMinutes;
  return result;
}

function healthSyncRunV1_(preview) {
  var lock = null;
  if (!preview) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return {ok:false, status:'BUSY', message:'Ein anderer Health-Sync-Lauf ist noch aktiv.'};
    }
  }
  var ss = null;
  try {
    ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
    var cfg = healthSyncConfigV1_(ss);
    if (!cfg.enabled) {
      return {ok:false, status:'DISABLED', message:'health_sync_enabled ist nicht TRUE.'};
    }
    if (!cfg.stepsFolderId || !cfg.activitiesFolderId || !cfg.weightFolderId) {
      return {ok:false, status:'NOT_CONFIGURED', message:'Health-Sync-Ordner in SYS_CONFIG fehlen.'};
    }

    var files = {
      steps: healthSyncFolderFilesV1_(cfg.stepsFolderId, ['.csv']),
      activities: healthSyncFolderFilesV1_(cfg.activitiesFolderId, ['.csv', '.tcx']),
      weight: healthSyncFolderFilesV1_(cfg.weightFolderId, ['.csv'])
    };
    var steps = healthSyncParseStepsV1_(files.steps, cfg.lookbackDays);
    var activities = healthSyncParseActivitiesV1_(files.activities, cfg.lookbackDays);
    var weights = healthSyncParseWeightsV1_(files.weight, cfg.lookbackDays);
    healthSyncAttachActivitiesV1_(steps.days, activities);
    healthSyncAttachWeightsV1_(steps.days, weights);

    var summary = {
      ok: true,
      status: preview ? 'PREVIEW' : 'READY',
      source: HEALTH_SYNC_V1_SOURCE,
      files: {
        steps: files.steps.length,
        activities: files.activities.length,
        weight: files.weight.length
      },
      parsed: {
        stepRowsRead: steps.rowsRead,
        stepEventsUsed: steps.eventsUsed,
        stepDays: Object.keys(steps.days).length,
        workouts: activities.length,
        weightMeasurements: weights.length
      },
      latestDataDate: healthSyncLatestDateV1_(steps.days, activities, weights),
      missingMetrics: HEALTH_SYNC_V1_MISSING.slice(),
      configuredLookbackDays: cfg.lookbackDays,
      triggerFunction: 'runHealthSyncV1'
    };
    if (preview) {
      summary.sampleDays = Object.keys(steps.days).sort().slice(-7).map(function(date) {
        var day = steps.days[date];
        return {date:date, steps:day.steps || 0, workouts:day.workoutCount || 0};
      });
      return summary;
    }

    var written = healthSyncWriteV1_(ss, steps.days, activities, weights);
    summary.status = 'OK';
    summary.written = written;
    healthSyncUpdateStateV1_(ss, summary, null);
    appendAudit_(ss, {
      actor: 'APPS_SCRIPT',
      action_type: 'HEALTH_SYNC',
      target_system: 'HEALTH_SYNC_DRIVE',
      target_id: 'HEALTH_DAILY/WORKOUTS',
      trigger_type: 'TIME_DRIVEN',
      permission_class: 'AUTO_IF_REVERSIBLE',
      status: 'SUCCESS',
      previous_value: '',
      new_value: JSON.stringify({
        stepDays: summary.parsed.stepDays,
        workouts: summary.parsed.workouts,
        weights: summary.parsed.weightMeasurements
      })
    });
    invalidateCore_();
    return summary;
  } catch (error) {
    var message = String(error && error.message ? error.message : error);
    if (ss) {
      try {
        healthSyncUpdateStateV1_(ss, {ok:false, status:'ERROR', source:HEALTH_SYNC_V1_SOURCE, files:{}, parsed:{}, latestDataDate:''}, message);
        appendAudit_(ss, {
          actor: 'APPS_SCRIPT',
          action_type: 'HEALTH_SYNC',
          target_system: 'HEALTH_SYNC_DRIVE',
          target_id: 'HEALTH_DAILY/WORKOUTS',
          trigger_type: 'TIME_DRIVEN',
          permission_class: 'AUTO_IF_REVERSIBLE',
          status: 'ERROR',
          previous_value: '',
          new_value: message
        });
      } catch (ignored) {}
    }
    return {ok:false, status:'ERROR', source:HEALTH_SYNC_V1_SOURCE, error:message};
  } finally {
    if (lock) lock.releaseLock();
  }
}

function healthSyncConfigV1_(ss) {
  var cfg = readConfig_(reader_(ss));
  var interval = healthSyncNumberV1_(cfg.health_sync_interval_minutes);
  if ([5, 10, 15, 30].indexOf(interval) < 0) interval = 15;
  var lookback = healthSyncNumberV1_(cfg.health_sync_lookback_days);
  if (!lookback || lookback < 1) lookback = 30;
  lookback = Math.min(90, Math.round(lookback));
  return {
    enabled: cfg.health_sync_enabled == null ? true : truthy_(cfg.health_sync_enabled),
    stepsFolderId: String(cfg.health_sync_steps_folder_id || '').trim(),
    activitiesFolderId: String(cfg.health_sync_activities_folder_id || '').trim(),
    weightFolderId: String(cfg.health_sync_weight_folder_id || '').trim(),
    intervalMinutes: interval,
    lookbackDays: lookback
  };
}

function healthSyncFolderFilesV1_(folderId, extensions) {
  var folder = DriveApp.getFolderById(folderId);
  var iterator = folder.getFiles();
  var files = [];
  while (iterator.hasNext()) {
    var file = iterator.next();
    var name = file.getName();
    var lower = name.toLowerCase();
    if (!extensions.some(function(ext) { return lower.slice(-ext.length) === ext; })) continue;
    var blob = file.getBlob();
    var content = '';
    try {
      content = blob.getDataAsString('UTF-8');
    } catch (error) {
      content = blob.getDataAsString();
    }
    files.push({
      id: file.getId(),
      name: name,
      content: content,
      updated: file.getLastUpdated()
    });
  }
  return files;
}

function healthSyncCsvRowsV1_(content) {
  var text = String(content || '').replace(/^\uFEFF/, '');
  if (!text.trim()) return [];
  return Utilities.parseCsv(text, ',');
}

function healthSyncHeaderKeyV1_(value) {
  var text = String(value == null ? '' : value);
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (ignored) {}
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function healthSyncHeaderIndexV1_(headers, names) {
  var keys = headers.map(healthSyncHeaderKeyV1_);
  for (var i = 0; i < names.length; i++) {
    var wanted = healthSyncHeaderKeyV1_(names[i]);
    var exact = keys.indexOf(wanted);
    if (exact >= 0) return exact;
  }
  return -1;
}

function healthSyncNumberV1_(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  var text = String(value).trim().replace(/^"|"$/g, '').replace(/\s/g, '');
  if (!text) return null;
  if (text.indexOf(',') >= 0) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, '');
  }
  text = text.replace(/[^0-9eE+.-]/g, '');
  var number = Number(text);
  return isFinite(number) ? number : null;
}

function healthSyncDateV1_(dateValue, timeValue) {
  var dateText = String(dateValue == null ? '' : dateValue).trim();
  var timeText = String(timeValue == null ? '' : timeValue).trim();
  if (!dateText) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateText)) {
    var iso = new Date(dateText);
    return isNaN(iso.getTime()) ? null : iso;
  }
  var match = dateText.match(/(\d{4})[.\/-](\d{2})[.\/-](\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?/);
  if (!match) return null;
  var hour = match[4] == null ? 0 : Number(match[4]);
  var minute = match[5] == null ? 0 : Number(match[5]);
  var second = match[6] == null ? 0 : Number(match[6]);
  if (match[4] == null && timeText) {
    var timeMatch = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      hour = Number(timeMatch[1]);
      minute = Number(timeMatch[2]);
      second = timeMatch[3] == null ? 0 : Number(timeMatch[3]);
    }
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, second);
}

function healthSyncDateKeyV1_(date) {
  return date ? Utilities.formatDate(date, TZ, 'yyyy-MM-dd') : '';
}

function healthSyncCutoffV1_(days) {
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - days);
  return now.getTime();
}

function healthSyncFilePriorityV1_(name) {
  var text = String(name || '');
  var exactDay = /\d{4}\.\d{2}\.\d{2}/.test(text);
  if (/health connect/i.test(text)) return exactDay ? 40 : 30;
  if (/google fit/i.test(text)) return exactDay ? 20 : 10;
  return 5;
}

function healthSyncParseStepsV1_(files, lookbackDays) {
  var cutoff = healthSyncCutoffV1_(lookbackDays);
  var groups = {};
  var rowsRead = 0;
  files.forEach(function(file) {
    var rows = healthSyncCsvRowsV1_(file.content);
    if (!rows.length) return;
    var dateIndex = healthSyncHeaderIndexV1_(rows[0], ['Datum', 'Date']);
    var timeIndex = healthSyncHeaderIndexV1_(rows[0], ['Zeit', 'Time']);
    var stepIndex = healthSyncHeaderIndexV1_(rows[0], ['Schritte', 'Steps', 'Step Count']);
    if (dateIndex < 0 || stepIndex < 0) return;
    var priority = healthSyncFilePriorityV1_(file.name);
    rows.slice(1).forEach(function(row) {
      rowsRead++;
      var date = healthSyncDateV1_(row[dateIndex], timeIndex >= 0 ? row[timeIndex] : '');
      var steps = healthSyncNumberV1_(row[stepIndex]);
      if (!date || date.getTime() < cutoff || steps == null || steps < 0) return;
      var timestampKey = String(date.getTime());
      var bucket = groups[timestampKey];
      if (!bucket || priority > bucket.priority) {
        bucket = {priority:priority, date:date, entries:{}, sourceFiles:{}};
        groups[timestampKey] = bucket;
      }
      if (priority !== bucket.priority) return;
      var eventKey = String(steps);
      if (bucket.entries[eventKey]) return;
      bucket.entries[eventKey] = true;
      bucket.sourceFiles[file.name] = true;
    });
  });
  var days = {};
  Object.keys(groups).forEach(function(timestampKey) {
    var bucket = groups[timestampKey];
    var value = Object.keys(bucket.entries).reduce(function(sum, key) { return sum + Number(key); }, 0);
    var date = bucket.date;
    var dateKey = healthSyncDateKeyV1_(date);
    if (!dateKey) return;
    if (!days[dateKey]) {
      days[dateKey] = {date:dateKey, steps:0, stepEvents:0, lastEvent:date, sourceFiles:{}};
    }
    days[dateKey].steps += value;
    days[dateKey].stepEvents += Object.keys(bucket.entries).length;
    if (date.getTime() > days[dateKey].lastEvent.getTime()) days[dateKey].lastEvent = date;
    Object.keys(bucket.sourceFiles).forEach(function(name) { days[dateKey].sourceFiles[name] = true; });
  });
  return {
    days: days,
    rowsRead: rowsRead,
    eventsUsed: Object.keys(groups).reduce(function(sum, key) {
      return sum + Object.keys(groups[key].entries).length;
    }, 0)
  };
}

function healthSyncTagValuesV1_(xml, tag) {
  var pattern = new RegExp('<(?:[A-Za-z0-9_]+:)?' + tag + '(?:\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?' + tag + '>', 'gi');
  var values = [];
  var match;
  while ((match = pattern.exec(xml)) !== null) values.push(String(match[1]).trim());
  return values;
}

function healthSyncTagOneV1_(xml, tag) {
  var values = healthSyncTagValuesV1_(xml, tag);
  return values.length ? values[0] : '';
}

function healthSyncParseTcxV1_(file) {
  var xml = String(file.content || '');
  var id = healthSyncTagOneV1_(xml, 'Id');
  var start = id ? new Date(id) : null;
  if (!start || isNaN(start.getTime())) return null;
  var duration = healthSyncTagValuesV1_(xml, 'TotalTimeSeconds').reduce(function(sum, value) {
    return sum + (healthSyncNumberV1_(value) || 0);
  }, 0);
  var distanceMeters = healthSyncTagValuesV1_(xml, 'DistanceMeters').reduce(function(sum, value) {
    return Math.max(sum, healthSyncNumberV1_(value) || 0);
  }, 0);
  var calories = healthSyncNumberV1_(healthSyncTagOneV1_(xml, 'Calories')) || 0;
  var avgHr = healthSyncNumberV1_(healthSyncTagOneV1_(xml, 'AverageHeartRateBpm')) || 0;
  var maxHr = healthSyncNumberV1_(healthSyncTagOneV1_(xml, 'MaximumHeartRateBpm')) || 0;
  var sportMatch = xml.match(/<Activity\b[^>]*Sport="([^"]+)"/i);
  var type = sportMatch ? sportMatch[1] : 'OTHER';
  var author = healthSyncTagOneV1_(xml, 'Name') || 'Health Sync';
  var key = type + '|' + start.getTime();
  return {
    key:key,
    start:start,
    date:healthSyncDateKeyV1_(start),
    type:type,
    durationMinutes:Math.round(duration / 60 * 10) / 10,
    distanceKm:Math.round(distanceMeters / 1000 * 1000) / 1000,
    calories:calories,
    steps:0,
    avgHr:avgHr,
    maxHr:maxHr,
    source:'TCX/' + author,
    fileName:file.name
  };
}

function healthSyncParseActivitiesV1_(files, lookbackDays) {
  var cutoff = healthSyncCutoffV1_(lookbackDays);
  var tcxByKey = {};
  files.filter(function(file) { return /\.tcx$/i.test(file.name); }).forEach(function(file) {
    var activity = healthSyncParseTcxV1_(file);
    if (!activity || activity.start.getTime() < cutoff) return;
    var current = tcxByKey[activity.key];
    if (!current || activity.distanceKm > current.distanceKm || activity.durationMinutes > current.durationMinutes) {
      tcxByKey[activity.key] = activity;
    }
  });
  var csvActivities = [];
  files.filter(function(file) { return /\.csv$/i.test(file.name); }).forEach(function(file) {
    var rows = healthSyncCsvRowsV1_(file.content);
    if (!rows.length) return;
    var typeIndex = healthSyncHeaderIndexV1_(rows[0], ['Aktivitätstyp', 'Aktivitaetstyp', 'Activity Type']);
    var dateIndex = healthSyncHeaderIndexV1_(rows[0], ['Datum', 'Date']);
    var timeIndex = healthSyncHeaderIndexV1_(rows[0], ['Zeit', 'Time']);
    var durationIndex = healthSyncHeaderIndexV1_(rows[0], ['Verstrichene Zeit', 'Elapsed Time', 'Duration']);
    var activeIndex = healthSyncHeaderIndexV1_(rows[0], ['Aktive Zeit', 'Active Time']);
    var distanceIndex = healthSyncHeaderIndexV1_(rows[0], ['Entfernung (km)', 'Distance (km)']);
    var caloriesIndex = healthSyncHeaderIndexV1_(rows[0], ['Kalorien (kcal)', 'Calories (kcal)']);
    var stepsIndex = healthSyncHeaderIndexV1_(rows[0], ['Schritte', 'Steps']);
    var avgHrIndex = healthSyncHeaderIndexV1_(rows[0], ['Durchschnittliche Herzfrequenz', 'Average Heart Rate']);
    var maxHrIndex = healthSyncHeaderIndexV1_(rows[0], ['Maximale Herzfrequenz', 'Maximum Heart Rate']);
    if (dateIndex < 0 || typeIndex < 0) return;
    rows.slice(1).forEach(function(row) {
      var start = healthSyncDateV1_(row[dateIndex], timeIndex >= 0 ? row[timeIndex] : '');
      if (!start || start.getTime() < cutoff) return;
      var durationSeconds = healthSyncNumberV1_(row[activeIndex >= 0 ? activeIndex : durationIndex]) || 0;
      var activity = {
        start:start,
        date:healthSyncDateKeyV1_(start),
        type:String(row[typeIndex] || 'OTHER'),
        durationMinutes:Math.round(durationSeconds / 60 * 10) / 10,
        distanceKm:healthSyncNumberV1_(row[distanceIndex]) || 0,
        calories:healthSyncNumberV1_(row[caloriesIndex]) || 0,
        steps:healthSyncNumberV1_(row[stepsIndex]) || 0,
        avgHr:healthSyncNumberV1_(row[avgHrIndex]) || 0,
        maxHr:healthSyncNumberV1_(row[maxHrIndex]) || 0,
        source:'CSV/' + String(row[0] || 'Health Sync'),
        fileName:file.name
      };
      csvActivities.push(activity);
    });
  });

  var result = Object.keys(tcxByKey).map(function(key) { return tcxByKey[key]; });
  csvActivities.forEach(function(csv) {
    var match = result.filter(function(tcx) {
      return tcx.type === csv.type && Math.abs(tcx.start.getTime() - csv.start.getTime()) <= 5 * 60 * 1000;
    }).sort(function(a, b) {
      return Math.abs(a.start.getTime() - csv.start.getTime()) - Math.abs(b.start.getTime() - csv.start.getTime());
    })[0];
    if (match) {
      if (!match.steps && csv.steps) match.steps = csv.steps;
      if (!match.avgHr && csv.avgHr) match.avgHr = csv.avgHr;
      if (!match.maxHr && csv.maxHr) match.maxHr = csv.maxHr;
      if (!match.durationMinutes && csv.durationMinutes) match.durationMinutes = csv.durationMinutes;
      if (!match.distanceKm && csv.distanceKm) match.distanceKm = csv.distanceKm;
      if (!match.calories && csv.calories) match.calories = csv.calories;
      match.source = 'TCX + CSV';
    } else {
      result.push(csv);
    }
  });
  var unique = {};
  result.forEach(function(activity) {
    var key = activity.type + '|' + activity.start.getTime();
    if (!unique[key] || activity.durationMinutes > unique[key].durationMinutes) unique[key] = activity;
  });
  return Object.keys(unique).map(function(key) { return unique[key]; });
}

function healthSyncParseWeightsV1_(files, lookbackDays) {
  var cutoff = healthSyncCutoffV1_(lookbackDays);
  var latest = {};
  files.forEach(function(file) {
    var rows = healthSyncCsvRowsV1_(file.content);
    if (!rows.length) return;
    var dateIndex = healthSyncHeaderIndexV1_(rows[0], ['Datum', 'Date']);
    var timeIndex = healthSyncHeaderIndexV1_(rows[0], ['Zeit', 'Time']);
    var weightIndex = healthSyncHeaderIndexV1_(rows[0], ['Gewicht', 'Weight']);
    var bodyFatIndex = healthSyncHeaderIndexV1_(rows[0], ['Körperfettanteil', 'Koerperfettanteil', 'Body Fat']);
    if (dateIndex < 0 || weightIndex < 0) return;
    rows.slice(1).forEach(function(row) {
      var date = healthSyncDateV1_(row[dateIndex], timeIndex >= 0 ? row[timeIndex] : '');
      var weight = healthSyncNumberV1_(row[weightIndex]);
      if (!date || date.getTime() < cutoff || weight == null || weight <= 0) return;
      var bodyFat = bodyFatIndex >= 0 ? healthSyncNumberV1_(row[bodyFatIndex]) : null;
      var key = healthSyncDateKeyV1_(date);
      var item = {date:key, measuredAt:date, weight:weight, bodyFat:bodyFat && bodyFat > 0 ? bodyFat : null, source:file.name};
      if (!latest[key] || date.getTime() > latest[key].measuredAt.getTime()) latest[key] = item;
    });
  });
  return Object.keys(latest).map(function(key) { return latest[key]; }).sort(function(a, b) {
    return a.measuredAt.getTime() - b.measuredAt.getTime();
  });
}

function healthSyncAttachActivitiesV1_(days, activities) {
  activities.forEach(function(activity) {
    if (!days[activity.date]) days[activity.date] = {date:activity.date, steps:null, stepEvents:0, lastEvent:activity.start, sourceFiles:{}};
    var day = days[activity.date];
    day.workoutCount = (day.workoutCount || 0) + 1;
    day.workoutMinutes = (day.workoutMinutes || 0) + (activity.durationMinutes || 0);
    day.workoutTypes = day.workoutTypes || {};
    day.workoutTypes[activity.type] = true;
  });
}

function healthSyncAttachWeightsV1_(days, weights) {
  weights.forEach(function(weight) {
    if (!days[weight.date]) days[weight.date] = {date:weight.date, steps:null, stepEvents:0, lastEvent:weight.measuredAt, sourceFiles:{}};
    days[weight.date].weight = weight.weight;
    if (weight.bodyFat != null) days[weight.date].bodyFat = weight.bodyFat;
  });
}

function healthSyncLatestDateV1_(days, activities, weights) {
  var dates = Object.keys(days);
  activities.forEach(function(item) { dates.push(item.date); });
  weights.forEach(function(item) { dates.push(item.date); });
  return dates.sort().pop() || '';
}

function healthSyncMidnightDateV1_(dateKey) {
  var parts = String(dateKey).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function healthSyncWriteFieldV1_(sheet, table, rowNumber, header, value) {
  if (table.index[header] == null) return;
  sheet.getRange(rowNumber, table.index[header] + 1).setValue(value == null ? '' : value);
}

function healthSyncNextIdV1_(sheet, prefix, field) {
  var table = table_(sheet);
  var max = 0;
  table.rows.forEach(function(row) {
    var match = String(row[field] || '').match(new RegExp('^' + prefix + '(\\d+)$'));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return prefix + String(max + 1).padStart(6, '0');
}

function healthSyncUpsertHealthV1_(sheet, days) {
  var table = table_(sheet);
  var rowsByDate = {};
  table.rows.forEach(function(row) {
    var key = dateText_(row.date);
    if (key) rowsByDate[key] = row;
  });
  var nextId = healthSyncNextIdV1_(sheet, 'HEALTH_', 'health_id');
  var inserted = 0;
  var updated = 0;
  Object.keys(days).sort().forEach(function(date) {
    var day = days[date];
    var row = rowsByDate[date];
    if (!row) {
      var record = {
        health_id: nextId,
        date: healthSyncMidnightDateV1_(date),
        source: HEALTH_SYNC_V1_SOURCE,
        sync_status: 'OK',
        steps: day.steps == null ? '' : Math.round(day.steps),
        workout_count: day.workoutCount || '',
        workout_minutes: day.workoutMinutes ? Math.round(day.workoutMinutes * 10) / 10 : '',
        workout_type: day.workoutTypes ? Object.keys(day.workoutTypes).join(', ') : '',
        weight_kg: day.weight == null ? '' : day.weight,
        body_fat_percent: day.bodyFat == null ? '' : day.bodyFat
      };
      sheet.appendRow(table.headers.map(function(header) { return record[header] == null ? '' : record[header]; }));
      nextId = 'HEALTH_' + String(Number(nextId.slice(7)) + 1).padStart(6, '0');
      inserted++;
      return;
    }
    if (day.steps != null) healthSyncWriteFieldV1_(sheet, table, row.__row, 'steps', Math.round(day.steps));
    if (day.workoutCount != null) {
      healthSyncWriteFieldV1_(sheet, table, row.__row, 'workout_count', day.workoutCount);
      healthSyncWriteFieldV1_(sheet, table, row.__row, 'workout_minutes', Math.round((day.workoutMinutes || 0) * 10) / 10);
      healthSyncWriteFieldV1_(sheet, table, row.__row, 'workout_type', Object.keys(day.workoutTypes || {}).join(', '));
    }
    if (day.weight != null) healthSyncWriteFieldV1_(sheet, table, row.__row, 'weight_kg', day.weight);
    if (day.bodyFat != null) healthSyncWriteFieldV1_(sheet, table, row.__row, 'body_fat_percent', day.bodyFat);
    healthSyncWriteFieldV1_(sheet, table, row.__row, 'source', HEALTH_SYNC_V1_SOURCE);
    healthSyncWriteFieldV1_(sheet, table, row.__row, 'sync_status', 'OK');
    updated++;
  });
  return {inserted:inserted, updated:updated};
}

function healthSyncWorkoutRecordV1_(activity, id) {
  var end = activity.durationMinutes ? new Date(activity.start.getTime() + activity.durationMinutes * 60000) : '';
  return {
    workout_id:id,
    date:healthSyncMidnightDateV1_(activity.date),
    start_time:activity.start,
    end_time:end,
    workout_type:activity.type,
    duration_minutes:Math.round((activity.durationMinutes || 0) * 10) / 10,
    distance_km:activity.distanceKm || '',
    calories:activity.calories || '',
    avg_hr:activity.avgHr || '',
    max_hr:activity.maxHr || '',
    source:HEALTH_SYNC_V1_SOURCE,
    notes:'Health Sync export (' + activity.source + ')'
  };
}

function healthSyncUpsertWorkoutsV1_(sheet, activities) {
  var table = table_(sheet);
  var rowsById = {};
  table.rows.forEach(function(row) { if (row.workout_id) rowsById[String(row.workout_id)] = row; });
  var inserted = 0;
  var updated = 0;
  activities.forEach(function(activity) {
    var id = 'WORKOUT_' + Utilities.formatDate(activity.start, TZ, 'yyyyMMdd_HHmmss') + '_' + String(activity.type || 'OTHER').toUpperCase();
    var record = healthSyncWorkoutRecordV1_(activity, id);
    var row = rowsById[id];
    if (!row) {
      sheet.appendRow(table.headers.map(function(header) { return record[header] == null ? '' : record[header]; }));
      inserted++;
    } else {
      Object.keys(record).forEach(function(header) {
        healthSyncWriteFieldV1_(sheet, table, row.__row, header, record[header]);
      });
      updated++;
    }
  });
  return {inserted:inserted, updated:updated};
}

function healthSyncWriteV1_(ss, days, activities, weights) {
  var healthSheet = ss.getSheetByName('HEALTH_DAILY');
  var workoutSheet = ss.getSheetByName('WORKOUTS');
  if (!healthSheet) throw new Error('Tab HEALTH_DAILY fehlt.');
  if (!workoutSheet) throw new Error('Tab WORKOUTS fehlt.');
  var health = healthSyncUpsertHealthV1_(healthSheet, days);
  var workouts = healthSyncUpsertWorkoutsV1_(workoutSheet, activities);
  return {health:health, workouts:workouts};
}

function healthSyncUpdateStateV1_(ss, summary, errorMessage) {
  var sheet = ss.getSheetByName('SYNC_STATE');
  if (!sheet) return;
  var table = table_(sheet);
  var row = table.rows.filter(function(item) { return String(item.system_name) === 'Fitness Source'; })[0];
  var nowText = isoLocal_(new Date());
  var status = errorMessage ? 'ERROR' : 'DEGRADED';
  var latest = summary.latestDataDate || 'NO_DATA';
  var note = errorMessage || (
    'Health Sync Drive: ' + (summary.parsed.stepDays || 0) + ' Tage / ' +
    (summary.parsed.workouts || 0) + ' Workouts / ' +
    (summary.parsed.weightMeasurements || 0) + ' Gewichtsmessungen. ' +
    'Nicht enthalten: Schlaf, Herzfrequenz, HRV, SpO2.'
  );
  var values = {
    system_name:'Fitness Source',
    status:status,
    last_attempt_at:nowText,
    data_freshness:'HEALTH SYNC ' + latest,
    connection_state:'CONNECTED_VIA_HEALTH_SYNC_DRIVE',
    warning_level:'NORMAL',
    note:note,
    last_error:errorMessage || ''
  };
  if (!errorMessage) values.last_success_at = nowText;
  if (!row) {
    var record = {};
    Object.keys(values).forEach(function(key) { record[key] = values[key]; });
    sheet.appendRow(table.headers.map(function(header) { return record[header] == null ? '' : record[header]; }));
  } else {
    Object.keys(values).forEach(function(header) {
      healthSyncWriteFieldV1_(sheet, table, row.__row, header, values[header]);
    });
  }
}