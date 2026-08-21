# Phase 4 – Second-Brain-Volltextsuche

Die bestehende `SecondBrain.gs`-Schicht bleibt die read-only Grundlage für die On-Demand-Volltextsuche.

Die schnelle persönliche Dashboard-Anzeige ist in [docs/phase4b-personal-operator.md](phase4b-personal-operator.md) dokumentiert.

## Bestehende Volltextsuche

## Ziel

Die Kommandozentrale bekommt einen schnellen, entscheidungsorientierten Personal-Lens. Beim normalen Dashboard-Start werden nicht mehr alle Second-Brain-Seiten gelesen. Stattdessen werden fünf kanonische, normale Systemseiten als Langzeitkontext mit den aktuellen OPS-Daten verbunden.

Der Personal Operator soll nicht Lukes Biografie anzeigen. Er soll im richtigen Moment helfen, eine sinnvolle nächste Entscheidung zu treffen:

- Was ist jetzt der nächste sichtbare Schritt?
- Warum ist dieser Schritt gerade wichtig?
- Was sollte bewusst nicht zusätzlich begonnen werden?
- Welche Arbeits- und Lernregel passt zur Situation?



## Ziel

Die Kommandozentrale bekommt einen schnellen, entscheidungsorientierten Personal-Lens. Beim normalen Dashboard-Start werden nicht mehr alle Second-Brain-Seiten gelesen. Stattdessen werden fünf kanonische, normale Systemseiten als Langzeitkontext mit den aktuellen OPS-Daten verbunden.

Der Personal Operator soll nicht Lukes Biografie anzeigen. Er soll im richtigen Moment helfen, eine sinnvolle nächste Entscheidung zu treffen:

- Was ist jetzt der nächste sichtbare Schritt?
- Warum ist dieser Schritt gerade wichtig?
- Was sollte bewusst nicht zusätzlich begonnen werden?
- Welche Arbeits- und Lernregel passt zur Situation?

## Schnellpfad und Quellen

Der Schnellpfad liest ausschließlich diese Allowlist:

- `_System/SCHEMA.md` – Wahrheits-, Datenschutz- und Schreibregeln
- `_System/Wissenslandkarte.md` – Prioritätsrouten
- `Selbstentwicklung/Persoenliches-Betriebssystem.md` – Fokus, Kapazität und Tagesstruktur
- `Business/Business-Betriebssystem.md` – Portfolio und aktuelle Business-Engpässe
- `Ausbildung/Lernsystem.md` – Lernen, Fehler und Wiederholung

Die folgenden Inhalte gehören ausdrücklich nicht in den normalen Browser-Kontext:

- `_System/Project_Instructions.md`
- persönliche Profil- und Kommunikationsregeln
- Interessen, Musik, Gaming und allgemeine Hintergrundinformationen
- der vollständige Markdown-Bestand

Die vollständige Second-Brain-Suche bleibt in `SecondBrain.gs` erhalten, wird aber nur aus der Detailansicht und nur auf ausdrücklichen Abruf gestartet. Sensible Quellen bleiben standardmäßig blockiert.

## Datenrollen

| Aufgabe | Quelle |
|---|---|
| Aktuelle Aufgaben, Deadlines, Status | OPS Sheet |
| Aktueller Kalender | Google Calendar |
| Aktuelle relevante E-Mails | OPS.EMAIL_REFS / Gmail |
| Langfristige Regeln, Prioritäten und Lernlogik | Personal Operator / Second Brain |
| Code und technischer Zustand | Repository, Git und Tests |

Der Personal Operator darf keine OPS-, Drive-, Gmail- oder Kalenderdaten verändern. Er ist read-only.

## Apps-Script-Übertragung

Nach Merge in `main`:

1. `src/PersonalOperator.gs` als neue Datei `PersonalOperator.gs` in das Apps-Script-Projekt kopieren.
2. `src/Index.html` vollständig durch die neue Repository-Version ersetzen.
3. `Code.gs` und `SecondBrain.gs` im Projekt belassen.
4. Prüfen, dass die Script Property `SECOND_BRAIN_ROOT_ID` weiterhin auf den inneren kanonischen Second-Brain-Ordner zeigt.
5. Die Funktion `refreshPersonalOperatorContextV1` einmal manuell ausführen.
6. Die Berechtigungsabfrage für Google Drive bestätigen, falls sie erscheint.
7. Eine neue Web-App-Version bereitstellen und den bestehenden `/exec`-Link auf diese Version zeigen lassen.

## Smoke-Test

- Die Karte heißt `Dein persönlicher Operator`.
- Die Karte zeigt `Nächster sichtbarer Schritt`, `Warum`, `Bewusst nicht jetzt` und `Arbeitsmodus`.
- Die Metazeile zeigt `Personal Lens`, die Anzahl der Schnellpfad-Quellen und `read-only`.
- Die Ladezeit liegt deutlich unter dem bisherigen Vollscan; `timingMs` ist sichtbar.
- Aufgaben, Kalender, Mails, Finanzen, Health und Systemstatus funktionieren wie vorher.
- In der Detailansicht öffnet die Volltextsuche erst nach manueller Eingabe.
- Eine Suche nach `AzubiPass`, `Prüfung` oder `Fokus` liefert normale Treffer mit Quelle und Ausschnitt.
- Es gibt keine Schreib-, Lösch-, Verschiebe- oder Umbenennungsaktion für Second-Brain-Dateien.

## Erfolgskriterium

Phase 4B ist fachlich erfolgreich, wenn die Karte nicht mehr nur Wissen ausstellt, sondern aus aktuellem OPS-Zustand und langfristigem persönlichem Arbeitsmodell eine kleine, handlungsfähige Entscheidungshilfe macht.