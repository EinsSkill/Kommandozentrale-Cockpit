# Entwicklungs- und Releaseworkflow

## Standardablauf

1. Problem oder Idee im ChatGPT-Projekt klären.
2. Context Bootstrap anwenden: nur die für die Entscheidung nötigen SoTs und Langzeitquellen laden; technische Aussagen gegen Repo/Git/Tests prüfen.
3. ChatGPT erstellt eine kleine, vollständige technische Spezifikation.
4. Optional: ChatGPT holt einen externen Gemini-Gegencheck ein, wenn ein echter Architektur-/Risiko-Trade-off vorliegt. Gemini ist nicht Teil der Standardschleife.
5. Claude Code implementiert die freigegebene Spec im Feature-Branch.
6. Claude führt statische und automatisierte Tests aus und übergibt einen überprüfbaren Umsetzungsbericht an ChatGPT.
7. ChatGPT prüft Branch, Diff, Tests, Datenverträge, Scope und relevante SoT-Regeln unabhängig.
8. Bei Findings geht ein konkretes Fix-Paket zurück an Claude; danach erneutes Review.
9. Nutzer gibt den Merge ausdrücklich frei.
10. Merge in `main` durchführen und Git-Stand verifizieren.
11. Falls Runtime betroffen ist: Nutzer gibt den Live-/Deploy-Schritt separat frei.
12. Live-Deployment kontrolliert durchführen und Apps-Script-Cockpit prüfen.
13. Ergebnis und tatsächlichen Endzustand im OPS Audit-Log dokumentieren.

Der verbindliche Kontext-Router steht in `docs/shared-ai-context-bootstrap.md`.
Der Rollen-, Übergabe- und Reviewvertrag steht in `docs/multi-ai-workflow.md`.

Eine Übergabe muss nicht den vollständigen Chat, OPS oder Second Brain enthalten, sondern nur die für den nächsten Schritt nötigen Quellen, Belege und offenen Voraussetzungen.

## Kernteam

Der normale technische Workflow ist:

`ChatGPT → Claude → ChatGPT → Lukes`.

- ChatGPT: Operator, Architekt, Spec und unabhängiges Review.
- Claude: technische Umsetzung und Tests.
- Lukes: Merge-/Deploy-Freigaben und offene fachliche Entscheidungen.
- Gemini: optionaler externer Bewerter mit kleinem, kontextarmen Prüf-Paket.

Es gibt keine autonome Claude↔Gemini-Schleife.

## Testgrenzen

Lokale Tests dürfen nur anonymisierte Fixtures verwenden. Sie dürfen weder Google-APIs aufrufen noch externe Schreibaktionen auslösen.

Ein grüner Testlauf bedeutet nicht automatisch, dass eine Änderung gemergt, deployed oder live verifiziert ist.

## Rollback

Jede produktive Änderung braucht einen bekannten vorherigen Quellstand. Bei einem Fehler wird auf den letzten verifizierten Apps-Script-Stand zurückgegangen; die Ursache und der Rollback werden im Audit-Log festgehalten.
