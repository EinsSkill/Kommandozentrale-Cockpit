/**
 * Canonical Finance dashboard service for KZ 1.0 Wave 1 (Issue #33).
 *
 * Source contracts:
 * - FINANCE_PERIODS.period_id defines the active salary/finance cycle.
 * - FINANCE_TX.cashflow_period_id assigns cash-flow metrics to a cycle.
 * - FINANCE_TX.consumption_period_id assigns consumption/category spend to a cycle.
 * - FINANCE_BUDGETS.period_id + budget_type + active define current budgets.
 *
 * The service is intentionally independent from getFinanceV33; V33 stays as a
 * compatibility path and is not used by the live adapter after this change.
 */
var FINANCE_DASHBOARD_V1_CACHE_KEY = 'KZ_V1_FIN_DASHBOARD';

function getFinanceDashboardV1(force) {
  return cachedJson_(FINANCE_DASHBOARD_V1_CACHE_KEY, 90, !!force, function () {
    var started = new Date().getTime();
    try {
      var ss = SpreadsheetApp.openById(OPS_SPREADSHEET_ID);
      var rd = reader_(ss);
      var result = buildFinanceDashboardV1_(
        rd.rows('FINANCE_PERIODS'),
        rd.rows('FINANCE_BUDGETS'),
        rd.rows('FINANCE_TX').filter(function(row) { return row.transaction_id; }),
        new Date()
      );
      result.timingMs = new Date().getTime() - started;
      return result;
    } catch (error) {
      return {
        ok:false,
        finance:null,
        stage:'read finance sheets',
        error:'Finance @ getFinanceDashboardV1: ' + String(error && error.message ? error.message : error),
        timingMs:new Date().getTime() - started
      };
    }
  });
}

function buildFinanceDashboardV1_(periodRows, budgetRows, txRows, now) {
  var activePeriods = (periodRows || []).filter(function(row) {
    return String(row.status || '').toUpperCase() === 'ACTIVE';
  });

  if (activePeriods.length !== 1) {
    return {
      ok:false,
      finance:null,
      stage:'select active period',
      error:activePeriods.length === 0
        ? 'Kein aktiver Finance-Zeitraum: FINANCE_PERIODS enthält keine Zeile mit status = ACTIVE.'
        : 'Mehrdeutiger Finance-Zeitraum: FINANCE_PERIODS enthält ' + activePeriods.length + ' Zeilen mit status = ACTIVE (erwartet genau eine).'
    };
  }

  var periodRow = activePeriods[0];
  var periodId = String(periodRow.period_id || '').trim();
  if (!periodId) {
    return {
      ok:false,
      finance:null,
      stage:'select active period',
      error:'Ungültiger Finance-Zeitraum: aktive FINANCE_PERIODS-Zeile hat keine period_id.'
    };
  }

  var period = {
    id:periodId,
    status:String(periodRow.status || ''),
    startDate:dateText_(periodRow.start_date),
    endDate:dateText_(periodRow.end_date),
    cashTargetTotal:num_(periodRow.cash_target_total)
  };

  var budgets = [];
  var cashEnvelopes = [];
  (budgetRows || []).forEach(function(row) {
    if (!row.budget_id) return;
    if (String(row.period_id || '') !== periodId) return;
    if (!truthy_(row.active)) return;

    var type = String(row.budget_type || '').toUpperCase();
    if (type !== 'CATEGORY_LIMIT' && type !== 'CASH_ENVELOPE') return;

    var entry = {
      id:String(row.budget_id || ''),
      category:String(row.category || ''),
      planned:num_(row.planned_amount),
      actual:num_(row.actual_amount),
      remaining:num_(row.remaining_amount),
      status:String(row.status || '')
    };

    if (type === 'CATEGORY_LIMIT') {
      budgets.push(entry);
    } else {
      entry.targetBalance = num_(row.target_balance);
      entry.currentBalance = num_(row.current_balance);
      entry.fundingMode = String(row.funding_mode || '');
      cashEnvelopes.push(entry);
    }
  });

  var income = 0;
  var expense = 0;
  var pending = 0;
  var categoryTotals = {};
  var recent = [];

  (txRows || []).forEach(function(row) {
    var bookingDate = asDate_(row.booking_date);
    var amount = num_(row.amount);
    var direction = financeDirectionV1_(row.direction, amount);
    var isPending = financePendingV1_(row);
    var cashflowPeriodId = String(row.cashflow_period_id || '');
    var consumptionPeriodId = String(row.consumption_period_id || '');

    if (cashflowPeriodId === periodId) {
      if (isPending) {
        pending += amount;
      } else if (direction === 'INCOME') {
        income += amount;
      } else if (direction === 'EXPENSE') {
        expense += Math.abs(amount);
      }
    }

    if (consumptionPeriodId === periodId && !isPending && direction === 'EXPENSE') {
      var category = String(row.category || 'Sonstiges');
      categoryTotals[category] = (categoryTotals[category] || 0) + Math.abs(amount);
    }

    recent.push({
      id:String(row.transaction_id || ''),
      date:bookingDate ? dateText_(bookingDate) : '',
      _ts:bookingDate ? bookingDate.getTime() : 0,
      amount:amount,
      merchant:String(row.merchant || ''),
      category:String(row.category || ''),
      subcategory:String(row.subcategory || ''),
      direction:String(row.direction || '').toUpperCase(),
      pending:isPending,
      cashflowPeriodId:cashflowPeriodId,
      consumptionPeriodId:consumptionPeriodId
    });
  });

  recent.sort(function(a, b) { return b._ts - a._ts; });
  var recent10 = recent.slice(0, 10).map(function(item) {
    delete item._ts;
    return item;
  });

  return {
    ok:true,
    finance:{
      period:period,
      currentPeriod:{
        income:round2_(income),
        expense:round2_(expense),
        net:round2_(income - expense),
        pending:round2_(pending)
      },
      budgets:budgets,
      cashEnvelopes:cashEnvelopes,
      monthSeries:buildFinanceMonthSeriesV1_(txRows, now),
      categorySpend:Object.keys(categoryTotals)
        .map(function(category) { return {category:category, amount:round2_(categoryTotals[category])}; })
        .sort(function(a, b) { return b.amount - a.amount; })
        .slice(0, 7),
      recent:recent10,
      transactionCount:(txRows || []).length
    },
    stage:'done'
  };
}

/** Structured pending state is authoritative; notes are legacy fallback only. */
function financePendingV1_(row) {
  var status = String(row && row.booking_status || '').trim().toUpperCase();
  if (status) return status === 'PENDING';
  return /VORGEMERKT/i.test(String(row && row.notes || ''));
}

/** Explicit directions win. Amount sign is only a fallback for legacy rows. */
function financeDirectionV1_(directionValue, amount) {
  var direction = String(directionValue || '').trim().toUpperCase();
  if (direction === 'INCOME' || direction === 'EXPENSE' || direction === 'TRANSFER') return direction;
  if (amount > 0) return 'INCOME';
  if (amount < 0) return 'EXPENSE';
  return '';
}

function buildFinanceMonthSeriesV1_(txRows, now) {
  var monthKeys = [];
  var monthMap = {};
  for (var offset = 5; offset >= 0; offset--) {
    var date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    var key = Utilities.formatDate(date, TZ, 'yyyy-MM');
    monthKeys.push(key);
    monthMap[key] = { key:key, label:Utilities.formatDate(date, TZ, 'MMM'), income:0, expense:0, pending:0 };
  }

  (txRows || []).forEach(function(row) {
    var bookingDate = asDate_(row.booking_date);
    if (!bookingDate) return;
    var key = Utilities.formatDate(bookingDate, TZ, 'yyyy-MM');
    var month = monthMap[key];
    if (!month) return;

    var amount = num_(row.amount);
    if (financePendingV1_(row)) {
      month.pending += amount;
      return;
    }

    var direction = financeDirectionV1_(row.direction, amount);
    if (direction === 'INCOME') month.income += amount;
    if (direction === 'EXPENSE') month.expense += Math.abs(amount);
  });

  return monthKeys.map(function(key) {
    var month = monthMap[key];
    return {
      key:month.key,
      label:month.label,
      income:round2_(month.income),
      expense:round2_(month.expense),
      net:round2_(month.income - month.expense),
      pending:round2_(month.pending)
    };
  });
}
