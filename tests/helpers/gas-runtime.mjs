import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

/** Minimal Utilities.formatDate stand-in for tests only. */
function formatDate(date, tz, pattern) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(parts.month) - 1];

  if (pattern === "yyyy-MM-dd'T'HH:mm:ssXXX") {
    return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}+00:00`;
  }

  const tokens = [
    ['yyyy', parts.year], ['MMM', monthShort], ['MM', parts.month], ['dd', parts.day],
    ['HH', hour], ['mm', parts.minute], ['ss', parts.second], ['SSS', pad(d.getMilliseconds(), 3)]
  ];
  let out = pattern;
  for (const [token, value] of tokens) out = out.split(token).join(value);
  return out;
}

function parseDate() {
  throw new Error('Utilities.parseDate is not available in the test harness.');
}

export function makeGasGlobals(overrides = {}) {
  return Object.assign({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Utilities: { formatDate, parseDate },
    HtmlService: {
      createTemplateFromFile: () => ({ evaluate: () => ({ getContent: () => '' }) }),
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
      createHtmlOutput: () => ({ setTitle: () => ({ setXFrameOptionsMode: () => ({}) }) }),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
    },
    ScriptApp: { getService: () => ({ getUrl: () => '' }) },
    CalendarApp: { getAllCalendars: () => [] },
    GmailApp: {},
    Logger: { log: () => {} }
  }, overrides);
}

export function makeFakeSheet(headers, dataRows) {
  const values = [headers, ...dataRows];
  return {
    getLastRow: () => values.length,
    getLastColumn: () => headers.length,
    getRange: (r1, c1, numRows, numCols) => ({
      getValues: () => values.slice(r1 - 1, r1 - 1 + numRows).map(row => row.slice(c1 - 1, c1 - 1 + numCols))
    })
  };
}

export function makeFakeSpreadsheet(sheetsByName) {
  return { getSheetByName: name => sheetsByName[name] || null };
}

/** Loads Apps-Script sources into a sandbox with mocked GAS globals. */
export async function loadGasModule(fileNames, globalOverrides = {}) {
  const sources = await Promise.all(fileNames.map(name => readFile(join(root, 'src', name), 'utf8')));
  const combined = sources.join('\n');

  const names = new Set();
  const fnPattern = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm;
  let match;
  while ((match = fnPattern.exec(combined))) names.add(match[1]);

  const globals = makeGasGlobals(globalOverrides);
  const paramNames = Object.keys(globals);
  const exportStatement = `\nreturn { ${[...names].map(n => `${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(', ')} };`;
  const factory = new Function(...paramNames, combined + exportStatement);
  return factory(...paramNames.map(key => globals[key]));
}
