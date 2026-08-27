import assert from 'node:assert/strict';
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
