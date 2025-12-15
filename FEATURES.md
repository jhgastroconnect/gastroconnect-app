## F1 – Restaurant Produktkatalog: Cleanup Phase 1
Ziel:
- Code aufräumen, ohne Verhalten zu ändern.

ToDo:
- Komponente in kleinere Unterkomponenten aufteilen.
- Toten/auskommentierten Code entfernen.
- Variablen/Props klar benennen.

## F2 – Produktkatalog Mobile Cleanup
- Auf Mobile nur zeigen: Bild, Name, Preis, „In den Warenkorb“.
- Beschreibung ausblenden.
- Lieferant‑Details ausblenden.
- ETA-Badge optional ausblenden.
- Grid auf 1‑Spalte reduzieren.
- Filter als Dropdown statt Leiste.

## F3 – Stock Handling
- Wenn stock === 0 → Button disabled + "Nicht verfügbar".
- Wenn stock low → Badge "Begrenzter Bestand".
- Keine Backendänderungen annehmen, UI-only.

## F4 – Lieferant Tagesübersicht Cleanup
- Restaurant/Zone Lookup in Maps cachen (restaurantMap, zoneMap).
- getZoneForRestaurant in eigene Funktion auslagern.
- Status-Konfiguration zentralisieren (ORDER_STATUS).
- Error-Handling hinzufügen (isError, isLoading).
- O(n²)-Berechnungen entfernen.
- UI-Struktur vereinfachen: Header, Filterleiste, Liste trennen.

## F5 – Restaurant Warenkorb Cleanup (nur Struktur)

Ziel:
- Code lesbarer machen, ohne Verhalten zu ändern.

ToDo:
- Summenberechnung in eigene Helper-Funktionen auslagern.
- Eine zentrale handleBestellungSenden(proLieferant) Funktion klar strukturieren.
- UI in drei klare Blöcke aufteilen:
  1) Gruppen nach Lieferant (Positionen)
  2) Summenbereich (Zwischensumme, Gesamtbetrag)
  3) Actions (Buttons: Zurück, Bestellung senden).
- Kommentare an die kritischen Stellen (Stock-Check, zwei API-Calls, Query-Invalidierung),
  damit wir sie später in die zentrale Order-API verlagern können.
- Kein Backend-Verhalten ändern, nur Struktur + Kommentare.

