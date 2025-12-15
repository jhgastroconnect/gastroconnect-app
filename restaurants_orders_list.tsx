import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye, FileText, AlertTriangle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { createPageUrl } from '@/utils';
import BestellungFilters from '@/components/restaurant/BestellungFilters';
import BestellungDetailModal from '@/components/restaurant/BestellungDetailModal';
import { useRole } from '@/components/RoleContext';
import ExportButton from '@/components/ui/ExportButton';
import { CSV_COLUMNS } from '@/components/utils/csvExport';
import { useTranslation } from '@/components/utils/translations';
import EntityNameLink from '@/components/profile/EntityNameLink';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

/**
 * Zentrale Status-Konfiguration für Bestellungen
 * Verwendung: const config = ORDER_STATUS[status]
 */
const ORDER_STATUS = {
  gesendet: {
    labelKey: 'offen',
    className: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  bestätigt: {
    labelKey: 'bestaetigt',
    className: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  in_vorbereitung: {
    labelKey: 'inVorbereitungLabel',
    className: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  unterwegs: {
    labelKey: 'unterwegs',
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200'
  },
  geliefert: {
    labelKey: 'geliefert',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  storniert: {
    labelKey: 'storniert',
    className: 'bg-red-100 text-red-800 border-red-200'
  },
  verspaetet: {
    labelKey: 'verspaetet',
    className: 'bg-amber-100 text-amber-800 border-amber-200'
  }
} as const;

// Status-Kategorien
const OFFENE_STATUS = ['gesendet', 'bestätigt', 'in_vorbereitung', 'unterwegs', 'verspaetet'];
const GESCHLOSSENE_STATUS = ['geliefert', 'storniert'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Erstellt eine Map für schnellen Lieferanten-Lookup
 * @param lieferanten - Array von Lieferant-Objekten
 * @returns Map mit lieferant.id als Key
 */
function createSupplierMap(lieferanten: any[]): Map<string, any> {
  return new Map(lieferanten.map(l => [l.id, l]));
}

/**
 * Gibt Status-Konfiguration zurück (Label + CSS-Klassen)
 * @param status - Status-String der Bestellung
 * @param t - Translation-Funktion
 */
function getStatusConfig(status: string, t: (key: string) => string) {
  const config = ORDER_STATUS[status as keyof typeof ORDER_STATUS] || ORDER_STATUS.gesendet;
  return {
    label: t(config.labelKey),
    className: config.className
  };
}

/**
 * Prüft ob eine Bestellung im angegebenen Datums-Range liegt
 */
function isInDateRange(bestelldatum: string, vonDatum: string, bisDatum: string): boolean {
  const bestellDate = new Date(bestelldatum);
  
  // Von-Datum prüfen
  if (vonDatum) {
    const von = new Date(vonDatum);
    if (bestellDate < von) return false;
  }
  
  // Bis-Datum prüfen (Ende des Tages)
  if (bisDatum) {
    const bis = new Date(bisDatum);
    bis.setHours(23, 59, 59, 999);
    if (bestellDate > bis) return false;
  }
  
  return true;
}

/**
 * Filtert und sortiert Bestellungen nach allen Kriterien
 */
function filterAndSortOrders(
  bestellungen: any[],
  filters: {
    vonDatum: string;
    bisDatum: string;
    lieferantFilter: string;
    statusFilter: string;
  }
): any[] {
  const { vonDatum, bisDatum, lieferantFilter, statusFilter } = filters;
  
  return bestellungen
    .filter(b => {
      // Filter 1: Datums-Range
      if (!isInDateRange(b.bestelldatum, vonDatum, bisDatum)) {
        return false;
      }
      
      // Filter 2: Lieferant
      if (lieferantFilter !== 'alle' && b.lieferant !== lieferantFilter) {
        return false;
      }
      
      // Filter 3: Status
      if (statusFilter !== 'alle' && b.status !== statusFilter) {
        return false;
      }
      
      return true;
    })
    // Sortierung: Neueste zuerst
    .sort((a, b) => new Date(b.bestelldatum).getTime() - new Date(a.bestelldatum).getTime());
}

/**
 * Bereitet Bestellungen für CSV-Export vor
 */
function prepareExportData(
  bestellungen: any[],
  supplierMap: Map<string, any>,
  restaurantName: string
): any[] {
  return bestellungen.map(b => ({
    ...b,
    lieferantName: supplierMap.get(b.lieferant)?.name || 'Unbekannt',
    restaurantName: restaurantName,
    bestelldatum: b.bestelldatum 
      ? format(new Date(b.bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de }) 
      : '-'
  }));
}

/**
 * Prüft ob Verspätungs-Info angezeigt werden soll
 */
function shouldShowDelayInfo(bestellung: any): boolean {
  return bestellung.status === 'verspaetet' && !!bestellung.verspaetung_grund;
}

/**
 * Prüft ob ETA angezeigt werden soll
 */
function shouldShowETA(bestellung: any): boolean {
  return !!bestellung.voraussichtliche_lieferung &&
         bestellung.status !== 'geliefert' &&
         bestellung.status !== 'storniert';
}

/**
 * Formatiert Bestelldatum für Anzeige
 */
function formatOrderDate(bestelldatum: string | null): string {
  if (!bestelldatum) return '-';
  return format(new Date(bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Loading Skeleton für Bestellungsliste
 */
function OrderListSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-12 mb-2" />
        ))}
      </div>
    </div>
  );
}

/**
 * Empty State - Keine Bestellungen gefunden
 */
function EmptyOrdersState({
  activeTab,
  hasBaseOrders,
  t
}: {
  activeTab: string;
  hasBaseOrders: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
      <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-slate-900 mb-2">
        {activeTab === 'offen' 
          ? t('keineOffenenBestellungen') 
          : t('keineGeschlossenenBestellungen')}
      </h3>
      <p className="text-slate-500">
        {hasBaseOrders
          ? t('passenSieFilterAn')
          : activeTab === 'offen'
            ? t('alleBestellungenAbgeschlossen')
            : t('nochKeineAbgeschlossen')}
      </p>
    </div>
  );
}

/**
 * Status-Badge mit optionalen Zusatz-Infos (Verspätung, ETA)
 */
function OrderStatusBadge({
  bestellung,
  statusConfig
}: {
  bestellung: any;
  statusConfig: { label: string; className: string };
}) {
  return (
    <div className="flex flex-col gap-1 items-start">
      {/* Haupt-Status Badge */}
      <Badge variant="outline" className={`${statusConfig.className} whitespace-nowrap`}>
        {statusConfig.label}
      </Badge>
      
      {/* Verspätungs-Info */}
      {shouldShowDelayInfo(bestellung) && (
        <span 
          className="text-xs text-amber-600 max-w-[150px] truncate" 
          title={bestellung.verspaetung_grund}
        >
          ⚠️ {bestellung.verspaetung_grund}
        </span>
      )}
      
      {/* ETA-Info */}
      {shouldShowETA(bestellung) && (
        <span className="text-xs text-slate-500">
          ETA: {bestellung.voraussichtliche_lieferung}
        </span>
      )}
    </div>
  );
}

/**
 * Lieferanten-Link oder Fallback-Name
 */
function SupplierLink({
  lieferant,
  activeRestaurantId
}: {
  lieferant: any | undefined;
  activeRestaurantId: string;
}) {
  if (!lieferant) {
    return <span>Unbekannt</span>;
  }
  
  return (
    <EntityNameLink
      entity={lieferant}
      type="supplier"
      currentEntityId={activeRestaurantId}
      className="text-sm font-medium"
    />
  );
}

/**
 * Tabellen-Zeile für eine einzelne Bestellung
 */
function OrderTableRow({
  bestellung,
  supplierMap,
  activeRestaurantId,
  onOpenDetails,
  t
}: any) {
  const statusConfig = getStatusConfig(bestellung.status, t);
  const datum = formatOrderDate(bestellung.bestelldatum);
  const lieferant = supplierMap.get(bestellung.lieferant);
  
  return (
    <tr key={bestellung.id} className="hover:bg-slate-50">
      {/* Datum */}
      <td className="px-4 py-3 text-sm text-slate-600">{datum}</td>
      
      {/* Lieferant */}
      <td className="px-4 py-3 text-sm font-medium text-slate-900">
        <SupplierLink 
          lieferant={lieferant} 
          activeRestaurantId={activeRestaurantId} 
        />
      </td>
      
      {/* Status mit Zusatzinfos */}
      <td className="px-4 py-3">
        <OrderStatusBadge bestellung={bestellung} statusConfig={statusConfig} />
      </td>
      
      {/* Betrag */}
      <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">
        {(bestellung.gesamtbetrag || 0).toFixed(2)} €
      </td>
      
      {/* Lieferschein */}
      <td className="px-4 py-3 text-center">
        {bestellung.lieferschein_url ? (
          <a
            href={bestellung.lieferschein_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700"
          >
            <FileText className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
      
      {/* Aktionen */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onOpenDetails(bestellung)}
          >
            <Eye className="h-4 w-4 mr-1" />
            {t('details')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = createPageUrl('RestaurantReklamationen') + '?bestellung=' + bestellung.id}
            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Problem melden
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RestaurantBestellungen() {
  const { impersonatedRestaurant } = useRole();
  const activeRestaurantId = impersonatedRestaurant || DEFAULT_RESTAURANT_ID;
  const { t } = useTranslation();
  
  // ========== STATE ==========
  const [activeTab, setActiveTab] = useState('offen');
  const [vonDatum, setVonDatum] = useState('');
  const [bisDatum, setBisDatum] = useState('');
  const [lieferantFilter, setLieferantFilter] = useState('alle');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [selectedBestellung, setSelectedBestellung] = useState<any>(null);

  // ========== DATA FETCHING ==========
  
  // Bestellungen für dieses Restaurant (server-seitig gefiltert)
  const { data: bestellungen = [], isLoading } = useQuery({
    queryKey: ['restaurant-bestellungen', activeRestaurantId],
    queryFn: () => base44.entities.Bestellung.filter({ restaurant: activeRestaurantId }),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Alle Lieferanten (für Namen-Lookup)
  // TODO: Könnte optimiert werden - nur benötigte Lieferanten laden
  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  // Alle Restaurants (für Restaurant-Name)
  // TODO: Sollte zu .get(activeRestaurantId) geändert werden - nur 1 Restaurant benötigt
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  // ========== COMPUTED DATA ==========
  
  // Lieferanten-Map für O(1) Lookups statt O(n)
  const supplierMap = useMemo(
    () => createSupplierMap(lieferanten),
    [lieferanten]
  );

  // Aktuelles Restaurant
  const activeRestaurant = useMemo(
    () => restaurants.find(r => r.id === activeRestaurantId),
    [restaurants, activeRestaurantId]
  );

  // Offene Bestellungen (alle Status außer geliefert/storniert)
  const offeneBestellungen = useMemo(
    () => bestellungen.filter(b => OFFENE_STATUS.includes(b.status)),
    [bestellungen]
  );
  
  // Geschlossene Bestellungen (geliefert/storniert)
  const geschlosseneBestellungen = useMemo(
    () => bestellungen.filter(b => GESCHLOSSENE_STATUS.includes(b.status)),
    [bestellungen]
  );

  // Basis-Bestellungen je nach aktivem Tab
  const basisBestellungen = activeTab === 'offen' 
    ? offeneBestellungen 
    : geschlosseneBestellungen;

  // Gefilterte und sortierte Bestellungen
  const gefilterteBestellungen = useMemo(
    () => filterAndSortOrders(basisBestellungen, {
      vonDatum,
      bisDatum,
      lieferantFilter,
      statusFilter
    }),
    [basisBestellungen, vonDatum, bisDatum, lieferantFilter, statusFilter]
  );

  // Export-Daten vorbereiten
  const exportData = useMemo(
    () => prepareExportData(
      gefilterteBestellungen,
      supplierMap,
      activeRestaurant?.name || ''
    ),
    [gefilterteBestellungen, supplierMap, activeRestaurant]
  );

  // ========== EVENT HANDLERS ==========
  
  const handleOpenDetails = (bestellung: any) => {
    setSelectedBestellung(bestellung);
  };

  const handleCloseDetails = () => {
    setSelectedBestellung(null);
  };

  // ========== RENDER ==========
  
  // Loading State
  if (isLoading) {
    return <OrderListSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header mit Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('meineBestellungenTitle')}
          </h1>
          <p className="text-slate-500 mt-1">
            {bestellungen.length} {t('bestellungenInsgesamt')}
          </p>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="offen" className="gap-2">
              {t('offeneBestellungen')}
              {offeneBestellungen.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-orange-100 text-orange-700">
                  {offeneBestellungen.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="geschlossen" className="gap-2">
              {t('geschlosseneBestellungen')}
              {geschlosseneBestellungen.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-slate-100 text-slate-600">
                  {geschlosseneBestellungen.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Export Button */}
      <div className="flex justify-end mb-4">
        <ExportButton
          data={exportData}
          columns={CSV_COLUMNS.bestellungen}
          filename="bestellungen_export"
        />
      </div>

      {/* Filter */}
      <BestellungFilters
        vonDatum={vonDatum}
        setVonDatum={setVonDatum}
        bisDatum={bisDatum}
        setBisDatum={setBisDatum}
        lieferant={lieferantFilter}
        setLieferant={setLieferantFilter}
        status={statusFilter}
        setStatus={setStatusFilter}
        lieferanten={lieferanten}
      />

      {/* Bestellungen Tabelle oder Empty State */}
      {gefilterteBestellungen.length === 0 ? (
        <EmptyOrdersState
          activeTab={activeTab}
          hasBaseOrders={basisBestellungen.length > 0}
          t={t}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('datum')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('lieferant')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('status')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('betrag')}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('lieferschein')}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('aktion')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gefilterteBestellungen.map(bestellung => (
                  <OrderTableRow
                    key={bestellung.id}
                    bestellung={bestellung}
                    supplierMap={supplierMap}
                    activeRestaurantId={activeRestaurantId}
                    onOpenDetails={handleOpenDetails}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anzahl Ergebnisse */}
      {gefilterteBestellungen.length > 0 && 
       gefilterteBestellungen.length !== basisBestellungen.length && (
        <p className="text-sm text-slate-500 text-center">
          {gefilterteBestellungen.length} {t('von')} {basisBestellungen.length}{' '}
          {activeTab === 'offen' 
            ? t('offenenBestellungen') 
            : t('geschlossenenBestellungen')}
        </p>
      )}

      {/* Detail Modal */}
      {selectedBestellung && (
        <BestellungDetailModal
          bestellung={selectedBestellung}
          lieferantName={supplierMap.get(selectedBestellung.lieferant)?.name || 'Unbekannt'}
          lieferantEmail={supplierMap.get(selectedBestellung.lieferant)?.email || null}
          restaurantName={activeRestaurant?.name || ''}
          open={!!selectedBestellung}
          onClose={handleCloseDetails}
        />
      )}
    </div>
  );
}