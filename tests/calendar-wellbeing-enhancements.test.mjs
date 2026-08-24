import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await readFile(join(root, 'src', 'ZZ_CalendarWellbeingEnhancements.gs'), 'utf8');
const client = await readFile(join(root, 'src', 'CalendarWellbeingEnhancements.html'), 'utf8');
const desktop = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const mobile = await readFile(join(root, 'src', 'MobileIndex.html'), 'utf8');

test('extension injects after the evaluated original templates without modifying their design sources', () => {
  assert.match(server, /createTemplateFromFile\(view\)/);
  assert.match(server, /CalendarWellbeingEnhancements/);
  assert.match(server, /rendered\.replace/);
  assert.match(server, /Heute im Kalender/);
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
