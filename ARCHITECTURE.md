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

  ## Admin Reklamationen
Datei: AdminReklamationen.jsx

Zweck:
- Zentrale Übersicht aller Reklamationen im System (globaler Admin-Blick).
- Filter nach Status, Restaurant, Lieferant, Suchtext.
- KPI-Cards (Anzahl offen / in Bearbeitung / gelöst / abgelehnt).
- Detail-Ansicht via ReklamationDetailModal (inkl. Bestellung/Restaurant/Lieferant).

Datenquellen:
- Reklamationen: base44.entities.Reklamation.list('-created_date')
  → alle Reklamationen, nach Erstellungsdatum absteigend.
- Bestellungen: base44.entities.Bestellung.list()
  → aktuell ALLE Bestellungen (Overfetching).
- Restaurants: base44.entities.Restaurant.list()
  → aktuell ALLE Restaurants (Overfetching).
- Lieferanten: base44.entities.Lieferant.list()
  → aktuell ALLE Lieferanten.

Logik:
- Filter-Pipeline:
  1) Status-Filter (offen / in_bearbeitung / geloest / abgelehnt)
  2) Restaurant-Filter
  3) Lieferanten-Filter
  4) Suchtext (Bestellnummer, Restaurantname, Lieferantenname, Beschreibung)
- KPIs über mehrfaches Array.filter auf reklamationen.
- Detail-Modal erhält entspr. Entities via Array.find in den großen Listen.

Probleme:
- Massive Overfetching (Bestellungen/Restaurants/Lieferanten per .list statt id__in).
- O(n²)-Lookups durch Array.find in Filter und Render-Loop.
- Duplizierte statusConfig/typConfig (auch in anderen Reklamations-Komponenten).
- Keine staleTime, kein differenziertes Error-Handling.
- Admin-spezifische Aktionen (Status-Änderung, Zuweisung, Kommentare) noch nicht implementiert.

## Admin Bestellungen
Datei: AdminBestellungen.jsx

Zweck:
- Zentrale Übersicht aller Bestellungen im System (Admin-Sicht).
- Filter: Status, Restaurant, Lieferant, Datum (von/bis), Suchtext.
- CSV-Export der gefilterten Bestellungen.

Datenquellen:
- Bestellungen: base44.entities.Bestellung.list('-bestelldatum')
  → alle Bestellungen, nach Datum absteigend.
- Restaurants: base44.entities.Restaurant.list()
  → aktuell ALLE Restaurants, nur für Anzeige/Filter.
- Lieferanten: base44.entities.Lieferant.list()
  → aktuell ALLE Lieferanten, nur für Anzeige/Filter.

Logik:
- Filter-Pipeline:
  1) Status-Filter
  2) Restaurant-Filter
  3) Lieferanten-Filter
  4) Datumsbereich (von/bis)
  5) Suchtext (Bestellnummer, Restaurantname, Lieferantenname)
- Sortierung: server-seitig via -bestelldatum.
- Lookup-Helfer: getRestaurantName / getLieferantName (Array.find in großen Arrays).
- Export: ExportButton mit exportData (nutzt dieselben Lookups).

Probleme:
- Overfetching: Restaurants/Lieferanten per .list() (keine id__in-Strategie).
- O(n²)-Lookups in Filter, Render, Export durch Array.find.
- Status-Config inline definiert und dupliziert zu anderen Bestellungs-Views.
- Kein combined Error-Handling, nur Loading für Bestellungen.
- Keine KPIs/Statistiken für Admin.







