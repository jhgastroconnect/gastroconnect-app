import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Search, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/components/utils/translations';
import { useRole } from '@/components/RoleContext';
import { calculateETABatch } from '@/components/eta/etaCalculator';
import GCMap from '@/components/map/GCMap';
import SupplierInfoCard from '@/components/profile/SupplierInfoCard';

const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

export default function RestaurantLieferanten() {
  const { t } = useTranslation();
  const { impersonatedRestaurant } = useRole();
  const [searchText, setSearchText] = useState('');
  const [selectedLieferant, setSelectedLieferant] = useState(null);
  const [showZonesDialog, setShowZonesDialog] = useState(null);

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
  const activeRestaurantId = useMemo(() => {
    if (impersonatedRestaurant) return impersonatedRestaurant;
    if (currentUser) {
      const userRestaurant = restaurants.find(
        r => r.auth_user_id === currentUser.id || r.email === currentUser.email
      );
      if (userRestaurant) return userRestaurant.id;
    }
    return DEFAULT_RESTAURANT_ID;
  }, [impersonatedRestaurant, currentUser, restaurants]);

  const currentRestaurant = restaurants.find(r => r.id === activeRestaurantId);

  // Fetch Lieferanten
  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten-restaurant'],
    queryFn: async () => {
      const all = await base44.entities.Lieferant.list();
      return all.filter(l => l.status === 'active' || l.status === 'approved');
    }
  });

  // Fetch Liefergebiete
  const { data: liefergebiete = [] } = useQuery({
    queryKey: ['liefergebiete-restaurant'],
    queryFn: () => base44.entities.Liefergebiet.list()
  });

  // Fetch Favoriten
  const { data: favoriten = [] } = useQuery({
    queryKey: ['restaurant-favoriten', activeRestaurantId],
    queryFn: () => base44.entities.RestaurantLieferant.filter({ restaurant_id: activeRestaurantId }),
    enabled: !!activeRestaurantId
  });

  const isFavorite = (lieferantId) => {
    return favoriten.some(f => f.lieferant_id === lieferantId && f.is_favorite_by_restaurant);
  };

  // Lieferanten die in die PLZ des Restaurants liefern
  const lieferantenInPLZ = useMemo(() => {
    if (!currentRestaurant?.plz) return [];
    const lieferantenIds = new Set(
      liefergebiete
        .filter(lg => lg.plz === currentRestaurant.plz || lg.plz_liste?.includes(currentRestaurant.plz))
        .map(lg => lg.lieferant)
    );
    return lieferanten.filter(l => lieferantenIds.has(l.id));
  }, [liefergebiete, currentRestaurant, lieferanten]);

  // Lieferanten mit GPS aus den gefilterten Lieferanten (nur die, die in die PLZ liefern)
  const lieferantenMitKoordinaten = useMemo(() => {
    return lieferantenInPLZ.filter(l => l.latitude && l.longitude);
  }, [lieferantenInPLZ]);

  // Gefilterte Lieferanten
  const filteredLieferanten = useMemo(() => {
    let filtered = lieferantenInPLZ;
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(l => 
        l.name?.toLowerCase().includes(search) ||
        l.ort?.toLowerCase().includes(search)
      );
    }
    return filtered;
  }, [lieferantenInPLZ, searchText]);

  const getZonenCount = (lieferantId) => {
    return liefergebiete.filter(z => z.lieferant === lieferantId).length;
  };

  const getZonenForLieferant = (lieferantId) => {
    return liefergebiete.filter(z => z.lieferant === lieferantId);
  };

  // ETA-Berechnung
  const etaMap = useMemo(() => {
    if (!currentRestaurant || lieferantenInPLZ.length === 0) return new Map();
    return calculateETABatch(lieferantenInPLZ, currentRestaurant);
  }, [lieferantenInPLZ, currentRestaurant]);

  // Map Markers
  const mapMarkers = useMemo(() => {
    return lieferantenMitKoordinaten.map(lieferant => ({
      id: lieferant.id,
      type: 'lieferant',
      name: lieferant.name,
      plz: lieferant.plz_basis,
      gemeinde: lieferant.ort,
      lat: lieferant.latitude,
      lng: lieferant.longitude,
      adresse: lieferant.strasse ? `${lieferant.strasse}, ${lieferant.plz_basis} ${lieferant.ort}` : null,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('lieferanten')}</h1>
        <p className="text-slate-600 mt-1">{t('lieferantenInRegion')}</p>
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder={t('suchen')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lieferanten Liste */}
      <Card>
        <div className="divide-y">
          {filteredLieferanten.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p>{t('keineLieferantenVerfuegbar')}</p>
            </div>
          ) : (
            filteredLieferanten.map(lieferant => {
              const zonenCount = getZonenCount(lieferant.id);
              const favorite = isFavorite(lieferant.id);
              return (
                <div key={lieferant.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        {favorite && <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
                        <h3 className="font-semibold text-slate-900">{lieferant.name}</h3>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {zonenCount} {zonenCount === 1 ? 'Zone' : 'Zonen'}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {lieferant.plz_basis} {lieferant.ort}
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

      {/* Supplier Info Card */}
      <SupplierInfoCard
        supplier={selectedLieferant}
        open={!!selectedLieferant}
        onClose={() => setSelectedLieferant(null)}
        restaurantId={activeRestaurantId}
        favoriteStatus={selectedLieferant && isFavorite(selectedLieferant.id)}
      />

      {/* Zones Dialog (Read-only) */}
      <Dialog open={!!showZonesDialog} onOpenChange={() => setShowZonesDialog(null)}>
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
                      {zone.gemeinde && <p>{t('gemeinde')}: {zone.gemeinde}</p>}
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