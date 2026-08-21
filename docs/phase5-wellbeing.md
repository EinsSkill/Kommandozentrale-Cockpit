# Phase 5 – Wohlbefinden und Tagesabschluss

## Ziel

Die Kommandozentrale bekommt einen kleinen, freiwilligen Abendcheck, der über mehrere Tage einen persönlichen Wohlbefindensverlauf sichtbar macht. Der Second-Brain-Kontext wird dabei nicht als täglicher Vollimport verwendet. Er liefert nur die Regeln, nach denen der Check und spätere Hinweise persönlich, vorsichtig und nicht überfordernd bleiben.

Die operative Tageschronik liegt im OPS-Tab `WELLBEING_LOG`. Ein bestätigtes langfristiges Muster darf später separat ins Second Brain übernommen werden. Das passiert in dieser Phase nicht automatisch.

## Nutzerfluss

Die Karte steht ganz unten im Cockpit, damit sie den operativen Start nicht blockiert.

1. Auf **Abendcheck starten** klicken.
2. Die sechs Skalen ausfüllen oder mit **Heute nicht angeben** überspringen:
   - Stimmung
   - Energie
   - innerer Druck
   - Schlafqualität
   - Motivation / Antrieb
   - Erholung / Regeneration
3. Optional ein Hauptgefühl, dessen Intensität von 1 bis 5 und den wichtigsten Einfluss auswählen.
4. Optional beantworten: „Was hat heute am meisten zu deinem Zustand beigetragen?“
5. **Abendcheck speichern** drücken.

Ein Eintrag pro Tag wird gespeichert. Speichert der Nutzer denselben Tag erneut, wird der Tag aktualisiert statt dupliziert.

## Werte und Interpretation

Die sechs numerischen Werte verwenden eine 1–10-Skala. Bei Stimmung, Energie, Schlafqualität, Motivation und Erholung bedeutet 10 gut beziehungsweise hoch. Beim inneren Druck bedeutet 10 sehr hoher Druck.

Die verfügbaren Gefühlsgruppen sind bewusst alltagsnah:

- ruhig / ausgeglichen
- zufrieden / verbunden
- motiviert / zuversichtlich
- angespannt / unter Druck
- überfordert / voll im Kopf
- frustriert / blockiert
- traurig / niedergeschlagen
- leer / abgestumpft
- erschöpft / antriebslos

Die Einflussgruppen sind Arbeit / Schule, Beziehung / Soziales, Finanzen, Schlaf / Gesundheit, Projekt / Überforderung, Freizeit / Erholung und unklar.

Die Oberfläche zeigt einen kompakten 7-Tage-Verlauf und eine 30-Tage-Detailansicht. Das Backend schlägt ein Muster erst vorsichtig vor, wenn die letzten drei Einträge gemeinsam auf niedrige Stimmung oder Energie und gleichzeitig hohen Druck hindeuten. Das ist kein medizinisches Urteil und keine Diagnose.

## Persönliche Regeln aus dem Second Brain

Aus dem bestehenden persönlichen Betriebssystem werden nur die passenden Leitplanken genutzt:

- wenige sichtbare nächste Schritte statt Vollständigkeitsdruck
- Energie und Puffer berücksichtigen
- Tagesplanung darf an freien Tagen später starten
- kein Zwang, jede Frage auszufüllen
- beobachtete Muster erst nach Wiederholung ansprechen
- bestätigte Langzeitmuster getrennt von der täglichen OPS-Chronik behandeln

Die Kommandozentrale darf daraus einen ruhigen morgendlichen Hinweis ableiten. Sie entscheidet nicht automatisch über Termine, Projekte, medizinische Maßnahmen oder andere Systeme.

## Datenrollen

| Information | Quelle / Ziel |
|---|---|
| tägliche Werte und Antworten | OPS-Tab `WELLBEING_LOG` |
| aktuelle Aufgaben und Tagesabschluss-Kontext | OPS Sheet |
| langfristige, bestätigte Muster | Second Brain nach ausdrücklicher Bestätigung |
| UI und technische Logik | Repository / Apps Script |
| Diagnosen oder medizinische Bewertung | nicht Bestandteil der Kommandozentrale |

Der Schreibpfad `saveWellbeingEntryV1` schreibt nur in OPS und protokolliert die Aktion im Audit-Log. Es gibt keinen automatischen Second-Brain-Schreibzugriff.

## Apps-Script-Einrichtung

Die aktuelle GitHub-Änderung ist noch nicht automatisch im laufenden Apps-Script-Projekt. Nach Merge in `main`:

1. In Apps Script das Projekt **Kommandozentrale** öffnen.
2. Den Inhalt von `src/Code.gs` vollständig in die vorhandene Datei `Code.gs` kopieren. Darin steckt der neue Backend-Endpunkt samt OPS-Logik.
3. Den Inhalt von `src/Index.html` vollständig in `Index.html` kopieren.
4. `SecondBrain.gs` und `PersonalOperator.gs` unverändert im Projekt lassen.
5. Prüfen, dass die Script Property `OPS_SPREADSHEET_ID` weiterhin gesetzt ist.
6. Speichern.
7. Im Funktionsmenü `ensureWellbeingLogV1` auswählen und einmal mit **Ausführen** starten. Die Berechtigungen bestätigen.
8. Im OPS Sheet prüfen, dass der Tab `WELLBEING_LOG` mit der Kopfzeile angelegt wurde. Es werden dabei keine echten Werte eingetragen.
9. Unter **Bereitstellen → Bereitstellungen verwalten** eine neue Version der bestehenden Web-App-Bereitstellung erstellen. Den vorhandenen Zugriff unverändert lassen.
10. Den bestehenden `/exec`-Link öffnen und zuerst die Einrichtungskarte, danach einen Testeintrag mit anonymisierten Testwerten prüfen. Den Testeintrag anschließend nur löschen, wenn du ihn bewusst aus dem echten OPS entfernen möchtest; besser ist ein kontrollierter Testtag.

Der vorhandene Web-App-Link bleibt derselbe, sofern die bestehende Bereitstellung aktualisiert wird. Ich kann das Apps-Script-Projekt aus diesem Arbeitsbereich nicht direkt speichern oder bereitstellen; die beiden Dateien müssen deshalb in Apps Script eingefügt werden.

## Tests und Übergabe

Lokal:

```bash
npm test
```

Die neuen Vertragstests liegen in `tests/wellbeing.test.mjs`; die anonymisierten Testdaten liegen in `fixtures/wellbeing.json`. Die Tests verbinden sich nicht mit Google und enthalten keine persönlichen Daten.

Vor dem Merge:

- `npm test` grün
- Code.gs und der Script-Block in Index.html parsebar
- keine echte OPS-ID, keine E-Mail-Adresse und keine Second-Brain-Dateien im Repository
- Apps Script erst nach dem Merge manuell aktualisieren
- Live-Smoke-Test erst nach der neuen Bereitstellung
