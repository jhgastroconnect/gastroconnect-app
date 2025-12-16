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

## Admin Produkte
Datei: AdminProdukte.jsx

Zweck:
- Admin-Übersicht aller Produkte im System.
- Filter: Kategorie (hardcoded Liste), Textsuche nach Produktname.
- Anzeige: Name, Kategorie, Lieferant, Preis.

Datenquellen:
- Produkte: base44.entities.Produkt.list()
  → lädt aktuell alle Produkte, keine Sortierung, keine staleTime.
- Lieferanten: base44.entities.Lieferant.list()
  → lädt alle Lieferanten, nur für Anzeige des Lieferantennamens.
- Kategorien: derzeit als lokales KATEGORIEN-Array im Code definiert, nicht aus DB.

Logik:
- Filter-Pipeline:
  1) Kategorie-Filter (KATEGORIEN Array, inkl. „Alle“).
  2) Textsuche auf Produktname (case-insensitive).
- Sortierung:
  - keine server- oder clientseitige Sortierung.
- Lookups:
  - getLieferantName(id) nutzt Array.find auf der kompletten lieferanten-Liste.
  - Lookups werden im Render-Loop aufgerufen.

Probleme:
- Overfetching: alle Lieferanten per .list(), keine id__in-Strategie.
- O(n)-Lookups in Render-Loops (getLieferantName per Array.find).
- filteredProdukte ohne useMemo → Filter läuft bei jedem Render.
- Keine staleTime, kein Error-Handling für Queries.
- Hardcoded Kategorien (nicht skalierbar, nicht konsistent mit anderen Pages).
- Keine Status-/Stock-Anzeige, keine Admin-Aktionen (read-only Liste).

## Admin Lieferanten
Datei: AdminLieferanten.jsx

Zweck:
- Admin-Übersicht aller Lieferanten im System.
- Verwaltung: Anlegen, Bearbeiten, Löschen.
- Filter: Status (approved/pending/rejected), Textsuche (Name, E-Mail, PLZ, Ort).
- CSV-Export der gefilterten Lieferanten.

Datenquellen:
- Lieferanten: base44.entities.Lieferant.list()
  → lädt alle Lieferanten, keine Sortierung, keine staleTime.

Logik:
- Filter-Pipeline (useMemo):
  1) Status-Filter (approved/pending/rejected/alle)
  2) Textsuche über Name, E-Mail, PLZ, Ort (case-insensitive)
- Sortierung:
  - aktuell keine server- oder clientseitige Sortierung.
- Status-Badge:
  - getStatusBadge(status) mit inline-Konfiguration (labelKey + CSS-Klasse).

Aktionen:
- Erstellen/Bearbeiten:
  - LieferantEditDialog (Modal) mit saveMutation (create/update).
- Löschen:
  - deleteMutation mit AlertDialog und klarer Cascade-Warnung.
- Export:
  - CSV-Export basierend auf gefilterten Lieferanten.

Probleme:
- Keine staleTime, kein isError/error für die Lieferanten-Query.
- Status-Konfiguration inline, nicht konsistent mit anderen Status-Configs.
- Filter-Logik direkt im useMemo, nicht ausgelagert.
- Keine KPIs/StatCards (nur „x von y Lieferanten“).
- Kein spezieller Empty State bei 0 Lieferanten.

## Admin Restaurants
Datei: AdminRestaurants.jsx

Zweck:
- Admin-Übersicht aller Restaurants im System.
- Verwaltung: Anlegen, Bearbeiten, Löschen.
- Filter: Status (approved/active/pending/rejected), Textsuche (Name, E-Mail, PLZ, Ort).
- CSV-Export der gefilterten Restaurants.

Datenquellen:
- Restaurants: `base44.entities.Restaurant.list()`
  → lädt alle Restaurants, keine Sortierung, keine staleTime.

Logik:
- Filter-Pipeline (useMemo):
  1) Status-Filter (approved/active/pending/rejected/alle)
  2) Textsuche über Name, E-Mail, PLZ, Ort (case-insensitive)
- Sortierung:
  - aktuell keine server- oder clientseitige Sortierung.
- Status-Badge:
  - `getStatusBadge(status)` mit inline-Konfiguration (labelKey + CSS-Klasse).
  - Statuswerte: `approved`, `active`, `pending`, `rejected` (Bedeutung von `approved` vs. `active` aktuell nicht dokumentiert).

Aktionen:
- Erstellen/Bearbeiten:
  - `EntityEditDialog` (generic Modal mit `FIELDS`-Config) + `saveMutation` (create/update).
- Löschen:
  - `deleteMutation` mit AlertDialog und klarer Cascade-Warnung (löscht Bestellungen, Dokumente, Preislisten, Bestellvorlagen, Benachrichtigungen).
- Export:
  - CSV-Export basierend auf gefilterten Restaurants.

Probleme:
- Keine `staleTime`, kein `isError/error` für die Restaurants-Query.
- Status-Konfiguration inline, nicht konsistent zu anderen Status-Configs (F11–F14).
- Filter-Logik direkt im useMemo, nicht ausgelagert.
- Keine KPIs/StatCards (nur „x von y Restaurants“).
- Kein spezieller Empty State bei 0 Restaurants.
- Semantik von `approved` vs. `active` nicht beschrieben (Business-Logik TODO).

## Admin Lieferanten-Gebiete
Datei: AdminLieferantenGebiete.jsx

Zweck:
- Admin-Übersicht der Liefergebiete pro Lieferant.
- Kombination aus Liste (Lieferanten + Zonen) und Karte (Marker).
- Verwaltung von Liefergebieten über Modal (LieferzoneDialog): Anlegen, Bearbeiten, Löschen.

Datenquellen:
- Lieferanten: `base44.entities.Lieferant.list()`
  - aktuell client-seitig gefiltert auf `status === 'active' || 'approved'`
  - Query-Key: `['lieferanten-admin']`, ohne `staleTime`, ohne Error-Handling
- Liefergebiete: `base44.entities.Liefergebiet.list()`
  - lädt alle Gebiete (keine Filter)
  - Query-Key: `['liefergebiete-admin']`, ohne `staleTime`, ohne Error-Handling

Logik:
- Textsuche (`searchText`) auf Lieferanten:
  - Name, Ort, PLZ (multi-field), via `useMemo` gefiltert.
- Zonen je Lieferant:
  - `getZonenCount(lieferantId)` und `getZonenForLieferant(lieferantId)` aktuell via `Array.filter` direkt auf `liefergebiete` (O(n×m)).
- Map:
  - `lieferantenMitKoordinaten` gefiltert, `mapMarkers` via `useMemo` gebaut (Marker + Popup-Infos).
- UI:
  - Liste aller aktiven/freigegebenen Lieferanten inkl. Anzahl Zonen.
  - Button „Gebiete verwalten“ → Modal zeigt Zonen-Tabelle + „Neu“-Button.

Probleme:
- Client-side Status-Filter für Lieferanten statt server-seitig.
- Keine `staleTime`, kein Loading-/Error-Handling.
- Query-Keys inkonsistent zu anderen Admin-Pages.
- Performance: O(n×m) durch mehrfaches `filter` in Render/Modal.
- Mutations-Mix: Create/Update inline `async`, Delete mit `useMutation` + `window.confirm`.
- Keine KPIs/StatCards (z.B. Lieferanten mit/ohne Gebiete, Anzahl Gebiete).
- Kein sauberer Empty-State für Liste (nur Modal hat „keine Gebiete“).

## Admin Liefergebiete

AdminLiefergebiete.jsx
│
├── useQuery(['lieferanten'], list({status__in:['active','approved']}))
│       → liefert aktive Lieferanten
│
├── useQuery(['liefergebiete'], list())
│       → liefert alle Gebiete
│
├── useMemo: liefergebietMap (O(1) Lookup)
│       LieferantID → [Gebiete]
│
├── useMemo: groupedByLieferant
│       Für jede Lieferant:
│           { lieferant, gebiete: liefergebietMap.get(id) }
│
└── UI:
        ├── StatCards (4 KPIs)
        ├── Map (Leaflet)
        ├── Lieferanten-Liste
        └── LiefergebietEditor (CRUD pro Lieferant)

        

## Architektur – LieferantBestellungen (F18)

Daten & Queries:
- activeLieferantId:
  - Ermittlung wie in anderen Lieferanten-Pages (impersonation → user-mapping → DEFAULT_LIEFERANT_ID aus Config)
- Query 1: Lieferanten-Bestellungen
  - key: ['lieferant-bestellungen', activeLieferantId]
  - fn: Bestellung.filter({ lieferant: activeLieferantId })
  - Optionen:
    - staleTime: 2 * 60 * 1000
    - refetchInterval: 30000 (30s, nur wenn Tab aktiv)
    - refetchOnWindowFocus: true (nutzt staleTime)
  - Rückgabe: bestellungen, isLoading, isError, error, refetch
- Query 2: Restaurants für diese Bestellungen
  - restaurantIds = unique(bestellungen.map(b => b.restaurant))
  - Wenn restaurantIds leer: Query deaktivieren
  - key: ['restaurants', { ids: restaurantIds }]
  - fn: Restaurant.filter({ id__in: restaurantIds })
  - staleTime: 5 * 60 * 1000
- Optional: Lieferant-Details
  - Wenn benötigt: Lieferant.get(activeLieferantId) statt list()

Lookup-Struktur:
- restaurantMap:
  - useMemo(() => new Map(restaurants.map(r => [r.id, r])), [restaurants])
  - Helper:
    - getRestaurant(id) → restaurantMap.get(id) || null
    - getRestaurantName(id) → restaurantMap.get(id)?.name || '–'
- uniqueRestaurants:
  - useMemo(
      () => [...new Set(bestellungen.map(b => b.restaurant))]
            .map(id => restaurantMap.get(id))
            .filter(Boolean),
      [bestellungen, restaurantMap]
    )

Filter-Pipeline (useMemo):
- Input: bestellungen, statusFilter, restaurantFilter, vonDatum, bisDatum, searchText
- Schritte:
  1. Status-Filter
  2. Restaurant-Filter
  3. Datumsbereich
  4. Textsuche:
     - Bestell-ID
     - Restaurantname über restaurantMap
  5. Sortierung: new Date(b.bestelldatum) DESC

KPIs (useMemo, Single-Pass):
- Loop über filteredBestellungen:
  - counts nach Status (gesendet, bestätigt, in_vorbereitung, unterwegs, geliefert, storniert)
  - sumRevenue: Summe gesamtsumme/netto
- Darstellung als StatCards in Header wie bei F12

Status-Config:
- ORDER_STATUS zentral in /src/config/orderConfig.ts (oder ähnlich)
- LieferantBestellungen:
  - Import ORDER_STATUS
  - Filter-Dropdown baut Optionen aus ORDER_STATUS
  - BestellungRow nutzt ORDER_STATUS für Badges/Labels
  - Keine hardcoded Status-Strings im JSX

Batch-Actions:
- State:
  - selectedIds: Set<string>
  - batchAction: 'confirm' | 'prepare' | 'ship' | null
- UI:
  - Checkbox pro Zeile + "select all"
  - BatchActionBar zeigt Anzahl selektierter Orders
- Mutation:
  - batchUpdateMutation(useMutation):
    - mutationFn({ ids, newStatus }) → Promise.all(Bestellung.update(id, { status: newStatus }))
    - onSuccess:
      - invalidateQueries(['lieferant-bestellungen', activeLieferantId])
      - Toast + clearSelection()
    - Optional onMutate für Optimistic Updates (später)

Fehler- und Loading-Handling:
- Loading:
  - wenn isLoading (bestellungen) oder restaurantsLoading:
    - Skeleton für KPIs + Table
- Error:
  - Wenn isError:
    - Error-Card mit Fehlertext + „Erneut laden“-Button (refetch)
- Empty:
  - Wenn !isError && !isLoading && filteredBestellungen.length === 0:
    - Wenn bestellungen.length === 0 → „Noch keine Bestellungen“
    - Sonst → „Keine Ergebnisse – Filter zurücksetzen“

Konfiguration:
- DEFAULT_LIEFERANT_ID aus zentraler Config, nicht hardcoded im Component
- Auto-Refresh-Interval (30s) ebenfalls aus Config, falls mehrfach genutzt









