# Phase 4 – personalisierte Second-Brain-Schicht

## Ziel

Das Cockpit nutzt den gesamten inneren Second-Brain-Vault als read-only Wissensraum. Es kopiert keine Markdown-Dateien nach GitHub oder in OPS. Relevante Inhalte werden erst bei Bedarf ausgewählt und mit Quelle zurückgegeben.

## Konfiguration in Apps Script

In den Script Properties des Apps-Script-Projekts ergänzen:

```text
SECOND_BRAIN_ROOT_ID=<ID des inneren kanonischen Second-Brain-Ordners>
```

Der konfigurierte Ordner muss direkt `_System/SCHEMA.md`, `_System/index.md` und `TASKS.md` enthalten. Der äußere Arbeitsordner `Second Brain` ist nicht der kanonische Vault; verwendet wird der innere Ordner `Second Brain/Second Brain/`.

## Erster Test

1. `src/SecondBrain.gs` zusätzlich als Datei `SecondBrain.gs` in Apps Script kopieren.
2. In Apps Script die Funktion `getPersonalContextV1` auswählen und mit `force = true` ausführen.
3. Den Drive-Zugriff genehmigen, falls Google danach fragt.
4. Im Ausführungsprotokoll prüfen, dass `status: READY` und eine plausible Dateizahl zurückkommen.
5. Danach `getDashboardBaseV31` und `getMailV3` erneut ausführen.

## Datenschutz und Zuständigkeiten

- Der komplette Markdown-Bestand wird indexiert, aber nicht als Volltext an den Browser übertragen.
- Normale Treffer liefern nur kurze Ausschnitte und ihre Quelle.
- Seiten mit `sensitivity: sensitive` bleiben im Standardkontext und in der Cockpit-Suche gesperrt.
- Der Code schreibt, verschiebt, benennt und löscht keine Second-Brain-Dateien.
- OPS bleibt die operative Wahrheit für Aufgaben, Prioritäten, Deadlines und aktuellen Projektstatus.
- Repository, Git, Tests und sichtbares Verhalten bleiben die technische Wahrheit.
- Eine dauerhafte Wissensänderung erfolgt weiterhin nur über den bestehenden Freigabeprozess.

## Live-Smoke-Test

Nach dem Kopieren:

- neue Apps-Script-Version bereitstellen;
- Web-App auf die neue Version zeigen lassen;
- Cockpit öffnen und die Karte „Dein persönlicher Kontext“ prüfen;
- Detailansicht öffnen;
- nach `AzubiPass`, `Prüfung` oder `Fokus` suchen;
- prüfen, dass Ergebnisse Quellenpfad und kurzen Ausschnitt zeigen;
- prüfen, dass die Anzeige `read-only` und die geschützte Anzahl sichtbar sind;
- OPS-, Mail-, Kalender-, Finanz- und Health-Karten unverändert prüfen.
