import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const code = await readFile(join(src, 'Code.gs'), 'utf8');
const service = await readFile(join(src, 'CalendarService.gs'), 'utf8');
const wellbeing = await readFile(join(src, 'ZZ_CalendarWellbeingEnhancements.gs'), 'utf8');
const adapter = await readFile(join(src, 'LiveAdapter.html'), 'utf8');
const enhancement = await readFile(join(src, 'CalendarWellbeingEnhancements.html'), 'utf8');

test('only CalendarService owns direct Google Calendar reads', async () => {
  const gsFiles = (await readdir(src)).filter(name => name.endsWith('.gs'));
  const readers = [];
  for (const name of gsFiles) {
    const content = await readFile(join(src, name), 'utf8');
    if (/CalendarApp\.getAllCalendars\(\)|\.getEvents\(range\.start,\s*range\.end\)/.test(content)) readers.push(name);
  }
  assert.deepEqual(readers, ['CalendarService.gs']);
  assert.doesNotMatch(code, /function\s+getCalendarWeek_\s*\(/);
  assert.doesNotMatch(wellbeing, /getCalendarViewV4|CalendarApp\.getAllCalendars/);
});

test('legacy V3 endpoint delegates to the canonical V4 service and does not aggregate independently', () => {
  assert.match(code, /function getCalendarWeekV3\(force\)[\s\S]*getCalendarViewV4\(\{ view: 'week' \}, !!force\)/);
  assert.match(code, /compatibilitySource: 'getCalendarViewV4'/);
  assert.doesNotMatch(code, /CACHE_CAL/);
});

test('both cockpit Calendar consumers use the canonical V4 contract', () => {
  assert.match(adapter, /\['calendar', 'getCalendarViewV4'/);
  assert.match(adapter, /value\.rangeStart \|\| value\.weekStart/);
  assert.doesNotMatch(adapter, /\['calendar', 'getCalendarWeekV3'/);
  assert.match(enhancement, /call\('getCalendarViewV4'/);
});

test('canonical range helper keeps deterministic day week month boundaries', () => {
  const context = { Date };
  vm.createContext(context);
  vm.runInContext(service, context);
  const anchor = new Date(2026, 7, 27, 12, 0, 0, 0); // Thursday
  const day = context.calendarV4Range_('day', anchor);
  const week = context.calendarV4Range_('week', anchor);
  const month = context.calendarV4Range_('month', anchor);
  assert.equal(day.dayCount, 1);
  assert.equal(week.dayCount, 7);
  assert.equal(week.start.getDay(), 1);
  assert.equal(month.dayCount, 42);
  assert.equal(month.start.getDay(), 1);
});
