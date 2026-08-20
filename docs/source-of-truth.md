# Source-of-Truth-Vertrag

## Ziel

Das Cockpit stellt Daten dar und bietet kontrollierte Bedienung. Es erzeugt keine konkurrierende operative Wahrheit.

## Datenfluss

```text
Gmail ───────────────┐
Google Calendar ─────┼──> ChatGPT Operator ───> OPS Sheet ───> Cockpit
Google Drive ────────┘             │
Second Brain ─────────────────────┘
```

Der vereinfachte Datenfluss beschreibt die Zuständigkeiten, nicht eine automatische Vollsynchronisation.

## Mailbereich

- Gmail ist die Originalquelle für Nachrichten, Threads und Kommunikationsstatus.
- `OPS.EMAIL_REFS` enthält die vom Operator kontextuell bewerteten operativen Referenzen.
- `Code.gs/getMailV3()` liest `OPS.EMAIL_REFS` und übersetzt sie in das bestehende Frontend-Format.
- Das Frontend darf Relevanz nicht selbst anhand von Betreff- oder Absender-Regex erraten.
- `EMAIL_REFS` spiegelt keine Gmail-Lese- oder Sternmarkierungen; diese Werte dürfen nicht erfunden werden.

## Unsicherheit

Eine plausible, aber unbestätigte Interpretation gehört in die AI-Inbox beziehungsweise in einen Reviewprozess. Sie wird nicht still zu einem Faktenfeld.
