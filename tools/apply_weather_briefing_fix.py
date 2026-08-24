from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, label):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


weather = ROOT / 'src' / 'Weather.gs'
adapter = ROOT / 'src' / 'LiveAdapter.html'
weather_test = ROOT / 'tests' / 'weather-rate-limit.test.mjs'
adapter_test = ROOT / 'tests' / 'live-adapter-render.test.mjs'

# Weather: provider requests are intentionally conservative. A 30-minute trigger
# was unnecessary for an hourly forecast and made shared-IP rate limits visible.
replace_once(
    weather,
    "var WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS = 10 * 60;\nvar WEATHER_V1_429_COOLDOWN_SECONDS = 30 * 60;",
    "var WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS = 60 * 60;\nvar WEATHER_V1_429_COOLDOWN_SECONDS = 2 * 60 * 60;",
    'weather request cadence'
)
replace_once(weather, "result.intervalMinutes = 30;", "result.intervalMinutes = 60;", 'weather setup metadata')
replace_once(
    weather,
    "ScriptApp.newTrigger('runWeatherSyncV1').timeBased().everyMinutes(30).create();",
    "ScriptApp.newTrigger('runWeatherSyncV1').timeBased().everyHours(1).create();",
    'weather trigger cadence'
)
replace_once(
    weather,
    "duration = Math.max(5 * 60, Math.min(60 * 60, Math.ceil(duration)));",
    "duration = Math.max(15 * 60, Math.min(6 * 60 * 60, Math.ceil(duration)));",
    'weather cooldown clamp'
)
replace_once(
    weather,
    "return Math.max(5 * 60, Math.min(60 * 60, Math.ceil(seconds)));",
    "return Math.max(15 * 60, Math.min(6 * 60 * 60, Math.ceil(seconds)));",
    'weather retry-after clamp'
)
replace_once(
    weather,
    "    status:errorMessage ? 'ERROR' : 'OK',\n    last_attempt_at:nowText,\n    last_error:errorMessage || '',\n    data_freshness:current ? 'CURRENT ' + current.time : 'UNKNOWN',\n    connection_state:'CONNECTED_VIA_OPEN_METEO',\n    warning_level:errorMessage ? 'IMPORTANT' : 'NORMAL',\n    note:errorMessage || ('Open-Meteo · ' + (cfg ? cfg.locationLabel : 'Konfiguration') + ' · stündliche Vorschau in WEATHER_HOURLY')",
    "    status:errorMessage ? 'DEGRADED' : 'OK',\n    last_attempt_at:nowText,\n    last_error:errorMessage || '',\n    data_freshness:current ? 'CURRENT ' + current.time : (row && row.last_success_at ? 'STALE · letzter Erfolg ' + String(row.last_success_at) : 'UNKNOWN'),\n    connection_state:errorMessage ? 'DEGRADED_VIA_OPEN_METEO' : 'CONNECTED_VIA_OPEN_METEO',\n    warning_level:errorMessage ? 'IMPORTANT' : 'NORMAL',\n    note:errorMessage ? ('Letzter gültiger Wetterstand bleibt aktiv · ' + errorMessage) : ('Open-Meteo · ' + (cfg ? cfg.locationLabel : 'Konfiguration') + ' · stündliche Vorschau in WEATHER_HOURLY')",
    'weather degraded state'
)
replace_once(
    weather,
    "    available:storedStatus === 'OK',",
    "    // A provider/sync warning must never hide a previously valid snapshot.\n    // `stale` communicates freshness separately from usability.\n    available:true,",
    'weather snapshot availability'
)

# Live adapter: stale weather remains visible, and the current generated briefing
# becomes the context of the top Personal Operator instead of living only below fold.
replace_once(
    adapter,
    "  const compact = value => text(value).replace(/\\s+/g, ' ').trim();\n  const statusUpper = value => text(value).toUpperCase();",
    "  const compact = value => text(value).replace(/\\s+/g, ' ').trim();\n  const excerpt = (value, max = 180) => {\n    const cleaned = compact(value).replace(/\\b(?:FACT|INFERENCE|UNCERTAIN):\\s*/gi, '');\n    if (cleaned.length <= max) return cleaned;\n    const slice = cleaned.slice(0, max + 1);\n    const sentence = slice.lastIndexOf('. ');\n    const space = slice.lastIndexOf(' ');\n    const cut = sentence >= Math.floor(max * .55) ? sentence + 1 : space >= Math.floor(max * .65) ? space : max;\n    return cleaned.slice(0, cut).trim() + '…';\n  };\n  const statusUpper = value => text(value).toUpperCase();",
    'adapter excerpt helper'
)
replace_once(
    adapter,
    "    mapWeather(weather) {\n      const current = weather && weather.current;\n      const available = !!(weather && weather.available && current);\n      return {\n        available, stale: !!(weather && weather.stale),\n        place: text(weather && weather.location) || (available ? 'Standort aus OPS' : 'Wetterquelle nicht verfügbar'),\n        temp: available && current.temperatureC != null ? number(current.temperatureC) : null,\n        feelsLike: available && current.feelsLikeC != null ? number(current.feelsLikeC) : null,\n        cond: available ? text(current.text || 'Wetter') : (weather && weather.stale ? 'veraltet' : 'nicht verfügbar'),\n        error: text(weather && weather.lastError), lastSuccessAt: text(weather && weather.lastSuccessAt),\n        hours: asArray(weather && weather.hours).map(hour => ({\n          t: safeTime(hour.time) || '–', time: text(hour.time), v: number(hour.temperatureC),\n          code: number(hour.code), rain: hour.precipitationProbability == null ? null : number(hour.precipitationProbability),\n          text: text(hour.text)\n        }))\n      };\n    },",
    "    mapWeather(weather) {\n      const current = weather && weather.current;\n      const backendAvailable = !!(weather && weather.available);\n      const hasSnapshot = !!(current && (current.temperatureC != null || compact(current.text)));\n      const status = statusUpper(weather && weather.status);\n      const stale = !!(weather && (weather.stale || !backendAvailable || (status && status !== 'OK')));\n      return {\n        // Freshness and usability are deliberately separate: a failed refresh\n        // does not blank a still-useful last successful weather snapshot.\n        available: hasSnapshot, stale, status,\n        place: text(weather && weather.location) || (hasSnapshot ? 'Standort aus OPS' : 'Wetterquelle nicht verfügbar'),\n        temp: hasSnapshot && current.temperatureC != null ? number(current.temperatureC) : null,\n        feelsLike: hasSnapshot && current.feelsLikeC != null ? number(current.feelsLikeC) : null,\n        cond: hasSnapshot ? text(current.text || (stale ? 'letzter gültiger Stand' : 'Wetter')) : 'nicht verfügbar',\n        error: text(weather && weather.lastError), lastSuccessAt: text(weather && weather.lastSuccessAt),\n        hours: asArray(weather && weather.hours).map(hour => ({\n          t: safeTime(hour.time) || '–', time: text(hour.time), v: number(hour.temperatureC),\n          code: number(hour.code), rain: hour.precipitationProbability == null ? null : number(hour.precipitationProbability),\n          text: text(hour.text)\n        }))\n      };\n    },",
    'adapter stale weather mapping'
)
replace_once(
    adapter,
    "      const wellbeing = data.wb || {};\n      const guidance = wellbeing.guidance || {};\n      data.operator = {\n        step: task ? (task.next && !/^Kein nächster Schritt/.test(task.next) ? task.next : task.title) : 'Keine offene Aufgabe im OPS.',\n        why: task\n          ? (task.reason || [task.due !== '–' ? task.due : '', task.blockedBy].filter(Boolean).join(' · ') || 'Die Aufgabe steht im OPS aktuell an erster Stelle.')\n          : 'Der aktuelle OPS-Stand enthält keine offene Aufgabe.',\n        notNow: tasks.slice(1, 4).map(item => item.title),\n        mode: guidance.active\n          ? text(guidance.message)\n          : text(asArray(personal.dayStructure)[0] || asArray(personal.focusRules)[0] || 'Einen sichtbaren Schritt abschließen und Puffer lassen.')\n      };",
    "      const wellbeing = data.wb || {};\n      const guidance = wellbeing.guidance || {};\n      const briefing = data.briefing || {};\n      const briefingCore = briefing.available ? excerpt(briefing.core, 180) : '';\n      const briefingRec = briefing.available ? excerpt(briefing.rec, 155) : '';\n      const taskStep = task ? (task.next && !/^Kein nächster Schritt/.test(task.next) ? task.next : task.title) : '';\n      const taskWhy = task\n        ? (task.reason || [task.due !== '–' ? task.due : '', task.blockedBy].filter(Boolean).join(' · ') || 'Die Aufgabe steht im OPS aktuell an erster Stelle.')\n        : '';\n      data.operator = {\n        // The generated briefing belongs above the fold. When there is a task,\n        // it provides context; without a task, it becomes the operator's main statement.\n        step: taskStep || briefingCore || 'Keine offene Aufgabe im OPS.',\n        why: task ? (briefingCore || taskWhy) : (briefingRec || (briefingCore ? 'Aktueller Briefing-Stand aus dem OPS.' : 'Der aktuelle OPS-Stand enthält keine offene Aufgabe.')),\n        notNow: tasks.slice(1, 4).map(item => item.title),\n        mode: guidance.active\n          ? text(guidance.message)\n          : text(briefingRec || asArray(personal.dayStructure)[0] || asArray(personal.focusRules)[0] || 'Einen sichtbaren Schritt abschließen und Puffer lassen.')\n      };",
    'adapter operator briefing'
)

# Regression coverage.
weather_test_text = weather_test.read_text(encoding='utf-8')
weather_test_text += """

test('weather sync uses hourly cadence and multi-hour 429 cooldown', () => {
  assert.match(weatherSource, /WEATHER_V1_MIN_REQUEST_INTERVAL_SECONDS = 60 \* 60/);
  assert.match(weatherSource, /WEATHER_V1_429_COOLDOWN_SECONDS = 2 \* 60 \* 60/);
  assert.match(weatherSource, /everyHours\(1\)/);
  assert.match(weatherSource, /Math\.min\(6 \* 60 \* 60/);
  assert.match(weatherSource, /status:errorMessage \? 'DEGRADED' : 'OK'/);
  assert.match(weatherSource, /available:true/);
});
"""
weather_test.write_text(weather_test_text, encoding='utf-8')

adapter_text = adapter_test.read_text(encoding='utf-8')
needle = "    weather: { available: true, location: 'Live-Ort', current: { temperatureC: 20, feelsLikeC: 19, text: 'klar' }, hours: [{ time: '2026-08-22T12:00:00Z', temperatureC: 21, precipitationProbability: 10, text: 'klar' }] },"
replacement = "    weather: { available: false, stale: true, status: 'DEGRADED', location: 'Live-Ort', current: { temperatureC: 20, feelsLikeC: 19, text: 'klar' }, hours: [{ time: '2026-08-22T12:00:00Z', temperatureC: 21, precipitationProbability: 10, text: 'klar' }] },"
if adapter_text.count(needle) != 1:
    raise SystemExit('adapter test weather fixture not found exactly once')
adapter_text = adapter_text.replace(needle, replacement, 1)
needle2 = "  assert.equal(values.brief.core, 'Live-Briefing');\n  assert.equal(values.weather.place, 'Live-Ort · gefühlt 19 °C');"
replacement2 = "  assert.equal(values.brief.core, 'Live-Briefing');\n  assert.equal(component.D.weather.available, true);\n  assert.equal(component.D.weather.stale, true);\n  assert.match(values.op.why, /Live-Briefing/);\n  assert.match(values.op.mode, /Live-Empfehlung/);\n  assert.equal(values.weather.place, 'Live-Ort · gefühlt 19 °C');"
if adapter_text.count(needle2) != 1:
    raise SystemExit('adapter test assertion insertion point not found exactly once')
adapter_text = adapter_text.replace(needle2, replacement2, 1)
adapter_test.write_text(adapter_text, encoding='utf-8')

print('weather resilience + visible briefing patch applied')
