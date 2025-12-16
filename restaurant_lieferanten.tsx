import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import StatCard from '@/components/dashboard/StatCard';
import { MapPin, Search, Star, Package, CheckCircle2, Clock, XCircle, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/components/utils/translations';
import { useRole } from '@/components/RoleContext';
import { calculateETABatch } from '@/components/eta/etaCalculator';
import GCMap from '@/components/map/GCMap';
import SupplierInfoCard from '@/components/profile/SupplierInfoCard';

// ============================================================================
// CONFIGURATION
// ============================================================================

// TODO F20: In Environment Variable auslagern
const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

/**
 * Lieferant Status Configuration (aligned with F14 AdminLieferanten)
 * 
 * TODO F20: Später aus /src/config/lieferantConfig.js importieren
 */
const LIEFERANT_STATUS = {
  approved: {
    labelKey: 'approved',
    class: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle2
  },
  active: {
    labelKey: 'active',
    class: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: CheckCircle2
  },
  pending: {
    labelKey: 'pending',
    class: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Clock
  },
  rejected: {
    labelKey: 'rejected',
    class: 'bg-red-100 text-red-700 border-red-200',
    icon: XCircle
  }
};

// Active status values for filtering
const ACTIVE_STATUS = ['active', 'approved'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs für Restaurant-Lieferanten-Übersicht
 * 
 * @param {Array} lieferantenInPLZ - Lieferanten die in Restaurant-PLZ liefern
 * @param {Array} favoriten - Favoriten-Beziehungen
 * @param {Map} etaMap - ETA-Zeiten pro Lieferant
 * @returns {Object} Stats-Objekt mit KPIs
 */
function calculateStats(lieferantenInPLZ, favoriten, etaMap) {
  const stats = {
    totalLieferanten: lieferantenInPLZ.length,
    favoriten: 0,
    mitKoordinaten: 0,
    unter30Min: 0
  };

  lieferantenInPLZ.forEach(l => {
    // Favoriten zählen
    if (favoriten.some(f => f.lieferant_id === l.id && f.is_favorite_by_restaurant)) {
      stats.favoriten++;
    }

    // Koordinaten zählen
    if (l.latitude && l.longitude) {
      stats.mitKoordinaten++;
    }

    // ETA unter 30 Minuten
    const eta = etaMap.get(l.id);
    if (eta && eta < 30) {
      stats.unter30Min++;
    }
  });

  return stats;
}

/**
 * Filtert und sortiert Lieferanten basierend auf Suchtext, Favoriten und Sortierung
 * 
 * @param {Array} lieferanten - Basis-Lieferanten (bereits PLZ-gefiltert)
 * @param {string} searchText - Suchtext
 * @param {boolean} onlyFavorites - Nur Favoriten zeigen
 * @param {Array} favoriten - Favoriten-Beziehungen
 * @param {string} sortMode - Sortier-Modus ('name' | 'eta' | 'favorites_first')
 * @param {Map} etaMap - ETA-Zeiten pro Lieferant
 * @returns {Array} Gefilterte und sortierte Lieferanten
 */
function filterAndSortLieferanten({
  lieferanten,
  searchText,
  onlyFavorites,
  favoriten,
  sortMode,
  etaMap
}) {
  // Filter: Textsuche
  let filtered = lieferanten;
  if (searchText) {
    const search = searchText.toLowerCase();
    filtered = filtered.filter(l =>
      l.name?.toLowerCase().includes(search) ||
      l.ort?.toLowerCase().includes(search)
    );
  }

  // Filter: Nur Favoriten
  if (onlyFavorites) {
    const favoritenIds = new Set(
      favoriten
        .filter(f => f.is_favorite_by_restaurant)
        .map(f => f.lieferant_id)
    );
    filtered = filtered.filter(l => favoritenIds.has(l.id));
  }

  // Sortierung
  const sorted = [...filtered];
  if (sortMode === 'name') {
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortMode === 'eta') {
    sorted.sort((a, b) => {
      const etaA = etaMap.get(a.id) || Infinity;
      const etaB = etaMap.get(b.id) || Infinity;
      return etaA - etaB;
    });
  } else if (sortMode === 'favorites_first') {
    const favoritenIds = new Set(
      favoriten
        .filter(f => f.is_favorite_by_restaurant)
        .map(f => f.lieferant_id)
    );
    sorted.sort((a, b) => {
      const aIsFav = favoritenIds.has(a.id);
      const bIsFav = favoritenIds.has(b.id);
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  return sorted;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RestaurantLieferanten() {
  const { t } = useTranslation();
  const { impersonatedRestaurant } = useRole();

  // State
  const [searchText, setSearchText] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortMode, setSortMode] = useState('name');
  const [selectedLieferant, setSelectedLieferant] = useState(null);
  const [showZonesDialog, setShowZonesDialog] = useState(null);

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Current User Query
   */
  const { 
    data: currentUser,
    isLoading: userLoading
  } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000
  });

  /**
   * Active Restaurant Query
   * 
   * Optimierung: Lädt nur das aktive Restaurant statt alle
   * Reihenfolge: impersonatedRestaurant > User-Mapping > DEFAULT_RESTAURANT_ID
   */
  const { 
    data: currentRestaurant,
    isLoading: restaurantLoading,
    isError: restaurantError,
    refetch: refetchRestaurant
  } = useQuery({
    queryKey: ['current-restaurant', impersonatedRestaurant, currentUser?.id],
    queryFn: async () => {
      // 1. Impersonation hat Priorität
      if (impersonatedRestaurant) {
        return await base44.entities.Restaurant.get(impersonatedRestaurant);
      }

      // 2. User-Mapping: Finde Restaurant via auth_user_id oder email
      if (currentUser) {
        const allRestaurants = await base44.entities.Restaurant.list();
        const userRestaurant = allRestaurants.find(
          r => r.auth_user_id === currentUser.id || r.email === currentUser.email
        );
        if (userRestaurant) {
          return userRestaurant;
        }
      }

      // 3. Fallback: Default Restaurant
      return await base44.entities.Restaurant.get(DEFAULT_RESTAURANT_ID);
    },
    enabled: !!currentUser || !!impersonatedRestaurant,
    staleTime: 5 * 60 * 1000
  });

  const activeRestaurantId = currentRestaurant?.id;

  /**
   * Lieferanten Query mit server-side Status-Filter
   * 
   * Optimierung: Status-Filter auf Server-Seite statt client-side
   */
  const { 
    data: lieferanten = [],
    isLoading: lieferantenLoading,
    isError: lieferantenError,
    refetch: refetchLieferanten
  } = useQuery({
    queryKey: ['lieferanten-restaurant'],
    queryFn: async () => {
      // TODO F20: Wenn base44 status__in unterstützt:
      // return base44.entities.Lieferant.filter({ status__in: ACTIVE_STATUS });
      const all = await base44.entities.Lieferant.list();
      return all.filter(l => ACTIVE_STATUS.includes(l.status));
    },
    staleTime: 5 * 60 * 1000
  });

  /**
   * Liefergebiete Query
   * 
   * TODO F20: Server-side PLZ-Filter wenn verfügbar
   * z.B. filter({ plz__contains: currentRestaurant.plz })
   */
  const { 
    data: liefergebiete = [],
    isLoading: liefergebieteLoading,
    isError: liefergebieteError,
    refetch: refetchLiefergebiete
  } = useQuery({
    queryKey: ['liefergebiete-restaurant'],
    queryFn: () => base44.entities.Liefergebiet.list(),
    staleTime: 5 * 60 * 1000
  });

  /**
   * Favoriten Query
   */
  const { 
    data: favoriten = [],
    isLoading: favoritenLoading
  } = useQuery({
    queryKey: ['restaurant-favoriten', activeRestaurantId],
    queryFn: () => base44.entities.RestaurantLieferant.filter({ 
      restaurant_id: activeRestaurantId 
    }),
    enabled: !!activeRestaurantId,
    staleTime: 5 * 60 * 1000
  });

  // ============================================================================
  // MAPS für O(1) Lookups
  // ============================================================================

  /**
   * Liefergebiet Map: lieferantId → Liefergebiet[]
   * Ersetzt Array.filter in getZonenCount/getZonenForLieferant (O(n) → O(1))
   */
  const liefergebietMap = useMemo(() => {
    const map = new Map();
    liefergebiete.forEach(gebiet => {
      if (!map.has(gebiet.lieferant)) {
        map.set(gebiet.lieferant, []);
      }
      map.get(gebiet.lieferant).push(gebiet);
    });
    return map;
  }, [liefergebiete]);

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  /**
   * Lieferanten die in die PLZ des Restaurants liefern
   * Basis-Filter: PLZ-basiert via Liefergebiete
   */
  const lieferantenInPLZ = useMemo(() => {
    if (!currentRestaurant?.plz) return [];
    
    const lieferantenIds = new Set(
      liefergebiete
        .filter(lg => 
          lg.plz === currentRestaurant.plz || 
          lg.plz_liste?.includes(currentRestaurant.plz)
        )
        .map(lg => lg.lieferant)
    );
    
    return lieferanten.filter(l => lieferantenIds.has(l.id));
  }, [liefergebiete, currentRestaurant, lieferanten]);

  /**
   * Lieferanten mit GPS-Koordinaten (für Karte)
   */
  const lieferantenMitKoordinaten = useMemo(() => {
    return lieferantenInPLZ.filter(l => l.latitude && l.longitude);
  }, [lieferantenInPLZ]);

  /**
   * ETA-Berechnung
   */
  const etaMap = useMemo(() => {
    if (!currentRestaurant || lieferantenInPLZ.length === 0) return new Map();
    return calculateETABatch(lieferantenInPLZ, currentRestaurant);
  }, [lieferantenInPLZ, currentRestaurant]);

  /**
   * KPIs - Single Pass über lieferantenInPLZ
   */
  const stats = useMemo(() => {
    return calculateStats(lieferantenInPLZ, favoriten, etaMap);
  }, [lieferantenInPLZ, favoriten, etaMap]);

  /**
   * Gefilterte und sortierte Lieferanten
   */
  const filteredLieferanten = useMemo(() => {
    return filterAndSortLieferanten({
      lieferanten: lieferantenInPLZ,
      searchText,
      onlyFavorites,
      favoriten,
      sortMode,
      etaMap
    });
  }, [lieferantenInPLZ, searchText, onlyFavorites, favoriten, sortMode, etaMap]);

  /**
   * Map Markers für GCMap
   */
  const mapMarkers = useMemo(() => {
    return lieferantenMitKoordinaten.map(lieferant => ({
      id: lieferant.id,
      type: 'lieferant',
      name: lieferant.name,
      plz: lieferant.plz_basis,
      gemeinde: lieferant.ort,
      lat: lieferant.latitude,
      lng: lieferant.longitude,
      adresse: lieferant.strasse 
        ? `${lieferant.strasse}, ${lieferant.plz_basis} ${lieferant.ort}` 
        : null,
      hauptbild: lieferant.image1_url,
      bilder: [lieferant.image2_url, lieferant.image3_url].filter(Boolean),
      instagram_url: lieferant.instagram_url,
      email: lieferant.email,
      telefon: lieferant.telefon,
      lieferzeiten: lieferant.lieferzeiten,
      zustelltage: lieferant.zustelltage,
      mindestbestellwert: lieferant.mindestbestellwert,
      logistik_hinweise: lieferant.logistik_hinweise,
      eta: etaMap.get(lieferant.id)
    }));
  }, [lieferantenMitKoordinaten, etaMap]);

  // ============================================================================
  // HELPER FUNCTIONS (mit Map-Lookups)
  // ============================================================================

  const isFavorite = useCallback((lieferantId) => {
    return favoriten.some(f => 
      f.lieferant_id === lieferantId && 
      f.is_favorite_by_restaurant
    );
  }, [favoriten]);

  const getZonenCount = useCallback((lieferantId) => {
    return liefergebietMap.get(lieferantId)?.length || 0;
  }, [liefergebietMap]);

  const getZonenForLieferant = useCallback((lieferantId) => {
    return liefergebietMap.get(lieferantId) || [];
  }, [liefergebietMap]);

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = userLoading || restaurantLoading || lieferantenLoading || 
                    liefergebieteLoading || favoritenLoading;
  const hasError = restaurantError || lieferantenError || liefergebieteError;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        
        {/* KPI Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>

        {/* Map Skeleton */}
        <Skeleton className="h-96" />

        {/* Filters Skeleton */}
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-40" />
        </div>

        {/* List Skeleton */}
        <Card>
          <div className="divide-y">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4">
                <Skeleton className="h-12" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('lieferanten')}</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Fehler beim Laden
              </h3>
              <p className="text-slate-500 max-w-md mx-auto mb-4">
                Die Lieferanten-Daten konnten nicht geladen werden. 
                Bitte versuchen Sie es erneut.
              </p>
              <div className="flex gap-2 justify-center">
                {restaurantError && (
                  <Button onClick={() => refetchRestaurant()} variant="outline">
                    Restaurant erneut laden
                  </Button>
                )}
                {lieferantenError && (
                  <Button onClick={() => refetchLieferanten()} variant="outline">
                    Lieferanten erneut laden
                  </Button>
                )}
                {liefergebieteError && (
                  <Button onClick={() => refetchLiefergebiete()} variant="outline">
                    Liefergebiete erneut laden
                  </Button>
                )}
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('lieferanten')}</h1>
        <p className="text-slate-600 mt-1">{t('lieferantenInRegion')}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Lieferanten in Region"
          value={stats.totalLieferanten}
          icon={Truck}
          color="blue"
          subtitle={`In PLZ ${currentRestaurant?.plz || '—'}`}
        />
        <StatCard
          title="Favoriten"
          value={stats.favoriten}
          icon={Star}
          color="yellow"
          subtitle="Bevorzugte Lieferanten"
        />
        <StatCard
          title="Mit Standort"
          value={stats.mitKoordinaten}
          icon={MapPin}
          color="emerald"
          subtitle="Auf Karte sichtbar"
        />
        <StatCard
          title="Unter 30 Min"
          value={stats.unter30Min}
          icon={Clock}
          color="purple"
          subtitle="Geschätzte Lieferzeit"
        />
      </div>

      {/* Map */}
      {lieferantenMitKoordinaten.length > 0 ? (
        <GCMap
          context="restaurant_view_suppliers"
          markers={mapMarkers}
          currentUser={currentRestaurant}
        />
      ) : (
        <Card className="p-6 text-center text-slate-500">
          <MapPin className="h-12 w-12 mx-auto mb-2 text-slate-300" />
          <p>{t('keineLieferantenMitKoordinaten')}</p>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t('suchen')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sort */}
        <Select value={sortMode} onValueChange={setSortMode}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Sortierung" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="eta">Entfernung (ETA)</SelectItem>
            <SelectItem value="favorites_first">Favoriten zuerst</SelectItem>
          </SelectContent>
        </Select>

        {/* Favorites Toggle */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <Switch
            id="only-favorites"
            checked={onlyFavorites}
            onCheckedChange={setOnlyFavorites}
          />
          <Label htmlFor="only-favorites" className="cursor-pointer">
            Nur Favoriten
          </Label>
        </div>
      </div>

      {/* Lieferanten Liste */}
      <Card>
        <div className="divide-y">
          {filteredLieferanten.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              {lieferantenInPLZ.length === 0 ? (
                <>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">
                    Keine Lieferanten in deiner Region
                  </h3>
                  <p>
                    Für deine PLZ ({currentRestaurant?.plz || '—'}) hat aktuell kein Lieferant 
                    Liefergebiete definiert.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">
                    Keine Lieferanten gefunden
                  </h3>
                  <p>
                    Keine Lieferanten für die aktuellen Filter. 
                    Filter oder Suchtext anpassen.
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredLieferanten.map(lieferant => {
              const zonenCount = getZonenCount(lieferant.id);
              const favorite = isFavorite(lieferant.id);
              const statusConfig = LIEFERANT_STATUS[lieferant.status] || 
                                   LIEFERANT_STATUS['active'];
              
              return (
                <div 
                  key={lieferant.id} 
                  className="p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {favorite && (
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        )}
                        <h3 className="font-semibold text-slate-900">
                          {lieferant.name}
                        </h3>
                        <Badge 
                          variant="outline" 
                          className={statusConfig.class}
                        >
                          {t(statusConfig.labelKey)}
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {zonenCount} {zonenCount === 1 ? 'Zone' : 'Zonen'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {lieferant.plz_basis} {lieferant.ort}
                        {etaMap.get(lieferant.id) && (
                          <span className="text-purple-600 ml-2">
                            • ~{Math.round(etaMap.get(lieferant.id))} Min
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowZonesDialog(lieferant)}
                      >
                        {t('liefergebiete')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedLieferant(lieferant)}
                      >
                        {t('details')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Results Count */}
      {filteredLieferanten.length > 0 && 
       filteredLieferanten.length !== lieferantenInPLZ.length && (
        <p className="text-sm text-slate-500 text-center">
          {filteredLieferanten.length} von {lieferantenInPLZ.length} Lieferanten
        </p>
      )}

      {/* Supplier Info Card */}
      <SupplierInfoCard
        supplier={selectedLieferant}
        open={!!selectedLieferant}
        onClose={() => setSelectedLieferant(null)}
        restaurantId={activeRestaurantId}
        favoriteStatus={selectedLieferant && isFavorite(selectedLieferant.id)}
      />

      {/* Zones Dialog (Read-only) */}
      <Dialog 
        open={!!showZonesDialog} 
        onOpenChange={() => setShowZonesDialog(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto z-[9999]">
          <DialogHeader>
            <DialogTitle>
              {t('liefergebiete')}: {showZonesDialog?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {getZonenForLieferant(showZonesDialog?.id).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>{t('keineLiefergebieteDefiniert')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getZonenForLieferant(showZonesDialog?.id).map(zone => (
                  <Card key={zone.id} className="p-4">
                    <h4 className="font-semibold text-slate-900 mb-2">
                      {zone.name || zone.plz || t('unbenannt')}
                    </h4>
                    <div className="space-y-1 text-sm text-slate-600">
                      <p>PLZ: {zone.plz_liste || zone.plz || '-'}</p>
                      {zone.gemeinde && (
                        <p>{t('gemeinde')}: {zone.gemeinde}</p>
                      )}
                      {zone.mindestbestellwert && (
                        <p>{t('minBestellwert')}: {zone.mindestbestellwert} €</p>
                      )}
                      {zone.lieferkosten && (
                        <p>{t('lieferkosten')}: {zone.lieferkosten} €</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}