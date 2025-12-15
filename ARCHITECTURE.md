# Architektur Überblik GastroConnect (Base44-Stand)

Rollen:
- Admin
- Lieferant
- Restaurant

Wichtige Seiten (bisher gesichert):
- product_catalog_restaurant.tsx → Produktkatalog / Bestellansicht Restaurant
- orders_supplier_dashboard.tsx → Tagesübersicht / Bestellungen Lieferant
- restaurant_cart.tsx → Warenkorb Restaurant
- restaurant_orders_list.tsx → Restaurant Bestellungen Liste

## Restaurant Produktkatalog
Datei: product_catalog_restaurant.tsx
Zweck: Produkte anzeigen, filtern, in den Warenkorb legen.
Wichtige Datenquellen: base44.entities.Produkt.list()

## Lieferant Tagesübersicht
Datei: orders_supplier_dashboard.tsx
Zweck: Bestellungen/Lieferungen des Tages für Lieferanten anzeigen und bearbeiten.
Wichtige Datenquellen: base44.entities.Bestellung.list()

## Restaurant Warenkorb
Datei: restaurant_cart.tsx
- Cart-Daten kommen aus CartContext (useCart), nicht aus der DB.
- CartItems werden nach Lieferant gruppiert → pro Lieferant eine Bestellung.
- Beim Senden:
  1) Client-seitiger Stock-Check auf Basis von Produktliste (alle 3s refetch).
  2) Bestellung-Header erstellen (Bestellung.create).
  3) Bestellpositionen via bulkCreate hinzufügen.
- Query-Invalidierung nach Erfolg: 6 verschiedene QueryKeys.
- Risiken: Race Condition beim Stock, nicht-atomare Bestellung, zu viele Re-Queries.

## Restaurant Bestellungen Liste
Datei: restaurant_orders_list.tsx

- Bestellungen werden server-seitig gefiltert nach Restaurant (filter({ restaurant: activeRestaurantId })).
- Tabs: offen (5 Status) vs. geschlossen (2 Status).
- UI-Filter: Datum von/bis, Lieferant, Status; Sortierung: neueste zuerst.
- Lädt ALLE Lieferanten und ALLE Restaurants, obwohl nur wenige gebraucht werden.
- Lieferantensuche erfolgt mehrfach mit Array-find → O(n²) in Render + Export.
- Status-Konfiguration (getStatusConfig) ist dupliziert mit Supplier-Dashboard.
- Exportdaten werden bei jedem Render neu berechnet.
- Auto-Refresh alle 3s.

## Bestellung Detail Modal
Datei: bestellung_detail_modal.tsx

- Props: bestellung + Lieferant-/Restaurant-Namen.
- Lädt Positionen (filter nach bestellung.id).
- Lädt ALLE Produkte (list), nutzt sie nur für Namen/Einheit.
- Lädt Dokumente (filter nach bestellung.id).
- Einzige Statusänderung: Empfang bestätigen → status=geliefert + empfangsdatum + Mail.
- Probleme: Produktlist-Query, O(n)-Lookups, duplizierte Status-Config, kein sauberes Error/Loading-Handling.

## Restaurant Reklamationen
Datei: restaurant_reklamationen.tsx

Zweck:
- Reklamationen des Restaurants anzeigen.
- Filter nach Status / Datum / Lieferant.
- Detailansicht / Verlinkung zu Bestellung.

## Lieferant Reklamationen
Datei: supplier_reklamationen.tsx

- Lädt Reklamationen server-seitig gefiltert nach lieferant (activeLieferantId), sortiert nach created_date (neueste zuerst).
- Zusätzliche Queries: ALLE Bestellungen (.list), ALLE Restaurants (.list), ALLE Lieferanten.
- Filter: Status + Suchtext (Bestellung, Restaurant, Beschreibung).
- KPIs: Anzahl nach Status (offen, in_bearbeitung, geloest, abgelehnt).
- Probleme:
  - O(n²)-Lookups: getBestellungNummer / getRestaurantName in Filter + Render.
  - Lädt alle Bestellungen/Restaurants, obwohl wenige benötigt werden.
  - Duplizierte Status-/Typ-Configs wie auf anderen Pages.
  - Kein Error-Handling, schwache Loading-States.

  ## Lieferant Lagerbestand
Datei: supplier_lagerbestand.tsx

- Lädt Produkte server-seitig gefiltert nach lieferant (activeLieferantId), Polling alle 2s.
- Felder: current_stock, stock_status, min_stock, standard_preis, kategorie, einheit.
- Aktionen: Bestand im Input ändern, Status optional manuell setzen, Button "Speichern" pro Produkt.
- Beim Speichern: current_stock + stock_status werden via Mutation aktualisiert, danach Query-Invalidation für ['produkte'] und ['produkte-lagerbestand'].
- Probleme:
  - Aggressives Polling (2s) überschreibt lokale Edits (Race Condition).
  - Keine Validierung (negative/zu große/ungültige Werte möglich).
  - Kein Optimistic Update, schlechtes UX bei langsamen Requests.
  - Query-Invalidation zu global (betrifft auch Produktkatalog).






