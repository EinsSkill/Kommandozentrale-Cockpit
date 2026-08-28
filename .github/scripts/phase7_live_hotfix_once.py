from pathlib import Path
import re
import subprocess


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def require(condition, message):
    if not condition:
        raise SystemExit(message)


# ---------------------------------------------------------------------------
# Code.gs: force a fresh base cache and expose a non-sensitive integrity proof.
# ---------------------------------------------------------------------------
code_path = 'src/Code.gs'
code = read(code_path)
require("const CACHE_BASE_V31 = 'KZ_V31_BASE';" in code, 'base cache key marker missing')
code = code.replace("const CACHE_BASE_V31 = 'KZ_V31_BASE';", "const CACHE_BASE_V31 = 'KZ_V31_BASE_LIVE_HOTFIX_1';", 1)

old_base_tail = """    safeAssign_(out, 'goals', function(){ return getGoals_(rd); }, []);\n    out.timingMs = new Date().getTime() - started;\n    return out;\n"""
new_base_tail = """    safeAssign_(out, 'goals', function(){ return getGoals_(rd); }, []);\n    out.runtimeVersion = 'PHASE7_LIVE_HOTFIX_1';\n    out.integrity = dashboardBaseIntegrityV1_(rd);\n    out.timingMs = new Date().getTime() - started;\n    return out;\n"""
require(old_base_tail in code, 'base payload tail marker missing')
code = code.replace(old_base_tail, new_base_tail, 1)

insert_before = "function getFinanceV31(force) {"
require(insert_before in code, 'getFinanceV31 marker missing')
integrity_fn = r'''function dashboardBaseIntegrityV1_(rd) {
  const tasks = rd.rows('TASKS');
  const projects = rd.rows('PROJECTS');
  const briefings = rd.rows('BRIEFINGS');
  const weather = rd.rows('WEATHER_CURRENT');
  const normalized = value => String(value == null ? '' : value).trim().toUpperCase();
  const archived = row => truthy_(row && row.archived);
  return {
    rawTaskRows: tasks.filter(row => row.task_id).length,
    openTaskCandidates: tasks.filter(row => row.task_id && !archived(row) && !['DONE','CANCELLED'].includes(normalized(row.status))).length,
    activeProjectCandidates: projects.filter(row => row.project_id && !archived(row) && normalized(row.status) === 'ACTIVE').length,
    successfulBriefings: briefings.filter(row => row.briefing_id && normalized(row.generation_status) === 'SUCCESS').length,
    weatherSnapshots: weather.filter(row => row.weather_id).length
  };
}

'''
code = code.replace(insert_before, integrity_fn + insert_before, 1)
write(code_path, code)


# ---------------------------------------------------------------------------
# Canonical Food mount hosts: always normal document flow, at the bottom.
# ---------------------------------------------------------------------------
index_path = 'src/Index.html'
index = read(index_path)
footer_marker = """    <div style=\"max-width:1560px;margin:0 auto;padding:0 24px 44px;display:flex;align-items:center;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.1em;color:#7A8A7C\">\n      <span>LUKES KOMMANDOZENTRALE · V4 · APPS SCRIPT WEB-APP</span>\n"""
require(footer_marker in index, 'desktop footer marker missing')
desktop_host = """    <div data-kz-food-host=\"desktop\" style=\"max-width:1560px;margin:0 auto;padding:0 24px 24px;position:relative;z-index:5\"></div>\n\n"""
require('data-kz-food-host="desktop"' not in index, 'desktop Food host already present unexpectedly')
index = index.replace(footer_marker, desktop_host + footer_marker, 1)
write(index_path, index)

mobile_path = 'src/MobileIndex.html'
mobile = read(mobile_path)
mobile_marker = """      </sc-if>\n    </div>\n\n    <div style=\"position:fixed;left:0;right:0;bottom:0;width:100%;box-sizing:border-box;z-index:60;display:flex;background:linear-gradient(180deg,#102C1E 0%,#0A1F15 100%);"""
require(mobile_marker in mobile, 'mobile content/bottom-nav marker missing')
mobile_host = """      </sc-if>\n      <div data-kz-food-host=\"mobile\"></div>\n    </div>\n\n    <div style=\"position:fixed;left:0;right:0;bottom:0;width:100%;box-sizing:border-box;z-index:60;display:flex;background:linear-gradient(180deg,#102C1E 0%,#0A1F15 100%);"""
require('data-kz-food-host="mobile"' not in mobile, 'mobile Food host already present unexpectedly')
mobile = mobile.replace(mobile_marker, mobile_host, 1)
write(mobile_path, mobile)


# ---------------------------------------------------------------------------
# Food enhancement: idempotent and mounts only into rendered #dc-root host.
# ---------------------------------------------------------------------------
food_path = 'src/FoodTrackingEnhancements.html'
food = read(food_path)
food = food.replace(
    ".kz-food-entry.kz-food-entry-desktop{grid-column:1 / span 12;position:relative;z-index:2;margin-top:0;padding:20px 22px;",
    ".kz-food-entry.kz-food-entry-desktop{position:relative;z-index:2;width:100%;margin-top:0;padding:20px 22px;",
    1
)
old_mobile_css = ".kz-food-entry.kz-food-entry-mobile{position:fixed;left:12px;right:12px;bottom:84px;z-index:59;padding:13px 15px;display:flex;align-items:center;gap:11px;border:1px solid rgba(184,145,47,.4);border-radius:12px;background:linear-gradient(180deg,#F5EFE2,#EEE6D5);box-shadow:0 18px 38px -20px rgba(10,31,21,.75);cursor:pointer;pointer-events:auto}"
new_mobile_css = ".kz-food-entry.kz-food-entry-mobile{position:relative;width:100%;z-index:5;padding:13px 15px;display:flex;align-items:center;gap:11px;border:1px solid rgba(184,145,47,.4);border-radius:12px;background:linear-gradient(180deg,#F5EFE2,#EEE6D5);box-shadow:0 14px 30px -22px rgba(10,31,21,.65);cursor:pointer;pointer-events:auto}"
require(old_mobile_css in food, 'fixed mobile Food CSS marker missing')
food = food.replace(old_mobile_css, new_mobile_css, 1)

guard_marker = """(function () {\n  'use strict';\n  try {\n"""
require(guard_marker in food, 'Food IIFE marker missing')
food = food.replace(guard_marker, """(function () {\n  'use strict';\n  if (window.__KZ_FOOD_ENHANCEMENT_V2__) return;\n  window.__KZ_FOOD_ENHANCEMENT_V2__ = true;\n  try {\n""", 1)

entry_start = food.index('    function entryCard(){')
entry_end = food.index('    function tabsHtml()', entry_start)
require(entry_start >= 0 and entry_end > entry_start, 'Food entry function block not found')
new_entry = r'''    function foodHost(){var root=document.getElementById('dc-root');return root&&root.querySelector?root.querySelector('[data-kz-food-host]'):null;}
    function entryCard(){
      var host=foodHost();if(!host)return null;
      var existing=host.querySelector('[data-kz-food-entry]');if(existing)return existing;
      host.querySelectorAll('[data-kz-food-entry]').forEach(function(node){node.remove();});
      var card=document.createElement('section');card.className='kz-food-entry';card.setAttribute('data-kz-food-entry','1');card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-label','Ernährungsbereich öffnen');
      card.classList.add(host.getAttribute('data-kz-food-host')==='mobile'?'kz-food-entry-mobile':'kz-food-entry-desktop');
      card.addEventListener('click',openFood);card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openFood();}});
      host.replaceChildren(card);return card;
    }
    function renderEntry(){var card=entryCard();if(!card)return false;var connected=state.food&&state.food.ok&&state.food.available;card.innerHTML='<div class="kz-food-entry-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M5 4v7M8 4v7M5 8h3M6.5 11v9M16 4v16M16 4c2.2 2.2 2.2 5.5 0 7.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></div><div><div class="kz-food-entry-title">Ernährung</div><div class="kz-food-entry-sub">Mahlzeiten, Vorrat, Einkauf, Rezepte und Verlauf</div></div><div class="kz-food-entry-status">'+(connected?'DATEN VERBUNDEN':state.loading?'LÄDT':'BEREICH ÖFFNEN')+'</div><div class="kz-food-entry-arrow">→</div>';return true;}
'''
food = food[:entry_start] + new_entry + food[entry_end:]

old_startup = """    renderEntry();\n    loadFood(false);\n    var params=new URLSearchParams(window.location.search);if(params.get('section')==='food'||params.get('view')==='food'||params.get('view')==='food-mobile'){setTimeout(openFood,0);}\n"""
new_startup = """    function bootFoodMount(attempt){\n      if(renderEntry()){loadFood(false);var params=new URLSearchParams(window.location.search);if(params.get('section')==='food'||params.get('view')==='food'||params.get('view')==='food-mobile')setTimeout(openFood,0);return;}\n      if((attempt||0)<120)setTimeout(function(){bootFoodMount((attempt||0)+1);},50);\n    }\n    bootFoodMount(0);\n"""
require(old_startup in food, 'Food startup marker missing')
food = food.replace(old_startup, new_startup, 1)
require('document.body.appendChild(card)' not in food, 'Food entry still has body fallback')
require('.kz-food-entry-mobile{position:fixed' not in food, 'Food entry still fixed')
write(food_path, food)


# ---------------------------------------------------------------------------
# Calendar/wellbeing fragment: tolerate accidental duplicate inclusion safely.
# ---------------------------------------------------------------------------
cal_path = 'src/CalendarWellbeingEnhancements.html'
cal = read(cal_path)
cal_iife = """(function(){\n'use strict';\n"""
if cal_iife in cal and '__KZ_CALENDAR_WELLBEING_ENHANCEMENT_V1__' not in cal:
    cal = cal.replace(cal_iife, """(function(){\n'use strict';\nif(window.__KZ_CALENDAR_WELLBEING_ENHANCEMENT_V1__)return;\nwindow.__KZ_CALENDAR_WELLBEING_ENHANCEMENT_V1__=true;\n""", 1)
write(cal_path, cal)


# ---------------------------------------------------------------------------
# LiveAdapter: component generation, raw replay, version/integrity retry.
# ---------------------------------------------------------------------------
adapter_path = 'src/LiveAdapter.html'
adapter = read(adapter_path)
require("    component: null,\n    raw: {}," in adapter, 'adapter component marker missing')
adapter = adapter.replace("    component: null,\n    raw: {},", "    component: null,\n    generation: 0,\n    raw: {},", 1)

old_connect = r'''    connect(component) {
      this.component = component;
      this.load(false);
    },

    disconnect(component) {
      if (this.component === component) this.component = null;
    },
'''
new_connect = r'''    connect(component) {
      this.component = component;
      this.generation += 1;
      const generation = this.generation;
      this.replayRaw();
      this.load(false, generation, component);
    },

    disconnect(component) {
      if (this.component === component) {
        this.component = null;
        this.generation += 1;
      }
    },

    isCurrent(generation, component) {
      return this.component === component && this.generation === generation;
    },

    replayRaw() {
      if (!this.component) return;
      if (this.raw.base) this.applyBase(this.raw.base);
      if (this.raw.finance) this.applyFinance(this.raw.finance);
      if (this.raw.health) this.applyHealth(this.raw.health);
      if (this.raw.wellbeing) this.applyWellbeing(this.raw.wellbeing);
      if (this.raw.calendar) this.applyCalendar(this.raw.calendar);
      if (this.raw.mail) this.applyMail(this.raw.mail);
      if (this.raw.personal) this.applyPersonal(this.raw.personal);
      this.refreshSystem();
    },

    baseIntegrityProblem(value) {
      if (!value || value.runtimeVersion !== 'PHASE7_LIVE_HOTFIX_1') return 'OPS-Backend ist nicht auf dem aktuellen Hotfix-Stand.';
      const integrity = value.integrity || {};
      const problems = [];
      if (number(integrity.openTaskCandidates) > 0 && asArray(value.tasks).length === 0) problems.push('offene Tasks fehlen im Payload');
      if (number(integrity.activeProjectCandidates) > 0 && asArray(value.projects).length === 0) problems.push('aktive Projekte fehlen im Payload');
      if (number(integrity.successfulBriefings) > 0 && !value.briefing) problems.push('erfolgreiches Briefing fehlt im Payload');
      if (number(integrity.weatherSnapshots) > 0 && !(value.weather && value.weather.current)) problems.push('Wetter-Snapshot fehlt im Payload');
      return problems.join(' · ');
    },
'''
require(old_connect in adapter, 'adapter connect block missing')
adapter = adapter.replace(old_connect, new_connect, 1)

adapter = adapter.replace('    async load(force) {', '    async load(force, expectedGeneration, expectedComponent) {\n      const generation = expectedGeneration == null ? this.generation : expectedGeneration;\n      const component = expectedComponent || this.component;', 1)

old_call = """          const value = await this.call(endpoint, !!force);\n          apply(value || {});\n          this.loads[key] = { state: 'ok', ms: Math.round(performance.now() - started), error: '' };\n"""
new_call = """          let value = await this.call(endpoint, !!force);\n          if (!this.isCurrent(generation, component)) return;\n          if (key === 'base') {\n            let integrityProblem = this.baseIntegrityProblem(value);\n            if (integrityProblem && !force) {\n              value = await this.call(endpoint, true);\n              if (!this.isCurrent(generation, component)) return;\n              integrityProblem = this.baseIntegrityProblem(value);\n            }\n            if (integrityProblem) throw new Error('OPS Integritätsprüfung: ' + integrityProblem);\n          }\n          apply(value || {});\n          this.loads[key] = { state: 'ok', ms: Math.round(performance.now() - started), error: '' };\n"""
require(old_call in adapter, 'adapter endpoint call block missing')
adapter = adapter.replace(old_call, new_call, 1)

old_catch = """        } catch (error) {\n          this.loads[key] = {\n"""
new_catch = """        } catch (error) {\n          if (!this.isCurrent(generation, component)) return;\n          this.loads[key] = {\n"""
require(old_catch in adapter, 'adapter catch marker missing')
adapter = adapter.replace(old_catch, new_catch, 1)

old_end = """      this.applyOperator();\n      this.refreshSystem();\n      this.touch();\n    },\n\n    reload(component) {\n      if (component) this.component = component;\n      return this.load(true);\n"""
new_end = """      if (!this.isCurrent(generation, component)) return;\n      this.applyOperator();\n      this.refreshSystem();\n      this.touch();\n    },\n\n    reload(component) {\n      if (component && component !== this.component) { this.component = component; this.generation += 1; }\n      return this.load(true, this.generation, this.component);\n"""
require(old_end in adapter, 'adapter load/reload tail missing')
adapter = adapter.replace(old_end, new_end, 1)
write(adapter_path, adapter)


# ---------------------------------------------------------------------------
# Regression tests for the exact live failure modes.
# ---------------------------------------------------------------------------
food_test_path = 'tests/food-tracking-contract.test.mjs'
food_test = read(food_test_path)
insert_test = r'''

test('Food-Einstieg hat genau einen stabilen In-Flow-Mount pro kanonischer View', () => {
  assert.equal((cockpitDesktop.match(/data-kz-food-host="desktop"/g) || []).length, 1);
  assert.equal((cockpitMobile.match(/data-kz-food-host="mobile"/g) || []).length, 1);
  assert.match(entry, /__KZ_FOOD_ENHANCEMENT_V2__/);
  assert.match(entry, /getElementById\('dc-root'\)/);
  assert.match(entry, /querySelector\('\[data-kz-food-host\]'\)/);
  assert.match(entry, /host\.replaceChildren\(card\)/);
  assert.doesNotMatch(entry, /document\.body\.appendChild\(card\)/);
  assert.doesNotMatch(entry, /\.kz-food-entry\.kz-food-entry-mobile\{position:fixed/);
  assert.match(entry, /\.kz-food-panel\{position:fixed/);
});
'''
require("test('Backend, Routen und eingebettete Scripts sind syntaktisch parsebar'" in food_test, 'Food syntax test marker missing')
food_test = food_test.replace("test('Backend, Routen und eingebettete Scripts sind syntaktisch parsebar'", insert_test + "\ntest('Backend, Routen und eingebettete Scripts sind syntaktisch parsebar'", 1)
write(food_test_path, food_test)

live_test_path = 'tests/live-adapter-render.test.mjs'
live_test = read(live_test_path)
live_test = live_test.replace(
    "  adapter.applyBase({\n    tasks:",
    "  adapter.applyBase({\n    runtimeVersion: 'PHASE7_LIVE_HOTFIX_1',\n    integrity: { openTaskCandidates: 1, activeProjectCandidates: 1, successfulBriefings: 1, weatherSnapshots: 1 },\n    tasks:",
    1
)
require("test('real endpoint-shaped payloads flow through the adapter into Claude Design values'" in live_test, 'live payload test marker missing')
extra_live_tests = r'''

test('base integrity rejects a green-but-empty canonical payload', () => {
  const { adapter } = harness();
  assert.match(adapter.baseIntegrityProblem({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_1',
    integrity: { openTaskCandidates: 12, activeProjectCandidates: 6, successfulBriefings: 4, weatherSnapshots: 1 },
    tasks: [], projects: [], briefing: null, weather: { current: null }
  }), /offene Tasks fehlen.*aktive Projekte fehlen.*Briefing fehlt.*Wetter-Snapshot fehlt/);
  assert.equal(adapter.baseIntegrityProblem({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_1',
    integrity: { openTaskCandidates: 0, activeProjectCandidates: 0, successfulBriefings: 0, weatherSnapshots: 0 },
    tasks: [], projects: [], briefing: null, weather: { current: null }
  }), '');
});

test('cached live data is replayed into a replacement component after a runtime remount', () => {
  const first = harness();
  first.adapter.applyBase({
    runtimeVersion: 'PHASE7_LIVE_HOTFIX_1',
    integrity: { openTaskCandidates: 1, activeProjectCandidates: 1, successfulBriefings: 1, weatherSnapshots: 1 },
    tasks: [{ id: 'TASK_REPLAY', title: 'Replay-Aufgabe', status: 'OPEN', aiPriority: 90 }],
    projects: [{ id: 'PROJ_REPLAY', title: 'Replay-Projekt', status: 'ACTIVE' }],
    briefing: { type: 'AD_HOC', summary: 'Replay-Briefing' },
    weather: { available: true, status: 'OK', current: { temperatureC: 20, text: 'Bedeckt' }, hours: [] },
    alerts: [], aiInbox: [], goals: [], syncState: []
  });
  const replacement = new first.component.constructor();
  replacement.props = first.component.props;
  replacement.setState = update => {
    const next = typeof update === 'function' ? update(replacement.state) : update;
    Object.assign(replacement.state, next || {});
  };
  first.adapter.component = replacement;
  first.adapter.replayRaw();
  assert.equal(replacement.D.tasks[0].title, 'Replay-Aufgabe');
  assert.equal(replacement.D.projects[0].title, 'Replay-Projekt');
  assert.equal(replacement.D.briefing.core, 'Replay-Briefing');
  assert.equal(replacement.D.weather.available, true);
});
'''
live_test += extra_live_tests
write(live_test_path, live_test)

hotfix_test = r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(join(root, 'src', 'Code.gs'), 'utf8');
const adapter = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const food = await readFile(join(root, 'src', 'FoodTrackingEnhancements.html'), 'utf8');

test('Phase-7 live hotfix carries an explicit backend version and integrity proof', () => {
  assert.match(code, /KZ_V31_BASE_LIVE_HOTFIX_1/);
  assert.match(code, /runtimeVersion = 'PHASE7_LIVE_HOTFIX_1'/);
  assert.match(code, /function dashboardBaseIntegrityV1_/);
  for (const key of ['openTaskCandidates','activeProjectCandidates','successfulBriefings','weatherSnapshots']) assert.match(code, new RegExp(key));
});

test('LiveAdapter retries suspicious OPS base data and guards remount races', () => {
  assert.match(adapter, /generation: 0/);
  assert.match(adapter, /replayRaw\(\)/);
  assert.match(adapter, /baseIntegrityProblem\(value\)/);
  assert.match(adapter, /value = await this\.call\(endpoint, true\)/);
  assert.match(adapter, /isCurrent\(generation, component\)/);
});

test('Food entry can no longer become a viewport-fixed duplicate', () => {
  assert.match(food, /__KZ_FOOD_ENHANCEMENT_V2__/);
  assert.doesNotMatch(food, /document\.body\.appendChild\(card\)/);
  assert.doesNotMatch(food, /kz-food-entry-mobile\{position:fixed/);
});
'''
write('tests/live-regression-hotfix.test.mjs', hotfix_test)

# Final static safety checks before the repository test suite.
for path in [code_path, index_path, mobile_path, food_path, adapter_path]:
    require(Path(path).exists(), path + ' missing')

subprocess.run(['npm', 'test'], check=True)
