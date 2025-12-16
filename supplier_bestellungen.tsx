import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Search, Store, Filter, Package, Clock, Truck, CheckCircle2, XCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import StatCard from '@/components/dashboard/StatCard';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import BestellungRow from '@/components/lieferant/BestellungRow';
import BestellungDetailModal from '@/components/lieferant/BestellungDetailModal';
import { useRole } from '@/components/RoleContext';
import DateRangeFilter from '@/components/filters/DateRangeFilter';
import ExportButton from '@/components/ui/ExportButton';
import { CSV_COLUMNS } from '@/components/utils/csvExport';
import BatchActionBar, { ORDER_BATCH_ACTIONS } from '@/components/batch/BatchActionBar';
import BatchConfirmDialog from '@/components/batch/BatchConfirmDialog';
import { useTranslation } from '@/components/utils/translations';
import RestaurantInfoCard from '@/components/profile/RestaurantInfoCard';

// ============================================================================
// CONFIGURATION
// ============================================================================

// TODO F18: In Environment Variable auslagern
const DEFAULT_LIEFERANT_ID = '692b178b8af1f276d86a6a7b';

/**
 * Order Status Configuration (aligned with F12 AdminBestellungen)
 * 
 * TODO F18: Später aus /src/config/orderConfig.js importieren
 * Aktuell hier definiert für Konsistenz mit AdminBestellungen
 */
const ORDER_STATUS = {
  gesendet: { 
    labelKey: 'gesendet', 
    class: 'bg-blue-100 text-blue-700',
    icon: Package 
  },
  bestätigt: { 
    labelKey: 'bestaetigt', 
    class: 'bg-amber-100 text-amber-700',
    icon: Clock 
  },
  in_vorbereitung: { 
    labelKey: 'inVorbereitungLabel', 
    class: 'bg-purple-100 text-purple-700',
    icon: Package 
  },
  unterwegs: { 
    labelKey: 'unterwegs', 
    class: 'bg-cyan-100 text-cyan-700',
    icon: Truck 
  },
  geliefert: { 
    labelKey: 'geliefert', 
    class: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle2 
  },
  storniert: { 
    labelKey: 'storniert', 
    class: 'bg-red-100 text-red-700',
    icon: XCircle 
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Bestellungen in einem einzigen Durchlauf
 * 
 * @param {Array} bestellungen - Gefilterte Bestellungen
 * @returns {Object} Stats-Objekt mit KPIs
 */
function calculateStats(bestellungen) {
  const stats = {
    total: bestellungen.length,
    offen: 0,           // gesendet + bestätigt
    inBearbeitung: 0,   // in_vorbereitung + unterwegs
    geliefert: 0,
    storniert: 0,
    totalUmsatz: 0
  };

  bestellungen.forEach(b => {
    // Status-Kategorien
    if (b.status === 'gesendet' || b.status === 'bestätigt') {
      stats.offen++;
    } else if (b.status === 'in_vorbereitung' || b.status === 'unterwegs') {
      stats.inBearbeitung++;
    } else if (b.status === 'geliefert') {
      stats.geliefert++;
    } else if (b.status === 'storniert') {
      stats.storniert++;
    }

    // Umsatz (nur nicht-stornierte Bestellungen)
    if (b.status !== 'storniert' && b.gesamtsumme) {
      stats.totalUmsatz += b.gesamtsumme;
    }
  });

  return stats;
}

/**
 * Filtert Bestellungen basierend auf aktiven Filtern
 * 
 * @param {Array} bestellungen - Alle Bestellungen
 * @param {string} statusFilter - Status oder 'alle'
 * @param {string} restaurantFilter - Restaurant-ID oder 'alle'
 * @param {string} vonDatum - Start-Datum
 * @param {string} bisDatum - End-Datum
 * @param {string} searchText - Suchtext
 * @param {Map} restaurantMap - Map für Restaurant-Lookups
 * @returns {Array} Gefilterte und sortierte Bestellungen
 */
function filterBestellungen({
  bestellungen,
  statusFilter,
  restaurantFilter,
  vonDatum,
  bisDatum,
  searchText,
  restaurantMap
}) {
  return bestellungen.filter(b => {
    // Status Filter
    if (statusFilter !== 'alle' && b.status !== statusFilter) {
      return false;
    }

    // Restaurant Filter
    if (restaurantFilter !== 'alle' && b.restaurant !== restaurantFilter) {
      return false;
    }

    // Datum Filter
    if (vonDatum) {
      const bestellDatum = new Date(b.bestelldatum);
      const von = new Date(vonDatum);
      if (bestellDatum < von) return false;
    }
    if (bisDatum) {
      const bestellDatum = new Date(b.bestelldatum);
      const bis = new Date(bisDatum);
      bis.setHours(23, 59, 59, 999);
      if (bestellDatum > bis) return false;
    }

    // Text-Suche (Bestellnummer + Restaurant-Name)
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const bestellId = (b.id || '').toLowerCase();
      const restaurant = restaurantMap.get(b.restaurant);
      const restaurantName = (restaurant?.name || '').toLowerCase();
      
      if (!bestellId.includes(searchLower) && !restaurantName.includes(searchLower)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => new Date(b.bestelldatum) - new Date(a.bestelldatum));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LieferantBestellungen() {
  const { impersonatedLieferant } = useRole();
  const activeLieferantId = impersonatedLieferant || DEFAULT_LIEFERANT_ID;
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // State
  const [selectedBestellung, setSelectedBestellung] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [restaurantFilter, setRestaurantFilter] = useState('alle');
  const [vonDatum, setVonDatum] = useState('');
  const [bisDatum, setBisDatum] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchAction, setBatchAction] = useState(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Bestellungen Query mit optimiertem Refresh-Interval
   * 
   * Änderung zu vorher:
   * - refetchInterval: 30000 (30 Sekunden statt 3 Sekunden)
   * - staleTime: 2min (verhindert unnötige Refetches bei Focus)
   * - 90% weniger Server-Last!
   */
  const { 
    data: bestellungen = [], 
    isLoading: bestellungenLoading,
    isError: bestellungenError,
    error: bestellungenErrorMsg,
    refetch: refetchBestellungen
  } = useQuery({
    queryKey: ['lieferant-bestellungen', activeLieferantId],
    queryFn: () => base44.entities.Bestellung.filter({ lieferant: activeLieferantId }),
    enabled: !!activeLieferantId,
    staleTime: 2 * 60 * 1000, // 2 Minuten
    refetchInterval: 30000, // 30 Sekunden (statt 3!)
    refetchIntervalInBackground: true
  });

  /**
   * Restaurants Query - nur benötigte laden
   * 
   * TODO F18: Später optimieren mit id__in basierend auf bestellungen
   * Aktuell: list() mit TODO-Kommentar für spätere Backend-Optimierung
   */
  const { 
    data: allRestaurants = [],
    isLoading: restaurantsLoading,
    isError: restaurantsError,
    refetch: refetchRestaurants
  } = useQuery({
    queryKey: ['restaurants'],
    queryFn: async () => {
      // TODO F18: Optimieren mit id__in wenn möglich
      // const restaurantIds = [...new Set(bestellungen.map(b => b.restaurant))];
      // return base44.entities.Restaurant.filter({ id__in: restaurantIds });
      return base44.entities.Restaurant.list();
    },
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  /**
   * Aktiver Lieferant Query - nur einer
   * 
   * TODO F18: Optimieren mit .get() statt .list()
   */
  const { 
    data: allLieferanten = [],
    isLoading: lieferantenLoading 
  } = useQuery({
    queryKey: ['lieferanten', activeLieferantId],
    queryFn: async () => {
      // TODO F18: Optimieren mit get() statt list()
      // return [await base44.entities.Lieferant.get(activeLieferantId)];
      return base44.entities.Lieferant.list();
    },
    enabled: !!activeLieferantId,
    staleTime: 10 * 60 * 1000 // 10 Minuten (Lieferant-Daten ändern sich selten)
  });

  /**
   * Favoriten Query
   */
  const { data: favoriten = [] } = useQuery({
    queryKey: ['supplier-favoriten', activeLieferantId],
    queryFn: () => base44.entities.RestaurantLieferant.filter({ lieferant_id: activeLieferantId }),
    enabled: !!activeLieferantId,
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  // ============================================================================
  // MAPS für O(1) Lookups
  // ============================================================================

  /**
   * Restaurant Map: ID → Restaurant
   * Ersetzt Array.find in Render-Loop (O(n) → O(1))
   */
  const restaurantMap = useMemo(() => {
    return new Map(allRestaurants.map(r => [r.id, r]));
  }, [allRestaurants]);

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  const activeLieferant = useMemo(() => {
    return allLieferanten.find(l => l.id === activeLieferantId);
  }, [allLieferanten, activeLieferantId]);

  // Helper Functions mit Map-Lookup (O(1))
  const getRestaurant = (restaurantId) => {
    return restaurantMap.get(restaurantId);
  };

  const getRestaurantName = (restaurantId) => {
    return getRestaurant(restaurantId)?.name || 'Unbekannt';
  };

  const getRestaurantEmail = (restaurantId) => {
    return getRestaurant(restaurantId)?.email || null;
  };

  const isFavoriteRestaurant = (restaurantId) => {
    return favoriten.some(f => f.restaurant_id === restaurantId && f.is_favorite_by_supplier);
  };

  // Gefilterte Bestellungen
  const filteredBestellungen = useMemo(() => {
    return filterBestellungen({
      bestellungen,
      statusFilter,
      restaurantFilter,
      vonDatum,
      bisDatum,
      searchText,
      restaurantMap
    });
  }, [bestellungen, statusFilter, restaurantFilter, vonDatum, bisDatum, searchText, restaurantMap]);

  // KPIs - Single Pass über gefilterte Bestellungen
  const stats = useMemo(() => {
    return calculateStats(filteredBestellungen);
  }, [filteredBestellungen]);

  // Unique Restaurants für Filter (nur die in Bestellungen vorkommen)
  const uniqueRestaurants = useMemo(() => {
    const restaurantIds = [...new Set(bestellungen.map(b => b.restaurant))];
    return restaurantIds
      .map(id => restaurantMap.get(id))
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [bestellungen, restaurantMap]);

  // Export-Daten (nur bei Bedarf berechnet)
  const exportData = useMemo(() => {
    return filteredBestellungen.map(b => ({
      ...b,
      restaurantName: getRestaurantName(b.restaurant),
      lieferantName: activeLieferant?.name || '',
      bestelldatum: b.bestelldatum 
        ? format(new Date(b.bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de }) 
        : '-',
    }));
  }, [filteredBestellungen, activeLieferant]);

  // ============================================================================
  // BATCH-SELECTION FUNCTIONS
  // ============================================================================

  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === filteredBestellungen.length && filteredBestellungen.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBestellungen.map(b => b.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * Batch-Status-Update Mutation
   */
  const batchUpdateMutation = useMutation({
    mutationFn: async ({ ids, newStatus }) => {
      const promises = ids.map(id => 
        base44.entities.Bestellung.update(id, { status: newStatus })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lieferant-bestellungen'] });
      toast.success(`${selectedIds.size} ${t('bestellungenAktualisiert')}`);
      clearSelection();
      setBatchAction(null);
    },
    onError: () => {
      toast.error(t('fehlerBeimAktualisieren'));
    }
  });

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleBatchAction = (action) => {
    setBatchAction(action);
  };

  const confirmBatchAction = () => {
    if (batchAction && selectedIds.size > 0) {
      setIsBatchProcessing(true);
      batchUpdateMutation.mutate(
        { ids: Array.from(selectedIds), newStatus: batchAction.targetStatus },
        { onSettled: () => setIsBatchProcessing(false) }
      );
    }
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = bestellungenLoading || restaurantsLoading || lieferantenLoading;
  const hasError = bestellungenError || restaurantsError;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-32" />
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 mb-2" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('bestellungen')}</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Fehler beim Laden</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-4">
                Die Bestellungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => refetchBestellungen()} variant="outline">
                  Bestellungen erneut laden
                </Button>
                <Button onClick={() => refetchRestaurants()} variant="outline">
                  Restaurants erneut laden
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('bestellungen')}</h1>
          <p className="text-slate-500 mt-1">
            {filteredBestellungen.length} {t('von')} {bestellungen.length} {t('bestellungenInsgesamt')}
          </p>
        </div>
        <ExportButton
          data={exportData}
          columns={CSV_COLUMNS.bestellungen}
          filename="lieferant_bestellungen_export"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Offene Bestellungen"
          value={stats.offen}
          icon={Package}
          color="blue"
          subtitle="Gesendet + Bestätigt"
        />
        <StatCard
          title="In Bearbeitung"
          value={stats.inBearbeitung}
          icon={Truck}
          color="purple"
          subtitle="Vorbereitung + Unterwegs"
        />
        <StatCard
          title="Geliefert"
          value={stats.geliefert}
          icon={CheckCircle2}
          color="emerald"
          subtitle="Im aktuellen Filter"
        />
        <StatCard
          title="Gesamtumsatz"
          value={`€${stats.totalUmsatz.toFixed(2)}`}
          icon={Package}
          color="slate"
          subtitle="Gefilterte Bestellungen"
        />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('bestellnummerOderRestaurant')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <SelectValue placeholder={t('status')} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t('alleStatus')}</SelectItem>
              {Object.keys(ORDER_STATUS).map(status => (
                <SelectItem key={status} value={status}>
                  {t(ORDER_STATUS[status].labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
            <SelectTrigger className="w-full lg:w-48">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-slate-400" />
                <SelectValue placeholder={t('restaurant')} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t('alleRestaurants')}</SelectItem>
              {uniqueRestaurants.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateRangeFilter
          vonDatum={vonDatum}
          setVonDatum={setVonDatum}
          bisDatum={bisDatum}
          setBisDatum={setBisDatum}
        />
      </div>

      {/* Tabelle */}
      {filteredBestellungen.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {bestellungen.length === 0 
              ? t('keineBestellungenVorhanden')
              : 'Keine Bestellungen gefunden'
            }
          </h3>
          <p className="text-slate-500">
            {bestellungen.length === 0 
              ? t('keineBestellungenText')
              : 'Passen Sie Ihre Filterkriterien an, um Bestellungen anzuzeigen'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                    <Checkbox
                      checked={selectedIds.size === filteredBestellungen.length && filteredBestellungen.length > 0}
                      onCheckedChange={toggleAllSelection}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('datum')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {t('restaurant')}
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
                {filteredBestellungen.map(bestellung => (
                  <BestellungRow
                    key={bestellung.id}
                    bestellung={bestellung}
                    restaurant={getRestaurant(bestellung.restaurant)}
                    restaurantName={getRestaurantName(bestellung.restaurant)}
                    restaurantEmail={getRestaurantEmail(bestellung.restaurant)}
                    lieferantName={activeLieferant?.name}
                    onDetails={setSelectedBestellung}
                    isSelected={selectedIds.has(bestellung.id)}
                    onToggleSelect={() => toggleSelection(bestellung.id)}
                    showCheckbox={true}
                    supplierId={activeLieferantId}
                    onRestaurantClick={(restaurant) => setSelectedRestaurant(restaurant)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <BestellungDetailModal
        bestellung={selectedBestellung}
        restaurantName={selectedBestellung ? getRestaurantName(selectedBestellung.restaurant) : ''}
        lieferantName={activeLieferant?.name || ''}
        restaurant={selectedBestellung ? getRestaurant(selectedBestellung.restaurant) : null}
        lieferant={activeLieferant}
        open={!!selectedBestellung}
        onClose={() => setSelectedBestellung(null)}
      />

      {/* Batch-Aktionsleiste */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        isProcessing={isBatchProcessing}
        actions={[
          { ...ORDER_BATCH_ACTIONS.confirm, onClick: () => handleBatchAction(ORDER_BATCH_ACTIONS.confirm) },
          { ...ORDER_BATCH_ACTIONS.prepare, onClick: () => handleBatchAction(ORDER_BATCH_ACTIONS.prepare) },
          { ...ORDER_BATCH_ACTIONS.ship, onClick: () => handleBatchAction(ORDER_BATCH_ACTIONS.ship) },
        ]}
      />

      {/* Batch-Bestätigungsdialog */}
      <BatchConfirmDialog
        open={!!batchAction}
        onClose={() => setBatchAction(null)}
        onConfirm={confirmBatchAction}
        title={`Status auf "${batchAction?.label}" setzen?`}
        description={`Möchten Sie den Status aller ${selectedIds.size} ausgewählten Bestellungen auf "${batchAction?.label}" ändern?`}
        confirmLabel="Status ändern"
        isProcessing={isBatchProcessing}
        selectedCount={selectedIds.size}
      />

      {/* Restaurant Info Card */}
      <RestaurantInfoCard
        restaurant={selectedRestaurant}
        open={!!selectedRestaurant}
        onClose={() => setSelectedRestaurant(null)}
        supplierId={activeLieferantId}
        favoriteStatus={selectedRestaurant && isFavoriteRestaurant(selectedRestaurant.id)}
      />
    </div>
  );
}