# Finance & Health v1-Contracts (KZ 1.0 Wave 1)

## Ziel

Dieses Dokument beschreibt die Refactor-Welle aus Issue #33: Ausrichtung von Finance und Health auf das bereits migrierte OPS-v1-Datenmodell, ohne UI-Redesign. Es ersetzt keine Source of Truth und ist keine neue Spezifikation; es hält den technischen Vertrag dieser Welle fest.

## Finance: `getFinanceDashboardV1(force)`

Kanonischer Finance-Dashboard-Pfad in `src/FinanceDashboard.gs`. Er liest `FINANCE_PERIODS`, `FINANCE_BUDGETS` und `FINANCE_TX` header-basiert über die bestehenden `reader_`/`table_`-Helfer. Damit werden Felder rechts von alten festen Spaltenfenstern nicht mehr stillschweigend ignoriert.

### Aktiver Zeitraum

Der aktuelle Finance-Zyklus ist genau die `FINANCE_PERIODS`-Zeile mit `status = ACTIVE`.

- kein aktiver Zeitraum → expliziter Contract-Fehler
- mehr als ein aktiver Zeitraum → expliziter Contract-Fehler
- aktive Zeile ohne `period_id` → expliziter Contract-Fehler

Es gibt keinen stillen Rückfall auf den Kalendermonat.

### Budgets vs. Cash-Envelopes

Nur Zeilen des aktiven `period_id` mit `active = TRUE` werden als aktueller Zustand verwendet:

- `CATEGORY_LIMIT` → `finance.budgets`
- `CASH_ENVELOPE` → `finance.cashEnvelopes`
- `LEGACY_MONTHLY_PLAN` und unbekannte Typen → nicht im aktuellen Dashboard-Modell

Cash-Envelopes transportieren Verbrauch und physischen Bestand getrennt. Zusätzlich zu `planned`, `actual` und `remaining` werden `target_balance`, `current_balance` und `funding_mode` als `targetBalance`, `currentBalance` und `fundingMode` ausgegeben.

### Aktuelle Kennzahlen vs. historische Serie

- `finance.currentPeriod` (`income`, `expense`, `net`, `pending`) verwendet `FINANCE_TX.cashflow_period_id === activePeriod.period_id`.
- `finance.categorySpend` verwendet separat `FINANCE_TX.consumption_period_id === activePeriod.period_id`.
- `finance.monthSeries` bleibt eine historische rollierende Kalender-Monatsserie und ist bewusst von `currentPeriod` getrennt.

### Transaktionssemantik

- `direction = INCOME` zählt als Einkommen.
- `direction = EXPENSE` zählt als Ausgabe.
- `direction = TRANSFER` zählt weder als Einkommen noch als Ausgabe; das Betragsvorzeichen überschreibt einen expliziten Transfer nicht.
- Nur bei leerer oder unbekannter `direction` darf das Vorzeichen als Legacy-Fallback dienen.
- `booking_status = PENDING` ist die strukturierte Pending-Quelle. Der Notes-Marker `Vorgemerkt` bleibt nur Fallback für Altzeilen ohne `booking_status`.

`recent` gibt die beiden Periodenreferenzen getrennt als `cashflowPeriodId` und `consumptionPeriodId` aus; ein `FINANCE_TX.period_id` wird nicht angenommen.

### Payload

```js
{
  ok: true,
  finance: {
    period: { id, status, startDate, endDate, cashTargetTotal },
    currentPeriod: { income, expense, net, pending },
    budgets: [],
    cashEnvelopes: [],
    monthSeries: [],
    categorySpend: [],
    recent: [],
    transactionCount: 0
  },
  stage: 'done',
  timingMs
}
```

### `LiveAdapter.html`

`applyFinance()` verwendet für aktuelle Kennzahlen primär `finance.currentPeriod` und fällt nur als Übergangskompatibilität auf `finance.current` zurück. `finance.cashEnvelopes` wird zusätzlich in `D.fin` abgebildet.

### `getFinanceV33` (Altpfad)

`getFinanceV33` bleibt unverändert als temporärer Compatibility-Pfad in `Code.gs`. Der kanonische Service liegt getrennt in `src/FinanceDashboard.gs`, baut nicht auf V33 auf und soll dessen Versionskette nicht fortsetzen.

## Health: `HEALTH_TRENDS` v1.1

`healthSyncRebuildTrendsV1_(ss, now)` bleibt der Apps-Script-Einstiegspunkt für Sheet-I/O und delegiert die wöchentliche Aggregation an die testbare Funktion `healthSyncBuildTrendsV1_(healthRows, now)`.

Für jede Wochenzeile werden zusätzlich gesetzt:

- `data_through`: spätestes normalisiertes `HEALTH_DAILY.date`, das in der Woche verwendet wurde
- `coverage_days`: Anzahl eindeutiger `HEALTH_DAILY`-Tage der Woche
- `period_complete`: `TRUE`, wenn das Periodenende vor dem ausdrücklich über `Europe/Berlin` normalisierten heutigen Kalendertag liegt; die laufende Woche bleibt `FALSE`

Bestehende Durchschnitts- und Trendwerte werden nicht durch erfundene Rohmetriken ergänzt.

## Tests

- `tests/finance-dashboard-contract.test.mjs`: aktive Periodenwahl, Budget-/Envelope-Trennung, physische Envelope-Felder, getrennte Cashflow-/Konsumperioden, Transfer-Semantik, strukturierter Pending-Status, Legacy-Fallbacks, historische Monatsserie und Integration gegen das reale v1.1-Headerschema.
- `tests/health-trends-coverage.test.mjs`: vollständige/laufende Wochen, eindeutige Coverage-Tage, `data_through`, Determinismus, unveränderte Trendwerte, fehlende Rohmetriken und Europe/Berlin-Tagesgrenze.
- `tests/helpers/gas-runtime.mjs`: ausschließlich Test-Infrastruktur für Apps-Script-Code mit synthetischen Daten.

## Out of Scope

Kein Calendar-Refactor, kein Personal-Operator-/Briefing-Refactor, kein Food-UI-Umbau, kein Desktop/Mobile-Template-Refactor, keine Permission-Engine, keine Second-Brain-Änderung, kein Apps-Script-Deployment, keine OPS-Schemaänderung und keine Änderung an realen Finanz- oder Health-Daten.
