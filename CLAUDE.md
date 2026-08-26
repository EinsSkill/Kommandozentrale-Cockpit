# Claude Code – Kommandozentrale Cockpit

## Rolle

Claude Code ist der technische Umsetzer im Repository. ChatGPT bleibt Operator, Architekt, Priorisierer, Spec-Owner und unabhängiger Reviewer.

Claude arbeitet primär mit ChatGPT zusammen. Gemini ist kein direkter Umsetzungspartner und erhält keine autonome Übergabe von Claude.

## Vor jeder Änderung

1. `AGENTS.md` lesen.
2. `docs/shared-ai-context-bootstrap.md` lesen.
3. `docs/multi-ai-workflow.md` lesen.
4. Die passende Datei unter `docs/` lesen.
5. Den betroffenen Datenvertrag und die vorhandenen Tests prüfen.
6. Branch, Basis-Commit und aktuellen Git-/Testzustand verifizieren.
7. Den kleinstmöglichen Änderungsumfang bestimmen.

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
- Gemini oder andere KIs autonom mit Systemkontext versorgen oder ihnen Folgeaufträge erteilen

## Qualitätsregeln

- Bestehendes Layout und Datenformat nur ändern, wenn die Spezifikation es verlangt.
- `OPS.EMAIL_REFS` bleibt der operative Mailpfad; Gmail bleibt die Originalquelle.
- Unsichere Informationen nicht als bestätigte Fakten speichern.
- Jede Änderung muss mit `npm test` geprüft werden.
- Keine großflächige Refaktorierung als Nebenprodukt eines kleinen Features.
- Bei Unklarheit stoppen, die Annahme dokumentieren und Rückfrage beziehungsweise Review an ChatGPT zurückgeben.
- Für technische Aussagen gilt: Runtime/Tests > aktueller Code > Git/Issues > Projektdokumentation > Second Brain > Chat-Memory.
- Eine Abweichung von der freigegebenen Spec muss im Umsetzungsbericht ausdrücklich genannt werden.

## Übergabeformat an ChatGPT

Jede Übergabe nennt:

- Change-ID oder Thema
- Workflow-Zustand: `REVIEW_READY`
- Basis-Commit und Branch
- Head-Commit
- geänderte Dateien
- fachliche und technische Änderung
- geladene Quellen und deren Stand
- nicht geladene oder nicht verfügbare notwendige Quellen
- ausgeführte Tests und exaktes Ergebnis
- bewusste Nicht-Änderungen
- bekannte Altfehler
- Abweichungen von der Spec
- Risiken oder offene Voraussetzungen
- konkreter nächster Schritt: ChatGPT Review

Claude entscheidet nicht selbst, dass eine Änderung merge- oder deploybereit ist. Das unabhängige Review liegt bei ChatGPT; Merge und Deployment benötigen die dafür vorgesehene Nutzerfreigabe.

## Second-Brain-Sonderregel

Wenn `src/SecondBrain.gs`, `src/PersonalOperator.gs` oder die persönliche Kontextanzeige geändert wird, zuerst `docs/phase4-personal-context.md` und `docs/phase4b-personal-operator.md` lesen. Der Vault bleibt außerhalb des Repositories; Tests und Fixtures dürfen keine echten persönlichen Inhalte enthalten. Für einen notwendigen Second-Brain-Abgleich gilt immer: `_System/SCHEMA.md` → `_System/index.md` → nur relevante Seiten.
