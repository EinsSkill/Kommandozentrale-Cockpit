# Kommandozentrale Cockpit

Technische Quellbasis für das HTML-Cockpit der persönlichen Kommandozentrale.

Dieses Repository enthält ausschließlich die Software-Schicht:

- Google-Apps-Script-Backend (`src/Code.gs`)
- HTML/CSS/JavaScript-Oberfläche (`src/Index.html`)
- anonymisierte Fixtures und statische Vertragstests
- technische Regeln für Claude Code, Reviews und Releases

Echte Gmail-Inhalte, Kalenderdaten, Finanzdaten, OPS-Exporte, Second-Brain-Dateien, Passwörter und Tokens gehören nicht in dieses Repository.

## Architektur

ChatGPT bleibt der persönliche Operator. Das OPS Sheet bleibt die operative Source of Truth. Gmail, Google Calendar und Google Drive bleiben ihre jeweiligen autoritativen Quellen. Das Cockpit liest und bedient diese Daten, ist aber keine eigene Wissensdatenbank und keine autonome KI.

Der Mailbereich verwendet `OPS.EMAIL_REFS` für die operative Relevanzliste. Gmail bleibt die Source of Truth für die Originalnachrichten.

## Lokale Prüfung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm test
```

Die Tests prüfen den Datenpfad statisch und verwenden ausschließlich anonymisierte Fixture-Daten. Sie verbinden sich nicht mit Google und verändern keine echten Daten.

## Apps-Script-Konfiguration

Die echte OPS-ID wird nicht aus dem Repository geladen. Für eine spätere Apps-Script-Bereitstellung muss in den Script Properties ein Eintrag gesetzt werden:

```text
OPS_SPREADSHEET_ID=<persönliche OPS-ID>
```

Live-Deployment, Freigaben und Änderungen an verbundenen Systemen bleiben separate, ausdrücklich freizugebende Schritte.

## Arbeitsablauf

```text
IDEe/Spezifikation → Claude-Code-Branch → Tests → unabhängiger Review
→ Nutzerfreigabe → Merge → Live-Deployment → Smoke-Test → Audit-Log
```

Die Repositorybasis ist bewusst klein gehalten. Neue Abstraktionen oder zusätzliche Dienste werden erst aufgenommen, wenn sie ein konkretes Problem lösen.

## Phase 4 – personalisierter Second-Brain-Kontext

`src/SecondBrain.gs` bleibt die read-only Grundlage für die geschützte Volltextsuche. Der vollständige Markdown-Bestand bleibt außerhalb von GitHub.

## Phase 4B – Personal Operator Layer

`src/PersonalOperator.gs` lädt beim Dashboard-Start nur fünf kanonische, nicht-sensitive Systemseiten. Zusammen mit aktuellen OPS-Daten erzeugt das Cockpit daraus eine handlungsorientierte Personal Lens: nächster sichtbarer Schritt, Begründung, bewusster Nicht-Fokus und passende Arbeitsregel. Die Volltextsuche bleibt ausdrücklich on-demand.

Einrichtung, Datenschutzgrenzen und Live-Smoke-Test stehen in [docs/phase4b-personal-operator.md](docs/phase4b-personal-operator.md).

## Phase 5 – Wohlbefinden

Die unterste Karte **Dein Wohlbefinden** bietet einen freiwilligen Abendcheck mit sechs 1–10-Werten, einem Hauptgefühl, Einflussfaktor und optionalem Reflexionssatz. Der Verlauf bleibt im OPS-Tab \`WELLBEING_LOG\`; die Detailansicht zeigt 7- und 30-Tage-Verläufe. Bestätigte langfristige Muster werden nicht automatisch ins Second Brain geschrieben.

Die Einrichtung und die persönliche Entscheidungslogik stehen in [docs/phase5-wellbeing.md](docs/phase5-wellbeing.md). Die Funktion \`ensureWellbeingLogV1\` legt den leeren OPS-Tab mit Kopfzeile an.

