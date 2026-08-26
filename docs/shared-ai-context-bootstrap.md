# Shared AI Context Bootstrap v1

## Zweck

Dieser Vertrag definiert, wie ChatGPT und Claude für die Kommandozentrale relevanten Kontext auswählen. Er ist **keine neue Source of Truth** und enthält keine persönliche Wissenskopie.

Ziel: dieselbe belastbare Entscheidungsgrundlage mit möglichst wenig Kontext laden.

## Autoritative Ebenen

| Frage | Autoritative Quelle |
|---|---|
| Aufgaben, Projekte, Status, AI-Inbox, Alerts, operative Systemdaten | OPS Sheet |
| Termine und Verfügbarkeit | Google Calendar |
| Nachrichten und Kommunikationsstatus | Gmail |
| Dateien und Dokumente | Google Drive |
| dauerhaftes persönliches Wissen | Second Brain |
| Projektwissen und technische Entscheidungen | Repository-Dokumentation |
| tatsächlicher technischer Stand | Tests, Runtime, aktueller Code, Git |
| Darstellung | Cockpit |

Referenzen, Caches, Briefings, Trends und UI-Zustände sind keine konkurrierenden Wahrheitsquellen.

## Grundregel

**Kontext wird nach Bedarf geroutet, nicht pauschal geladen.**

Vor jeder Aufgabe werden vier Fragen beantwortet:

1. Reichen aktuelle Unterhaltung und Repository-Kontext?
2. Ist persönlicher Langzeitkontext für die Entscheidung materiell relevant?
3. Ist aktueller Live-State für eine korrekte Antwort nötig?
4. Geht es um technischen Ist-Stand, der aus Code/Git/Tests verifiziert werden muss?

Nur Quellen, die mindestens eine dieser Fragen erforderlich macht, werden zusätzlich geladen.

## Gemeinsamer Entscheidungsbaum

```text
Anfrage
  ↓
Gespräch + aktueller Projektkontext ausreichend?
  ├─ ja → ohne weitere persönliche Quellen arbeiten
  └─ nein
       ↓
Persönlicher Langzeitkontext materiell relevant?
  ├─ ja → Second Brain: SCHEMA → index → nur relevante Seiten
  └─ nein
       ↓
Aktueller operativer Zustand nötig?
  ├─ ja → passende Live-SoT laden: OPS / Calendar / Gmail / Drive
  └─ nein
       ↓
Technischer Ist-Stand relevant?
  ├─ ja → Repo / Git / Tests / Runtime prüfen
  └─ nein
       ↓
Antwort / Spec mit Quelle, Freshness und sichtbarer Unsicherheit
```

Die Reihenfolge ist kein Zwang, unnötige Quellen vorher zu lesen. Sie beschreibt die Eskalation von kleinem zu größerem Kontext.

## ChatGPT-Bootstrap

ChatGPT ist zentraler Operator und darf verbundene Quellen gemäß `PERMISSIONS.md` direkt verwenden.

1. Anfrage und vorhandenen Gesprächskontext prüfen.
2. Datentyp bestimmen und dessen Source of Truth wählen.
3. Second Brain nur laden, wenn langfristige persönliche Regeln, Präferenzen, frühere Entscheidungen oder Wissen die Antwort materiell ändern.
4. Bei Second-Brain-Nutzung `_System/SCHEMA.md`, dann `_System/index.md` als Navigation verwenden und anschließend nur relevante Seiten lesen.
5. Bei zeitabhängigen Aussagen die passende Live-Quelle prüfen; alte Briefings, Trends oder Chat-Memory nicht als aktuellen Fakt verwenden.
6. Bei technischen Aussagen Repository, Git, Tests und sichtbares Verhalten höher gewichten als Vault-Zusammenfassungen oder Chat-Memory.
7. Fakten, Schlussfolgerungen, Unsicherheit und Vorschläge getrennt halten.

## Claude-Bootstrap

Claude ist technischer Umsetzer im Repository, nicht zweiter persönlicher Operator.

Vor einer Änderung:

1. `CLAUDE.md` lesen.
2. `AGENTS.md` lesen.
3. dieses Dokument lesen.
4. `docs/multi-ai-workflow.md` lesen.
5. passenden fachlichen Vertrag unter `docs/` und die betroffenen Tests/Dateien lesen.
6. Branch, Basis-Commit und aktuellen Git-/Testzustand verifizieren.

Externer Kontext wird **nur** geladen oder angefordert, wenn die freigegebene Spezifikation ihn benötigt:

- OPS für aktuellen operativen Status oder Datenvertrag,
- Second Brain für langfristiges persönliches Wissen,
- Calendar/Gmail/Drive für deren Originaldaten.

Wenn Claude eine notwendige externe Quelle nicht lesen kann, gilt: **nicht raten und keine Repo-Kopie dieser Wahrheit anlegen**. Die fehlende Quelle wird als Voraussetzung im Übergabeblock genannt.

Für Second Brain gilt derselbe Pfad wie für andere Agenten:

`_System/SCHEMA.md → _System/index.md → relevante Seite(n)`

Kein Vollscan und keine pauschale Kopie des Vaults in den Prompt.

## Minimaler Context Pack im Kernteam

Zwischen ChatGPT und Claude reicht normalerweise:

```text
Change-ID / Thema:
Aktueller Zustand der Workflow-Kette:
Meine Rolle:
Basis-Commit / Branch:
Entscheidung oder freigegebene Spec:
Geladene Quellen + Stand:
Nicht geladene / nicht verfügbare Quellen:
Bekannte Unsicherheiten / Blocker:
Erwarteter nächster Schritt:
```

Keine Vollkopie von OPS, Second Brain oder Chatverläufen anhängen, wenn konkrete Referenzen oder relevante Ausschnitte genügen.

## Gemini als externer Bewerter

Gemini gehört **nicht** zum normalen Kontextpfad von ChatGPT und Claude.

Wenn ein unabhängiger Gegencheck sinnvoll ist, erstellt ChatGPT ein separates, kleines Bewertungs-Paket. Default ist dabei **kein persönlicher und kein operativer Vollkontext**.

Gemini erhält nur das, was zur konkreten Prüffrage notwendig ist, typischerweise:

- Prüffrage,
- vorgeschlagene Lösung oder Entscheidung,
- technische Randbedingungen,
- ausgeschlossene Optionen,
- kleine relevante Code-/Doku-Ausschnitte,
- gewünschte Kritik: Gegenargument, Fehlerfälle, fehlende Belege, Widerlegungstest.

Gemini erhält standardmäßig **nicht**:

- vollständiges Second Brain,
- USER_PROFILE oder persönliche Langzeitprofile,
- vollständiges OPS Sheet,
- komplette Chatverläufe,
- Gmail-/Kalender-/Finanz-Rohdaten,
- produktive Geheimnisse oder Zugangsdaten.

Geminis Ergebnis ist eine externe Bewertung. ChatGPT prüft es gegen die echten Sources of Truth. Es wird weder automatisch gespeichert noch automatisch umgesetzt.

Der vollständige Rollen- und Handoffvertrag steht in `docs/multi-ai-workflow.md`.

## Freshness und Provenienz

Bei zeitabhängigen Daten muss erkennbar sein:

- aus welcher Quelle die Information stammt,
- auf welchen Zeitpunkt sie sich bezieht,
- ob sie Originaldaten, normalisierte operative Daten oder abgeleitete Analyse ist,
- ob die Quelle aktuell, veraltet oder unbekannt frisch ist.

Ein Cache oder `last-known-good` darf angezeigt werden, aber nicht als live bezeichnet werden.

## Konfliktregel

Bei Widerspruch gilt die Autorität des jeweiligen Datentyps. Für technische Fragen gilt zusätzlich:

`Runtime/Tests > aktueller Code > Git/Issues > projektdokumentierte Entscheidungen > Second Brain > Chat-Memory`.

Widersprüche werden sichtbar benannt; sie werden nicht durch stilles Zusammenführen „gelöst“.

## Bewusst nicht bauen

- keine Universal-Memory-Datenbank
- keine permanente Second-Brain-Kopie im Repository
- kein OPS-Vollmirror im Repository
- kein automatisches Laden des gesamten Vaults
- keine unsichtbare gemeinsame Erinnerung zwischen KIs
- keine automatische Speicherung normaler Gespräche
- keine zweite operative Task-/Projekt-Datenbank
- keine permanente Gemini-Kontextkopie

## Erfolgskriterien für KZ 1.0

Der Bootstrap gilt als erfolgreich, wenn:

1. ChatGPT und Claude bei derselben Frage dieselbe zuständige Source of Truth bestimmen.
2. Claude ohne persönliche Daten im Repository arbeiten kann und fehlenden externen Kontext sichtbar meldet.
3. persönlicher Kontext nur bei materieller Relevanz geladen wird.
4. aktuelle Zustände nicht aus alten Briefings oder Vault-Seiten abgeleitet werden.
5. technische Aussagen gegen Git/Code/Tests verifiziert werden.
6. Übergaben ohne vollständige Chat- oder Vault-Kopien anschlussfähig bleiben.
7. Gemini als Außenprüfer ohne vollständigen persönlichen oder operativen Kontext nutzbar bleibt.
