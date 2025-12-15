import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Truck } from 'lucide-react';
import ProduktFilter from '@/components/katalog/ProduktFilter';
import ProduktCard from '@/components/katalog/ProduktCard';
import { Skeleton } from "@/components/ui/skeleton";
import { useRole, ROLES } from '@/components/RoleContext';
import { calculateETA } from '@/components/eta/etaCalculator';
import ETABadge from '@/components/eta/ETABadge';
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from '@/components/utils/translations';

export default function Produktkatalog() {
  const { impersonatedRestaurant, currentRole } = useRole();
  const { t } = useTranslation();
  const isAdmin = currentRole === ROLES.ADMIN;
  
  // URL-Parameter für Lieferanten-Filter
  const urlParams = new URLSearchParams(window.location.search);
  const initialLieferant = urlParams.get('lieferant') || '';
  
  const [kategorie, setKategorie] = useState('Alle');
  const [suchtext, setSuchtext] = useState('');
  const [lieferantFilter, setLieferantFilter] = useState(initialLieferant);

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
  
  console.log('Current Restaurant:', currentRestaurant, 'PLZ:', restaurantPLZ);

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
      // Nur aktive Einträge zurückgeben
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

  // Aktive Aktionen (nur gültige)
  const aktiveAktionen = useMemo(() => {
    const heute = new Date().toISOString().split('T')[0];
    return aktionen.filter(a => 
      a.aktiv && a.start_datum <= heute && a.end_datum >= heute
    );
  }, [aktionen]);

  // Aktion für Produkt finden
  const getAktionForProdukt = (produktId) => {
    return aktiveAktionen.find(a => 
      a.produkt_ids && a.produkt_ids.includes(produktId)
    );
  };

  // Lieferanten die in die PLZ des Restaurants liefern (für Admins: alle)
  const lieferantenMitLiefergebiet = useMemo(() => {
    // Admin sieht alle Lieferanten
    if (currentRole === ROLES.ADMIN) {
      return new Set(lieferanten.map(l => l.id));
    }
    // Restaurant: nur Lieferanten mit passendem Liefergebiet
    if (!restaurantPLZ) return new Set();
    
    // Finde Lieferanten, die diese PLZ beliefern
    const lieferantenIds = new Set();
    liefergebiete.forEach(lg => {
      // Prüfe sowohl einzelne PLZ als auch PLZ-Liste
      const plzMatch = lg.plz === restaurantPLZ || 
                       (lg.plz_liste && lg.plz_liste.split(',').map(p => p.trim()).includes(restaurantPLZ));
      if (plzMatch) {
        lieferantenIds.add(lg.lieferant);
      }
    });
    
    console.log('Restaurant PLZ:', restaurantPLZ, 'Lieferanten mit Liefergebiet:', Array.from(lieferantenIds));
    return lieferantenIds;
  }, [liefergebiete, restaurantPLZ, currentRole, lieferanten]);

  // Preislisten als Map für schnellen Zugriff (nur aktive)
  const preisMap = useMemo(() => {
    const map = new Map();
    preislisten.forEach(pl => {
      // Nur wenn individueller Preis oder Rabatt gesetzt ist
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
    console.log('Filtering products. Total products:', produkte.length, 'Lieferanten IDs:', Array.from(lieferantenMitLiefergebiet));
    
    const filtered = produkte.filter(produkt => {
      // PLZ-Filter: nur Produkte von Lieferanten die hierher liefern
      const hasDeliveryArea = lieferantenMitLiefergebiet.has(produkt.lieferant);
      if (!hasDeliveryArea) {
        return false;
      }

      // Lieferanten-Filter aus URL
      if (lieferantFilter && produkt.lieferant !== lieferantFilter) {
        return false;
      }

      // Kategorie-Filter
      if (kategorie !== 'Alle' && produkt.kategorie !== kategorie) {
        return false;
      }

      // Textsuche
      if (suchtext && !produkt.name.toLowerCase().includes(suchtext.toLowerCase())) {
        return false;
      }

      return true;
    });
    
    console.log('Filtered products:', filtered.length);

    // Favoriten-Sortierung nur für Restaurants
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
  }, [produkte, kategorie, suchtext, lieferantenMitLiefergebiet, lieferantFilter, favoriten, currentRole]);

  // Lieferanten für Filter-Dropdown (nur die mit Liefergebiet)
  const verfuegbareLieferanten = useMemo(() => {
    return lieferanten.filter(l => lieferantenMitLiefergebiet.has(l.id));
  }, [lieferanten, lieferantenMitLiefergebiet]);

  // ETA für aktuell gewählten Lieferanten (nur für Restaurant-User)
  const selectedLieferantETA = useMemo(() => {
    if (currentRole !== ROLES.RESTAURANT || !lieferantFilter || !currentRestaurant) return null;
    const lieferant = lieferanten.find(l => l.id === lieferantFilter);
    if (!lieferant) return null;
    return calculateETA(lieferant, currentRestaurant);
  }, [lieferantFilter, lieferanten, currentRestaurant, currentRole]);

  const getLieferant = (lieferantId) => {
    return lieferanten.find(l => l.id === lieferantId) || { name: 'Unbekannt', id: lieferantId };
  };

  const isFavorite = (lieferantId) => {
    return favoriten.some(f => f.lieferant_id === lieferantId && f.is_favorite_by_restaurant);
  };

  const getPreis = (produkt) => {
    const preisInfo = preisMap.get(produkt.id);
    if (!preisInfo) {
      return produkt.standard_preis;
    }
    
    // Wenn individueller Preis gesetzt, diesen nutzen
    if (preisInfo.individueller_preis != null) {
      return preisInfo.individueller_preis;
    }
    
    // Wenn Rabatt gesetzt, berechnen
    if (preisInfo.rabatt_prozent != null) {
      return produkt.standard_preis * (1 - preisInfo.rabatt_prozent / 100);
    }
    
    return produkt.standard_preis;
  };

  const getPreisInfo = (produktId) => {
    return preisMap.get(produktId) || null;
  };

  const hatIndividuellenPreis = (produktId) => {
    const info = preisMap.get(produktId);
    return info && (info.individueller_preis != null || info.rabatt_prozent != null);
  };

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

      {/* Lieferant-Info mit ETA (wenn gefiltert) */}
      {lieferantFilter && currentRole === ROLES.RESTAURANT && (
        <Card className="bg-gradient-to-r from-emerald-50 to-white border-emerald-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{getLieferant(lieferantFilter).name}</p>
                  <p className="text-sm text-slate-500">
                    {getLieferant(lieferantFilter).plz_basis} {getLieferant(lieferantFilter).ort}
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

      {/* Filter */}
      <ProduktFilter
        kategorie={kategorie}
        setKategorie={setKategorie}
        suchtext={suchtext}
        setSuchtext={setSuchtext}
        lieferant={lieferantFilter}
        setLieferant={setLieferantFilter}
        lieferanten={verfuegbareLieferanten}
      />

      {/* Produktliste */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,280px)] gap-4 sm:gap-6 sm:justify-start">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="w-full sm:w-[280px] h-[280px] sm:h-[420px] bg-white rounded-xl border border-slate-200 overflow-hidden">
              <Skeleton className="h-[120px] sm:h-[180px] w-full" />
              <div className="p-2 sm:p-4 space-y-2 sm:space-y-3">
                <Skeleton className="h-4 sm:h-5 w-3/4" />
                <Skeleton className="h-3 sm:h-4 w-1/2" />
                <Skeleton className="h-8 sm:h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : gefilterteProdukte.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,280px)] gap-4 sm:gap-6 sm:justify-start">
          {gefilterteProdukte.map(produkt => {
            const aktion = getAktionForProdukt(produkt.id);
            return (
              <ProduktCard
                key={produkt.id}
                produkt={produkt}
                lieferant={getLieferant(produkt.lieferant)}
                preis={aktion ? produkt.standard_preis * (1 - aktion.rabatt_prozent / 100) : getPreis(produkt)}
                hatIndividuellenPreis={hatIndividuellenPreis(produkt.id) || !!aktion}
                preisInfo={aktion ? { rabatt_prozent: aktion.rabatt_prozent } : getPreisInfo(produkt.id)}
                standardPreis={produkt.standard_preis}
                isFavorite={currentRole === ROLES.RESTAURANT && isFavorite(produkt.lieferant)}
              />
            );
          })}
        </div>
      )}

      {/* Anzahl Ergebnisse */}
      {!isLoading && gefilterteProdukte.length > 0 && (
        <p className="text-sm text-slate-500 text-center">
          {gefilterteProdukte.length} {t('produkteGefunden')}
        </p>
      )}
    </div>
  );
}

