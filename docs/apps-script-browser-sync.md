# Browser-only Apps Script sync

Ziel: `src/` im GitHub-Repository ist die technische Source of Truth. Der Sync überträgt den kompletten Runtime-Stand nach Apps Script **HEAD**, ohne lokal etwas zu installieren und ohne automatisch die produktive Web-App zu deployen.

## Sicherheitsmodell

- Workflow startet ausschließlich manuell über `workflow_dispatch`.
- Workflow darf nur von `main` laufen.
- `check` verändert Apps Script nicht.
- `push` synchronisiert den vollständigen `src/`-Runtime-Stand nach Apps Script HEAD.
- Das aktuelle `appsscript.json` wird vor jedem Push aus Apps Script gelesen und unverändert wiederverwendet.
- Live-only Dateien blockieren den Push standardmäßig, damit nichts unbemerkt gelöscht wird.
- Nach einem Push wird Apps Script erneut gelesen und bytegenau gegen GitHub `src/` verifiziert.
- Es wird **keine** neue Apps-Script-Version und **kein** Web-App-Deployment erzeugt.

Google weist darauf hin, dass `projects.updateContent` den gesamten Projektinhalt ersetzt. Deshalb wird der vollständige Runtime-Dateisatz geprüft und das bestehende Manifest erhalten.

## Voraussetzungen

Im Repository müssen diese GitHub Actions Secrets vorhanden sein:

- `APPS_SCRIPT_ID` = Script-ID des produktiven Kommandozentrale-Apps-Script-Projekts
- `CLASPRC_JSON` = kompletter Inhalt einer gültigen clasp-OAuth-Datei (`~/.clasprc.json`)

Außerdem muss im Google-Konto unter Apps Script die **Google Apps Script API** aktiviert sein.

Die Secrets werden ausschließlich innerhalb des GitHub-Actions-Runners gelesen und nicht in Repository-Dateien geschrieben.

## Einmalige Browser-Einrichtung, falls die Secrets noch nicht existieren

### 1. Apps Script API aktivieren

In Apps Script unter **Einstellungen → Google Apps Script API** einschalten.

### 2. Script ID holen

Im konkreten Kommandozentrale-Apps-Script-Projekt:

**Projekteinstellungen → IDs → Script-ID**

Die Script-ID ist nicht die Web-App-Deployment-ID.

### 3. OAuth-Datei ohne lokale Installation erzeugen

Google Cloud Shell im Browser öffnen und ausführen:

```bash
npx --yes @google/clasp@3.4.0 login --no-localhost
```

Den angezeigten Google-Link öffnen, mit dem Google-Konto des Apps-Script-Projekts autorisieren und den von `clasp` verlangten Rückgabe-Schritt abschließen.

Danach in Cloud Shell:

```bash
cat ~/.clasprc.json
```

Den **gesamten JSON-Inhalt** kopieren. Er enthält OAuth-Zugangsdaten und gehört ausschließlich in ein GitHub Secret, niemals in Git-Dateien, Issues oder Chat-Nachrichten.

### 4. GitHub Secrets anlegen

Repository → **Settings → Secrets and variables → Actions → New repository secret**

Anlegen:

- `APPS_SCRIPT_ID` = Script-ID aus Schritt 2
- `CLASPRC_JSON` = kompletter Inhalt von `~/.clasprc.json`

## Benutzung

Repository → **Actions → Sync Apps Script (manual) → Run workflow**

Zuerst:

- Branch: `main`
- `mode`: `check`
- `allow_live_only_deletions`: `false`

Wenn `check` grün ist, erneut starten mit:

- `mode`: `push`
- `allow_live_only_deletions`: weiterhin `false`

Nur wenn der Check ausdrücklich live-only Dateien meldet und diese nach Prüfung bewusst entfernt werden sollen, darf die Löschfreigabe aktiviert werden.

Nach erfolgreichem `push` entspricht Apps Script HEAD dem GitHub-`src/`-Stand. Erst danach wird eine Web-App-Version manuell über Apps Script erstellt/deployed.

## Technische Version

Der Workflow nutzt Node 20 und pinnt `@google/clasp@3.4.0`. Für `.gs`-Dateien wird die aktuelle `scriptExtensions`-Konfiguration verwendet; HTML bleibt `.html`.
