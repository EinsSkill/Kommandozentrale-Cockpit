# Claude Design in die Kommandozentrale übernehmen

## Ergebnis

Die von Claude gelieferte `x-dc`-Oberfläche ist die visuelle Quelle. Raster, Typografie, Farben, Karten, Detailansichten, Cursor, Animationen und 3D-Bootsequenz werden direkt aus diesem Entwurf verwendet. Das Cockpit wurde nicht als separates Layout nachgebaut.

Zur Nachvollziehbarkeit sind die gelieferten Quellen festgehalten:

- Design-HTML, SHA-256: `01b102d2f95fef3b037030d946e4a9ab98a819eb3926ca3d35250c8c1bbf117b`
- Claude-Runtime (`support.js`), SHA-256: `8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe`

`tests/claude-design-live.test.mjs` schützt diese Herkunft und prüft außerdem, dass bekannte Demo-Einträge nicht mehr im Live-Cockpit vorkommen.

## Was technisch angebunden ist

| Bereich | Bestehender Endpunkt / Vertrag |
|---|---|
| Aufgaben, Projekte, KI-Inbox, Alerts, Ziele, Briefing, Wetter, Sync | `getDashboardBaseV31(force)` |
| Personal Operator | `getPersonalOperatorContextV1(force)` |
| Second-Brain-Suche | `searchSecondBrainV1(query, false)`; read-only, sensible Dateien standardmäßig ausgeblendet |
| Finanzen | `getFinanceV33(force)` |
| Gesundheit | `getHealthV31(force)` |
| Wohlbefinden | `getWellbeingV1(force)` |
| Kalender | `getCalendarWeekV3(force)` |
| Mail | `getMailV3(force)` aus `OPS.EMAIL_REFS`; Gmail bleibt Source of Truth |

Direkte Nutzeraktionen verwenden ausschließlich die vorhandenen auditierten Schreibpfade:

- Aufgabe erledigen: `setTaskDone(id, true)`
- Alert bestätigen: `acknowledgeAlert(id)`
- KI-Inbox entscheiden: `reviewAiInbox(id, decision, note)`; keine externe Folgeaktion
- Abendcheck speichern: `saveWellbeingEntryV1(payload)`

Fehlende Quellen bleiben leer oder werden als Fehler angezeigt. Es werden keine Demo-Werte als Ersatz eingesetzt.

## Nach dem Merge in Apps Script kopieren

Im bestehenden Apps-Script-Projekt **Kommandozentrale**:

1. `src/Code.gs` vollständig in die vorhandene Datei `Code.gs` kopieren.
2. `src/Index.html` vollständig in die vorhandene Datei `Index.html` kopieren.
3. Eine neue HTML-Datei `ClaudeRuntime` anlegen und den vollständigen Inhalt von `src/ClaudeRuntime.html` hineinkopieren.
4. Eine neue HTML-Datei `LiveAdapter` anlegen und den vollständigen Inhalt von `src/LiveAdapter.html` hineinkopieren.
5. Die vorhandenen Dateien `HealthSync.gs`, `PersonalOperator.gs`, `SecondBrain.gs` und `Weather.gs` unverändert im Projekt belassen.

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
3. Web-App neu laden und die Bootsequenz abwarten oder überspringen.
4. Prüfen, dass der Quellen-Chip den echten Ladezustand zeigt und Fehler nicht als erfolgreiche Daten erscheinen.
5. Je einen Leseweg prüfen: Aufgabe, Kalendertermin, `OPS.EMAIL_REFS`, Finanzwert, Health-Wert und Wellbeing-Verlauf.
6. Die Second-Brain-Suche im Detail **Personal Operator** testen; sie muss `read-only` melden.
7. Nur mit einem bewusst gewählten Testeintrag je einen Schreibweg prüfen und danach den zugehörigen OPS-/Audit-Eintrag kontrollieren.

Merge und Live-Bereitstellung bleiben getrennte, ausdrücklich freizugebende Schritte.

## Externe Design-Abhängigkeiten

Der gelieferte Entwurf lädt weiterhin seine ursprünglichen Browser-Abhängigkeiten: Google Fonts, Three.js sowie React, ReactDOM und Babel aus der Claude-Runtime. Diese URLs wurden nicht durch ein neues Frontend-Framework ersetzt.
