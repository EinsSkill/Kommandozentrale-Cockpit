import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');
const html = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const fixtures = JSON.parse(await readFile(join(root, 'fixtures', 'wellbeing.json'), 'utf8'));

test('Apps-Script-Wohlbefindenpfad erfüllt den OPS-Vertrag', () => {
  assert.match(code, /const WELLBEING_SHEET = 'WELLBEING_LOG'/);
  assert.match(code, /const WELLBEING_HEADERS = \[/);
  assert.match(code, /function getWellbeingV1\(force\)/);
  assert.match(code, /function ensureWellbeingLogV1\(\)/);
  assert.match(code, /function saveWellbeingEntryV1\(payload\)/);
  assert.match(code, /WELLBEING_ENTRY_/);
  assert.match(code, /Keine Second-Brain-Änderung/);
  assert.doesNotMatch(code, /SECOND_BRAIN_ROOT_ID\s*=\s*['"][^'"]+['"]/);
});

test('Frontend bietet Verlauf, freiwillige Felder und Speichern an', () => {
  assert.match(html, /id="card-wohlbefinden"/);
  assert.match(html, /callServer\('getWellbeingV1',force\)/);
  assert.match(html, /callServer\('saveWellbeingEntryV1',wellbeingFormPayload\(\)\)/);
  assert.match(html, /function wellbeingChartSvg_/);
  assert.match(html, /function wellbeingFormHtml_/);
  assert.match(html, /Heute nicht angeben/);
  assert.match(html, /Abendcheck speichern/);
  assert.match(html, /function saveWellbeing\(\)/);
});

test('Backend und eingebettetes Frontend sind syntaktisch parsebar', () => {
  assert.doesNotThrow(() => new Function(code));
  const script = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(script, 'Index.html enthält keinen Script-Block');
  assert.doesNotThrow(() => new Function(script[1]));
});

test('Wohlbefinden-Fixtures sind anonymisiert und liegen im erlaubten Wertebereich', () => {
  assert.ok(fixtures.length >= 3);
  const metrics = ['mood', 'energy', 'inner_pressure', 'sleep_quality', 'motivation', 'recovery'];
  for (const row of fixtures) {
    assert.match(row.entry_id, /^FIXTURE_WB_/);
    assert.match(row.entry_date, /^\d{4}-\d{2}-\d{2}$/);
    for (const field of metrics) {
      assert.equal(typeof row[field], 'number', 'Feld muss numerisch sein: ' + field);
      assert.ok(row[field] >= 1 && row[field] <= 10, 'Feld außerhalb 1–10: ' + field);
    }
    assert.equal(typeof row.feeling, 'string');
    assert.ok(row.feeling.length > 0);
    assert.ok(row.feeling_intensity >= 1 && row.feeling_intensity <= 5);
    assert.equal(typeof row.influence_factor, 'string');
    assert.equal(row.source, 'FIXTURE');
  }
  assert.doesNotMatch(JSON.stringify(fixtures), /gmail|docs\.google|script\.google/i);
});
