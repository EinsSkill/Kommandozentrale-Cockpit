/**
 * Kommandozentrale – Ernährung, Vorrat und Mahlzeiten
 *
 * Source of Truth: OPS Sheet
 *
 * Das Cockpit zeigt diese Daten nur an und bietet kontrollierte Eingaben.
 * Langfristige Vorlieben gehören weiterhin ins Second Brain und werden nicht
 * automatisch aus einzelnen Mahlzeiten als feste Fakten abgeleitet.
 */

const FOOD_CACHE_V1 = 'KZ_V1_FOOD_TRACKING';
const FOOD_SHEETS_V1 = Object.freeze({
  PANTRY: 'FOOD_PANTRY',
  LOG: 'FOOD_LOG',
  RECIPES: 'FOOD_RECIPES',
  SHOPPING: 'FOOD_SHOPPING'
});

const FOOD_HEADERS_V1 = Object.freeze({
  PANTRY: [
    'pantry_id', 'item_name', 'category', 'quantity', 'unit', 'storage',
    'status', 'best_before', 'last_updated', 'source', 'notes'
  ],
  LOG: [
    'food_log_id', 'entry_date', 'recorded_at', 'meal', 'meal_type',
    'portion_note', 'calories_estimate', 'protein_estimate',
    'carbs_estimate', 'fat_estimate', 'recipe_id', 'source', 'notes'
  ],
  RECIPES: [
    'recipe_id', 'title', 'rating', 'times_cooked', 'tags',
    'ingredients_summary', 'instructions', 'last_cooked_at', 'source', 'notes'
  ],
  SHOPPING: [
    'shopping_id', 'purchased_at', 'store', 'item_name', 'quantity', 'unit',
    'price', 'category', 'source', 'notes'
  ]
});

/** Read-only dashboard payload. Missing FOOD_* tabs remain visible as setup state. */
function getFoodV1(force) {
  return cachedJson_(FOOD_CACHE_V1, 45, !!force, function () {
    const started = new Date().getTime();
    try {
      const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
      const tables = {};
      let configured = false;

      Object.keys(FOOD_SHEETS_V1).forEach(function (key) {
        const sheetName = FOOD_SHEETS_V1[key];
        const sheet = ss.getSheetByName(sheetName);
        if (sheet) configured = true;
        tables[key] = sheet ? foodReadRowsV1_(sheet) : [];
      });

      const todayKey = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      const mealsToday = tables.LOG.filter(function (row) {
        return String(row.entry_date || '').slice(0, 10) === todayKey;
      }).sort(function (a, b) {
        return String(b.recorded_at || '').localeCompare(String(a.recorded_at || ''));
      });

      const totals = mealsToday.reduce(function (sum, row) {
        sum.calories += foodNumberV1_(row.calories_estimate);
        sum.protein += foodNumberV1_(row.protein_estimate);
        sum.carbs += foodNumberV1_(row.carbs_estimate);
        sum.fat += foodNumberV1_(row.fat_estimate);
        return sum;
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

      const pantry = tables.PANTRY.filter(function (row) {
        return String(row.status || 'AVAILABLE').toUpperCase() !== 'DEPLETED'
          && foodNumberV1_(row.quantity) > 0;
      });

      return {
        ok: true,
        available: configured,
        status: configured ? 'OK' : 'NOT_CONFIGURED',
        setupRequired: !configured,
        sourceOfTruth: 'OPS.FOOD_*',
        generatedAt: new Date().toISOString(),
        pantry: pantry.slice(0, 100),
        today: {
          date: todayKey,
          meals: mealsToday.slice(0, 30),
          totals: {
            calories: Math.round(totals.calories),
            protein: Math.round(totals.protein),
            carbs: Math.round(totals.carbs),
            fat: Math.round(totals.fat)
          }
        },
        recentMeals: tables.LOG.slice().sort(function (a, b) {
          return String(b.recorded_at || '').localeCompare(String(a.recorded_at || ''));
        }).slice(0, 12),
        recipes: tables.RECIPES.slice(0, 30),
        recentShopping: tables.SHOPPING.slice().sort(function (a, b) {
          return String(b.purchased_at || '').localeCompare(String(a.purchased_at || ''));
        }).slice(0, 20),
        timingMs: new Date().getTime() - started
      };
    } catch (error) {
      return {
        ok: false,
        available: false,
        status: 'ERROR',
        setupRequired: false,
        sourceOfTruth: 'OPS.FOOD_*',
        error: String(error && error.message ? error.message : error),
        pantry: [],
        today: { date: '', meals: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } },
        recentMeals: [], recipes: [], recentShopping: [],
        timingMs: new Date().getTime() - started
      };
    }
  });
}

/** Explicit user-triggered setup. It creates only missing tabs and headers. */
function setupFoodTrackingV1() {
  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const foodSetupPermission = authorizeActionV1_(ss, 'unknown_action', {
    triggerType: 'USER_RUN_FUNCTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const created = [];
  const existing = [];

  Object.keys(FOOD_SHEETS_V1).forEach(function (key) {
    const sheetName = FOOD_SHEETS_V1[key];
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      created.push(sheetName);
    } else {
      existing.push(sheetName);
    }
    foodEnsureHeadersV1_(sheet, FOOD_HEADERS_V1[key]);
  });

  if (typeof appendAudit_ === 'function') {
    appendAudit_(ss, {
      action_type: 'FOOD_TRACKING_SETUP',
      target_system: 'OPS',
      target_id: 'FOOD_*',
      trigger_type: foodSetupPermission.triggerType,
      permission_class: foodSetupPermission.permissionClass,
      status: 'SUCCESS',
      note: 'Ernährungs- und Vorratstabellen eingerichtet.'
    });
  }

  invalidateFoodV1_();
  return { ok: true, created: created, existing: existing, food: getFoodV1(true) };
}

/** Add one manually recorded meal with deliberately approximate nutrition fields. */
function saveFoodEntryV1(payload) {
  const item = payload || {};
  const meal = String(item.meal || '').trim();
  if (!meal) throw new Error('Für den Ernährungseintrag fehlt die Mahlzeit.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const foodLogPermission = authorizeActionV1_(ss, 'food_log_consumption', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'LOG');
  const now = new Date();
  const record = {
    food_log_id: String(item.foodLogId || ('FOOD_LOG_' + now.getTime())),
    entry_date: String(item.entryDate || Utilities.formatDate(now, TZ, 'yyyy-MM-dd')),
    recorded_at: now.toISOString(),
    meal: meal,
    meal_type: String(item.mealType || 'OTHER').toUpperCase(),
    portion_note: String(item.portionNote || '').trim(),
    calories_estimate: foodNumberOrBlankV1_(item.caloriesEstimate),
    protein_estimate: foodNumberOrBlankV1_(item.proteinEstimate),
    carbs_estimate: foodNumberOrBlankV1_(item.carbsEstimate),
    fat_estimate: foodNumberOrBlankV1_(item.fatEstimate),
    recipe_id: String(item.recipeId || ''),
    source: String(item.source || 'CHATGPT_OPERATOR'),
    notes: String(item.notes || '').trim()
  };
  foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.LOG, record);
  appendAudit_(ss, {
    action_type: 'FOOD_LOG_CONSUMPTION', target_system: 'OPS Sheet', target_id: record.food_log_id,
    trigger_type: foodLogPermission.triggerType, permission_class: foodLogPermission.permissionClass,
    status: 'SUCCESS', previous_value: '', new_value: record.meal, rollback_available: true,
    note: 'Tatsächlicher Konsum durch konkrete Nutzeraktion gespeichert.'
  });
  invalidateFoodV1_();
  return { ok: true, entry: record, food: getFoodV1(true) };
}

/** Add or update one pantry item. */
function saveFoodPantryItemV1(payload) {
  const item = payload || {};
  const name = String(item.itemName || '').trim();
  if (!name) throw new Error('Für den Vorratseintrag fehlt der Produktname.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const pantryPermission = authorizeActionV1_(ss, 'food_ingest_tracking', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'PANTRY');
  const table = foodReadTableV1_(sheet);
  const id = String(item.pantryId || ('PANTRY_' + new Date().getTime()));
  const record = {
    pantry_id: id,
    item_name: name,
    category: String(item.category || 'OTHER'),
    quantity: foodNumberOrBlankV1_(item.quantity),
    unit: String(item.unit || 'STÜCK'),
    storage: String(item.storage || 'UNKNOWN'),
    status: 'AVAILABLE',
    best_before: String(item.bestBefore || ''),
    last_updated: new Date().toISOString(),
    source: String(item.source || 'USER_INPUT'),
    notes: String(item.notes || '').trim()
  };
  const existingRow = foodFindRowV1_(table, 'pantry_id', id);
  if (existingRow) {
    foodWriteRecordV1_(sheet, table, existingRow.rowNumber, record);
  } else {
    foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.PANTRY, record);
  }
  appendAudit_(ss, {
    action_type: 'FOOD_PANTRY_UPDATE', target_system: 'OPS Sheet', target_id: record.pantry_id,
    trigger_type: pantryPermission.triggerType, permission_class: pantryPermission.permissionClass,
    status: 'SUCCESS', previous_value: existingRow ? 'existing' : '', new_value: record.quantity,
    rollback_available: true, note: 'Bestätigter Vorratsstand im Tracking-Workflow gespeichert.'
  });
  invalidateFoodV1_();
  return { ok: true, pantryItem: record, food: getFoodV1(true) };
}

/** Reduce a pantry quantity; an empty amount means "use everything". */
function consumeFoodPantryItemV1(payload) {
  const item = payload || {};
  const pantryId = String(item.pantryId || '').trim();
  if (!pantryId) throw new Error('Für den Verbrauch fehlt die pantry_id.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const consumePermission = authorizeActionV1_(ss, 'food_ingest_tracking', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'PANTRY');
  const table = foodReadTableV1_(sheet);
  const found = foodFindRowV1_(table, 'pantry_id', pantryId);
  if (!found) throw new Error('Vorratseintrag nicht gefunden: ' + pantryId);

  const current = foodNumberV1_(found.record.quantity);
  const requested = item.amount === '' || item.amount == null ? current : foodNumberV1_(item.amount);
  const remaining = Math.max(0, current - Math.max(0, requested));
  foodWriteRecordV1_(sheet, table, found.rowNumber, {
    quantity: remaining,
    status: remaining > 0 ? 'AVAILABLE' : 'DEPLETED',
    last_updated: new Date().toISOString(),
    notes: String(item.note || found.record.notes || '').trim()
  });

  appendAudit_(ss, {
    action_type: 'FOOD_PANTRY_CONSUME', target_system: 'OPS Sheet', target_id: pantryId,
    trigger_type: consumePermission.triggerType, permission_class: consumePermission.permissionClass,
    status: 'SUCCESS', previous_value: current, new_value: remaining, rollback_available: true,
    note: 'Vorratsverbrauch im ausdrücklich gestarteten Tracking-Workflow verbucht.'
  });
  invalidateFoodV1_();
  return { ok: true, pantryId: pantryId, remaining: remaining, food: getFoodV1(true) };
}

/** Store a shopping receipt line; actual prices remain user-provided facts. */
function saveFoodShoppingItemV1(payload) {
  const item = payload || {};
  const name = String(item.itemName || '').trim();
  if (!name) throw new Error('Für den Einkaufseintrag fehlt der Produktname.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const shoppingPermission = authorizeActionV1_(ss, 'food_ingest_tracking', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: false,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'SHOPPING');
  const now = new Date();
  const record = {
    shopping_id: String(item.shoppingId || ('SHOPPING_' + now.getTime())),
    purchased_at: String(item.purchasedAt || Utilities.formatDate(now, TZ, 'yyyy-MM-dd')),
    store: String(item.store || ''),
    item_name: name,
    quantity: foodNumberOrBlankV1_(item.quantity),
    unit: String(item.unit || 'STÜCK'),
    price: foodNumberOrBlankV1_(item.price),
    category: String(item.category || 'FOOD'),
    source: String(item.source || 'RECEIPT'),
    notes: String(item.notes || '').trim()
  };
  foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.SHOPPING, record);
  appendAudit_(ss, {
    action_type: 'FOOD_SHOPPING_INGEST', target_system: 'OPS Sheet', target_id: record.shopping_id,
    trigger_type: shoppingPermission.triggerType, permission_class: shoppingPermission.permissionClass,
    status: 'SUCCESS', previous_value: '', new_value: record.item_name, rollback_available: true,
    note: 'Bestätigte Einkaufsposition im Tracking-Workflow gespeichert.'
  });
  invalidateFoodV1_();
  return { ok: true, shoppingItem: record, food: getFoodV1(true) };
}

/** Save a recipe or update its rating and feedback. */
function saveFoodRecipeV1(payload) {
  const item = payload || {};
  const title = String(item.title || '').trim();
  if (!title) throw new Error('Für das Rezept fehlt der Titel.');

  const ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
  const recipePermission = authorizeActionV1_(ss, 'food_recipe_feedback', {
    triggerType: 'DASHBOARD_USER_ACTION', directUserAction: true, approvalSatisfied: true,
    conditionSatisfied: true, reversible: true
  });
  const sheet = foodEnsureSheetV1_(ss, 'RECIPES');
  const table = foodReadTableV1_(sheet);
  const id = String(item.recipeId || ('RECIPE_' + new Date().getTime()));
  const rating = foodNumberOrBlankV1_(item.rating);
  if (rating !== '' && (rating < 1 || rating > 5)) throw new Error('Die Rezeptbewertung muss zwischen 1 und 5 liegen.');
  const record = {
    recipe_id: id,
    title: title,
    rating: rating,
    times_cooked: foodNumberOrBlankV1_(item.timesCooked),
    tags: String(item.tags || '').trim(),
    ingredients_summary: String(item.ingredientsSummary || '').trim(),
    instructions: String(item.instructions || '').trim(),
    last_cooked_at: String(item.lastCookedAt || ''),
    source: String(item.source || 'USER_FEEDBACK'),
    notes: String(item.notes || '').trim()
  };
  const existingRow = foodFindRowV1_(table, 'recipe_id', id);
  if (existingRow) foodWriteRecordV1_(sheet, table, existingRow.rowNumber, record);
  else foodAppendRecordV1_(sheet, FOOD_HEADERS_V1.RECIPES, record);
  appendAudit_(ss, {
    action_type: 'FOOD_RECIPE_FEEDBACK', target_system: 'OPS Sheet', target_id: record.recipe_id,
    trigger_type: recipePermission.triggerType, permission_class: recipePermission.permissionClass,
    status: 'SUCCESS', previous_value: existingRow ? 'existing' : '', new_value: record.rating,
    rollback_available: true, note: 'Rezept-/Feedbackänderung durch konkrete Nutzeraktion gespeichert.'
  });
  invalidateFoodV1_();
  return { ok: true, recipe: record, food: getFoodV1(true) };
}

function foodEnsureSheetV1_(ss, key) {
  const sheetName = FOOD_SHEETS_V1[key];
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  foodEnsureHeadersV1_(sheet, FOOD_HEADERS_V1[key]);
  return sheet;
}

function foodEnsureHeadersV1_(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function foodReadRowsV1_(sheet) {
  return foodReadTableV1_(sheet).rows;
}

function foodReadTableV1_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return { headers: [], rows: [] };
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function (value) { return String(value || '').trim(); });
  const rows = [];
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const record = {};
    headers.forEach(function (header, columnIndex) {
      if (header) record[header] = foodCellV1_(values[rowIndex][columnIndex]);
    });
    if (Object.keys(record).some(function (key) { return record[key] !== ''; })) {
      rows.push(record);
    }
  }
  return { headers: headers, rows: rows };
}

function foodCellV1_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  return value == null ? '' : value;
}

function foodFindRowV1_(table, key, value) {
  const index = table.rows.findIndex(function (row) { return String(row[key] || '') === String(value); });
  return index < 0 ? null : { rowNumber: index + 2, record: table.rows[index] };
}

function foodAppendRecordV1_(sheet, headers, record) {
  sheet.appendRow(headers.map(function (header) { return record[header] == null ? '' : record[header]; }));
}

function foodWriteRecordV1_(sheet, table, rowNumber, patch) {
  const current = table.rows[rowNumber - 2] || {};
  const next = Object.assign({}, current, patch);
  const headers = table.headers.length ? table.headers : FOOD_HEADERS_V1.PANTRY;
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function (header) {
    return next[header] == null ? '' : next[header];
  })]);
}

function foodNumberV1_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return isFinite(number) ? number : 0;
}

function foodNumberOrBlankV1_(value) {
  if (value == null || value === '') return '';
  return foodNumberV1_(value);
}

function invalidateFoodV1_() {
  try { CacheService.getScriptCache().remove(FOOD_CACHE_V1); } catch (error) {}
}
