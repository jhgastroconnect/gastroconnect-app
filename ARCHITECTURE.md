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
Zweck: Historie / Status der Bestellungen des Restaurants anzeigen.

