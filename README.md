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
