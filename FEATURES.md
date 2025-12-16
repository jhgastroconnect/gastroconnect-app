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

## F6 – Restaurant Bestellübersicht Cleanup (nur Struktur)

Ziel:
- Performance verbessern und Code aufräumen ohne Logikänderung.

ToDo:
- lieferantenMap mit useMemo einführen (id → Lieferant) für O(1)-Lookups.
- Status-Konfiguration in ORDER_STATUS / getStatusConfig zentralisieren (wie Supplier-Dashboard).
- Restaurant-Query perspektivisch auf .get(activeRestaurantId) umstellen (nur 1 Restaurant).
- Filter-Pipeline lesbarer machen (eine zentrale Funktion für gefilterteBestellungen).
- Exportdaten in Helper-Funktion auslagern, optional erst bei Export-Klick berechnen (aber Verhalten jetzt nicht ändern).
- JSX von komplexer Bedingungslogik entlasten (kleine Helper-Funktionen für Status-/ETA-/Verspätungs-Anzeige).

## F7 – Bestellung Detail Modal Cleanup (nur Struktur)

Ziel:
- Performance verbessern und Code aufräumen ohne Verhalten zu ändern.

ToDo:
- produktMap mit useMemo einführen (id → Produkt) für O(1)-Lookups.
- Query für Produkte perspektivisch auf filter({ id__in: [...] }) umstellen (jetzt nur vorbereiten, Verhalten gleich lassen).
- Status-Config an zentrale ORDER_STATUS/getStatusConfig anpassen (kein eigener Block mehr).
- Error-/Loading-Handling für Positionen und Dokumente ergänzen.
- Hilfsfunktionen für Produktnamen/Einheit und Status-/ETA-/Verspätungsanzeige aus JSX herausziehen.

## F8 – Restaurant Reklamationen Cleanup

Ziel:
- Reklamations-Page für Restaurants lesbarer und performanter machen, ohne Verhalten zu ändern.

ToDo:
- Lieferanten-/Status-Lookups über Maps (useMemo) statt wiederholtem Array.find in Render-Loops.
- Status-Badges an das zentrale Status-System (ORDER_STATUS / getStatusConfig) angleichen oder intern konsistent bündeln.
- Filter- und Sortierlogik in eine klar strukturierte Hilfsfunktion auslagern (statt Logik direkt im JSX).
- Loading- und Error-Handling ergänzen (statt leerer Liste als Fallback).
- Navigation zu Bestellung / Reklamation über klare Helper-Funktionen kapseln.

## F9 – Lieferant Reklamationen Cleanup

Ziel:
- Lieferanten-Reklamationsseite performanter und lesbarer machen, ohne Verhalten zu ändern.

ToDo:
- bestellungenMap und restaurantMap mit useMemo einführen (id → Entity) und überall statt Array.find verwenden.
- Status-/Typ-Konfiguration im File bündeln und an bestehendes Status-System anlehnen (kein neues Import-File anlegen).
- Filter-/Suchlogik in eine gut lesbare Hilfsfunktion auslagern.
- KPI-Berechnung auf einen einzigen Durchlauf über das Array reduzieren.
- Loading-/Error-Handling für alle Queries ergänzen (statt leerer Arrays als Fallback).
- Nur Kommentare/TODOs für bessere Queries (id__in) ergänzen, aber noch keine Backend-Änderungen vornehmen.

## F10 – Lieferant Lagerbestand Stabilisierung

Ziel:
- Lagerbestand-Seite stabil und pilot-tauglich machen (Race Conditions entfernen, Datenqualität sichern).

ToDo:
- Polling nur aktiv, wenn:
  - Tab sichtbar (document.hidden === false)
  - kein Produkt im Edit-Mode ist (editingStocks leer)
  - Intervall auf ca. 10s reduzieren statt 2s.
- Strikte Validierung vor Save:
  - keine negativen Werte
  - sinnvoller Max-Wert (z.B. 0–999999)
  - nur numerische Werte akzeptieren.
- Anzeige klar trennen:
  - Unterschied zwischen "0 Bestand" (out_of_stock) und "nicht getrackt" (current_stock === null).
- Optimistic Update für updateStockMutation:
  - Query-Daten sofort mit neuem Bestand/Status updaten.
  - Rollback bei Fehler.
- Query-Invalidation einschränken:
  - nur ['produkte-lagerbestand', activeLieferantId] invalidieren, nicht global ['produkte'].
- Optional: einfacher "Abbrechen" Button pro Zeile, der lokale Edits verwirft.

## F11 – Admin Reklamationen Cleanup

Ziel:
- Admin-Reklamationsseite skalierbar und wartbar machen, ohne Verhalten zu ändern (weiterhin read-only).

ToDo:
- Query-Strategie vorbereiten:
  - Reklamationen laden, IDs für bestellung/restaurant/lieferant extrahieren.
  - TODO-Kommentare für spätere Umstellung auf id__in-Queries ergänzen
    (aber aktuell noch keine Backend-Änderung durchführen).
- Lookup-Performance:
  - bestellungenMap, restaurantsMap, lieferantenMap mit useMemo einführen (id → Entity).
  - Alle Array.find-Lookups in Filter, Render und Modal-Props auf O(1)-Map-Lookups umstellen.
- Status-/Typ-Konfiguration:
  - statusConfig und typConfig im File zentral bündeln und an bestehende Reklamations-Configs angleichen
    (keine neue globale Config-Datei anlegen, nur Konsistenz im File herstellen).
- Filter-/Search-Logik:
  - Filter- und Suchlogik in eine klar strukturierte Helper-Funktion auslagern
    (keine Logik direkt im JSX).
- KPIs:
  - KPI-Berechnung (offen / in_bearbeitung / geloest / abgelehnt) auf einen einzigen Durchlauf über reklamationen reduzieren.
- Loading/Error:
  - isLoading / isError für alle Queries nutzen und klar getrennte Loading-/Error-/Empty-States anzeigen.

  ## F12 – Admin Bestellungen Cleanup

Ziel:
- Admin-Bestellübersicht performanter und wartbarer machen, ohne Verhalten zu ändern (weiterhin read-only + Export).

ToDo:
- Lookup-Performance:
  - restaurantsMap und lieferantenMap mit useMemo einführen (id → Entity).
  - Alle Array.find-Lookups in Filter, Render und Export auf Map-Lookups umstellen.
- Query-/Error-Handling:
  - staleTime und isError/isLoading für alle drei Queries (Bestellungen, Restaurants, Lieferanten) setzen.
  - Klar getrennte Loading-/Error-/Empty-States anzeigen.
  - TODO-Kommentar für spätere id__in-Umstellung (aber jetzt keine Backend-Änderung).
- Filter-/Search-Logik:
  - Filter-/Suchlogik in eine eigene Helper-Funktion auslagern (statt alles inline in useMemo).
- Status-Konfiguration:
  - getStatusConfig in eine konsistente ORDER_STATUS-Konfiguration im File umbauen (keine neue globale Config-Datei in F12).
  - Translation-Keys vereinheitlichen.
- KPIs (optional, wenn noch Zeit):
  - Einfache Stat-Cards (Anzahl Bestellungen je Status) mit Single-Pass-Berechnung.

  ## F13 – Admin Produkte Cleanup

Ziel:
- Admin-Produktübersicht performanter und wartbarer machen, ohne Verhalten zu ändern (weiterhin read-only Liste).

ToDo:
- Query/Lookup:
  - lieferantenMap mit useMemo einführen (id → Entity).
  - Alle Array.find-Lookups für Lieferanten auf Map-Lookups umstellen.
  - filteredProdukte in useMemo kapseln.
  - staleTime und isError/isLoading für Produkte- und Lieferanten-Queries setzen.
  - TODO-Kommentar für spätere id__in-Queries (noch keine Backend-Änderung).

- Filter-/Suchlogik:
  - Filter-/Search-Logik in eine eigene Helper-Funktion auslagern (statt direkt im JSX).
  - Suchfeld klar dokumentieren (aktuell nur Name).

- Kategorien:
  - Hardcoded KATEGORIEN-Array beibehalten, aber mit TODO kommentieren
    (später dynamisch aus DB / Config laden).
  - Kategorie-Filter-Logik klar strukturieren.

- Status/KPIs (optional, wenn Zeit):
  - Einfache KPI-Berechnung (z.B. Gesamtanzahl Produkte, Anzahl pro Kategorie) in einem Durchlauf.
  - Noch keine neuen Status-Felder einführen, nur Struktur vorbereiten (Kommentare).

  ## F14 – Admin Lieferanten Cleanup

Ziel:
- Admin-Lieferantenübersicht technisch an F11–F13 angleichen (Query-Handling, Status-Config, KPIs), Verhalten beibehalten.

ToDo:
- Query-/Error-Handling:
  - Lieferanten-Query mit `staleTime` ausstatten.
  - `isError`/`error` auslesen und eine einfache Error-UI mit Retry anzeigen.
  - Loading-Skeleton für initialen Load beibehalten.

- Filter-Logik:
  - Filter-/Search-Logik in eine eigene Helper-Funktion auslagern (statt inline im useMemo).
  - useMemo weiter nutzen, aber Abhängigkeiten klar halten.

- Status-Konfiguration:
  - Inline `getStatusBadge` in eine top-level `LIEFERANT_STATUS`-Konfiguration umbauen.
  - Struktur: `{ labelKey, className, optional icon }`.
  - Einheitliche Benennung (approved/pending/rejected ↔ aktiv/ausstehend/abgelehnt).

- KPIs:
  - Einfache StatCards für Lieferanten-Status:
    - Gesamt
    - approved
    - pending
    - rejected
  - Single-Pass über `allLieferanten` für die Zählung.

- Empty State:
  - Speziellen Empty-State einführen, wenn keine Lieferanten (oder Filter zu streng).

## F15 – Admin Restaurants Cleanup

Ziel:
- Admin-Restaurantübersicht technisch an F11–F14 angleichen (Query-Handling, Status-Config, KPIs), Verhalten beibehalten.
- Unterschied `approved` vs. `active` dokumentieren, aber Business-Logik nicht ändern.

ToDo:
- Query-/Error-Handling:
  - Restaurants-Query mit `staleTime` (z.B. 5 Min) ergänzen.
  - `isError`/`error` auslesen und eine einfache Error-UI mit Retry-Button anzeigen.
  - Loading-Skeleton für initialen Load beibehalten.

- Filter-Logik:
  - Filter-/Search-Logik in eine eigene Helper-Funktion auslagern (z.B. `filterRestaurants`).
  - `useMemo` für gefilterte Liste beibehalten, Dependencies klar halten.

- Status-Konfiguration:
  - Inline `getStatusBadge` in eine top-level `RESTAURANT_STATUS`-Konfiguration umbauen.
  - Struktur: `{ labelKey, className, optional icon, optional description }`.
  - Statuswerte: `approved`, `active`, `pending`, `rejected`.
  - Nur Dokumentation/Texte anpassen, Status-Workflow nicht ändern.
  - Translation Keys auf Deutsch angleichen (konsistent mit F14), inkl. TODO-Kommentar zur genauen Unterscheidung `approved` vs. `active`.

- KPIs:
  - Einfache StatCards für Restaurant-Status:
    - Gesamt
    - approved
    - active (falls im Datenmodell genutzt)
    - pending
    - rejected
  - Zählung in einem Durchlauf über `allRestaurants`.

- Empty State:
  - Speziellen Empty-State einführen, wenn gefilterte Liste leer ist (inkl. Hinweis auf Filter).
  - Separater Text für „keine Restaurants im System“ vs. „Filter liefert 0 Ergebnisse“.

- Code-Organisation:
  - `FIELDS`-Array und `RESTAURANT_STATUS` im oberen Config-Bereich der Datei gruppieren.

## F16 – Admin Lieferanten-Gebiete Cleanup

Ziel:
- Admin-Ansicht für Liefergebiete technisch auf Niveau F11–F15 bringen (Performance, Loading/Error, Konsistenz).
- O(n×m)-Lookups eliminieren, server-seitiges Filtering, klare KPIs.

ToDo:
- Queries:
  - Query-Keys vereinheitlichen: `['lieferanten']`, `['liefergebiete']`.
  - Lieferanten server-seitig filtern: `status__in: ['active', 'approved']` (kein client-side Filter).
  - Für beide Queries `staleTime` (5–10 Min), `isLoading`, `isError`, `error`, `refetch`.
  - Loading-Skeleton + Error-UI mit Retry-Button.

- Lookups & Filter:
  - `liefergebietMap` via `useMemo` bauen (Map: lieferantId → Gebiete[]).
  - `getZonenCount` / `getZonenForLieferant` auf Map-Lookups (O(1)) umstellen.
  - Lieferanten-Filter in Helper-Funktion `filterLieferanten` auslagern, `useMemo` behalten.

- Mutations:
  - `createZone`, `updateZone`, `deleteZone` jeweils als `useMutation` definieren.
  - Konsistentes Error-Handling, `invalidateQueries(['liefergebiete'])`, Toasts.
  - `window.confirm` durch `AlertDialog` ersetzen (wie F14/F15).

- KPIs & Empty States:
  - StatCards: Gesamt Lieferanten, Lieferanten mit Gebieten, ohne Gebiete, Gesamt-Gebiete.
  - Single-Pass-Berechnung auf Basis von `lieferanten` + `liefergebietMap`.
  - Empty-State für Liste: unterscheiden „keine Daten“ vs. „Filter liefert 0 Ergebnisse“.

- Vorbereitung:
  - Hardcoded Status-Filter dokumentieren / später an `LIEFERANT_STATUS` (F14) andocken.
  - Basis-Validierung für Zonen (PLZ, Mindestbestellwert ≥ 0, Lieferkosten ≥ 0) vorbereiten.

## F17 – AdminLiefergebiete (Admin-Übersicht Liefergebiete)

- [ ] F17.1 – Queries stabilisieren
  - [ ] `liefergebiete` über `base44.entities.Liefergebiet.list()` mit `staleTime` (5–10 min)
  - [ ] `lieferanten` über `base44.entities.Lieferant.filter({ status__in: ['active', 'approved'] })` mit `staleTime`
  - [ ] `isLoading`, `isError`, `error`, `refetch` für beide Queries nutzen
  - [ ] Gemeinsame Error-UI mit Retry-Button

- [ ] F17.2 – Lookup-Performance
  - [ ] `liefergebietMap` als `useMemo`: `Map<lieferantId, Liefergebiet[]>`
  - [ ] `groupedByLieferant` auf Basis der Map: `{ lieferant, gebiete[] }[]`
  - [ ] Alle direkten `filter(lg => lg.lieferant === l.id)` durch Map-Lookups ersetzen

- [ ] F17.3 – KPIs / StatCards
  - [ ] 4 StatCards einführen:
    - [ ] Gesamt Lieferanten (aktiv/approved)
    - [ ] Lieferanten mit Gebieten
    - [ ] Lieferanten ohne Gebiete
    - [ ] Gesamt Liefergebiete
  - [ ] KPIs in einem einzigen Pass über `groupedByLieferant` / `liefergebiete` berechnen

- [ ] F17.4 – Suche & Filter
  - [ ] Textsuche über Lieferantenname (optional PLZ/Ort) implementieren
  - [ ] Optional: Toggle „nur Lieferanten mit Gebieten“
  - [ ] Filter-Logik in Helper (`filterLieferanten`) auslagern, per `useMemo` anwenden

- [ ] F17.5 – Sortierung
  - [ ] Sort-Key-State: `name` | `zones`
  - [ ] Sort-Richtung: `asc` | `desc`
  - [ ] Sortierung auf gefilterte Gruppen anwenden:
    - [ ] Name A–Z / Z–A
    - [ ] Anzahl Gebiete auf/absteigend

- [ ] F17.6 – Config & Konsistenz
  - [ ] Status-Checks über `LIEFERANT_STATUS` aus `lieferantConfig` abbilden (keine hardcoded Status-Strings)
  - [ ] Leaflet-/Map-Icon-Konfiguration in eigenes Config-File auslagern und hier nur importieren
  - [ ] Farben/Labels an F14/F16 (AdminLieferanten / AdminLieferantenGebiete) angleichen

- [ ] F17.7 – UX-Stati
  - [ ] Loading-Skeleton für: KPI-Zeile, Karte, Liste
  - [ ] Error-View mit kurzer Meldung + Retry
  - [ ] Empty-State:
    - [ ] „Keine Lieferanten“ wenn System leer
    - [ ] „Keine Treffer für Filter“ wenn Filter alles rausnimmt
  - [ ] Karten-Empty-State mit Hinweis auf Anzahl Lieferanten ohne Koordinaten

## 18 – LieferantBestellungen (Lieferanten-Order-Dashboard)

Ziel:
- Performantes, stabiles Bestell-Dashboard für Lieferanten
- Server-Last drastisch reduzieren, trotzdem „nah Echtzeit“
- Gleiche Qualitäts-Standards wie F12 (AdminBestellungen)

Scope:
- Nur Lieferanten-View der Bestellungen (Bestellung.filter({ lieferant: activeLieferantId }))
- Batch-Actions behalten (Status-Updates auf mehrere Orders)
- Favoriten-Logik für Restaurants behalten
- Kein Redesign vom UI-Layout, nur Performance/Struktur/Robustheit

Funktionale Anforderungen:
- Filter:
  - Status-Filter (alle relevanten Order-Status, wie in F12)
  - Restaurant-Filter (nur tatsächlich vorkommende Restaurants)
  - Datumsbereich (von/bis)
  - Textsuche (Bestellnummer + Restaurantname)
- Liste:
  - Sortierung absteigend nach bestelldatum (neueste zuerst)
  - Checkboxen für Multi-Select
  - Status-Badges konsistent mit ORDER_STATUS (F12)
- Batch-Actions:
  - Bestehende ORDER_BATCH_ACTIONS weiter nutzen (confirm, prepare, ship, …)
  - Batch-Update über Mutation, Query-Invalidation nach Success
- KPIs:
  - Offene Bestellungen (gesendet + bestätigt)
  - In Bearbeitung (in_vorbereitung + unterwegs)
  - Geliefert (in Zeitraum)
  - Gesamtumsatz (gefilterte Bestellungen)
- Fehler- und Loading-Handling:
  - Kombinierter Loading-State für Bestellungen + Restaurants
  - Error-State mit Retry-Button
  - Sauberer Empty-State (keine Daten vs. Filter zu streng)

## F19 – RestaurantBestellungen (Restaurant-Order-Dashboard)

Ziele:
- Server-Last massiv reduzieren (Auto-Refresh + Overfetching fixen)
- Performance & Lookups optimieren
- Restaurant-Dashboard mit KPIs ergänzen
- Status-Handling an ORDER_STATUS (F12/F18) angleichen

Umfang (MVP F19):

1) Query-Optimierung
- Bestellungen:
  - Weiterhin: filter({ restaurant: activeRestaurantId })
  - refetchInterval von 3000 ms → 30000 ms (30s)
  - staleTime: 2 * 60 * 1000
  - refetchOnWindowFocus: true, aber nutzt staleTime
- Lieferanten:
  - Statt list(): nur benötigte laden (id__in aus Bestellungen)
  - Falls id__in aktuell nicht verfügbar: TODO-Kommentar + vorerst list() mit staleTime 5–10min
- Restaurants:
  - Statt list(): get(activeRestaurantId) oder useContext für aktives Restaurant
  - Query-Key alignen mit anderen Pages (['restaurants'] / ['restaurant', activeRestaurantId])

2) Lookup-Performance (Maps)
- useMemo:
  - supplierMap = new Map(lieferanten.map(l => [l.id, l]))
  - optional: restaurantMap, falls mehrere Restaurants relevant sind
- Alle Array.find durch Map-Lookups ersetzen:
  - getLieferant / getLieferantName / getLieferantEmail → supplierMap.get(id)
- uniqueLieferanten für Filter aus Map ableiten (kein filter + includes mehr)

3) KPIs / StatCards
- Neue StatCards oben einführen (analog F12/F18):
  - Offene Bestellungen (gesendet + bestätigt + in_vorbereitung + unterwegs + verspaetet)
  - Geschlossene Bestellungen (geliefert + storniert)
  - Gesamtausgaben (Summe aller nicht-stornierten Bestellungen)
  - Top-Lieferant (Name + Anzahl Bestellungen)
- Berechnung in einem useMemo über bestellungen

4) Status-Config zentralisieren
- ORDER_STATUS aus gemeinsamer orderConfig.js importieren (wie bei F12/F18)
- OFFENE_STATUS / GESCHLOSSENE_STATUS aus ORDER_STATUS ableiten (category: 'open' | 'closed')
- Inline getStatusConfig entfernen, Badge-Styles über ORDER_STATUS[status] beziehen
- Optional Icons (z.B. Package, Truck, CheckCircle, XCircle) wie F12/F18

5) Filter- & Tab-Logik
- Tab-Filter (offen/geschlossen) + Detail-Filter (Datum, Lieferant, Status) in eine zentrale Filter-Funktion packen:
  - filterBestellungen({ bestellungen, activeTab, filters, supplierMap })
- gefilterteBestellungen per useMemo, basierend auf dieser Funktion
- Sortierung (neueste zuerst) in derselben Pipeline belassen

6) Error- & Loading-Handling
- useQuery für Bestellungen + Lieferanten + Restaurant:
  - isError, error, refetch verwenden
- Error-UI:
  - Kompakte Card mit Fehlertext + Retry-Button (refetch())
- Loading:
  - Bestehende Skeletons behalten, aber für alle relevanten Daten denken (nicht nur Bestellungen)

7) UX-Polish (MVP)
- Empty States beibehalten (sind schon sehr gut), nur Icons ggf. Tab-spezifisch machen:
  - Offen: Package/Clock
  - Geschlossen: CheckCircle
- Navigation für "Problem melden":
  - window.location.href → useNavigate(createPageUrl('RestaurantReklamationen') + '?bestellung=' + id)
- DEFAULT_RESTAURANT_ID: TODO in Config/Env auslagern












