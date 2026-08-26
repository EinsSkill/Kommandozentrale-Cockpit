# Multi-AI Workflow v1 – ChatGPT + Claude als Kernteam

## Zweck

Dieser Vertrag standardisiert die technische Zusammenarbeit an der Kommandozentrale.

Das Kernteam besteht aus **ChatGPT und Claude**:

- **ChatGPT** = zentraler Operator, Architekt, Spec-Owner, Priorisierer und unabhängiger Reviewer.
- **Claude** = technischer Umsetzer im Repository.
- **Gemini** = optionaler externer Bewerter ohne dauerhaften Systemkontext.
- **Lukes** = entscheidet bei Freigabepunkten, insbesondere Merge und Live-Deployment.

Der Workflow erzeugt keine neue Source of Truth und ersetzt weder OPS, Second Brain noch Git/Tests.

## Grundprinzip

Der Standardpfad lautet:

```text
Lukes / Problem
   ↓
ChatGPT: Kontext + Analyse + Spec
   ↓
Claude: Umsetzung im Branch + Tests
   ↓
ChatGPT: unabhängiges Review
   ↓
Lukes: Merge-Freigabe
   ↓
Merge
   ↓
Lukes: Deploy-Freigabe, falls Runtime betroffen
   ↓
Live-Prüfung
   ↓
Dokumentation / Audit
```

Gemini ist **nicht Teil dieses Standardpfads**.

## Workflow-Zustände

| Zustand | Primärer Owner | Ergebnis |
|---|---|---|
| IDEE / PROBLEM | ChatGPT + Lukes | Problem klar und abgegrenzt |
| KONTEXT | ChatGPT | relevante SoTs und technische Quellen geprüft |
| SPEC | ChatGPT | implementierbare, testbare Spezifikation |
| EXTERNER GEGENCHECK | Gemini optional | Gegenargumente / Fehlerfälle, keine Entscheidung |
| FREIGEGEBEN | Lukes, wenn Entscheidung/Freigabe nötig | Scope ist verbindlich |
| UMSETZUNG | Claude | isolierter Branch mit Änderungen |
| TEST | Claude | Tests und technische Prüfung dokumentiert |
| REVIEW | ChatGPT | unabhängige Prüfung gegen Spec, Diff und Tests |
| MERGE-FREIGABE | Lukes | ausdrückliche Merge-Entscheidung |
| MERGED | GitHub | Commit liegt auf `main` |
| DEPLOY-FREIGABE | Lukes, falls produktiver Schritt nötig | ausdrückliche Live-Entscheidung |
| LIVE | Runtime / Apps Script | produktiver Zustand verifiziert |
| DOKUMENTIERT | ChatGPT | OPS/Audit und ggf. dauerhaftes Wissen aktualisiert |

Zustände dürfen nicht sprachlich vermischt werden. `committed`, `pushed`, `PR offen`, `merged`, `deployed` und `live verifiziert` sind unterschiedliche Aussagen.

## 1. ChatGPT → Claude: Umsetzungs-Spec

Claude bekommt keine lose Gesprächszusammenfassung, sondern ein kleines vollständiges Arbeitspaket.

Pflichtfelder:

```text
Change-ID / Thema:
Workflow-Zustand: FREIGEGEBEN oder SPEC
Basis-Commit:
Ziel-Branch:
Problem:
Gewünschtes Ergebnis:
In Scope:
Out of Scope:
Betroffene Dateien / Datenverträge:
Relevante Quellen + Stand:
Akzeptanzkriterien:
Pflichttests:
Bekannte Risiken / Altfehler:
Freigabegrenzen:
Erwartete Rückgabe:
```

Regeln:

- Nur materiell relevanten Kontext übertragen.
- Keine vollständige Chat-Historie als Ersatz für eine Spec.
- Keine Vollkopie von OPS oder Second Brain.
- Persönliche Informationen nur dann, wenn sie für die konkrete Implementierung zwingend erforderlich sind.
- Ungeklärte fachliche Entscheidungen nicht an Claude delegieren; ChatGPT klärt sie vorher mit Lukes oder markiert sie sichtbar als Blocker.

## 2. Claude: Umsetzung

Claude arbeitet nur innerhalb des freigegebenen Scopes.

Vor der Änderung:

1. `CLAUDE.md`, `AGENTS.md`, `docs/shared-ai-context-bootstrap.md` und dieses Dokument lesen.
2. Basis-Commit und Branch prüfen.
3. relevante Fach-Doku und Tests lesen.
4. bestehende Änderungen anderer Beteiligter schützen.

Während der Umsetzung:

- kleinsten sinnvollen Änderungsumfang wählen,
- keine neue Architektur als Nebenprodukt erfinden,
- keine echten persönlichen Daten in Repo, Fixtures oder Logs schreiben,
- keine externen Systeme verändern,
- keine Merge-/Deploy-Aktion ausführen.

## 3. Claude → ChatGPT: Umsetzungsbericht

Claude beendet seine Phase mit einem überprüfbaren Bericht:

```text
Change-ID / Thema:
Workflow-Zustand: REVIEW_READY
Basis-Commit:
Branch:
Head-Commit:
Geänderte Dateien:
Was wurde fachlich geändert:
Was wurde technisch geändert:
Tests + exaktes Ergebnis:
Bewusst nicht geändert:
Bekannte Altfehler:
Neue Risiken / offene Punkte:
Abweichungen von der Spec:
Nächster Schritt: ChatGPT Review
```

Wenn Claude von der Spec abweichen musste, ist das keine stillschweigende Erweiterung. Die Abweichung wird explizit genannt und von ChatGPT bewertet.

## 4. ChatGPT: unabhängiges Review

ChatGPT prüft nicht nur Claudes Zusammenfassung, sondern soweit möglich die überprüfbaren Belege:

1. Branch und Basis-Commit,
2. tatsächlichen Diff,
3. relevante geänderte Dateien,
4. CI / Tests,
5. Datenvertrag und SoT-Regeln,
6. Scope-Einhaltung,
7. Auswirkungen auf Runtime, Deployment und bestehende Funktionen.

Review-Ergebnis:

- **READY_FOR_MERGE_APPROVAL** – technisch freigabefähig.
- **CHANGES_REQUIRED** – konkrete Korrekturen zurück an Claude.
- **BLOCKED** – fehlende Entscheidung, Quelle oder Voraussetzung.

ChatGPT merged nicht ohne Lukes' ausdrückliche Freigabe.

## 5. Korrekturschleife

Falls `CHANGES_REQUIRED`:

```text
ChatGPT Review
   ↓
konkrete Findings + erwarteter Fix
   ↓
Claude korrigiert denselben Branch
   ↓
Claude testet erneut
   ↓
ChatGPT prüft neuen Diff / neue Tests
```

Keine neue Spec-Runde, wenn nur ein klarer Implementierungsfehler behoben wird. Ändert sich jedoch der fachliche Scope, geht die Aufgabe zurück zu `SPEC` bzw. `FREIGEGEBEN`.

## 6. Gemini – externer Bewerter

Gemini ist ein **optionaler Außenprüfer**, kein drittes Kernmitglied.

### Wann Gemini sinnvoll ist

Gemini wird nur eingesetzt, wenn mindestens einer dieser Punkte zutrifft:

- zwei oder mehr plausible Architektur-/Designoptionen,
- hoher technischer oder organisatorischer Blast Radius,
- neue Sicherheits-, Datenschutz- oder Berechtigungsfrage,
- wesentliche Unsicherheit trotz ChatGPT-Analyse,
- gezielter Wunsch von Lukes nach einer unabhängigen Perspektive.

Nicht standardmäßig für:

- kleine Bugfixes,
- normale UI-Anpassungen,
- reine Dokumentationsänderungen,
- Routine-Tests,
- bereits klar spezifizierte Änderungen ohne echte Trade-offs.

### Was Gemini bekommt

Default ist **kein persönlicher und kein operativer Vollkontext**.

Ein Review-Paket enthält höchstens:

```text
Prüffrage:
Vorgeschlagene Entscheidung / Lösung:
Technische Randbedingungen:
Wichtige ausgeschlossene Optionen:
Kleine relevante Code-/Doku-Ausschnitte, falls nötig:
Was Gemini prüfen soll:
```

Nicht mitsenden:

- vollständiges Second Brain,
- USER_PROFILE oder persönliche Langzeitprofile,
- vollständiges OPS Sheet,
- komplette Chatverläufe,
- Gmail-/Kalender-/Finanz-Rohdaten,
- Geheimnisse oder produktive Zugangsdaten.

Wenn ein Detail für die Bewertung nicht nötig ist, wird es weggelassen oder abstrahiert.

### Erwartete Gemini-Antwort

Gemini soll nicht implementieren und nicht entscheiden. Gewünscht sind:

1. stärkstes Gegenargument,
2. mögliche Fehlerfälle,
3. fehlende Belege oder Tests,
4. alternative Erklärung/Option, falls relevant,
5. Einschätzung, was die aktuelle Empfehlung widerlegen würde.

ChatGPT bewertet diese Rückmeldung gegen die echten Quellen. Gemini-Ergebnisse werden nicht automatisch gespeichert, umgesetzt oder als Fakt übernommen.

## 7. Keine direkte Claude ↔ Gemini-Schleife

Claude und Gemini geben sich nicht gegenseitig autonom Aufgaben.

Wenn ein externer Gegencheck nötig ist:

```text
ChatGPT → kleines Gemini-Paket → ChatGPT bewertet → ggf. aktualisierte Spec → Claude
```

So bleibt ChatGPT der zentrale Operator und fachliche Kontext-Halter.

## 8. Freigabegrenzen

Unabhängig von der beteiligten KI gelten `PERMISSIONS.md` und die Projektregeln.

Insbesondere:

- Branch-Implementierung innerhalb freigegebener Spec kann reversibel vorbereitet werden.
- Merge in `main` benötigt Lukes' Freigabe.
- produktives Apps-Script-Deployment benötigt Lukes' Freigabe.
- Script Properties, Trigger und sicherheitsrelevante Einstellungen benötigen Freigabe.
- keine KI darf Käufe, Zahlungen, Verträge oder irreversible kritische Löschungen autonom ausführen.

## 9. Technische Wahrheit

Bei technischen Konflikten gilt:

`Runtime / ausgeführte Tests > aktueller Code > Git / Issues > Projektdokumentation > Second Brain > Chat-Memory`.

Berichte anderer KIs sind Hinweise, keine technische Wahrheit.

## 10. Erfolgskriterien

Der Workflow gilt als stabil, wenn:

1. die normale technische Arbeit mit ChatGPT + Claude ohne dritten Kontext-Handoff funktioniert,
2. Claude eine vollständige Spec erhält und nicht fachlich raten muss,
3. ChatGPT Claudes Arbeit unabhängig gegen Diff und Tests prüft,
4. Merge und Deployment nie mit "fertig" verwechselt werden,
5. Gemini nur bei echtem Bewertungsnutzen eingesetzt wird,
6. Gemini ohne vollständigen persönlichen/Systemkontext nützliche Gegenargumente liefern kann,
7. alle Übergaben kurz genug bleiben, dass keine Vollkopien von Chats, OPS oder Second Brain nötig sind.
