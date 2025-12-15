import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search, MessageSquare, AlertCircle } from 'lucide-react';
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
import ReklamationErstellenDialog from '@/components/reklamationen/ReklamationErstellenDialog';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

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
 * Erstellt eine Map für schnellen Lieferanten-Lookup
 */
function createSupplierMap(lieferanten: any[]): Map<string, any> {
  return new Map(lieferanten.map(l => [l.id, l]));
}

/**
 * Erstellt eine Map für schnellen Bestellungs-Lookup
 */
function createOrderMap(bestellungen: any[]): Map<string, any> {
  return new Map(bestellungen.map(b => [b.id, b]));
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
  return bestellung ? `#${bestellung.id.slice(-6).toUpperCase()}` : 'Unbekannt';
}

/**
 * Gibt Lieferanten-Namen zurück
 */
function getSupplierName(lieferantId: string, supplierMap: Map<string, any>): string {
  return supplierMap.get(lieferantId)?.name || 'Unbekannt';
}

/**
 * Formatiert Datum für Anzeige
 */
function formatDate(dateString: string): string {
  return format(new Date(dateString), 'dd.MM.yyyy HH:mm');
}

/**
 * Filtert Reklamationen nach allen Kriterien
 */
function filterComplaints(
  reklamationen: any[],
  filters: {
    statusFilter: string;
    searchText: string;
  },
  orderMap: Map<string, any>,
  supplierMap: Map<string, any>
): any[] {
  const { statusFilter, searchText } = filters;
  
  return reklamationen.filter(r => {
    // Filter 1: Status
    if (statusFilter !== 'alle' && r.status !== statusFilter) {
      return false;
    }
    
    // Filter 2: Suchtext (Bestellung, Lieferant, Beschreibung)
    if (searchText) {
      const search = searchText.toLowerCase();
      const bestellNr = formatOrderNumber(r.bestellung, orderMap).toLowerCase();
      const lieferantName = getSupplierName(r.lieferant, supplierMap).toLowerCase();
      const beschreibung = (r.beschreibung || '').toLowerCase();
      
      return bestellNr.includes(search) ||
             lieferantName.includes(search) ||
             beschreibung.includes(search);
    }
    
    return true;
  });
}

/**
 * Ermittelt aktive Restaurant-ID basierend auf User/Impersonation
 */
function getActiveRestaurantId(
  impersonatedRestaurant: string | null,
  currentUser: any,
  restaurants: any[]
): string {
  if (impersonatedRestaurant) return impersonatedRestaurant;
  
  if (currentUser) {
    const userRestaurant = restaurants.find(
      r => r.auth_user_id === currentUser.id || r.email === currentUser.email
    );
    if (userRestaurant) return userRestaurant.id;
  }
  
  return DEFAULT_RESTAURANT_ID;
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
          : 'Erstellen Sie Ihre erste Reklamation'}
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
  supplierMap,
  onSelect
}: {
  reklamation: any;
  orderMap: Map<string, any>;
  supplierMap: Map<string, any>;
  onSelect: (r: any) => void;
}) {
  const statusInfo = getStatusConfig(reklamation.status);
  const typInfo = getTypeConfig(reklamation.typ);
  const orderNumber = formatOrderNumber(reklamation.bestellung, orderMap);
  const supplierName = getSupplierName(reklamation.lieferant, supplierMap);
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
          
          {/* Lieferant & Beschreibung */}
          <p className="text-sm font-medium mb-1">{supplierName}</p>
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
  supplierMap,
  isLoading,
  isError,
  hasFilters,
  onSelectReklamation
}: {
  reklamationen: any[];
  orderMap: Map<string, any>;
  supplierMap: Map<string, any>;
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
          supplierMap={supplierMap}
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
            mit Ihren Lieferanten kommunizieren.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RestaurantReklamationen() {
  const { t } = useTranslation();
  const { impersonatedRestaurant } = useRole();
  
  // ========== STATE ==========
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [selectedReklamation, setSelectedReklamation] = useState<any>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [preselectedBestellung, setPreselectedBestellung] = useState<string | null>(null);

  // ========== DATA FETCHING ==========
  
  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Fetch Restaurants
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  // Active Restaurant ID
  const activeRestaurantId = useMemo(
    () => getActiveRestaurantId(impersonatedRestaurant, currentUser, restaurants),
    [impersonatedRestaurant, currentUser, restaurants]
  );

  // Fetch Reklamationen
  const {
    data: reklamationen = [],
    isLoading: reklamationenLoading,
    isError: reklamationenError
  } = useQuery({
    queryKey: ['reklamationen', activeRestaurantId],
    queryFn: () => base44.entities.Reklamation.filter(
      { restaurant: activeRestaurantId },
      '-created_date'
    ),
    enabled: !!activeRestaurantId,
    staleTime: 60 * 1000  // 1 Minute Cache
  });

  // Fetch Bestellungen
  const {
    data: bestellungen = [],
    isLoading: bestellungenLoading,
    isError: bestellungenError
  } = useQuery({
    queryKey: ['bestellungen', activeRestaurantId],
    queryFn: () => base44.entities.Bestellung.filter(
      { restaurant: activeRestaurantId },
      '-bestelldatum'
    ),
    enabled: !!activeRestaurantId,
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Fetch Lieferanten
  const {
    data: lieferanten = [],
    isLoading: lieferantenLoading,
    isError: lieferantenError
  } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list(),
    staleTime: 5 * 60 * 1000  // 5 Minuten Cache
  });

  // ========== COMPUTED DATA ==========
  
  // Maps für O(1) Lookups
  const supplierMap = useMemo(
    () => createSupplierMap(lieferanten),
    [lieferanten]
  );
  
  const orderMap = useMemo(
    () => createOrderMap(bestellungen),
    [bestellungen]
  );

  // Gefilterte Reklamationen
  const filteredReklamationen = useMemo(
    () => filterComplaints(
      reklamationen,
      { statusFilter, searchText },
      orderMap,
      supplierMap
    ),
    [reklamationen, statusFilter, searchText, orderMap, supplierMap]
  );

  // Loading/Error States
  const isLoading = reklamationenLoading || bestellungenLoading || lieferantenLoading;
  const isError = reklamationenError || bestellungenError || lieferantenError;
  const hasFilters = statusFilter !== 'alle' || searchText !== '';

  // ========== EFFECTS ==========
  
  // URL Parameter für vorausgewählte Bestellung
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const bestellungId = urlParams.get('bestellung');
    
    if (bestellungId && bestellungen.length > 0) {
      setPreselectedBestellung(bestellungId);
      setCreateDialogOpen(true);
      
      // URL parameter entfernen nach dem Öffnen
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [bestellungen]);

  // ========== EVENT HANDLERS ==========
  
  const handleSelectReklamation = (reklamation: any) => {
    setSelectedReklamation(reklamation);
  };

  const handleCloseDetail = () => {
    setSelectedReklamation(null);
  };

  const handleOpenCreateDialog = () => {
    setCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setPreselectedBestellung(null);
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
          Reklamationen verwalten und mit Lieferanten kommunizieren
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
          <div className="flex justify-end">
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Reklamation
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Bestellung oder Lieferant suchen..."
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
                Meine Reklamationen ({filteredReklamationen.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ComplaintsList
                reklamationen={filteredReklamationen}
                orderMap={orderMap}
                supplierMap={supplierMap}
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
          restaurant={restaurants.find(r => r.id === activeRestaurantId)}
          lieferant={supplierMap.get(selectedReklamation.lieferant)}
          open={!!selectedReklamation}
          onClose={handleCloseDetail}
        />
      )}

      {/* Create Dialog */}
      <ReklamationErstellenDialog
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        restaurantId={activeRestaurantId}
        bestellungen={bestellungen}
        lieferanten={lieferanten}
        preselectedBestellungId={preselectedBestellung}
      />
    </div>
  );
}