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
  assert.match(mobile, /Claude Mobile Design source SHA-256/);
});

test('calendar endpoint supports day week month and hides Möglichkeiten by default', () => {
  assert.match(server, /getCalendarViewV4/);
  assert.match(server, /\['day', 'week', 'month'\]/);
  assert.match(server, /defaultVisible: !\/möglichkeit\/i/);
  assert.match(server, /CalendarApp\.getAllCalendars\(\)/);
  assert.match(client, /kz\.calendar\.v1/);
  for (const label of ['Tag', 'Woche', 'Monat', 'Heute', 'Kalender ▾']) {
    assert.match(client, new RegExp(label));
  }
});

test('calendar selection remains presentation state and does not write Google Calendar', () => {
  assert.doesNotMatch(server, /cal\.createEvent|ev\.deleteEvent|CalendarApp\.createEvent/);
  assert.match(server, /cal\.getEvents\(range\.start, range\.end\)/);
  assert.match(client, /localStorage\.setItem\(PREF_KEY/);
});

test('wellbeing can be backfilled while future entry dates are rejected', () => {
  assert.match(server, /saveWellbeingEntryV2/);
  assert.match(server, /entryDate > today/);
  assert.match(server, /saveWellbeingEntryV1\(p\)/);
  assert.match(client, /input\.type = 'date'/);
  assert.match(client, /input\.max = todayKey\(\)/);
  assert.match(client, /entryDate: state\.wellbeingDate/);
  assert.match(client, /saveWellbeingEntryV2/);
});

test('desktop and mobile share the same enhancement layer and touch controls stay usable', () => {
  assert.match(client, /findHosts/);
  assert.match(client, /kzCalendarEnhanced/);
  assert.match(client, /minHeight: mobile \? '44px' : '30px'/);
  assert.match(client, /background: active \? GREEN/);
  assert.match(client, /Kommandozentrale Mobil/);
  assert.match(client, /observer\.disconnect\(\)/);
  assert.match(client, /GOLD/);
});
