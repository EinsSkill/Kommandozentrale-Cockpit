/**
 * KZ 1.0 canonical runtime permission evaluator.
 *
 * Source of Truth: OPS.PERMISSIONS / PERMISSIONS.md
 * Runtime classes are strictly limited to:
 * AUTO | AUTO_IF_REVERSIBLE | APPROVAL | FORBIDDEN
 *
 * Unknown/unmatched actions resolve through the active `unknown_action` rule
 * and therefore fail closed to APPROVAL unless a concrete user action supplies
 * explicit approval evidence.
 */
var KZ_PERMISSION_CLASSES_V1 = ['AUTO', 'AUTO_IF_REVERSIBLE', 'APPROVAL', 'FORBIDDEN'];

function permissionBoolV1_(value) {
  if (value === true || value === false) return value;
  var text = String(value == null ? '' : value).trim().toUpperCase();
  return text === 'TRUE' || text === '1' || text === 'YES' || text === 'JA';
}

function readPermissionRulesV1_(ss) {
  var sheet = ss && ss.getSheetByName ? ss.getSheetByName('PERMISSIONS') : null;
  if (!sheet) throw permissionErrorV1_('KZ_PERMISSION_TABLE_MISSING', 'OPS.PERMISSIONS fehlt. Schreibaktion wird fail-closed blockiert.');
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) throw permissionErrorV1_('KZ_PERMISSION_TABLE_EMPTY', 'OPS.PERMISSIONS enthält keine aktiven Regeln.');
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(function(value) { return String(value || '').trim(); });
  var index = {};
  headers.forEach(function(header, column) { if (header) index[header] = column; });
  ['permission_id', 'action_type', 'permission_class', 'active'].forEach(function(header) {
    if (index[header] == null) throw permissionErrorV1_('KZ_PERMISSION_SCHEMA_INVALID', 'Pflichtspalte fehlt: ' + header);
  });
  return values.slice(1).map(function(row) {
    var rule = {};
    headers.forEach(function(header, column) { if (header) rule[header] = row[column]; });
    return rule;
  }).filter(function(rule) {
    return rule.action_type && permissionBoolV1_(rule.active);
  });
}

function resolvePermissionV1_(ss, actionType) {
  var requested = String(actionType || '').trim();
  if (!requested) requested = 'unknown_action';
  var rules = readPermissionRulesV1_(ss);
  var exact = rules.filter(function(rule) { return String(rule.action_type || '').trim() === requested; });
  var matches = exact;
  var usedFallback = false;
  if (!matches.length && requested !== 'unknown_action') {
    matches = rules.filter(function(rule) { return String(rule.action_type || '').trim() === 'unknown_action'; });
    usedFallback = true;
  }
  if (matches.length !== 1) {
    throw permissionErrorV1_('KZ_PERMISSION_RULE_AMBIGUOUS', 'Berechtigungsregel für `' + requested + '` ist nicht eindeutig vorhanden.');
  }
  var rule = matches[0];
  var permissionClass = String(rule.permission_class || '').trim().toUpperCase();
  if (KZ_PERMISSION_CLASSES_V1.indexOf(permissionClass) < 0) {
    throw permissionErrorV1_('KZ_PERMISSION_CLASS_INVALID', 'Ungültige Berechtigungsklasse `' + permissionClass + '` für `' + requested + '`.');
  }
  return {
    requestedAction: requested,
    resolvedAction: String(rule.action_type || ''),
    permissionId: String(rule.permission_id || ''),
    permissionClass: permissionClass,
    condition: String(rule.condition || ''),
    reversibleRequired: permissionBoolV1_(rule.reversible_required),
    approvalRequired: permissionBoolV1_(rule.approval_required),
    hardLimit: permissionBoolV1_(rule.hard_limit),
    targetSystem: String(rule.target_system || ''),
    usedFallback: usedFallback
  };
}

function authorizeActionV1_(ss, actionType, context) {
  var ctx = context || {};
  var decision = resolvePermissionV1_(ss, actionType);
  if (decision.hardLimit || decision.permissionClass === 'FORBIDDEN') {
    throw permissionErrorV1_('KZ_PERMISSION_FORBIDDEN', 'Aktion `' + decision.requestedAction + '` ist VERBOTEN.');
  }
  if (decision.condition && ctx.conditionSatisfied !== true) {
    throw permissionErrorV1_('KZ_PERMISSION_CONDITION_UNCONFIRMED', 'Bedingung für `' + decision.requestedAction + '` wurde nicht bestätigt.');
  }
  if (decision.permissionClass === 'AUTO_IF_REVERSIBLE' && decision.reversibleRequired && ctx.reversible !== true) {
    throw permissionErrorV1_('KZ_PERMISSION_REVERSIBILITY_REQUIRED', 'Aktion `' + decision.requestedAction + '` benötigt bestätigte Reversibilität.');
  }
  if (decision.permissionClass === 'APPROVAL' || decision.approvalRequired) {
    var directUserAction = ctx.directUserAction === true;
    var approved = ctx.approvalSatisfied === true;
    if (!directUserAction || !approved) {
      throw permissionErrorV1_('KZ_PERMISSION_APPROVAL_REQUIRED', 'Aktion `' + decision.requestedAction + '` benötigt konkrete Nutzerfreigabe.');
    }
  }
  decision.triggerType = String(ctx.triggerType || 'SYSTEM');
  decision.reversible = ctx.reversible === true;
  decision.approvalSatisfied = ctx.approvalSatisfied === true;
  decision.conditionSatisfied = ctx.conditionSatisfied === true;
  return decision;
}

function permissionErrorV1_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function assertAuditPermissionClassV1_(permissionClass) {
  var normalized = String(permissionClass || '').trim().toUpperCase();
  if (KZ_PERMISSION_CLASSES_V1.indexOf(normalized) < 0) {
    throw permissionErrorV1_('KZ_AUDIT_PERMISSION_CLASS_INVALID', 'Audit permission_class muss kanonisch sein: ' + normalized);
  }
  return normalized;
}

function permissionAuditFieldsV1_(decision) {
  if (!decision) throw permissionErrorV1_('KZ_PERMISSION_DECISION_MISSING', 'Permission-Entscheidung fehlt für Audit.');
  return {
    permission_class: assertAuditPermissionClassV1_(decision.permissionClass),
    trigger_type: String(decision.triggerType || 'SYSTEM')
  };
}
