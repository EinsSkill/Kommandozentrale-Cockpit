# Claude Design in die Kommandozentrale übernehmen

## Ergebnis

Die von Claude gelieferte `x-dc`-Oberfläche ist die visuelle Quelle. Raster, Typografie, Farben, Karten, Detailansichten, Cursor, Animationen und 3D-Bootsequenz werden direkt aus diesem Entwurf verwendet. Das Cockpit wurde nicht als separates Layout nachgebaut.

Zur Nachvollziehbarkeit sind die gelieferten Quellen festgehalten:

- Design-HTML, SHA-256: `01b102d2f95fef3b037030d946e4a9ab98a819eb3926ca3d35250c8c1bbf117b`
- Claude-Runtime (`support.js`), SHA-256: `8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe`

`tests/claude-design-live.test.mjs` schützt diese Herkunft und prüft außerdem, dass bekannte Demo-Einträge nicht mehr im Live-Cockpit vorkommen.

## Mobile-Version

Die mobile Claude-Datei bleibt als eigener Apps-Script-Template-View erhalten:

- Mobile-Design-HTML, SHA-256: `94f45fae22b676d57a4904b6f8330a2ff9789184e88ef89fb283927751b0b3a0`
- Datei im Repository: `src/MobileIndex.html`
- Auf kleinen Bildschirmen führt der normale `/exec`-Aufruf automatisch zu `?view=mobile`.
- `?view=mobile` erzwingt die mobile Ansicht; `?view=desktop` erzwingt die Desktop-Ansicht.

Die mobile Oberfläche verwendet dieselben Live-Endpunkte, Schreibpfade, Script Properties, Claude-Runtime und den Live-Adapter wie die Desktop-Oberfläche. Das Layout wird nicht neu nachgebaut; nur die Daten- und Aktionsbindungen sind an die vorhandenen Contracts angeschlossen.

## Was technisch angebunden ist

| Bereich | Bestehender Endpunkt / Vertrag |
|---|---|
| Aufgaben, Projekte, KI-Inbox, Alerts, Ziele, Briefing, Wetter, Sync | `getDashboardBaseV31(force)` |
| Personal Operator | `getPersonalOperatorContextV1(force)` |
| Second-Brain-Suche | `searchSecondBrainV1(query, false)`; read-only, sensible Dateien standardmäßig ausgeblendet |
| Finanzen | `getFinanceDashboardV1(force)`; kanonischer periodengebundener OPS-v1.1-Pfad |
| Gesundheit | `getHealthV31(force)`; `HealthSync.gs` pflegt zusätzlich die `HEALTH_TRENDS`-Coverage-Felder |
| Wohlbefinden | `getWellbeingV1(force)` |
| Kalender | `getCalendarWeekV3(force)` |
| Mail | `getMailV3(force)` aus `OPS.EMAIL_REFS`; Gmail bleibt Source of Truth |

Der historische `getFinanceV33(force)`-Pfad bleibt in `Code.gs` ausschließlich als temporärer Compatibility-Pfad bestehen; der LiveAdapter verwendet ihn nicht mehr.

Direkte Nutzeraktionen verwenden ausschließlich die vorhandenen auditierten Schreibpfade:

- Aufgabe erledigen: `setTaskDone(id, true)`
- Alert bestätigen: `acknowledgeAlert(id)`
- KI-Inbox entscheiden: `reviewAiInbox(id, decision, note)`; keine externe Folgeaktion
- Abendcheck speichern: `saveWellbeingEntryV1(payload)`

Fehlende Quellen bleiben leer oder werden als Fehler angezeigt. Es werden keine Demo-Werte als Ersatz eingesetzt.

## Nach dem Merge in Apps Script kopieren

Im bestehenden Apps-Script-Projekt **Kommandozentrale**:

1. `src/Code.gs` vollständig in die vorhandene Datei `Code.gs` kopieren.
2. `src/FinanceDashboard.gs` als neue Apps-Script-Datei `FinanceDashboard.gs` anlegen bzw. aktualisieren.
3. `src/HealthSync.gs` vollständig in die vorhandene Datei `HealthSync.gs` kopieren.
4. `src/Index.html` vollständig in die vorhandene Datei `Index.html` kopieren.
5. Eine neue HTML-Datei `MobileIndex` anlegen und den vollständigen Inhalt von `src/MobileIndex.html` hineinkopieren.
6. Eine neue HTML-Datei `ClaudeRuntime` anlegen bzw. die vorhandene Datei aus dem Desktop-Merge unverändert beibehalten; Inhalt von `src/ClaudeRuntime.html` verwenden.
7. Eine neue HTML-Datei `LiveAdapter` anlegen bzw. aktualisieren; Inhalt von `src/LiveAdapter.html` verwenden.
8. Die vorhandenen Dateien `PersonalOperator.gs`, `SecondBrain.gs` und `Weather.gs` unverändert im Projekt belassen.

`support.js` muss nicht als eigene Datei angelegt werden. Sein unveränderter Inhalt steckt bereits in `ClaudeRuntime.html`.

## Konfiguration

Die bestehenden Script Properties bleiben maßgeblich:

```text
OPS_SPREADSHEET_ID=<persönliche OPS-ID>
SECOND_BRAIN_ROOT_ID=<Ordner-ID des inneren Second Brain>
```

Keine echte ID, Mailadresse, kein Token und keine persönliche Exportdatei gehört in Git.

Falls die zugehörigen Bereiche noch nicht eingerichtet sind, einmal manuell in Apps Script ausführen:

1. `setupLiveDataV1`
2. `ensureWellbeingLogV1`
3. `refreshPersonalOperatorContextV1`

## Bereitstellung und Smoke-Test

1. Vor dem Kopieren im Repository `npm test` ausführen.
2. In Apps Script eine neue Version der bestehenden Web-App-Bereitstellung veröffentlichen. Der vorhandene Web-App-Link bleibt bei einer aktualisierten Bereitstellung gleich.
3. Den `/exec`-Link auf dem Desktop und auf dem Smartphone öffnen; zusätzlich `?view=desktop` und `?view=mobile` testen.
4. Web-App neu laden und die Bootsequenz abwarten oder überspringen.
5. Prüfen, dass der Quellen-Chip den echten Ladezustand zeigt und Fehler nicht als erfolgreiche Daten erscheinen.
6. Je einen Leseweg prüfen: Aufgabe, Kalendertermin, `OPS.EMAIL_REFS`, Finanzwert, Health-Wert und Wellbeing-Verlauf.
7. Beim Finance-Smoke-Test prüfen, dass der aktive `FINANCE_PERIODS`-Zyklus geladen wird und Cash-Envelopes aus dem periodengebundenen v1.1-Modell stammen.
8. Nach einem Health-Sync prüfen, dass `HEALTH_TRENDS.data_through`, `coverage_days` und `period_complete` erhalten bzw. neu gesetzt sind.
9. Die Second-Brain-Suche im Detail **Personal Operator** bzw. im mobilen Tab **Mehr** testen; sie muss `read-only` melden.
10. Nur mit einem bewusst gewählten Testeintrag je einen Schreibweg prüfen und danach den zugehörigen OPS-/Audit-Eintrag kontrollieren.

Merge und Live-Bereitstellung bleiben getrennte, ausdrücklich freizugebende Schritte.

## Externe Design-Abhängigkeiten

Der gelieferte Entwurf lädt weiterhin seine ursprünglichen Browser-Abhängigkeiten: Google Fonts, Three.js sowie React, ReactDOM und Babel aus der Claude-Runtime. Diese URLs wurden nicht durch ein neues Frontend-Framework ersetzt.
