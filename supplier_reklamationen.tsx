import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Search, MessageSquare, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useRole } from '@/components/RoleContext';
import { useTranslation } from '@/components/utils/translations';
import { format } from 'date-fns';
import ReklamationDetailModal from '@/components/reklamationen/ReklamationDetailModal';
import StatCard from '@/components/dashboard/StatCard';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LIEFERANT_ID = '692b17e8f6d6cf27327c0e4f';

/**
 * Zentrale Status-Konfiguration für Reklamationen
 */
const COMPLAINT_STATUS = {
  offen: {
    label: 'Offen',
    color: 'bg-orange-500'
  },
  in_bearbeitung: {
    label: 'In Bearbeitung',
    color: 'bg-blue-500'
  },
  geloest: {
    label: 'Gelöst',
    color: 'bg-green-500'
  },
  abgelehnt: {
    label: 'Abgelehnt',
    color: 'bg-red-500'
  }
} as const;

/**
 * Typen-Konfiguration für Reklamationen
 */
const COMPLAINT_TYPE = {
  fehlend: {
    label: 'Fehlend',
    icon: '📦'
  },
  beschaedigt: {
    label: 'Beschädigt',
    icon: '💔'
  },
  falsch: {
    label: 'Falsch',
    icon: '❌'
  },
  qualitaet: {
    label: 'Qualität',
    icon: '⚠️'
  },
  sonstiges: {
    label: 'Sonstiges',
    icon: '📝'
  }
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Erstellt eine Map für schnellen Bestellungs-Lookup
 */
function createOrderMap(bestellungen: any[]): Map<string, any> {
  return new Map(bestellungen.map(b => [b.id, b]));
}

/**
 * Erstellt eine Map für schnellen Restaurant-Lookup
 */
function createRestaurantMap(restaurants: any[]): Map<string, any> {
  return new Map(restaurants.map(r => [r.id, r]));
}

/**
 * Gibt Status-Konfiguration zurück
 */
function getStatusConfig(status: string) {
  return COMPLAINT_STATUS[status as keyof typeof COMPLAINT_STATUS] || COMPLAINT_STATUS.offen;
}

/**
 * Gibt Typ-Konfiguration zurück
 */
function getTypeConfig(typ: string) {
  return COMPLAINT_TYPE[typ as keyof typeof COMPLAINT_TYPE] || COMPLAINT_TYPE.sonstiges;
}

/**
 * Formatiert Bestellungs-Nummer für Anzeige
 */
function formatOrderNumber(bestellungId: string, orderMap: Map<string, any>): string {
  const bestellung = orderMap.get(bestellungId);
  return bestellung ? `#${bestellung.id.slice(-6)}` : 'Unbekannt';
}

/**
 * Gibt Restaurant-Namen zurück
 */
function getRestaurantName(restaurantId: string, restaurantMap: Map<string, any>): string {
  return restaurantMap.get(restaurantId)?.name || 'Unbekannt';
}

/**
 * Formatiert Datum für Anzeige
 */
function formatDate(dateString: string): string {
  return format(new Date(dateString), 'dd.MM.yyyy HH:mm');
}

/**
 * Berechnet KPIs für alle Status in einem einzigen Durchlauf
 */
function calculateComplaintStats(reklamationen: any[]): {
  offen: number;
  inBearbeitung: number;
  geloest: number;
  abgelehnt: number;
} {
  return reklamationen.reduce(
    (stats, r) => {
      if (r.status === 'offen') stats.offen++;
      else if (r.status === 'in_bearbeitung') stats.inBearbeitung++;
      else if (r.status === 'geloest') stats.geloest++;
      else if (r.status === 'abgelehnt') stats.abgelehnt++;
      return stats;
    },
    { offen: 0, inBearbeitung: 0, geloest: 0, abgelehnt: 0 }
  );
}

/**
 * Filtert Reklamationen nach allen Kriterien mit O(1) Map-Lookups
 */
function filterComplaints(
  reklamationen: any[],
  filters: {
    statusFilter: string;
    searchText: string;
  },
  orderMap: Map<string, any>,
  restaurantMap: Map<string, any>
): any[] {
  const { statusFilter, searchText } = filters;
  
  return reklamationen.filter(r => {
    // Filter 1: Status
    if (statusFilter !== 'alle' && r.status !== statusFilter) {
      return false;
    }
    
    // Filter 2: Suchtext (Bestellung, Restaurant, Beschreibung)
    if (searchText) {
      const search = searchText.toLowerCase();
      const bestellNr = formatOrderNumber(r.bestellung, orderMap).toLowerCase();
      const restaurantName = getRestaurantName(r.restaurant, restaurantMap).toLowerCase();
      const beschreibung = (r.beschreibung || '').toLowerCase();
      
      return bestellNr.includes(search) ||
             restaurantName.includes(search) ||
             beschreibung.includes(search);
    }
    
    return true;
  });
}

/**
 * Ermittelt aktive Lieferanten-ID basierend auf User/Impersonation
 */
function getActiveSupplierId(
  impersonatedLieferant: string | null,
  currentUser: any,
  lieferanten: any[]
): string {
  if (impersonatedLieferant) return impersonatedLieferant;
  
  if (currentUser) {
    const userLieferant = lieferanten.find(
      l => l.auth_user_id === currentUser.id || l.email === currentUser.email
    );
    if (userLieferant) return userLieferant.id;
  }
  
  return DEFAULT_LIEFERANT_ID;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Loading Skeleton für Reklamationsliste
 */
function ComplaintsLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

/**
 * Error State
 */
function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
      <p className="text-gray-900 font-medium mb-1">Fehler beim Laden</p>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

/**
 * Empty State - Keine Reklamationen
 */
function EmptyComplaintsState({
  hasFilters
}: {
  hasFilters: boolean;
}) {
  return (
    <div className="text-center py-12">
      <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500">Keine Reklamationen vorhanden</p>
      <p className="text-sm text-gray-400 mt-1">
        {hasFilters 
          ? 'Passen Sie Ihre Filter an' 
          : 'Es liegen keine Reklamationen vor'}
      </p>
    </div>
  );
}

/**
 * Einzelne Reklamations-Card
 */
function ComplaintCard({
  reklamation,
  orderMap,
  restaurantMap,
  onSelect
}: {
  reklamation: any;
  orderMap: Map<string, any>;
  restaurantMap: Map<string, any>;
  onSelect: (r: any) => void;
}) {
  const statusInfo = getStatusConfig(reklamation.status);
  const typInfo = getTypeConfig(reklamation.typ);
  const orderNumber = formatOrderNumber(reklamation.bestellung, orderMap);
  const restaurantName = getRestaurantName(reklamation.restaurant, restaurantMap);
  const createdDate = formatDate(reklamation.created_date);
  
  return (
    <div
      className="border rounded-lg p-4 hover:border-gray-400 transition-colors cursor-pointer"
      onClick={() => onSelect(reklamation)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge className={statusInfo.color}>
              {statusInfo.label}
            </Badge>
            <Badge variant="outline">
              {typInfo.icon} {typInfo.label}
            </Badge>
            <span className="text-sm text-gray-500">
              Bestellung: {orderNumber}
            </span>
          </div>
          
          {/* Restaurant & Beschreibung */}
          <p className="text-sm font-medium mb-1">{restaurantName}</p>
          <p className="text-sm text-gray-600 line-clamp-2">
            {reklamation.beschreibung}
          </p>

          {/* Datum */}
          <div className="text-xs text-gray-500 mt-2">
            Erstellt: {createdDate}
          </div>
        </div>

        <Button variant="outline" size="sm">Details</Button>
      </div>
    </div>
  );
}

/**
 * Reklamationen-Liste
 */
function ComplaintsList({
  reklamationen,
  orderMap,
  restaurantMap,
  isLoading,
  isError,
  hasFilters,
  onSelectReklamation
}: {
  reklamationen: any[];
  orderMap: Map<string, any>;
  restaurantMap: Map<string, any>;
  isLoading: boolean;
  isError: boolean;
  hasFilters: boolean;
  onSelectReklamation: (r: any) => void;
}) {
  if (isLoading) {
    return <ComplaintsLoadingSkeleton />;
  }
  
  if (isError) {
    return <ErrorState message="Die Reklamationen konnten nicht geladen werden." />;
  }
  
  if (reklamationen.length === 0) {
    return <EmptyComplaintsState hasFilters={hasFilters} />;
  }
  
  return (
    <div className="space-y-3">
      {reklamationen.map(reklamation => (
        <ComplaintCard
          key={reklamation.id}
          reklamation={reklamation}
          orderMap={orderMap}
          restaurantMap={restaurantMap}
          onSelect={onSelectReklamation}
        />
      ))}
    </div>
  );
}

/**
 * Chat-Tab Placeholder
 */
function ChatTabPlaceholder() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center py-12">
          <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Chat-Funktion
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Die Chat-Funktion wird in Kürze verfügbar sein. Sie können dann direkt 
            mit Ihren Restaurant-Kunden kommunizieren.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LieferantReklamationen() {
  const { t } = useTranslation();
  const { impersonatedLieferant } = useRole();
  
  // ========== STATE ==========
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [selectedReklamation, setSelectedReklamation] = useState<any>(null);

  // ========== DATA FETCHING ==========
  
  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch Lieferanten
  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  // Active Lieferant ID
  const activeLieferantId = useMemo(
    () => getActiveSupplierId(impersonatedLieferant, currentUser, lieferanten),
    [impersonatedLieferant, currentUser, lieferanten]
  );

  // Fetch Reklamationen für diesen Lieferanten
  const {
    data: reklamationen = [],
    isLoading: reklamationenLoading,
    isError: reklamationenError
  } = useQuery({
    queryKey: ['reklamationen', activeLieferantId],
    queryFn: () => base44.entities.Reklamation.filter(
      { lieferant: activeLieferantId },
      '-created_date'
    ),
    enabled: !!activeLieferantId,
    staleTime: 60 * 1000  // 1 Minute Cache
  });

  // Fetch Bestellungen
  // TODO: Sollte auf filter({ id__in: [...] }) optimiert werden
  // Aktuell werden ALLE Bestellungen geladen, obwohl nur 5-10 benötigt werden
  const {
    data: bestellungen = [],
    isLoading: bestellungenLoading,
    isError: bestellungenError
  } = useQuery({
    queryKey: ['bestellungen'],
    queryFn: () => base44.entities.Bestellung.list(),
    staleTime: 5 * 60 * 1000  // 5 Minuten Cache
  });

  // Fetch Restaurants
  // TODO: Sollte auf filter({ id__in: [...] }) optimiert werden
  // Aktuell werden ALLE Restaurants geladen, obwohl nur 3-5 benötigt werden
  const {
    data: restaurants = [],
    isLoading: restaurantsLoading,
    isError: restaurantsError
  } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list(),
    staleTime: 5 * 60 * 1000  // 5 Minuten Cache
  });

  // ========== COMPUTED DATA ==========
  
  // Maps für O(1) Lookups statt O(n)
  const orderMap = useMemo(
    () => createOrderMap(bestellungen),
    [bestellungen]
  );
  
  const restaurantMap = useMemo(
    () => createRestaurantMap(restaurants),
    [restaurants]
  );

  // KPIs in einem einzigen Durchlauf berechnen
  const stats = useMemo(
    () => calculateComplaintStats(reklamationen),
    [reklamationen]
  );

  // Gefilterte Reklamationen mit O(1) Map-Lookups
  const filteredReklamationen = useMemo(
    () => filterComplaints(
      reklamationen,
      { statusFilter, searchText },
      orderMap,
      restaurantMap
    ),
    [reklamationen, statusFilter, searchText, orderMap, restaurantMap]
  );

  // Loading/Error States
  const isLoading = reklamationenLoading || bestellungenLoading || restaurantsLoading;
  const isError = reklamationenError || bestellungenError || restaurantsError;
  const hasFilters = statusFilter !== 'alle' || searchText !== '';

  // ========== EVENT HANDLERS ==========
  
  const handleSelectReklamation = (reklamation: any) => {
    setSelectedReklamation(reklamation);
  };

  const handleCloseDetail = () => {
    setSelectedReklamation(null);
  };

  // ========== RENDER ==========

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Reklamationen & Kommunikation
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Reklamationen bearbeiten und mit Restaurants kommunizieren
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

        {/* Reklamationen Tab */}
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
              subtitle="Erfolgreich"
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Bestellung oder Restaurant suchen..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-9"
                  />
                </div>
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
              </div>
            </CardContent>
          </Card>

          {/* Reklamationen Liste */}
          <Card>
            <CardHeader>
              <CardTitle>
                Reklamationen ({filteredReklamationen.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ComplaintsList
                reklamationen={filteredReklamationen}
                orderMap={orderMap}
                restaurantMap={restaurantMap}
                isLoading={isLoading}
                isError={isError}
                hasFilters={hasFilters}
                onSelectReklamation={handleSelectReklamation}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chats">
          <ChatTabPlaceholder />
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      {selectedReklamation && (
        <ReklamationDetailModal
          reklamation={selectedReklamation}
          bestellung={orderMap.get(selectedReklamation.bestellung)}
          restaurant={restaurantMap.get(selectedReklamation.restaurant)}
          lieferant={lieferanten.find(l => l.id === activeLieferantId)}
          open={!!selectedReklamation}
          onClose={handleCloseDetail}
          isLieferant={true}
        />
      )}
    </div>
  );
}