# Health Sync und Wetter – Betriebsdesign

## Zielbild

Health Sync exportiert die Rohdaten vom Telefon bzw. der Uhr über Health Connect nach Google Drive. Apps Script liest diese Drive-Ordner regelmäßig, bildet daraus eine idempotente Projektion in OPS und aktualisiert den Status in `SYNC_STATE`. Das Cockpit liest ausschließlich diese OPS-Projektion.

Die Rohdateien bleiben in Drive. OPS enthält nur die für die Kommandozentrale benötigten Tages- und Trainingswerte. Dadurch bleibt Drive die Rohdatenquelle und OPS die operative Quelle, ohne eine zweite Rohdatenablage zu schaffen.

## Health Sync

Verwendete OPS-Konfiguration in `SYS_CONFIG`:

- `health_sync_enabled`
- `health_sync_steps_folder_id`
- `health_sync_activities_folder_id`
- `health_sync_weight_folder_id`
- `health_sync_interval_minutes` (5, 10, 15 oder 30)
- `health_sync_lookback_days`

Der Importer liest CSV-Dateien für Schritte und Gewicht sowie CSV/TCX für Aktivitäten. FIT-Dateien werden bewusst nicht zusätzlich eingelesen, wenn eine lesbare CSV/TCX-Repräsentation vorhanden ist.

Überlappende Schrittdateien werden nach Quellenpriorität behandelt: tagesbezogener Health-Connect-Export vor rollierendem Health-Connect-Export vor Google-Fit-Export. Gleiche Zeitstempel mit gleichem Schrittwert werden einmal gezählt. Die Kombination ist damit bei jedem Lauf wiederholbar und erzeugt keine neuen Duplikate.

Aktivitäten erhalten eine stabile ID aus Startzeit und Typ. CSV- und TCX-Dateien desselben Trainings werden zusammengeführt. Gewicht wird pro Tag auf die letzte Messung reduziert. Nicht exportierte Werte – aktuell Schlaf, Herzfrequenz, HRV und SpO2 – werden nicht geschätzt.

## Wetter

Apps Script ruft Open-Meteo ab und schreibt:

- `WEATHER_CURRENT`: aktueller Mess-/Prognosestand
- `WEATHER_HOURLY`: die nächsten Stunden für die Briefing-Anzeige

Verwendete Konfiguration:

- `weather_enabled`
- `weather_location_label`
- `weather_latitude`
- `weather_longitude`
- `weather_timezone`
- `weather_forecast_hours`

Der Browser ruft keinen Wetterdienst auf. Er zeigt nur den zuletzt erfolgreich in OPS gespeicherten Stand. Wenn der letzte Lauf fehlgeschlagen ist oder länger als 90 Minuten zurückliegt, wird der Stand im Cockpit ausdrücklich als `Veralteter Stand` markiert; der Fehler steht zusätzlich als Tooltip am Wetterblock.

### Schutz vor Open-Meteo-429

Jeder Apps-Script-Lauf prüft vor dem Provider-Aufruf eine Script-Property-Sperre. Zwischen zwei Requests liegen mindestens zehn Minuten. Nach HTTP 429 wird zusätzlich eine Pause von mindestens 30 Minuten gesetzt; ein vorhandener `Retry-After`-Header wird zwischen fünf und 60 Minuten berücksichtigt. Ein blockierter Lauf schreibt keine neuen Wetterwerte und erzeugt keinen weiteren Provider-Request.

Die bisher gespeicherten Wetterwerte bleiben bei einem Fehler erhalten, werden aber über `SYNC_STATE` als `ERROR` und im Cockpit als veraltet ausgewiesen. Dadurch erscheint ein alter Stand nicht stillschweigend als aktuell.

## Einmalige Apps-Script-Aktivierung

Nach dem Einspielen der Dateien und dem Setzen des bestehenden Script-Properties-Schlüssels `OPS_SPREADSHEET_ID` wird im Apps-Script-Editor einmalig `setupLiveDataV1()` ausgeführt und autorisiert. Diese Funktion legt die Wetter-Tabs an, entfernt doppelte Wetter- bzw. veraltete Sammeltrigger, installiert genau einen Wetter-Zeit-Trigger, führt einen ersten Health-Sync und einen ersten Wetter-Refresh aus.

Danach laufen:

- Health Sync alle 15 Minuten
- Wetter alle 30 Minuten
- manueller Sammellauf über `runLiveDataSyncV1()`
- Trigger-Diagnose über `weatherTriggerStatusV1()`

Der Status ist in `SYNC_STATE` unter `Fitness Source` und `Weather` sichtbar. Jeder erfolgreiche oder fehlgeschlagene Lauf wird zusätzlich in `AUDIT_LOG` protokolliert.

## Betriebsgrenzen

Die Lösung benötigt weiterhin die bestehende Apps-Script-Bereitstellung und die einmalige Google-Autorisierung für Drive, Sheets, UrlFetch und Zeit-Trigger. Im Repository werden keine persönlichen Drive- oder OPS-IDs abgelegt. Ein laufender Trigger darf erst als aktiv gelten, wenn `setupLiveDataV1()` erfolgreich ausgeführt wurde und die beiden `SYNC_STATE`-Zeilen einen erfolgreichen Lauf zeigen.
