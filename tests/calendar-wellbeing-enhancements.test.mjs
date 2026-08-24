import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const code = await readFile(join(src, 'Code.gs'), 'utf8');
const server = await readFile(join(src, 'ZZ_CalendarWellbeingEnhancements.gs'), 'utf8');
const client = await readFile(join(src, 'CalendarWellbeingEnhancements.html'), 'utf8');
const desktop = await readFile(join(src, 'Index.html'), 'utf8');
const mobile = await readFile(join(src, 'MobileIndex.html'), 'utf8');

test('Code.gs owns the single web entry point and injects the enhancement without modifying design sources', async () => {
  const gsFiles = (await readdir(src)).filter(name => name.endsWith('.gs'));
  let doGetCount = 0;
  for (const name of gsFiles) {
    const content = await readFile(join(src, name), 'utf8');
    doGetCount += (content.match(/function\s+doGet\s*\(/g) || []).length;
  }
  assert.equal(doGetCount, 1);
  assert.match(code, /createTemplateFromFile\(view\)/);
  assert.match(code, /CalendarWellbeingEnhancements/);
  assert.match(code, /rendered\.replace/);
  assert.match(code, /Heute im Kalender/);
  assert.doesNotMatch(server, /function\s+doGet\s*\(/);
  assert.match(desktop, /Claude Design source SHA-256/);
  assert.match(desktop, /data-kz-calendar-detail-host/);
  assert.match(desktop, /showLedger:dk!=='calendar'/);import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const code = await readFile(join(src, 'Code.gs'), 'utf8');
const server = await readFile(join(src, 'ZZ_CalendarWellbeingEnhancements.gs'), 'utf8');
const client = await readFile(join(src, 'CalendarWellbeingEnhancements.html'), 'utf8');
const desktop = await readFile(join(src, 'Index.html'), 'utf8');
const mobile = await readFile(join(src, 'MobileIndex.html'), 'utf8');

test('Code.gs owns the single web entry point and injects the enhancement without modifying design sources', async () => {
  const gsFiles = (await readdir(src)).filter(name => name.endsWith('.gs'));
  let doGetCount = 0;
  for (const name of gsFiles) {
    const content = await readFile(join(src, name), 'utf8');
    doGetCount += (content.match(/function\s+doGet\s*\(/g) || []).length;
  }
  assert.equal(doGetCount, 1);
  assert.match(code, /createTemplateFromFile\(view\)/);
  assert.match(code, /CalendarWellbeingEnhancements/);
  assert.match(code, /rendered\.replace/);
  assert.match(code, /Heute im Kalender/);
  assert.doesNotMatch(server, /function\s+doGet\s*\(/);
  assert.match(desktop, /Claude Design source SHA-256/);
  assert.match(mobile, /Claude Mobile Design source SHA-256/);
});

test('calendar endpoint supports day week month and hides Möglichkeiten by default', () => {
  assert.match(server, /getCalendarViewV4/);
  assert.match(server, /\['day', 'week', 'month'\]/);
  assert.match(server, /defaultVisible: !\/möglichkeit\/i/);
  assert.match(server, /CalendarApp\.getAllCalendars\(\)/);
  assert.match(client, /kz\.calendar\.v2/);
  for (const label of ['Tag', 'Woche', 'Monat', 'Heute', 'Kalender']) {
    assert.match(client, new RegExp(label));
  }
});

test('calendar redesign keeps dense views inside the tile and uses purpose-built day week month layouts', () => {
  assert.match(client, /kz-cal-desktop/);
  assert.match(client, /kz-cal-detail/);
  assert.match(client, /renderLargeTimeGrid/);
  assert.match(client, /largeTimeSegmentsForDay/);import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const code = await readFile(join(src, 'Code.gs'), 'utf8');
const server = await readFile(join(src, 'ZZ_CalendarWellbeingEnhancements.gs'), 'utf8');
const client = await readFile(join(src, 'CalendarWellbeingEnhancements.html'), 'utf8');
const desktop = await readFile(join(src, 'Index.html'), 'utf8');
const mobile = await readFile(join(src, 'MobileIndex.html'), 'utf8');

test('Code.gs owns the single web entry point and injects the enhancement without modifying design sources', async () => {
  const gsFiles = (await readdir(src)).filter(name => name.endsWith('.gs'));
  let doGetCount = 0;
  for (const name of gsFiles) {
    const content = await readFile(join(src, name), 'utf8');
    doGetCount += (content.match(/function\s+doGet\s*\(/g) || []).length;
  }
  assert.equal(doGetCount, 1);
  assert.match(code, /createTemplateFromFile\(view\)/);
  assert.match(code, /CalendarWellbeingEnhancements/);
  assert.match(code, /rendered\.replace/);
  assert.match(code, /Heute im Kalender/);
  assert.doesNotMatch(server, /function\s+doGet\s*\(/);
  assert.match(desktop, /Claude Design source SHA-256/);
  assert.match(mobile, /Claude Mobile Design source SHA-256/);
});

test('calendar endpoint supports day week month and hides Möglichkeiten by default', () => {
  assert.match(server, /getCalendarViewV4/);
  assert.match(server, /\['day', 'week', 'month'\]/);
  assert.match(server, /defaultVisible: !\/möglichkeit\/i/);
  assert.match(server, /CalendarApp\.getAllCalendars\(\)/);
  assert.match(client, /kz\.calendar\.v2/);
  for (const label of ['Tag', 'Woche', 'Monat', 'Heute', 'Kalender']) {
    assert.match(client, new RegExp(label));
  }
});

test('calendar redesign keeps dense views inside the tile and uses purpose-built day week month layouts', () => {
  assert.match(client, /kz-cal-desktop/);
  assert.match(client, /position:absolute/);
  assert.match(client, /kz-week-strip/);
  assert.match(client, /kz-agenda-list/);
  assert.match(client, /kz-month-grid/);
  assert.match(client, /kz-month-dots/);
  assert.match(client, /openDay\(day\)/);
  assert.doesNotMatch(client, /component\.D\.week\s*=/);
});

test('calendar selection remains presentation state and does not write Google Calendar', () => {
  assert.doesNotMatch(server, /cal\.createEvent|ev\.deleteEvent|CalendarApp\.createEvent/);
  assert.match(server, /cal\.getEvents\(range\.start, range\.end\)/);
  assert.match(client, /localStorage\.setItem\(PREF_KEY/);
  assert.match(client, /selectStandardCalendars/);
  assert.match(client, /selectAllCalendars/);
});

test('wellbeing backfill reads the visible selected date and verifies the server saved the same logical date', () => {
  assert.match(server, /saveWellbeingEntryV2/);
  assert.match(server, /entryDate > today/);
  assert.match(server, /saveWellbeingEntryV1\(p\)/);
  assert.match(client, /input\.type='date'/);
  assert.match(client, /input\.max=todayKey\(\)/);
  assert.match(client, /selectedWellbeingDate/);
  assert.match(client, /entryDate/);
  assert.match(client, /saveWellbeingEntryV2/);
  assert.match(client, /result\.entryDate/);
  assert.match(client, /__kzBackfillV2/);
  assert.match(client, /pointerdown',ensureAdapterPatch,true/);
  assert.match(client, /wbSaved:todaySaved/);
  assert.doesNotMatch(client, /kz\.wellbeing\.entryDate/);
});

test('desktop and mobile share the enhancement layer with cockpit styling and usable touch targets', () => {
  assert.match(client, /Kommandozentrale Mobil/);
  assert.match(client, /#1B4632/);
  assert.match(client, /#B8912F/);
  assert.match(client, /min-height:44px/);
  assert.match(client, /observer\.disconnect\(\)/);
  assert.match(client, /kz-cal-popover/);
});

test('embedded enhancement JavaScript remains syntactically parseable', () => {
  const match = client.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'enhancement script block missing');
  assert.doesNotThrow(() => new Function(match[1]));
});
