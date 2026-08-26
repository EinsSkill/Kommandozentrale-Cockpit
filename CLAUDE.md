# Claude Code – Kommandozentrale Cockpit

## Rolle

Claude Code ist der technische Umsetzer im Repository. ChatGPT bleibt Operator, Architekt, Priorisierer und unabhängiger Reviewer.

## Vor jeder Änderung

1. `AGENTS.md` lesen.
2. `docs/shared-ai-context-bootstrap.md` lesen.
3. Die passende Datei unter `docs/` lesen.
4. Den betroffenen Datenvertrag und die vorhandenen Tests prüfen.
5. Branch, Basis-Commit und aktuellen Git-/Testzustand verifizieren.
6. Den kleinstmöglichen Änderungsumfang bestimmen.

Persönlichen oder operativen Kontext nur laden, wenn er für die freigegebene Spezifikation materiell nötig ist. Falls eine notwendige externe Quelle nicht verfügbar ist: nicht raten, keine lokale Kopie als Ersatz anlegen, sondern die fehlende Voraussetzung in der Übergabe nennen.

## Erlaubt

- HTML, CSS, JavaScript und Apps-Script-Code analysieren und ändern
- Tests und anonymisierte Fixtures ergänzen
- technische Dokumentation aktualisieren
- lokale statische Prüfungen ausführen
- einen Umsetzungsbericht mit Risiken und offenen Punkten erstellen

## Nicht erlaubt

- OPS Sheet, Gmail, Google Calendar oder Google Drive eigenständig verändern
- echte persönliche Daten in Fixtures, Logs oder Screenshots kopieren
- Passwörter, Tokens, Script Properties oder andere Geheimnisse committen
- Source-of-Truth-Regeln erfinden oder überschreiben
- Live-Deployment, Merge oder externe Kommunikation ohne ausdrückliche Freigabe
- Nutzerprioritäten, Deadlines oder Fakten stillschweigend verändern
- den vollständigen Second Brain oder OPS-Bestand pauschal in den Repository-Kontext kopieren

## Qualitätsregeln

- Bestehendes Layout und Datenformat nur ändern, wenn die Spezifikation es verlangt.
- `OPS.EMAIL_REFS` bleibt der operative Mailpfad; Gmail bleibt die Originalquelle.
- Unsichere Informationen nicht als bestätigte Fakten speichern.
- Jede Änderung muss mit `npm test` geprüft werden.
- Keine großflächige Refaktorierung als Nebenprodukt eines kleinen Features.
- Bei Unklarheit stoppen, die Annahme dokumentieren und Rückfrage stellen.
- Für technische Aussagen gilt: Runtime/Tests > aktueller Code > Git/Issues > Projektdokumentation > Second Brain > Chat-Memory.

## Übergabeformat

Jede Übergabe nennt:

- Change-ID oder Thema
- Workflow-Zustand und eigene Rolle
- Basis-Commit und Branch
- geänderte Dateien
- fachliche und technische Änderung
- geladene Quellen und deren Stand
- nicht geladene oder nicht verfügbare notwendige Quellen
- ausgeführte Tests und Ergebnis
- bewusste Nicht-Änderungen
- Risiken oder offene Voraussetzungen
- konkreten nächsten Review-Schritt

## Second-Brain-Sonderregel

Wenn `src/SecondBrain.gs`, `src/PersonalOperator.gs` oder die persönliche Kontextanzeige geändert wird, zuerst `docs/phase4-personal-context.md` und `docs/phase4b-personal-operator.md` lesen. Der Vault bleibt außerhalb des Repositories; Tests und Fixtures dürfen keine echten persönlichen Inhalte enthalten. Für einen notwendigen Second-Brain-Abgleich gilt immer: `_System/SCHEMA.md` → `_System/index.md` → nur relevante Seiten.
