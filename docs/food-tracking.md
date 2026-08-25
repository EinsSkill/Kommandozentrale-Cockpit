# Ernährung & Vorrat

## Ziel

Das Cockpit erhält einen eigenen Datenbereich für:

- aktuelle Vorräte
- Einkaufszettel und Einkaufspositionen
- gegessene Mahlzeiten
- grobe Kalorien- und Makroschätzungen
- Rezepte und Bewertungen

Die aktuelle operative Wahrheit liegt im OPS Sheet. Das Second Brain bleibt für
langfristige, bestätigte Vorlieben und Muster zuständig.

## OPS-Tabs

| Tab | Zweck |
|---|---|
| `FOOD_PANTRY` | Aktueller Bestand mit Menge, Lagerort und Status |
| `FOOD_LOG` | Gegessene Mahlzeiten und ungefähre Nährwerte |
| `FOOD_RECIPES` | Rezepte, Bewertungen und Kochhistorie |
| `FOOD_SHOPPING` | Einkaufspositionen und Preise |

Die Tabellen werden nur durch die ausdrückliche Aktion
`setupFoodTrackingV1()` angelegt. Der Lese-Endpunkt erzeugt keine Tabellen und
zeigt den Einrichtungsstatus sichtbar an.

## Bedienung

Das Cockpit bietet:

- eine kompakte Ernährungskarte auf „Heute“
- einen eigenen Ernährungseinstieg mit Detailpanel
- „Mahlzeit eintragen“
- „Vorrat hinzufügen“
- „aufgebraucht“ für bestehende Vorratspositionen
- Aktualisieren ohne erfundene Fallbackwerte

Die Nährwerte heißen im Datenmodell bewusst `*_estimate`. Sie sind grobe
Schätzwerte und werden nicht als exakte Messwerte ausgegeben.

## Sicherheits- und Datenregeln

- Fehlende Tabellen sind `NOT_CONFIGURED`, nicht „leer“.
- Fehlende Nährwertangaben bleiben offen und werden nicht still geschätzt.
- Einzelne Mahlzeiten werden nicht automatisch zu dauerhaften Vorlieben.
- Langfristige Präferenzen und Muster werden erst nach ausreichender Evidenz bzw.
  Bestätigung in den langfristigen Kontext übernommen.
- Echte persönliche Inhalte gehören weder in Fixtures noch in GitHub.


## Separater Design-Tab

Die von Claude Design erstellte Oberfläche liegt getrennt in:

- `src/FoodIndex.html` für Desktop
- `src/FoodMobileIndex.html` für Mobile

Die Hauptseite besitzt nur einen kompakten Einstieg über `FoodTrackingEnhancements.html`. Die Route `?view=food` beziehungsweise `?view=food-mobile` öffnet den eigenständigen Bereich.

Die statischen Beispielwerte der Designvorschau werden standardmäßig nicht angezeigt. Für die reine visuelle Prüfung kann vorübergehend `?view=food&preview=1` beziehungsweise `?view=food-mobile&preview=1` verwendet werden. Die echte OPS-Anbindung und die Erfassungsfunktionen werden in einem separaten Integrationsschritt angeschlossen.
