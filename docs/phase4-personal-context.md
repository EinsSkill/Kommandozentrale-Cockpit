# Phase 4 – Second-Brain-Volltextsuche

## Rolle

`src/SecondBrain.gs` ist die read-only Grundlage für die vollständige Second-Brain-Suche. Der gesamte verbundene Markdown-Bestand bleibt außerhalb von GitHub und wird nicht als Volltext an das Dashboard übertragen.

Die normale persönliche Dashboard-Anzeige verwendet inzwischen den getrennten Schnellpfad aus `src/PersonalOperator.gs`. Dieser ist in [docs/phase4b-personal-operator.md](phase4b-personal-operator.md) dokumentiert.

## Konfiguration in Apps Script

In den Script Properties des Apps-Script-Projekts muss stehen:

    SECOND_BRAIN_ROOT_ID=<ID des inneren kanonischen Second-Brain-Ordners>

Der konfigurierte Ordner muss direkt den inneren Second-Brain-Bestand enthalten. Der äußere Arbeitsordner `Second Brain` ist nicht automatisch der kanonische Vault.

## Volltextsuche

- `searchSecondBrainV1(query, includeSensitive)` bleibt der On-Demand-Endpunkt.
- Normale Treffer liefern nur kurze Ausschnitte mit Quelle.
- Sensible Treffer bleiben standardmäßig gesperrt.
- Eine Freischaltung sensibler Suche ist keine Standardfunktion des Cockpits.
- Der Code schreibt, verschiebt, benennt und löscht keine Second-Brain-Dateien.

## Zuständigkeiten

- OPS bleibt die operative Wahrheit für Aufgaben, Prioritäten, Deadlines und aktuellen Projektstatus.
- Repository, Git, Tests und sichtbares Verhalten bleiben die technische Wahrheit.
- Langfristige Regeln und Wissensrouten kommen aus dem Second Brain.
- Eine dauerhafte Wissensänderung erfolgt weiterhin nur über den bestehenden Freigabeprozess.

## Bezug zu Phase 4B

Beim normalen Start soll kein Vollscan mehr stattfinden. Die fünf erlaubten Schnellpfad-Quellen und die Apps-Script-Übertragung stehen in [docs/phase4b-personal-operator.md](phase4b-personal-operator.md).