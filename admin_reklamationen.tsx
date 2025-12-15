import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, XCircle, Search, Filter, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatCard from '@/components/dashboard/StatCard';
import { useTranslation } from '@/components/utils/translations';
import { format } from 'date-fns';
import ReklamationDetailModal from '@/components/reklamationen/ReklamationDetailModal';

// ============================================================================
// ZENTRALE KONFIGURATIONEN
// ============================================================================

const STATUS_CONFIG = {
  offen: { 
    label: 'Offen', 
    color: 'bg-orange-500', 
    textColor: 'text-orange-700', 
    bgColor: 'bg-orange-50' 
  },
  in_bearbeitung: { 
    label: 'In Bearbeitung', 
    color: 'bg-blue-500', 
    textColor: 'text-blue-700', 
    bgColor: 'bg-blue-50' 
  },
  geloest: { 
    label: 'Gelöst', 
    color: 'bg-green-500', 
    textColor: 'text-green-700', 
    bgColor: 'bg-green-50' 
  },
  abgelehnt: { 
    label: 'Abgelehnt', 
    color: 'bg-red-500', 
    textColor: 'text-red-700', 
    bgColor: 'bg-red-50' 
  }
};

const TYP_CONFIG = {
  fehlend: { label: 'Fehlend', icon: '📦' },
  beschaedigt: { label: 'Beschädigt', icon: '💔' },
  falsch: { label: 'Falsch', icon: '❌' },
  qualitaet: { label: 'Qualität', icon: '⚠️' },
  sonstiges: { label: 'Sonstiges', icon: '📝' }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Reklamationen in einem einzigen Durchlauf
 */
function calculateStats(reklamationen) {
  const stats = {
    offen: 0,
    inBearbeitung: 0,
    geloest: 0,
    abgelehnt: 0
  };

  reklamationen.forEach(r => {
    if (r.status === 'offen') stats.offen++;
    else if (r.status === 'in_bearbeitung') stats.inBearbeitung++;
    else if (r.status === 'geloest') stats.geloest++;
    else if (r.status === 'abgelehnt') stats.abgelehnt++;
  });

  return stats;
}

/**
 * Filtert Reklamationen basierend auf allen aktiven Filtern
 * Verwendet Maps für O(1) Lookups
 */
function filterReklamationen({
  reklamationen,
  statusFilter,
  restaurantFilter,
  lieferantFilter,
  searchText,
  bestellungenMap,
  restaurantsMap,
  lieferantenMap
}) {
  return reklamationen.filter(r => {
    // Status Filter
    if (statusFilter !== 'alle' && r.status !== statusFilter) {
      return false;
    }

    // Restaurant Filter
    if (restaurantFilter !== 'alle' && r.restaurant !== restaurantFilter) {
      return false;
    }

    // Lieferant Filter
    if (lieferantFilter !== 'alle' && r.lieferant !== lieferantFilter) {
      return false;
    }

    // Search Filter
    if (searchText) {
      const search = searchText.toLowerCase();
      
      // Bestellung Nummer
      const bestellung = bestellungenMap.get(r.bestellung);
      const bestellNr = bestellung ? `#${bestellung.id.slice(-6)}` : 'unbekannt';
      if (bestellNr.toLowerCase().includes(search)) return true;

      // Restaurant Name
      const restaurant = restaurantsMap.get(r.restaurant);
      const restaurantName = restaurant?.name || 'unbekannt';
      if (restaurantName.toLowerCase().includes(search)) return true;

      // Lieferant Name
      const lieferant = lieferantenMap.get(r.lieferant);
      const lieferantName = lieferant?.name || 'unbekannt';
      if (lieferantName.toLowerCase().includes(search)) return true;

      // Beschreibung
      if (r.beschreibung?.toLowerCase().includes(search)) return true;

      return false;
    }

    return true;
  });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminReklamationen() {
  const { t } = useTranslation();
  
  // State
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [restaurantFilter, setRestaurantFilter] = useState('alle');
  const [lieferantFilter, setLieferantFilter] = useState('alle');
  const [selectedReklamation, setSelectedReklamation] = useState(null);

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { 
    data: reklamationen = [], 
    isLoading: reklamationenLoading,
    isError: reklamationenError 
  } = useQuery({
    queryKey: ['reklamationen'],
    queryFn: () => base44.entities.Reklamation.list('-created_date'),
    staleTime: 2 * 60 * 1000 // 2 Minuten
  });

  // TODO F11: Später umstellen auf id__in-basierte Queries
  // 1. Extrahiere unique IDs aus reklamationen: bestellung_ids, restaurant_ids, lieferant_ids
  // 2. Lade nur benötigte Entitäten: base44.entities.Bestellung.list({ id__in: bestellung_ids })
  // 3. Reduziert Query-Last erheblich bei vielen Reklamationen
  const { 
    data: bestellungen = [],
    isLoading: bestellungenLoading,
    isError: bestellungenError
  } = useQuery({
    queryKey: ['bestellungen'],
    queryFn: () => base44.entities.Bestellung.list(),
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  const { 
    data: restaurants = [],
    isLoading: restaurantsLoading,
    isError: restaurantsError
  } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list(),
    staleTime: 10 * 60 * 1000 // 10 Minuten
  });

  const { 
    data: lieferanten = [],
    isLoading: lieferantenLoading,
    isError: lieferantenError
  } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list(),
    staleTime: 10 * 60 * 1000 // 10 Minuten
  });

  // ============================================================================
  // MAPS für O(1) Lookups
  // ============================================================================

  const bestellungenMap = useMemo(() => {
    return new Map(bestellungen.map(b => [b.id, b]));
  }, [bestellungen]);

  const restaurantsMap = useMemo(() => {
    return new Map(restaurants.map(r => [r.id, r]));
  }, [restaurants]);

  const lieferantenMap = useMemo(() => {
    return new Map(lieferanten.map(l => [l.id, l]));
  }, [lieferanten]);

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  // KPIs - Single Pass über alle Reklamationen
  const stats = useMemo(() => {
    return calculateStats(reklamationen);
  }, [reklamationen]);

  // Gefilterte Reklamationen
  const filteredReklamationen = useMemo(() => {
    return filterReklamationen({
      reklamationen,
      statusFilter,
      restaurantFilter,
      lieferantFilter,
      searchText,
      bestellungenMap,
      restaurantsMap,
      lieferantenMap
    });
  }, [
    reklamationen, 
    statusFilter, 
    restaurantFilter, 
    lieferantFilter, 
    searchText,
    bestellungenMap,
    restaurantsMap,
    lieferantenMap
  ]);

  // ============================================================================
  // HELPER FUNCTIONS (mit Maps)
  // ============================================================================

  const getBestellungNummer = (bestellungId) => {
    const bestellung = bestellungenMap.get(bestellungId);
    return bestellung ? `#${bestellung.id.slice(-6)}` : 'Unbekannt';
  };

  const getRestaurantName = (restaurantId) => {
    return restaurantsMap.get(restaurantId)?.name || 'Unbekannt';
  };

  const getLieferantName = (lieferantId) => {
    return lieferantenMap.get(lieferantId)?.name || 'Unbekannt';
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = reklamationenLoading || bestellungenLoading || restaurantsLoading || lieferantenLoading;
  const hasError = reklamationenError || bestellungenError || restaurantsError || lieferantenError;

  if (hasError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reklamationen & Kommunikation (Admin)</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fehler beim Laden</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Die Daten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
              </p>
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
        <h1 className="text-2xl font-bold text-gray-900">Reklamationen & Kommunikation (Admin)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Übersicht aller Reklamationen und Chats im System
        </p>
      </div>

      <Tabs defaultValue="reklamationen" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reklamationen">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Reklamationen
          </TabsTrigger>
          <TabsTrigger value="chats">
            <MessageSquare className="h-4 w-4 mr-2" />
            Chats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reklamationen" className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Offen"
              value={stats.offen}
              icon={AlertTriangle}
              color="orange"
              subtitle="Warten auf Bearbeitung"
            />
            <StatCard
              title="In Bearbeitung"
              value={stats.inBearbeitung}
              icon={Clock}
              color="blue"
              subtitle="Werden bearbeitet"
            />
            <StatCard
              title="Gelöst"
              value={stats.geloest}
              icon={CheckCircle2}
              color="emerald"
              subtitle="Erfolgreich abgeschlossen"
            />
            <StatCard
              title="Abgelehnt"
              value={stats.abgelehnt}
              icon={XCircle}
              color="red"
              subtitle="Nicht berechtigt"
            />
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Bestellung, Restaurant oder Lieferant..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Status</SelectItem>
                    <SelectItem value="offen">Offen</SelectItem>
                    <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                    <SelectItem value="geloest">Gelöst</SelectItem>
                    <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>

                {/* Restaurant Filter */}
                <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Restaurant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Restaurants</SelectItem>
                    {restaurants.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Lieferant Filter */}
                <Select value={lieferantFilter} onValueChange={setLieferantFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Lieferant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Lieferanten</SelectItem>
                    {lieferanten.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active Filters */}
              {(searchText || statusFilter !== 'alle' || restaurantFilter !== 'alle' || lieferantFilter !== 'alle') && (
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="text-sm text-gray-500">Aktive Filter:</span>
                  {searchText && (
                    <Badge variant="secondary" className="gap-1">
                      Suche: {searchText}
                      <button onClick={() => setSearchText('')} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  {statusFilter !== 'alle' && (
                    <Badge variant="secondary" className="gap-1">
                      Status: {STATUS_CONFIG[statusFilter]?.label}
                      <button onClick={() => setStatusFilter('alle')} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  {restaurantFilter !== 'alle' && (
                    <Badge variant="secondary" className="gap-1">
                      Restaurant: {getRestaurantName(restaurantFilter)}
                      <button onClick={() => setRestaurantFilter('alle')} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  {lieferantFilter !== 'alle' && (
                    <Badge variant="secondary" className="gap-1">
                      Lieferant: {getLieferantName(lieferantFilter)}
                      <button onClick={() => setLieferantFilter('alle')} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">×</button>
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchText('');
                      setStatusFilter('alle');
                      setRestaurantFilter('alle');
                      setLieferantFilter('alle');
                    }}
                    className="text-xs"
                  >
                    Alle zurücksetzen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reklamationen Liste */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Reklamationen ({filteredReklamationen.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : filteredReklamationen.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Keine Reklamationen gefunden</p>
                  <p className="text-sm text-gray-400 mt-1">Passen Sie Ihre Filterkriterien an</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReklamationen.map(reklamation => {
                    const statusInfo = STATUS_CONFIG[reklamation.status];
                    const typInfo = TYP_CONFIG[reklamation.typ];

                    return (
                      <div
                        key={reklamation.id}
                        className="border rounded-lg p-4 hover:border-gray-400 transition-colors cursor-pointer"
                        onClick={() => setSelectedReklamation(reklamation)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <Badge className={statusInfo.color}>
                                {statusInfo.label}
                              </Badge>
                              <Badge variant="outline">
                                {typInfo.icon} {typInfo.label}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                Bestellung: {getBestellungNummer(reklamation.bestellung)}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500">Restaurant:</span>
                                <p className="font-medium">{getRestaurantName(reklamation.restaurant)}</p>
                              </div>
                              <div>
                                <span className="text-gray-500">Lieferant:</span>
                                <p className="font-medium">{getLieferantName(reklamation.lieferant)}</p>
                              </div>
                            </div>

                            <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                              {reklamation.beschreibung}
                            </p>

                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span>Erstellt: {format(new Date(reklamation.created_date), 'dd.MM.yyyy HH:mm')}</span>
                              {reklamation.geloest_am && (
                                <span>Gelöst: {format(new Date(reklamation.geloest_am), 'dd.MM.yyyy HH:mm')}</span>
                              )}
                            </div>
                          </div>

                          <Button variant="outline" size="sm">
                            Details
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chats">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Chat-Übersicht</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  Die Chat-Funktion wird in Kürze verfügbar sein. Sie können dann alle Chats zwischen Restaurants und Lieferanten einsehen.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      {selectedReklamation && (
        <ReklamationDetailModal
          reklamation={selectedReklamation}
          bestellung={bestellungenMap.get(selectedReklamation.bestellung)}
          restaurant={restaurantsMap.get(selectedReklamation.restaurant)}
          lieferant={lieferantenMap.get(selectedReklamation.lieferant)}
          open={!!selectedReklamation}
          onClose={() => setSelectedReklamation(null)}
          isAdmin={true}
        />
      )}
    </div>
  );
}