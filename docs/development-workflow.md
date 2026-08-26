# Entwicklungs- und Releaseworkflow

## Standardablauf

1. Problem oder Idee im ChatGPT-Projekt klären.
2. Context Bootstrap anwenden: nur die für die Entscheidung nötigen SoTs und Langzeitquellen laden; technische Aussagen gegen Repo/Git/Tests prüfen.
3. Kleine technische Spezifikation festlegen.
4. Claude Code implementiert im Feature-Branch.
5. Statische und automatisierte Tests ausführen.
6. ChatGPT prüft die Änderung unabhängig gegen Vertrag, Datenfluss, Scope und geladenen Kontext.
7. Nutzer gibt Merge und Live-Schritt frei.
8. Live-Deployment manuell beziehungsweise kontrolliert durchführen.
9. Apps-Script-Cockpit live testen.
10. Ergebnis im OPS Audit-Log dokumentieren.

Der verbindliche Kontext-Router steht in `docs/shared-ai-context-bootstrap.md`. Eine Übergabe muss nicht den vollständigen Chat, OPS oder Second Brain enthalten, sondern nur die für den nächsten Schritt nötigen Quellen, Belege und offenen Voraussetzungen.

## Testgrenzen

Lokale Tests dürfen nur anonymisierte Fixtures verwenden. Sie dürfen weder Google-APIs aufrufen noch externe Schreibaktionen auslösen.

## Rollback

Jede produktive Änderung braucht einen bekannten vorherigen Quellstand. Bei einem Fehler wird auf den letzten verifizierten Apps-Script-Stand zurückgegangen; die Ursache und der Rollback werden im Audit-Log festgehalten.
