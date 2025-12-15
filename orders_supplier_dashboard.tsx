import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRole, ROLES } from '@/components/RoleContext';
import { useTranslation } from '@/components/utils/translations';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar, Store, Euro, Package, Clock, MapPin, Search, AlertCircle } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import BestellungDetailModal from '@/components/lieferant/BestellungDetailModal';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Zentrale Status-Konfiguration für Bestellungen
 * Verwendung: const config = ORDER_STATUS[status]
 */
const ORDER_STATUS = {
  gesendet: {
    labelKey: 'eingegangen',
    className: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  eingegangen: {
    labelKey: 'eingegangen',
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
    labelKey: 'inZustellung',
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200'
  },
  geliefert: {
    labelKey: 'geliefert',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
} as const;

// Status-Werte die als "neu" gelten
const NEW_ORDER_STATUSES = ['gesendet', 'eingegangen'] as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Erstellt eine Map für schnellen Restaurant-Lookup
 * @param restaurants - Array von Restaurant-Objekten
 * @returns Map mit restaurant.id als Key
 */
function createRestaurantMap(restaurants: any[]): Map<string, any> {
  return new Map(restaurants.map(r => [r.id, r]));
}

/**
 * Erstellt eine Map für schnellen Zone-Lookup nach Restaurant-ID
 * @param liefergebiete - Array von Liefergebiet-Objekten
 * @param restaurants - Array von Restaurant-Objekten
 * @param lieferantId - ID des aktiven Lieferanten
 * @returns Map mit restaurant.id als Key, zone als Value
 */
function createZoneMap(
  liefergebiete: any[],
  restaurants: any[],
  lieferantId: string | undefined
): Map<string, any> {
  if (!lieferantId) return new Map();
  
  const zoneMap = new Map<string, any>();
  
  // Für jedes Restaurant die passende Zone finden
  restaurants.forEach(restaurant => {
    const zone = liefergebiete.find(z =>
      z.lieferant === lieferantId && z.plz === restaurant.plz
    );
    if (zone) {
      zoneMap.set(restaurant.id, zone);
    }
  });
  
  return zoneMap;
}

/**
 * Holt die Zone für ein Restaurant aus der Zone-Map
 * @param restaurantId - ID des Restaurants
 * @param zoneMap - Map mit Restaurant-ID → Zone
 * @returns Zone-Objekt oder null
 */
function getZoneForRestaurant(
  restaurantId: string,
  zoneMap: Map<string, any>
): any | null {
  return zoneMap.get(restaurantId) || null;
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
 * Prüft ob eine Bestellung als "neu" gilt
 */
function isNewOrder(status: string): boolean {
  return NEW_ORDER_STATUSES.includes(status as any);
}

/**
 * Extrahiert Lieferzeit aus Bestellung (Priorität: lieferzeit_von > bestelldatum)
 */
function getDeliveryTime(bestellung: any): Date {
  return bestellung.lieferzeit_von
    ? new Date(bestellung.lieferzeit_von)
    : new Date(bestellung.bestelldatum);
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Loading Skeleton für KPI Cards
 */
function KPILoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </Card>
      ))}
    </div>
  );
}

/**
 * Loading Skeleton für Bestellungsliste
 */
function OrderListLoadingSkeleton() {
  return (
    <Card>
      <div className="divide-y">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Error State Komponente
 */
function ErrorState({ message }: { message: string }) {
  return (
    <Card className="p-8 text-center">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 mb-2">Fehler beim Laden</h3>
      <p className="text-slate-600">{message}</p>
    </Card>
  );
}

/**
 * Empty State wenn keine Bestellungen vorhanden
 */
function EmptyOrdersState({ t }: { t: (key: string) => string }) {
  return (
    <div className="p-8 text-center text-slate-500">
      <Package className="h-12 w-12 mx-auto mb-2 text-slate-300" />
      <p>{t('keineBestellungenVorhanden')}</p>
    </div>
  );
}

/**
 * Einzelne Bestellungs-Zeile
 */
function OrderRow({
  bestellung,
  restaurant,
  zone,
  statusConfig,
  isNew,
  lieferzeit,
  onConfirm,
  onOpenDetails,
  isConfirming,
  t
}: any) {
  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Restaurant & Time */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={onOpenDetails}
              className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-left truncate"
            >
              {restaurant?.name || t('unbekannt')}
            </button>
            {isNew && (
              <Badge className="bg-red-100 text-red-800 text-xs">
                {t('neu')}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lieferzeit}
            </span>
            {zone && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {zone.name || zone.plz}
              </span>
            )}
          </div>
        </div>

        {/* Status & Amount */}
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
          <span className="font-semibold text-slate-900 min-w-[80px] text-right">
            {(bestellung.gesamtbetrag || 0).toFixed(2)} €
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isNew && (
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={isConfirming}
            >
              {t('bestaetigen')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenDetails}
          >
            {t('details')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TagesUebersicht() {
  const { t } = useTranslation();
  const { currentRole, impersonatedLieferant } = useRole();
  const queryClient = useQueryClient();
  
  // ========== STATE ==========
  const [selectedDay, setSelectedDay] = useState('today');
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [sortBy, setSortBy] = useState('lieferzeit');
  const [selectedBestellung, setSelectedBestellung] = useState<any>(null);

  // ========== AUTH CHECK ==========
  if (currentRole !== ROLES.LIEFERANT) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('keinZugriff')}</h2>
          <p className="text-slate-600">Diese Seite ist nur für Lieferanten verfügbar.</p>
        </Card>
      </div>
    );
  }

  // ========== DATA FETCHING ==========
  
  // Fetch user
  const { data: user, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Fetch lieferanten
  const { data: lieferanten = [], isLoading: lieferantenLoading, error: lieferantenError } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  // Finde aktiven Lieferanten
  const activeLieferant = useMemo(() => {
    if (impersonatedLieferant) {
      return lieferanten.find(l => l.id === impersonatedLieferant);
    }
    return lieferanten.find(l => l.auth_user_id === user?.id || l.email === user?.email);
  }, [lieferanten, impersonatedLieferant, user]);

  // Fetch bestellungen mit Auto-Refresh
  const { 
    data: bestellungen = [], 
    isLoading: bestellungenLoading, 
    error: bestellungenError 
  } = useQuery({
    queryKey: ['bestellungen-tagesuebersicht', activeLieferant?.id],
    queryFn: () => base44.entities.Bestellung.list(),
    enabled: !!activeLieferant,
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Fetch restaurants
  const { 
    data: restaurants = [], 
    isLoading: restaurantsLoading, 
    error: restaurantsError 
  } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  // Fetch liefergebiete
  const { 
    data: liefergebiete = [], 
    isLoading: liefergebieteLoading, 
    error: liefergebieteError 
  } = useQuery({
    queryKey: ['liefergebiete', activeLieferant?.id],
    queryFn: () => base44.entities.Liefergebiet.list(),
    enabled: !!activeLieferant
  });

  // ========== COMPUTED DATA ==========
  
  // Restaurant Map für O(1) Lookup
  const restaurantMap = useMemo(
    () => createRestaurantMap(restaurants),
    [restaurants]
  );

  // Zone Map für O(1) Lookup (statt O(n) in jedem Filter)
  const zoneMap = useMemo(
    () => createZoneMap(liefergebiete, restaurants, activeLieferant?.id),
    [liefergebiete, restaurants, activeLieferant?.id]
  );

  // Datums-Range berechnen
  const { startDate, endDate } = useMemo(() => {
    const baseDate = selectedDay === 'today' ? new Date() : addDays(new Date(), 1);
    return {
      startDate: startOfDay(baseDate),
      endDate: endOfDay(baseDate)
    };
  }, [selectedDay]);

  // Filter: Bestellungen für gewählten Tag + Lieferant
  const dayBestellungen = useMemo(() => {
    if (!activeLieferant) return [];

    return bestellungen.filter(b => {
      // Filter 1: Nur Bestellungen dieses Lieferanten
      if (b.lieferant !== activeLieferant.id) return false;

      // Filter 2: Nur Bestellungen im Datums-Range
      const bestellDate = getDeliveryTime(b);
      return bestellDate >= startDate && bestellDate <= endDate;
    });
  }, [bestellungen, activeLieferant, startDate, endDate]);

  // Filter + Sortierung anwenden
  const filteredBestellungen = useMemo(() => {
    let filtered = [...dayBestellungen];

    // Filter 1: Status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(b => b.status === statusFilter);
    }

    // Filter 2: Zone (jetzt O(1) statt O(n))
    if (zoneFilter !== 'all') {
      filtered = filtered.filter(b => {
        const zone = getZoneForRestaurant(b.restaurant, zoneMap);
        return zone?.id === zoneFilter;
      });
    }

    // Filter 3: Restaurant-Suche (jetzt O(1) Lookup)
    if (restaurantSearch) {
      const search = restaurantSearch.toLowerCase();
      filtered = filtered.filter(b => {
        const restaurant = restaurantMap.get(b.restaurant);
        return restaurant?.name?.toLowerCase().includes(search);
      });
    }

    // Sortierung
    filtered.sort((a, b) => {
      if (sortBy === 'lieferzeit') {
        const dateA = getDeliveryTime(a);
        const dateB = getDeliveryTime(b);
        return dateA.getTime() - dateB.getTime();
      } else if (sortBy === 'restaurant') {
        const nameA = restaurantMap.get(a.restaurant)?.name || '';
        const nameB = restaurantMap.get(b.restaurant)?.name || '';
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'status') {
        return (a.status || '').localeCompare(b.status || '');
      }
      return 0;
    });

    return filtered;
  }, [dayBestellungen, statusFilter, zoneFilter, restaurantSearch, sortBy, restaurantMap, zoneMap]);

  // KPIs berechnen
  const kpis = useMemo(() => {
    const totalOrders = dayBestellungen.length;
    const totalRevenue = dayBestellungen.reduce((sum, b) => sum + (b.gesamtbetrag || 0), 0);
    const uniqueRestaurants = new Set(dayBestellungen.map(b => b.restaurant)).size;
    const openOrders = dayBestellungen.filter(b => isNewOrder(b.status)).length;

    return {
      totalOrders,
      totalRevenue,
      uniqueRestaurants,
      openOrders
    };
  }, [dayBestellungen]);

  // Verfügbare Zonen für Filter-Dropdown (jetzt O(n) statt O(n²))
  const availableZones = useMemo(() => {
    const zonesSet = new Map<string, any>();
    
    dayBestellungen.forEach(b => {
      const zone = getZoneForRestaurant(b.restaurant, zoneMap);
      if (zone && !zonesSet.has(zone.id)) {
        zonesSet.set(zone.id, {
          id: zone.id,
          name: zone.name || zone.plz
        });
      }
    });
    
    return Array.from(zonesSet.values());
  }, [dayBestellungen, zoneMap]);

  // ========== MUTATIONS ==========
  
  // Status-Update Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ bestellungId, newStatus }: { bestellungId: string; newStatus: string }) =>
      base44.entities.Bestellung.update(bestellungId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bestellungen-tagesuebersicht'] });
      toast.success(t('statusAktualisiert'));
    },
    onError: () => {
      toast.error('Fehler beim Aktualisieren des Status');
    }
  });

  const handleQuickConfirm = (bestellung: any) => {
    updateStatusMutation.mutate({
      bestellungId: bestellung.id,
      newStatus: 'bestätigt'
    });
  };

  // ========== ERROR HANDLING ==========
  
  // Prüfe auf kritische Fehler
  const criticalError = userError || lieferantenError || bestellungenError || restaurantsError || liefergebieteError;
  
  if (criticalError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ErrorState message="Die Daten konnten nicht geladen werden. Bitte laden Sie die Seite neu." />
      </div>
    );
  }

  // Loading State
  const isLoading = userLoading || lieferantenLoading || bestellungenLoading || restaurantsLoading || liefergebieteLoading;

  // Kein Lieferant gefunden
  if (!isLoading && !activeLieferant) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('keinLieferantAusgewaehlt')}</h2>
          <p className="text-slate-600">{t('bitteWaehlenSieLieferant')}</p>
        </Card>
      </div>
    );
  }

  // ========== RENDER ==========

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('tagesUebersicht')}</h1>
        <p className="text-slate-600 mt-1">Übersicht aller Bestellungen für heute und morgen</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={selectedDay === 'today' ? 'default' : 'outline'}
          onClick={() => setSelectedDay('today')}
          className="flex-1 sm:flex-none"
        >
          <Calendar className="h-4 w-4 mr-2" />
          {t('heute')}
        </Button>
        <Button
          variant={selectedDay === 'tomorrow' ? 'default' : 'outline'}
          onClick={() => setSelectedDay('tomorrow')}
          className="flex-1 sm:flex-none"
        >
          <Calendar className="h-4 w-4 mr-2" />
          {t('morgen')}
        </Button>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <KPILoadingSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t('anzahlBestellungen')}
            value={kpis.totalOrders}
            icon={Package}
            color="blue"
          />
          <StatCard
            title={t('gesamtumsatzTag')}
            value={`${kpis.totalRevenue.toFixed(2)} €`}
            icon={Euro}
            color="green"
          />
          <StatCard
            title={t('anzahlRestaurants')}
            value={kpis.uniqueRestaurants}
            icon={Store}
            color="purple"
          />
          <StatCard
            title={t('offeneBestellungenCount')}
            value={kpis.openOrders}
            icon={Clock}
            color="orange"
          />
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t('status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('alleStatus')}</SelectItem>
              <SelectItem value="gesendet">{t('eingegangen')}</SelectItem>
              <SelectItem value="bestätigt">{t('bestaetigt')}</SelectItem>
              <SelectItem value="in_vorbereitung">{t('inVorbereitungLabel')}</SelectItem>
              <SelectItem value="unterwegs">{t('inZustellung')}</SelectItem>
              <SelectItem value="geliefert">{t('geliefert')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Zone Filter */}
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t('zone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('alleZonen')}</SelectItem>
              {availableZones.map(zone => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Restaurant Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('restaurant')}
              value={restaurantSearch}
              onChange={(e) => setRestaurantSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger>
              <SelectValue placeholder={t('sortierenNach')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lieferzeit">{t('lieferzeit')}</SelectItem>
              <SelectItem value="restaurant">{t('restaurant')}</SelectItem>
              <SelectItem value="status">{t('status')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Orders List */}
      {isLoading ? (
        <OrderListLoadingSkeleton />
      ) : (
        <Card>
          <div className="divide-y">
            {filteredBestellungen.length === 0 ? (
              <EmptyOrdersState t={t} />
            ) : (
              filteredBestellungen.map(bestellung => {
                const restaurant = restaurantMap.get(bestellung.restaurant);
                const zone = getZoneForRestaurant(bestellung.restaurant, zoneMap);
                const statusConfig = getStatusConfig(bestellung.status, t);
                const isNew = isNewOrder(bestellung.status);
                const lieferzeit = format(
                  getDeliveryTime(bestellung),
                  'HH:mm',
                  { locale: de }
                );

                return (
                  <OrderRow
                    key={bestellung.id}
                    bestellung={bestellung}
                    restaurant={restaurant}
                    zone={zone}
                    statusConfig={statusConfig}
                    isNew={isNew}
                    lieferzeit={lieferzeit}
                    onConfirm={() => handleQuickConfirm(bestellung)}
                    onOpenDetails={() => setSelectedBestellung(bestellung)}
                    isConfirming={updateStatusMutation.isPending}
                    t={t}
                  />
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* Detail Modal */}
      {selectedBestellung && (
        <BestellungDetailModal
          bestellung={selectedBestellung}
          restaurantName={restaurantMap.get(selectedBestellung.restaurant)?.name || ''}
          lieferantName={activeLieferant?.name || ''}
          restaurant={restaurantMap.get(selectedBestellung.restaurant) || null}
          lieferant={activeLieferant}
          open={!!selectedBestellung}
          onClose={() => setSelectedBestellung(null)}
        />
      )}
    </div>
  );
}