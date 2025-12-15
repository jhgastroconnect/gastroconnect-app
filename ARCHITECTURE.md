# Architektur Überblik GastroConnect (Base44-Stand)

Rollen:
- Admin
- Lieferant
- Restaurant

Wichtige Seiten (bisher gesichert):
- product_catalog_restaurant.json → Produktkatalog / Bestellansicht Restaurant
- orders_supplier_dashboard.json → Tagesübersicht / Bestellungen Lieferant

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
Zweck: Aktuellen Warenkorb anzeigen, Menge ändern, Bestellung auslösen.

## Restaurant Bestellungen Liste
Datei: restaurant_orders_list.tsx
Zweck: Historie / Status der Bestellungen des Restaurants anzeigen.

