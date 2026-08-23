# Kommandozentrale Cockpit

> Eine technische Quellbasis für ein persönliches Dashboard, das wichtige Alltagssysteme an einem Ort zusammenführt.

Das Kommandozentrale Cockpit verbindet Darstellung, Datenverträge und Bedienlogik für ein persönliches HTML-Dashboard. Die eigentlichen Gmail-, Kalender-, Drive-, OPS- und Second-Brain-Daten bleiben in ihren jeweiligen autoritativen Quellen.

[![Projekt öffnen](https://img.shields.io/badge/GitHub-Projekt_öffnen-173f35?style=for-the-badge&logo=github&logoColor=white)](https://github.com/EinsSkill/Kommandozentrale-Cockpit)

## Was zeigt dieses Repository?

- Claude-Design-Oberfläche und Runtime
- Google-Apps-Script-Backend und schmalen Adapter
- Live-Datenbindungen für die persönliche Kommandozentrale
- Wetter- und Gesundheitsdaten-Anbindung
- Personal-Operator-Layer und Wohlbefinden
- anonymisierte Fixtures und statische Vertragstests

## Architektur

Die Kommandozentrale ist bewusst kein neuer Datenspeicher:

| Bereich | Autoritative Quelle |
| --- | --- |
| Mails | Gmail |
| Termine | Google Calendar |
| Dateien und Wissen | Google Drive / Second Brain |
| Operative Daten | OPS Sheet |
| Darstellung und Bedienung | Kommandozentrale Cockpit |

Das Cockpit liest und bedient diese Quellen. Es speichert keine vollständige Kopie des persönlichen Wissensbestands.

## Öffentliche Sicherheitsgrenze

Dieses Repository enthält ausschließlich die Software-Schicht und anonymisierte Testdaten.

Nicht im Repository enthalten:

- echte Gmail-Inhalte
- echte Kalenderdaten
- Finanzdaten und OPS-Exporte
- persönliche Second-Brain-Dateien
- Passwörter, Tokens oder persönliche IDs

Live-Bereitstellung, Freigaben und Änderungen an verbundenen Systemen bleiben separate Schritte.

## Aktueller Stand

**Aktiv in Entwicklung**

Das Cockpit wird schrittweise erweitert und nach jeder größeren Phase lokal geprüft, reviewed und anschließend separat bereitgestellt. Die öffentliche Version dient als technische Dokumentation und als Showcase für Architektur, Datenfluss und Interface.

## Lokale Prüfung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm test
```

Die Tests verwenden ausschließlich anonymisierte Fixture-Daten. Sie verbinden sich nicht mit Google und verändern keine echten Daten.

## Apps-Script-Konfiguration

Für eine spätere Apps-Script-Bereitstellung wird die persönliche OPS-ID ausschließlich als Script Property gesetzt:

```text
OPS_SPREADSHEET_ID=<persönliche OPS-ID>
```

Sie wird nicht aus dem Repository geladen.

## Arbeitsablauf

```text
Idee / Spezifikation
        ↓
Entwicklung und Tests
        ↓
Review
        ↓
Merge
        ↓
Live-Deployment
        ↓
Smoke-Test und Audit
```

Die Repositorybasis bleibt bewusst klein. Neue Abstraktionen oder Dienste kommen nur hinzu, wenn sie ein konkretes Problem lösen.

## Technologie

- HTML, CSS und JavaScript
- Google Apps Script
- Node.js
- statische Vertragstests
- anonymisierte Fixture-Daten
- GitHub für Versionierung und Reviews

---

Ein persönliches Operator-Cockpit als nachvollziehbares Softwareprojekt – mit klarer Trennung zwischen öffentlichem Code und privaten Datenquellen.
