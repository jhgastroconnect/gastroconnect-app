import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Truck, ChevronDown } from 'lucide-react';
import ProduktFilter from '@/components/katalog/ProduktFilter';
import ProduktCard from '@/components/katalog/ProduktCard';
import { Skeleton } from "@/components/ui/skeleton";
import { useRole, ROLES } from '@/components/RoleContext';
import { calculateETA } from '@/components/eta/etaCalculator';
import ETABadge from '@/components/eta/ETABadge';
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from '@/components/utils/translations';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Prüft ob ein Liefergebiet die angegebene PLZ abdeckt
 * @param liefergebiet - Liefergebiet-Objekt mit plz und plz_liste
 * @param restaurantPLZ - PLZ des Restaurants
 */
function isPLZMatch(liefergebiet: any, restaurantPLZ: string): boolean {
  if (!restaurantPLZ) return false;
  
  // Direkter Match mit einzelner PLZ
  if (liefergebiet.plz === restaurantPLZ) return true;
  
  // Match in PLZ-Liste (kommagetrennt)
  if (liefergebiet.plz_liste) {
    const plzArray = liefergebiet.plz_liste.split(',').map((p: string) => p.trim());
    return plzArray.includes(restaurantPLZ);
  }
  
  return false;
}

/**
 * Kombiniert alle Filter-Kriterien und gibt gefilterte Produkte zurück
 * @param produkte - Alle Produkte
 * @param filters - Filter-Objekt mit allen Kriterien
 */
function combineFilters(produkte: any[], filters: {
  lieferantenMitLiefergebiet: Set<string>;
  lieferantFilter: string;
  kategorie: string;
  suchtext: string;
  favoriten: any[];
  currentRole: string;
}): any[] {
  const { lieferantenMitLiefergebiet, lieferantFilter, kategorie, suchtext, favoriten, currentRole } = filters;
  
  // Schritt 1: Alle Filter anwenden
  const filtered = produkte.filter(produkt => {
    // Filter 1: PLZ-basiertes Liefergebiet
    if (!lieferantenMitLiefergebiet.has(produkt.lieferant)) {
      return false;
    }

    // Filter 2: Lieferanten-Filter (aus URL)
    if (lieferantFilter && produkt.lieferant !== lieferantFilter) {
      return false;
    }

    // Filter 3: Kategorie-Filter
    if (kategorie !== 'Alle' && produkt.kategorie !== kategorie) {
      return false;
    }

    // Filter 4: Textsuche
    if (suchtext && !produkt.name.toLowerCase().includes(suchtext.toLowerCase())) {
      return false;
    }

    return true;
  });
  
  // Schritt 2: Sortierung nach Favoriten (nur für Restaurants)
  if (currentRole === ROLES.RESTAURANT) {
    const favoritenIds = new Set(
      favoriten.filter(f => f.is_favorite_by_restaurant).map(f => f.lieferant_id)
    );
    
    return filtered.sort((a, b) => {
      const aIsFav = favoritenIds.has(a.lieferant);
      const bIsFav = favoritenIds.has(b.lieferant);
      
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      return 0;
    });
  }

  return filtered;
}

/**
 * Prüft Stock-Status eines Produkts
 * @param produkt - Produkt-Objekt
 * @returns { isAvailable, isLowStock, stockMessage }
 */
function getStockStatus(produkt: any): {
  isAvailable: boolean;
  isLowStock: boolean;
  stockMessage: string | null;
} {
  const stock = produkt.stock ?? null;
  
  // Kein Stock-Tracking
  if (stock === null || stock === undefined) {
    return { isAvailable: true, isLowStock: false, stockMessage: null };
  }
  
  // Stock = 0 → Nicht verfügbar
  if (stock === 0) {
    return { isAvailable: false, isLowStock: false, stockMessage: 'Nicht verfügbar' };
  }
  
  // Low Stock (unter 10 Einheiten)
  if (stock > 0 && stock < 10) {
    return { isAvailable: true, isLowStock: true, stockMessage: 'Begrenzter Bestand' };
  }
  
  // Ausreichend Stock
  return { isAvailable: true, isLowStock: false, stockMessage: null };
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Mobile Filter Dropdown (collapsed)
 */
function MobileFilterDropdown({
  kategorie,
  setKategorie,
  suchtext,
  setSuchtext,
  lieferantFilter,
  setLieferantFilter,
  verfuegbareLieferanten
}: any) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();
  
  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-lg"
      >
        <span className="text-sm font-medium text-slate-700">Filter</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="mt-2 p-4 bg-white border border-slate-200 rounded-lg space-y-3">
          <ProduktFilter
            kategorie={kategorie}
            setKategorie={setKategorie}
            suchtext={suchtext}
            setSuchtext={setSuchtext}
            lieferant={lieferantFilter}
            setLieferant={setLieferantFilter}
            lieferanten={verfuegbareLieferanten}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Filter-Leiste mit Lieferanten-Info und ETA-Badge (Desktop)
 */
function FilterBar({ 
  kategorie, 
  setKategorie, 
  suchtext, 
  setSuchtext,
  lieferantFilter,
  setLieferantFilter,
  verfuegbareLieferanten,
  selectedLieferant,
  selectedLieferantETA,
  currentRole
}: any) {
  const { t } = useTranslation();
  
  return (
    <div className="hidden md:block space-y-4">
      {/* Lieferant-Info mit ETA (wenn gefiltert) */}
      {lieferantFilter && currentRole === ROLES.RESTAURANT && selectedLieferant && (
        <Card className="bg-gradient-to-r from-emerald-50 to-white border-emerald-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedLieferant.name}</p>
                  <p className="text-sm text-slate-500">
                    {selectedLieferant.plz_basis} {selectedLieferant.ort}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selectedLieferantETA && <ETABadge eta={selectedLieferantETA} />}
                <button 
                  onClick={() => setLieferantFilter('')}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  ← Alle Lieferanten
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter-Komponente */}
      <ProduktFilter
        kategorie={kategorie}
        setKategorie={setKategorie}
        suchtext={suchtext}
        setSuchtext={setSuchtext}
        lieferant={lieferantFilter}
        setLieferant={setLieferantFilter}
        lieferanten={verfuegbareLieferanten}
      />
    </div>
  );
}

/**
 * Mobile Produkt Card (vereinfacht: nur Bild, Name, Preis, Button)
 */
function MobileProductCard({
  produkt,
  finalPreis,
  stockStatus
}: any) {
  const { isAvailable, isLowStock, stockMessage } = stockStatus;
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Produktbild */}
      <div className="relative h-40 bg-slate-100">
        {produkt.bild_url ? (
          <img 
            src={produkt.bild_url} 
            alt={produkt.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            Kein Bild
          </div>
        )}
        
        {/* Low Stock Badge */}
        {isLowStock && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-amber-500 text-white text-xs font-semibold rounded">
            {stockMessage}
          </div>
        )}
      </div>
      
      {/* Produkt-Info */}
      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-slate-900 text-sm line-clamp-2">
          {produkt.name}
        </h3>
        
        <p className="text-lg font-bold text-emerald-600">
          €{finalPreis.toFixed(2)}
        </p>
        
        {/* Add to Cart Button */}
        <button
          disabled={!isAvailable}
          className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            isAvailable
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isAvailable ? 'In den Warenkorb' : stockMessage}
        </button>
      </div>
    </div>
  );
}

/**
 * Desktop Produkt Card (volle Features)
 */
function DesktopProductCard({
  produkt,
  lieferant,
  finalPreis,
  hasSpecialPrice,
  preisInfo,
  standardPreis,
  isFavorite,
  stockStatus
}: any) {
  const { isAvailable, isLowStock, stockMessage } = stockStatus;
  
  return (
    <div className="relative">
      {/* Low Stock Badge (oben rechts) */}
      {isLowStock && (
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-amber-500 text-white text-xs font-semibold rounded">
          {stockMessage}
        </div>
      )}
      
      {/* Original ProduktCard mit Stock-Override */}
      <ProduktCard
        produkt={produkt}
        lieferant={lieferant}
        preis={finalPreis}
        hatIndividuellenPreis={hasSpecialPrice}
        preisInfo={preisInfo}
        standardPreis={standardPreis}
        isFavorite={isFavorite}
        stockStatus={stockStatus}
      />
    </div>
  );
}

/**
 * Wrapper für einzelne Produkt-Card (responsive)
 */
function ProductCardWrapper({ 
  produkt, 
  getLieferant,
  getPreis,
  getPreisInfo,
  hatIndividuellenPreis,
  getAktionForProdukt,
  isFavorite,
  currentRole
}: any) {
  const aktion = getAktionForProdukt(produkt.id);
  const lieferant = getLieferant(produkt.lieferant);
  const finalPreis = aktion 
    ? produkt.standard_preis * (1 - aktion.rabatt_prozent / 100) 
    : getPreis(produkt);
  const hasSpecialPrice = hatIndividuellenPreis(produkt.id) || !!aktion;
  const preisInfo = aktion 
    ? { rabatt_prozent: aktion.rabatt_prozent } 
    : getPreisInfo(produkt.id);
  
  const stockStatus = getStockStatus(produkt);
  
  return (
    <>
      {/* Mobile Version */}
      <div className="md:hidden">
        <MobileProductCard
          produkt={produkt}
          finalPreis={finalPreis}
          stockStatus={stockStatus}
        />
      </div>
      
      {/* Desktop Version */}
      <div className="hidden md:block">
        <DesktopProductCard
          produkt={produkt}
          lieferant={lieferant}
          finalPreis={finalPreis}
          hasSpecialPrice={hasSpecialPrice}
          preisInfo={preisInfo}
          standardPreis={produkt.standard_preis}
          isFavorite={currentRole === ROLES.RESTAURANT && isFavorite(produkt.lieferant)}
          stockStatus={stockStatus}
        />
      </div>
    </>
  );
}

/**
 * Produktliste mit Loading- und Empty-States
 */
function ProductList({ 
  isLoading, 
  gefilterteProdukte,
  currentRestaurant,
  currentRole,
  suchtext,
  kategorie,
  lieferantFilter,
  getLieferant,
  getPreis,
  getPreisInfo,
  hatIndividuellenPreis,
  getAktionForProdukt,
  isFavorite
}: any) {
  const { t } = useTranslation();
  
  // Loading State
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,280px)] gap-4 md:gap-6 md:justify-start">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="w-full md:w-[280px] h-[280px] md:h-[420px] bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Skeleton className="h-[120px] md:h-[180px] w-full" />
            <div className="p-3 md:p-4 space-y-2 md:space-y-3">
              <Skeleton className="h-4 md:h-5 w-3/4" />
              <Skeleton className="h-3 md:h-4 w-1/2" />
              <Skeleton className="h-8 md:h-10 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // Empty State
  if (gefilterteProdukte.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">{t('keineProdukte')}</h3>
        <p className="text-slate-500">
          {suchtext || kategorie !== 'Alle' || lieferantFilter
            ? t('versuchenSieAndere')
            : currentRestaurant?.plz 
              ? `Aktuell beliefert kein Lieferant die PLZ ${currentRestaurant.plz}.`
              : 'Aktuell sind keine Produkte verfügbar.'}
        </p>
        {!currentRestaurant?.plz && currentRole === ROLES.RESTAURANT && (
          <p className="text-sm text-amber-600 mt-2">
            Bitte legen Sie eine PLZ in den Einstellungen fest, um Lieferanten und Produkte anzuzeigen.
          </p>
        )}
        {currentRole === ROLES.RESTAURANT && !currentRestaurant && (
          <p className="text-sm text-red-600 mt-2">
            Restaurant-Profil konnte nicht geladen werden. Bitte kontaktieren Sie den Support.
          </p>
        )}
      </div>
    );
  }
  
  // Produktliste (Mobile: 1 Spalte, Desktop: Auto-fill Grid)
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,280px)] gap-4 md:gap-6 md:justify-start">
        {gefilterteProdukte.map((produkt: any) => (
          <ProductCardWrapper
            key={produkt.id}
            produkt={produkt}
            getLieferant={getLieferant}
            getPreis={getPreis}
            getPreisInfo={getPreisInfo}
            hatIndividuellenPreis={hatIndividuellenPreis}
            getAktionForProdukt={getAktionForProdukt}
            isFavorite={isFavorite}
            currentRole={currentRole}
          />
        ))}
      </div>
      
      {/* Anzahl Ergebnisse */}
      <p className="text-sm text-slate-500 text-center">
        {gefilterteProdukte.length} {t('produkteGefunden')}
      </p>
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Produktkatalog() {
  const { impersonatedRestaurant, currentRole } = useRole();
  const { t } = useTranslation();
  const isAdmin = currentRole === ROLES.ADMIN;
  
  // ========== STATE ==========
  const urlParams = new URLSearchParams(window.location.search);
  const initialLieferant = urlParams.get('lieferant') || '';
  
  const [kategorie, setKategorie] = useState('Alle');
  const [suchtext, setSuchtext] = useState('');
  const [lieferantFilter, setLieferantFilter] = useState(initialLieferant);

  // ========== DATA FETCHING ==========
  
  // Fetch User für Restaurant-Zuordnung
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
    enabled: currentRole === ROLES.RESTAURANT
  });

  // Fetch Restaurant für PLZ
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  // Fetch alle Produkte mit Auto-Refresh
  const { data: produkte = [], isLoading: produkteLoading } = useQuery({
    queryKey: ['produkte'],
    queryFn: () => base44.entities.Produkt.list(),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Fetch alle Lieferanten (nur approved/active)
  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: async () => {
      const all = await base44.entities.Lieferant.list();
      return all.filter(l => l.status === 'approved' || l.status === 'active');
    }
  });

  // Fetch Liefergebiete
  const { data: liefergebiete = [] } = useQuery({
    queryKey: ['liefergebiete'],
    queryFn: () => base44.entities.Liefergebiet.list()
  });

  // Fetch Preislisten für dieses Restaurant
  const { data: preislisten = [], isLoading: preislistenLoading } = useQuery({
    queryKey: ['preislisten-restaurant', currentRestaurant?.id],
    queryFn: async () => {
      const all = await base44.entities.Preisliste.filter({ restaurant: currentRestaurant.id });
      return all.filter(pl => pl.aktiv !== false);
    },
    enabled: !!currentRestaurant?.id
  });

  // Fetch Favoriten für Restaurant
  const { data: favoriten = [] } = useQuery({
    queryKey: ['restaurant-favoriten', currentRestaurant?.id],
    queryFn: () => base44.entities.RestaurantLieferant.filter({ restaurant_id: currentRestaurant.id }),
    enabled: !!currentRestaurant?.id && currentRole === ROLES.RESTAURANT
  });

  // Fetch aktive Aktionen
  const { data: aktionen = [] } = useQuery({
    queryKey: ['aktionen-aktiv'],
    queryFn: () => base44.entities.Aktion.list()
  });

  // ========== COMPUTED DATA ==========
  
  // Finde aktuelles Restaurant basierend auf auth_user_id
  const currentRestaurant = useMemo(() => {
    if (currentRole === ROLES.ADMIN && impersonatedRestaurant) {
      return restaurants.find(r => r.id === impersonatedRestaurant);
    }
    if (currentRole === ROLES.RESTAURANT && user) {
      return restaurants.find(r => r.auth_user_id === user.id);
    }
    return null;
  }, [restaurants, impersonatedRestaurant, currentRole, user]);

  const restaurantPLZ = currentRestaurant?.plz;

  // Aktive Aktionen (nur gültige Datum-Range)
  const aktiveAktionen = useMemo(() => {
    const heute = new Date().toISOString().split('T')[0];
    return aktionen.filter(a => 
      a.aktiv && a.start_datum <= heute && a.end_datum >= heute
    );
  }, [aktionen]);

  // Lieferanten die in die PLZ des Restaurants liefern (für Admins: alle)
  const lieferantenMitLiefergebiet = useMemo(() => {
    // Admin sieht alle Lieferanten
    if (currentRole === ROLES.ADMIN) {
      return new Set(lieferanten.map(l => l.id));
    }
    
    // Restaurant: nur Lieferanten mit passendem Liefergebiet
    if (!restaurantPLZ) return new Set();
    
    const lieferantenIds = new Set<string>();
    liefergebiete.forEach(lg => {
      if (isPLZMatch(lg, restaurantPLZ)) {
        lieferantenIds.add(lg.lieferant);
      }
    });
    
    return lieferantenIds;
  }, [liefergebiete, restaurantPLZ, currentRole, lieferanten]);

  // Preislisten als Map für schnellen Zugriff
  const preisMap = useMemo(() => {
    const map = new Map();
    preislisten.forEach(pl => {
      if (pl.individueller_preis != null || pl.rabatt_prozent != null) {
        map.set(pl.produkt, {
          individueller_preis: pl.individueller_preis,
          rabatt_prozent: pl.rabatt_prozent
        });
      }
    });
    return map;
  }, [preislisten]);

  // Gefilterte Produkte mit Favoriten-Sortierung
  const gefilterteProdukte = useMemo(() => {
    return combineFilters(produkte, {
      lieferantenMitLiefergebiet,
      lieferantFilter,
      kategorie,
      suchtext,
      favoriten,
      currentRole
    });
  }, [produkte, lieferantenMitLiefergebiet, lieferantFilter, kategorie, suchtext, favoriten, currentRole]);

  // Lieferanten für Filter-Dropdown (nur die mit Liefergebiet)
  const verfuegbareLieferanten = useMemo(() => {
    return lieferanten.filter(l => lieferantenMitLiefergebiet.has(l.id));
  }, [lieferanten, lieferantenMitLiefergebiet]);

  // Ausgewählter Lieferant (für ETA-Berechnung)
  const selectedLieferant = useMemo(() => {
    if (!lieferantFilter) return null;
    return lieferanten.find(l => l.id === lieferantFilter);
  }, [lieferantFilter, lieferanten]);

  // ETA für aktuell gewählten Lieferanten (nur für Restaurant-User)
  const selectedLieferantETA = useMemo(() => {
    if (currentRole !== ROLES.RESTAURANT || !selectedLieferant || !currentRestaurant) return null;
    return calculateETA(selectedLieferant, currentRestaurant);
  }, [selectedLieferant, currentRestaurant, currentRole]);

  // ========== HELPER FUNCTIONS ==========
  
  const getLieferant = (lieferantId: string) => {
    return lieferanten.find(l => l.id === lieferantId) || { name: 'Unbekannt', id: lieferantId };
  };

  const isFavorite = (lieferantId: string) => {
    return favoriten.some(f => f.lieferant_id === lieferantId && f.is_favorite_by_restaurant);
  };

  /**
   * Berechnet den finalen Preis für ein Produkt
   * Priorität: 1. Individueller Preis, 2. Rabatt, 3. Standard-Preis
   */
  const getPreis = (produkt: any) => {
    const preisInfo = preisMap.get(produkt.id);
    if (!preisInfo) {
      return produkt.standard_preis;
    }
    
    // Priorität 1: Individueller Preis (überschreibt alles)
    if (preisInfo.individueller_preis != null) {
      return preisInfo.individueller_preis;
    }
    
    // Priorität 2: Rabatt auf Standard-Preis anwenden
    if (preisInfo.rabatt_prozent != null) {
      return produkt.standard_preis * (1 - preisInfo.rabatt_prozent / 100);
    }
    
    // Priorität 3: Standard-Preis (Fallback)
    return produkt.standard_preis;
  };

  const getPreisInfo = (produktId: string) => {
    return preisMap.get(produktId) || null;
  };

  const hatIndividuellenPreis = (produktId: string) => {
    const info = preisMap.get(produktId);
    return info && (info.individueller_preis != null || info.rabatt_prozent != null);
  };

  const getAktionForProdukt = (produktId: string) => {
    return aktiveAktionen.find(a => 
      a.produkt_ids && a.produkt_ids.includes(produktId)
    );
  };

  // ========== RENDER ==========
  
  const isLoading = produkteLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('produktkatalog')}</h1>
        <p className="text-slate-500 mt-1">
          {isAdmin 
            ? t('alleProdukteAdminAnsicht')
            : currentRestaurant?.plz 
              ? `${t('uebersichtAlleLieferanten')} - ${t('produkteWaehlen')}`
              : t('uebersichtAlleLieferanten')
          }
        </p>
      </div>

      {/* Mobile Filter Dropdown */}
      <MobileFilterDropdown
        kategorie={kategorie}
        setKategorie={setKategorie}
        suchtext={suchtext}
        setSuchtext={setSuchtext}
        lieferantFilter={lieferantFilter}
        setLieferantFilter={setLieferantFilter}
        verfuegbareLieferanten={verfuegbareLieferanten}
      />

      {/* Desktop Filter Bar */}
      <FilterBar
        kategorie={kategorie}
        setKategorie={setKategorie}
        suchtext={suchtext}
        setSuchtext={setSuchtext}
        lieferantFilter={lieferantFilter}
        setLieferantFilter={setLieferantFilter}
        verfuegbareLieferanten={verfuegbareLieferanten}
        selectedLieferant={selectedLieferant}
        selectedLieferantETA={selectedLieferantETA}
        currentRole={currentRole}
      />

      {/* Produktliste */}
      <ProductList
        isLoading={isLoading}
        gefilterteProdukte={gefilterteProdukte}
        currentRestaurant={currentRestaurant}
        currentRole={currentRole}
        suchtext={suchtext}
        kategorie={kategorie}
        lieferantFilter={lieferantFilter}
        getLieferant={getLieferant}
        getPreis={getPreis}
        getPreisInfo={getPreisInfo}
        hatIndividuellenPreis={hatIndividuellenPreis}
        getAktionForProdukt={getAktionForProdukt}
        isFavorite={isFavorite}
      />
    </div>
  );
}