import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGasModule, makeFakeSheet, makeFakeSpreadsheet } from './helpers/gas-runtime.mjs';

const gas = await loadGasModule(['Code.gs', 'FinanceDashboard.gs']);
const { buildFinanceDashboardV1_, getFinanceDashboardV1 } = gas;
assert.equal(typeof buildFinanceDashboardV1_, 'function');
assert.equal(typeof getFinanceDashboardV1, 'function');

const NOW = new Date('2026-08-15T12:00:00Z');
const ACTIVE_ID = 'PERIOD_ACTIVE';
const CLOSED_ID = 'PERIOD_CLOSED';
const activePeriod = { period_id: ACTIVE_ID, status: 'ACTIVE', start_date: '2026-08-01', end_date: '2026-08-31', cash_target_total: 500 };
const closedPeriod = { period_id: CLOSED_ID, status: 'CLOSED', start_date: '2026-07-01', end_date: '2026-07-31', cash_target_total: 500 };

function budgetRow(overrides = {}) {
  return Object.assign({
    budget_id: 'BUDGET_1', period_id: ACTIVE_ID, budget_type: 'CATEGORY_LIMIT', category: 'Lebensmittel',
    planned_amount: 300, actual_amount: 120, remaining_amount: 180,
    target_balance: '', current_balance: '', funding_mode: '', status: 'OK', active: true
  }, overrides);
}

function txRow(overrides = {}) {
  return Object.assign({
    transaction_id: 'TX_1', booking_date: '2026-08-10', amount: -50, direction: 'EXPENSE',
    merchant: 'Beispielhandel', category: 'Lebensmittel', subcategory: '', notes: '', booking_status: 'BOOKED',
    consumption_period_id: ACTIVE_ID, cashflow_period_id: ACTIVE_ID
  }, overrides);
}

test('active period is selected and exposed', () => {
  const result = buildFinanceDashboardV1_([activePeriod, closedPeriod], [], [], NOW);
  assert.equal(result.ok, true);
  assert.equal(result.finance.period.id, ACTIVE_ID);
  assert.equal(result.finance.period.status, 'ACTIVE');
  assert.equal(result.finance.period.startDate, '2026-08-01');
  assert.equal(result.finance.period.endDate, '2026-08-31');
  assert.equal(result.finance.period.cashTargetTotal, 500);
});

test('no active period is an explicit contract error', () => {
  const result = buildFinanceDashboardV1_([closedPeriod], [], [], NOW);
  assert.equal(result.ok, false);
  assert.equal(result.finance, null);
  assert.equal(result.stage, 'select active period');
  assert.match(result.error, /Kein aktiver Finance-Zeitraum/);
});

test('multiple active periods are an explicit contract error', () => {
  const result = buildFinanceDashboardV1_([activePeriod, { ...activePeriod, period_id: 'PERIOD_SECOND' }], [], [], NOW);
  assert.equal(result.ok, false);
  assert.match(result.error, /Mehrdeutiger Finance-Zeitraum/);
});

test('active period without period_id is an explicit contract error', () => {
  const result = buildFinanceDashboardV1_([{ ...activePeriod, period_id: '' }], [], [], NOW);
  assert.equal(result.ok, false);
  assert.match(result.error, /keine period_id/);
});

test('CATEGORY_LIMIT and CASH_ENVELOPE are separated while legacy/inactive/foreign rows are excluded', () => {
  const rows = [
    budgetRow({ budget_id: 'B_CAT', budget_type: 'CATEGORY_LIMIT' }),
    budgetRow({ budget_id: 'B_CASH', budget_type: 'CASH_ENVELOPE', category: 'Tanken', target_balance: 150, current_balance: 100, funding_mode: 'TOP_UP_TO_TARGET' }),
    budgetRow({ budget_id: 'B_LEGACY', budget_type: 'LEGACY_MONTHLY_PLAN' }),
    budgetRow({ budget_id: 'B_INACTIVE', active: false }),
    budgetRow({ budget_id: 'B_FOREIGN', period_id: CLOSED_ID }),
    budgetRow({ budget_id: 'B_UNKNOWN', budget_type: 'OTHER' })
  ];
  const result = buildFinanceDashboardV1_([activePeriod], rows, [], NOW).finance;
  assert.deepEqual(result.budgets.map(row => row.id), ['B_CAT']);
  assert.deepEqual(result.cashEnvelopes.map(row => row.id), ['B_CASH']);
  assert.equal(result.cashEnvelopes[0].targetBalance, 150);
  assert.equal(result.cashEnvelopes[0].currentBalance, 100);
  assert.equal(result.cashEnvelopes[0].fundingMode, 'TOP_UP_TO_TARGET');
});

test('currentPeriod uses cashflow_period_id only', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [
    txRow({ transaction_id: 'IN_SCOPE_EXP', amount: -100, direction: 'EXPENSE' }),
    txRow({ transaction_id: 'IN_SCOPE_INC', amount: 250, direction: 'INCOME' }),
    txRow({ transaction_id: 'OUT_SCOPE', amount: -9999, direction: 'EXPENSE', cashflow_period_id: CLOSED_ID })
  ], NOW).finance;
  assert.equal(finance.currentPeriod.income, 250);
  assert.equal(finance.currentPeriod.expense, 100);
  assert.equal(finance.currentPeriod.net, 150);
});

test('categorySpend uses consumption_period_id only', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [
    txRow({ transaction_id: 'CONSUME', amount: -30, category: 'Lebensmittel' }),
    txRow({ transaction_id: 'FOREIGN_CONSUME', amount: -500, category: 'Sonstiges', consumption_period_id: CLOSED_ID }),
    txRow({ transaction_id: 'CASHFLOW_FOREIGN_BUT_CONSUME_ACTIVE', amount: -20, category: 'Lebensmittel', cashflow_period_id: CLOSED_ID })
  ], NOW).finance;
  assert.deepEqual(finance.categorySpend, [{ category: 'Lebensmittel', amount: 50 }]);
  assert.equal(finance.currentPeriod.expense, 530);
});

test('explicit negative TRANSFER never counts as expense or category spend', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [txRow({ amount: -500, direction: 'TRANSFER', category: 'Bargeld' })], NOW).finance;
  assert.equal(finance.currentPeriod.expense, 0);
  assert.equal(finance.currentPeriod.income, 0);
  assert.equal(finance.currentPeriod.net, 0);
  assert.deepEqual(finance.categorySpend, []);
  assert.equal(finance.monthSeries.find(row => row.key === '2026-08').expense, 0);
});

test('explicit positive TRANSFER never counts as income', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [txRow({ amount: 500, direction: 'TRANSFER' })], NOW).finance;
  assert.equal(finance.currentPeriod.income, 0);
  assert.equal(finance.currentPeriod.net, 0);
  assert.equal(finance.monthSeries.find(row => row.key === '2026-08').income, 0);
});

test('amount sign is only a fallback when direction is missing/unknown', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [
    txRow({ transaction_id: 'LEGACY_NEG', amount: -40, direction: '' }),
    txRow({ transaction_id: 'LEGACY_POS', amount: 70, direction: 'UNKNOWN' })
  ], NOW).finance;
  assert.equal(finance.currentPeriod.expense, 40);
  assert.equal(finance.currentPeriod.income, 70);
});

test('booking_status=PENDING is authoritative without notes marker', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [txRow({ amount: -25, booking_status: 'PENDING', notes: 'kein Legacy-Marker' })], NOW).finance;
  assert.equal(finance.currentPeriod.expense, 0);
  assert.equal(finance.currentPeriod.pending, -25);
  assert.deepEqual(finance.categorySpend, []);
});

test('notes marker remains a legacy pending fallback only when booking_status is empty', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [txRow({ amount: -15, booking_status: '', notes: 'Vorgemerkt; Legacy-Zeile' })], NOW).finance;
  assert.equal(finance.currentPeriod.expense, 0);
  assert.equal(finance.currentPeriod.pending, -15);
});

test('BOOKED overrides a stale Vorgemerkt note', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [txRow({ amount: -15, booking_status: 'BOOKED', notes: 'Vorgemerkt; alter Hinweis' })], NOW).finance;
  assert.equal(finance.currentPeriod.expense, 15);
  assert.equal(finance.currentPeriod.pending, 0);
});

test('historical monthSeries stays calendar-based and transfer-safe', () => {
  const finance = buildFinanceDashboardV1_([activePeriod], [], [
    txRow({ transaction_id: 'AUG_INC', booking_date: '2026-08-05', amount: 1000, direction: 'INCOME' }),
    txRow({ transaction_id: 'JUL_EXP', booking_date: '2026-07-05', amount: -200, direction: 'EXPENSE', cashflow_period_id: CLOSED_ID, consumption_period_id: CLOSED_ID }),
    txRow({ transaction_id: 'JUL_TRANSFER', booking_date: '2026-07-06', amount: -900, direction: 'TRANSFER', cashflow_period_id: CLOSED_ID, consumption_period_id: CLOSED_ID })
  ], NOW).finance;
  const aug = finance.monthSeries.find(row => row.key === '2026-08');
  const jul = finance.monthSeries.find(row => row.key === '2026-07');
  assert.equal(aug.income, 1000);
  assert.equal(jul.expense, 200);
  assert.equal(jul.income, 0);
});

test('recent payload exposes both explicit period references', () => {
  const recent = buildFinanceDashboardV1_([activePeriod], [], [txRow()], NOW).finance.recent[0];
  assert.equal(recent.cashflowPeriodId, ACTIVE_ID);
  assert.equal(recent.consumptionPeriodId, ACTIVE_ID);
  assert.equal(Object.hasOwn(recent, 'periodId'), false);
});

test('getFinanceDashboardV1 reads real v1 fields beyond old fixed-column windows', async () => {
  const periodsSheet = makeFakeSheet(['period_id', 'status', 'start_date', 'end_date', 'cash_target_total'], [[ACTIVE_ID, 'ACTIVE', '2026-08-01', '2026-08-31', 500]]);
  const budgetsSheet = makeFakeSheet(
    ['budget_id','month','category','planned_amount','actual_amount','remaining_amount','rollover','warning_threshold','status','note','period_id','budget_type','target_balance','current_balance','funding_mode','active'],
    [['B_CASH','2026-08','Tanken',150,50,100,false,120,'OK','',ACTIVE_ID,'CASH_ENVELOPE',150,100,'TOP_UP_TO_TARGET',true]]
  );
  const txSheet = makeFakeSheet(
    ['transaction_id','booking_date','value_date','amount','currency','direction','merchant','description','category','subcategory','account','recurring','fixed_cost','essential','ai_category','ai_confidence','user_override','related_contract_id','notes','occurred_at','payment_method','booking_status','consumption_period_id','cashflow_period_id','extraordinary','linked_transaction_id'],
    [['TX_SYN','2026-08-10','',-50,'EUR','EXPENSE','Beispielhandel','','Lebensmittel','','',false,false,true,'','',false,'','','','CARD','BOOKED',ACTIVE_ID,ACTIVE_ID,false,'']]
  );
  const fakeSpreadsheet = makeFakeSpreadsheet({ FINANCE_PERIODS: periodsSheet, FINANCE_BUDGETS: budgetsSheet, FINANCE_TX: txSheet });
  const scoped = await loadGasModule(['Code.gs', 'FinanceDashboard.gs'], { SpreadsheetApp: { openById: () => fakeSpreadsheet } });
  const response = scoped.getFinanceDashboardV1(true);
  assert.equal(response.ok, true, response.error);
  assert.equal(response.finance.currentPeriod.expense, 50);
  assert.equal(response.finance.cashEnvelopes[0].currentBalance, 100);
});
