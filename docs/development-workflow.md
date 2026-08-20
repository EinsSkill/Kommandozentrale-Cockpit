# Entwicklungs- und Releaseworkflow

## Standardablauf

1. Problem oder Idee im ChatGPT-Projekt klären.
2. Kleine technische Spezifikation festlegen.
3. Claude Code implementiert im Feature-Branch.
4. Statische und automatisierte Tests ausführen.
5. ChatGPT prüft die Änderung unabhängig gegen Vertrag, Datenfluss und Scope.
6. Nutzer gibt Merge und Live-Schritt frei.
7. Live-Deployment manuell beziehungsweise kontrolliert durchführen.
8. Apps-Script-Cockpit live testen.
9. Ergebnis im OPS Audit-Log dokumentieren.

## Testgrenzen

Lokale Tests dürfen nur anonymisierte Fixtures verwenden. Sie dürfen weder Google-APIs aufrufen noch externe Schreibaktionen auslösen.

## Rollback

Jede produktive Änderung braucht einen bekannten vorherigen Quellstand. Bei einem Fehler wird auf den letzten verifizierten Apps-Script-Stand zurückgegangen; die Ursache und der Rollback werden im Audit-Log festgehalten.
