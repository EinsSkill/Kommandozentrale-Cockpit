from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# Wave 5 — Permission runtime enforcement.
code_path = Path('src/Code.gs')
code = code_path.read_text()

code = replace_once(code,
"""function ensureWellbeingLogV1() {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  let sh = ss.getSheetByName(WELLBEING_SHEET);""",
"""function ensureWellbeingLogV1() {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const wellbeingSetupPermission = authorizeActionV1_(ss, 'unknown_action', {
    triggerType: 'USER_RUN_FUNCTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  let sh = ss.getSheetByName(WELLBEING_SHEET);""",
'wellbeing setup guard')
code = replace_once(code,
"""    trigger_type: 'USER_RUN_FUNCTION',
    permission_class: 'USER_APPROVED',""",
"""    trigger_type: wellbeingSetupPermission.triggerType,
    permission_class: wellbeingSetupPermission.permissionClass,""",
'wellbeing setup audit')

code = replace_once(code,
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sh = ss.getSheetByName(WELLBEING_SHEET);
  if (!sh) throw new Error('Tab WELLBEING_LOG fehlt. Einmal ensureWellbeingLogV1() ausführen.');""",
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const wellbeingSavePermission = authorizeActionV1_(ss, 'wellbeing_save', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName(WELLBEING_SHEET);
  if (!sh) throw new Error('Tab WELLBEING_LOG fehlt. Einmal ensureWellbeingLogV1() ausführen.');""",
'wellbeing save guard')
code = replace_once(code,
"""    trigger_type: 'DASHBOARD_USER_ACTION',
    permission_class: 'USER_APPROVED',
    status: 'SUCCESS',
    previous_value: existing ? 'same-day entry' : '',""",
"""    trigger_type: wellbeingSavePermission.triggerType,
    permission_class: wellbeingSavePermission.permissionClass,
    status: 'SUCCESS',
    previous_value: existing ? 'same-day entry' : '',""",
'wellbeing save audit')

code = replace_once(code,
"""function setTaskDone(taskId, done) {
  if (!taskId) throw new Error('taskId fehlt.');
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sh = ss.getSheetByName('TASKS');""",
"""function setTaskDone(taskId, done) {
  if (!taskId) throw new Error('taskId fehlt.');
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const taskPermission = authorizeActionV1_(ss, 'task_complete_cancel', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName('TASKS');""",
'task guard')
code = replace_once(code,
"""    trigger_type: 'DASHBOARD_USER_ACTION', permission_class: 'USER_APPROVED', status: 'SUCCESS',
    previous_value: previousStatus, new_value: nextStatus, rollback_available: true,""",
"""    trigger_type: taskPermission.triggerType, permission_class: taskPermission.permissionClass, status: 'SUCCESS',
    previous_value: previousStatus, new_value: nextStatus, rollback_available: true,""",
'task audit')

code = replace_once(code,
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sh = ss.getSheetByName('AI_INBOX');
  const table = table_(sh);""",
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const inboxPermission = authorizeActionV1_(ss, 'ai_inbox_review', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName('AI_INBOX');
  const table = table_(sh);""",
'ai inbox guard')
code = replace_once(code,
"""    trigger_type: 'DASHBOARD_USER_ACTION', permission_class: 'USER_APPROVED', status: 'SUCCESS',
    previous_value: before, new_value: normalized, rollback_available: true,""",
"""    trigger_type: inboxPermission.triggerType, permission_class: inboxPermission.permissionClass, status: 'SUCCESS',
    previous_value: before, new_value: normalized, rollback_available: true,""",
'ai inbox audit')

code = replace_once(code,
"""function acknowledgeAlert(alertId) {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sh = ss.getSheetByName('ALERTS');""",
"""function acknowledgeAlert(alertId) {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const alertPermission = authorizeActionV1_(ss, 'alert_user_ack_dismiss', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sh = ss.getSheetByName('ALERTS');""",
'alert guard')
code = replace_once(code,
"""    trigger_type: 'DASHBOARD_USER_ACTION', permission_class: 'USER_APPROVED', status: 'SUCCESS',
    previous_value: String(row.status || ''), new_value: 'ACKNOWLEDGED', rollback_available: true,""",
"""    trigger_type: alertPermission.triggerType, permission_class: alertPermission.permissionClass, status: 'SUCCESS',
    previous_value: String(row.status || ''), new_value: 'ACKNOWLEDGED', rollback_available: true,""",
'alert audit')

old_audit = "function appendAudit_(ss,data){const sh=ss.getSheetByName('AUDIT_LOG');if(!sh)return;const t=table_(sh),headers=t.headers,stamp=isoLocal_(new Date()),id='AUDIT_'+Utilities.formatDate(new Date(),TZ,'yyyyMMdd_HHmmss_SSS'),record=Object.assign({audit_id:id,timestamp:stamp,actor:'USER',error_message:'',rollback_reference:''},data);sh.appendRow(headers.map(h=>record[h]!=null?record[h]:''));}"
new_audit = "function appendAudit_(ss,data){const sh=ss.getSheetByName('AUDIT_LOG');if(!sh)return;const input=Object.assign({},data||{});input.permission_class=assertAuditPermissionClassV1_(input.permission_class);const t=table_(sh),headers=t.headers,stamp=isoLocal_(new Date()),id='AUDIT_'+Utilities.formatDate(new Date(),TZ,'yyyyMMdd_HHmmss_SSS'),record=Object.assign({audit_id:id,timestamp:stamp,actor:'USER',error_message:'',rollback_reference:''},input);sh.appendRow(headers.map(h=>record[h]!=null?record[h]:''));}"
code = replace_once(code, old_audit, new_audit, 'audit canonical class guard')
if 'USER_APPROVED' in code:
    raise SystemExit('Code.gs still contains USER_APPROVED')
code_path.write_text(code)


food_path = Path('src/FoodTracking.gs')
food = food_path.read_text()
food = replace_once(food,
"""function setupFoodTrackingV1() {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const created = [];""",
"""function setupFoodTrackingV1() {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const foodSetupPermission = authorizeActionV1_(ss, 'unknown_action', {
    triggerType: 'USER_RUN_FUNCTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const created = [];""",
'food setup guard')
food = replace_once(food,
"""      trigger_type: 'USER_ACTION',
      permission_class: 'APPROVAL',""",
"""      trigger_type: foodSetupPermission.triggerType,
      permission_class: foodSetupPermission.permissionClass,""",
'food setup audit')

food = replace_once(food,
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sheet = foodEnsureSheetV1_(ss, 'LOG');""",
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const foodLogPermission = authorizeActionV1_(ss, 'food_log_consumption', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'LOG');""",
'food log guard')
food = replace_once(food,
"""  foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.LOG, record);
  invalidateFoodV1_();""",
"""  foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.LOG, record);
  appendAudit_(ss, {
    action_type: 'FOOD_LOG_CONSUMPTION', target_system: 'OPS Sheet', target_id: record.food_log_id,
    trigger_type: foodLogPermission.triggerType, permission_class: foodLogPermission.permissionClass,
    status: 'SUCCESS', previous_value: '', new_value: record.meal, rollback_available: true,
    note: 'Tatsächlicher Konsum durch konkrete Nutzeraktion gespeichert.'
  });
  invalidateFoodV1_();""",
'food log audit')

food = replace_once(food,
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sheet = foodEnsureSheetV1_(ss, 'PANTRY');
  const table = foodReadTableV1_(sheet);""",
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const pantryPermission = authorizeActionV1_(ss, 'food_ingest_tracking', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'PANTRY');
  const table = foodReadTableV1_(sheet);""",
'pantry save guard')
food = replace_once(food,
"""  invalidateFoodV1_();
  return { ok: true, pantryItem: record, food: getFoodV1(true) };""",
"""  appendAudit_(ss, {
    action_type: 'FOOD_PANTRY_UPDATE', target_system: 'OPS Sheet', target_id: record.pantry_id,
    trigger_type: pantryPermission.triggerType, permission_class: pantryPermission.permissionClass,
    status: 'SUCCESS', previous_value: existingRow ? 'existing' : '', new_value: record.quantity,
    rollback_available: true, note: 'Bestätigter Vorratsstand im Tracking-Workflow gespeichert.'
  });
  invalidateFoodV1_();
  return { ok: true, pantryItem: record, food: getFoodV1(true) };""",
'pantry save audit')

# Consume function has the same PANTRY opening marker; target the function prefix as well.
food = replace_once(food,
"""function consumeFoodPantryItemV1(payload) {
  const item = payload || {};
  const pantryId = String(item.pantryId || '').trim();
  if (!pantryId) throw new Error('Für den Verbrauch fehlt die pantry_id.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sheet = foodEnsureSheetV1_(ss, 'PANTRY');""",
"""function consumeFoodPantryItemV1(payload) {
  const item = payload || {};
  const pantryId = String(item.pantryId || '').trim();
  if (!pantryId) throw new Error('Für den Verbrauch fehlt die pantry_id.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const consumePermission = authorizeActionV1_(ss, 'food_ingest_tracking', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'PANTRY');""",
'pantry consume guard')
food = replace_once(food,
"""  invalidateFoodV1_();
  return { ok: true, pantryId: pantryId, remaining: remaining, food: getFoodV1(true) };""",
"""  appendAudit_(ss, {
    action_type: 'FOOD_PANTRY_CONSUME', target_system: 'OPS Sheet', target_id: pantryId,
    trigger_type: consumePermission.triggerType, permission_class: consumePermission.permissionClass,
    status: 'SUCCESS', previous_value: current, new_value: remaining, rollback_available: true,
    note: 'Vorratsverbrauch im ausdrücklich gestarteten Tracking-Workflow verbucht.'
  });
  invalidateFoodV1_();
  return { ok: true, pantryId: pantryId, remaining: remaining, food: getFoodV1(true) };""",
'pantry consume audit')

food = replace_once(food,
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sheet = foodEnsureSheetV1_(ss, 'SHOPPING');""",
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const shoppingPermission = authorizeActionV1_(ss, 'food_ingest_tracking', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'SHOPPING');""",
'food shopping guard')
food = replace_once(food,
"""  foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.SHOPPING, record);
  invalidateFoodV1_();""",
"""  foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.SHOPPING, record);
  appendAudit_(ss, {
    action_type: 'FOOD_SHOPPING_INGEST', target_system: 'OPS Sheet', target_id: record.shopping_id,
    trigger_type: shoppingPermission.triggerType, permission_class: shoppingPermission.permissionClass,
    status: 'SUCCESS', previous_value: '', new_value: record.item_name, rollback_available: true,
    note: 'Bestätigte Einkaufsposition im Tracking-Workflow gespeichert.'
  });
  invalidateFoodV1_();""",
'food shopping audit')

food = replace_once(food,
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const sheet = foodEnsureSheetV1_(ss, 'RECIPES');""",
"""  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const recipePermission = authorizeActionV1_(ss, 'food_recipe_feedback', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'RECIPES');""",
'food recipe guard')
food = replace_once(food,
"""  invalidateFoodV1_();
  return { ok: true, recipe: record, food: getFoodV1(true) };""",
"""  appendAudit_(ss, {
    action_type: 'FOOD_RECIPE_FEEDBACK', target_system: 'OPS Sheet', target_id: record.recipe_id,
    trigger_type: recipePermission.triggerType, permission_class: recipePermission.permissionClass,
    status: 'SUCCESS', previous_value: existingRow ? 'existing' : '', new_value: record.rating,
    rollback_available: true, note: 'Rezept-/Feedbackänderung durch konkrete Nutzeraktion gespeichert.'
  });
  invalidateFoodV1_();
  return { ok: true, recipe: record, food: getFoodV1(true) };""",
'food recipe audit')
food_path.write_text(food)


health_path = Path('src/HealthSync.gs')
health = health_path.read_text()
health = replace_once(health,
"""function runHealthSyncV1() {
  return healthSyncRunV1_(false);
}""",
"""function runHealthSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  authorizeActionV1_(ss, 'health_weather_sync_run', {
    triggerType: 'SYSTEM_SYNC', directUserAction: false, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  return healthSyncRunV1_(false);
}""",
'health run guard')
health = replace_once(health,
"""function setupHealthSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  var cfg = healthSyncConfigV1_(ss);""",
"""function setupHealthSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  authorizeActionV1_(ss, 'health_weather_sync_config', {
    triggerType: 'USER_RUN_FUNCTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  var cfg = healthSyncConfigV1_(ss);""",
'health setup guard')
health_path.write_text(health)


weather_path = Path('src/Weather.gs')
weather = weather_path.read_text()
weather = replace_once(weather,
"""function runWeatherSyncV1() {
  var lock = LockService.getScriptLock();""",
"""function runWeatherSyncV1() {
  var permissionSs = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  authorizeActionV1_(permissionSs, 'health_weather_sync_run', {
    triggerType: 'SYSTEM_SYNC', directUserAction: false, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  var lock = LockService.getScriptLock();""",
'weather run guard')
weather = replace_once(weather,
"""function setupWeatherSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  var cfg = weatherConfigV1_(ss);""",
"""function setupWeatherSyncV1() {
  var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  authorizeActionV1_(ss, 'health_weather_sync_config', {
    triggerType: 'USER_RUN_FUNCTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  var cfg = weatherConfigV1_(ss);""",
'weather setup guard')
weather_path.write_text(weather)


Path('tests/permission-runtime.test.mjs').write_text(r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [serviceSource, codeSource, foodSource, healthSource, weatherSource] = await Promise.all([
  readFile(join(root, 'src', 'PermissionService.gs'), 'utf8'),
  readFile(join(root, 'src', 'Code.gs'), 'utf8'),
  readFile(join(root, 'src', 'FoodTracking.gs'), 'utf8'),
  readFile(join(root, 'src', 'HealthSync.gs'), 'utf8'),
  readFile(join(root, 'src', 'Weather.gs'), 'utf8')
]);

const runtime = new Function(`${serviceSource}; return { resolvePermissionV1_, authorizeActionV1_, assertAuditPermissionClassV1_ };`)();
const headers = ['permission_id','action_type','target_system','permission_class','condition','reversible_required','approval_required','hard_limit','active','updated_at'];
function fakeSpreadsheet(rules) {
  const values = [headers].concat(rules.map((rule, i) => [
    rule.id || `P${i}`, rule.action, rule.target || 'OPS Sheet', rule.permissionClass,
    rule.condition ?? 'confirmed condition', rule.reversibleRequired ? 'TRUE' : 'FALSE',
    rule.approvalRequired ? 'TRUE' : 'FALSE', rule.hardLimit ? 'TRUE' : 'FALSE',
    rule.active === false ? 'FALSE' : 'TRUE', '2026-08-27'
  ]));
  const sheet = {
    getLastRow: () => values.length,
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => values })
  };
  return { getSheetByName: name => name === 'PERMISSIONS' ? sheet : null };
}

const baseRules = [
  { action:'auto_action', permissionClass:'AUTO' },
  { action:'reversible_action', permissionClass:'AUTO_IF_REVERSIBLE', reversibleRequired:true },
  { action:'approval_action', permissionClass:'APPROVAL', approvalRequired:true },
  { action:'forbidden_action', permissionClass:'FORBIDDEN', hardLimit:true },
  { action:'unknown_action', permissionClass:'APPROVAL', approvalRequired:true }
];

test('exact rule resolves and canonical AUTO is allowed after condition confirmation', () => {
  const ss = fakeSpreadsheet(baseRules);
  const decision = runtime.authorizeActionV1_(ss, 'auto_action', { conditionSatisfied:true });
  assert.equal(decision.permissionClass, 'AUTO');
  assert.equal(decision.usedFallback, false);
});

test('unknown actions fail closed through unknown_action APPROVAL', () => {
  const ss = fakeSpreadsheet(baseRules);
  assert.throws(() => runtime.authorizeActionV1_(ss, 'brand_new_action', { conditionSatisfied:true }), /konkrete Nutzerfreigabe/);
  const approved = runtime.authorizeActionV1_(ss, 'brand_new_action', {
    conditionSatisfied:true, directUserAction:true, approvalSatisfied:true, reversible:true,
    triggerType:'DASHBOARD_USER_ACTION'
  });
  assert.equal(approved.permissionClass, 'APPROVAL');
  assert.equal(approved.usedFallback, true);
});

test('APPROVAL cannot be satisfied by a non-user system call', () => {
  const ss = fakeSpreadsheet(baseRules);
  assert.throws(() => runtime.authorizeActionV1_(ss, 'approval_action', {
    conditionSatisfied:true, directUserAction:false, approvalSatisfied:true
  }), /konkrete Nutzerfreigabe/);
});

test('AUTO_IF_REVERSIBLE requires explicit reversibility', () => {
  const ss = fakeSpreadsheet(baseRules);
  assert.throws(() => runtime.authorizeActionV1_(ss, 'reversible_action', { conditionSatisfied:true }), /Reversibilität/);
  assert.equal(runtime.authorizeActionV1_(ss, 'reversible_action', { conditionSatisfied:true, reversible:true }).permissionClass, 'AUTO_IF_REVERSIBLE');
});

test('FORBIDDEN and hard limits cannot be overridden by approval', () => {
  const ss = fakeSpreadsheet(baseRules);
  assert.throws(() => runtime.authorizeActionV1_(ss, 'forbidden_action', {
    conditionSatisfied:true, reversible:true, directUserAction:true, approvalSatisfied:true
  }), /VERBOTEN/);
});

test('conditions fail closed when the call site does not affirm them', () => {
  const ss = fakeSpreadsheet(baseRules);
  assert.throws(() => runtime.authorizeActionV1_(ss, 'auto_action', {}), /Bedingung/);
});

test('audit permission classes reject legacy USER_APPROVED', () => {
  assert.equal(runtime.assertAuditPermissionClassV1_('approval'), 'APPROVAL');
  assert.throws(() => runtime.assertAuditPermissionClassV1_('USER_APPROVED'), /kanonisch/);
});

test('runtime mutation entrypoints are guarded and legacy USER_APPROVED is gone', () => {
  assert.doesNotMatch(codeSource, /USER_APPROVED/);
  for (const action of ['task_complete_cancel','ai_inbox_review','alert_user_ack_dismiss','wellbeing_save']) {
    assert.match(codeSource, new RegExp(`authorizeActionV1_\\(ss, '${action}'`));
  }
  for (const action of ['food_log_consumption','food_ingest_tracking','food_recipe_feedback']) {
    assert.match(foodSource, new RegExp(`authorizeActionV1_\\(ss, '${action}'`));
  }
  assert.match(healthSource, /authorizeActionV1_\(ss, 'health_weather_sync_run'/);
  assert.match(healthSource, /authorizeActionV1_\(ss, 'health_weather_sync_config'/);
  assert.match(weatherSource, /authorizeActionV1_\(permissionSs, 'health_weather_sync_run'/);
  assert.match(weatherSource, /authorizeActionV1_\(ss, 'health_weather_sync_config'/);
});
''')

Path('docs/permission-runtime-contract.md').write_text(r'''# Permission Runtime Contract – KZ 1.0

## Authority

Runtime authorization reads the active `OPS.PERMISSIONS` table. `PERMISSIONS.md` defines the stable policy model; OPS is the structured operational projection used by Apps Script.

Only these permission classes are valid at runtime and in new audit rows:

- `AUTO`
- `AUTO_IF_REVERSIBLE`
- `APPROVAL`
- `FORBIDDEN`

`USER_APPROVED` is not a permission class.

## Fail-closed behavior

`authorizeActionV1_()` resolves an exact active `action_type`. If no exact active rule exists, it resolves the active `unknown_action` rule. Ambiguous/missing rules, invalid classes, unconfirmed rule conditions, missing reversibility evidence, unresolved approval, and forbidden/hard-limit actions block before mutation.

## Approval evidence

An `APPROVAL` rule may proceed only when the call site marks both:

- `directUserAction: true`; and
- `approvalSatisfied: true`.

This is intentionally scoped to the concrete operation being invoked. A scheduled/system call cannot satisfy approval merely by setting an approval flag.

## Reversibility

`AUTO_IF_REVERSIBLE` rules whose OPS row requires reversibility proceed only when the call site explicitly supplies `reversible: true`.

## Runtime coverage in Phase 7 Wave 5

The guard covers current mutating entrypoints for:

- task completion/reopening;
- AI Inbox review;
- alert acknowledgement;
- wellbeing setup/save;
- Food setup/log/pantry/shopping/recipe writes;
- Health and Weather sync runs;
- Health and Weather trigger/config setup.

Second Brain and Personal Operator remain read-only.

## Audit

`appendAudit_()` validates every new `permission_class` against the four canonical classes. Historical audit rows are not rewritten.
''')
