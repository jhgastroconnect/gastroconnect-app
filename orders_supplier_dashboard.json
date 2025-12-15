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
import { Calendar, Store, Euro, Package, Clock, MapPin, Search } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import BestellungDetailModal from '@/components/lieferant/BestellungDetailModal';
import { toast } from 'sonner';

export default function TagesUebersicht() {
  const { t } = useTranslation();
  const { currentRole, impersonatedLieferant } = useRole();
  const queryClient = useQueryClient();
  
  const [selectedDay, setSelectedDay] = useState('today'); // 'today' or 'tomorrow'
  const [statusFilter, setStatusFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [sortBy, setSortBy] = useState('lieferzeit'); // 'lieferzeit', 'restaurant', 'status'
  const [selectedBestellung, setSelectedBestellung] = useState(null);

  // Auth check
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

  // Fetch user and lieferant
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  const activeLieferant = useMemo(() => {
    if (impersonatedLieferant) {
      return lieferanten.find(l => l.id === impersonatedLieferant);
    }
    return lieferanten.find(l => l.auth_user_id === user?.id || l.email === user?.email);
  }, [lieferanten, impersonatedLieferant, user]);

  // Fetch bestellungen mit Auto-Refresh
  const { data: bestellungen = [] } = useQuery({
    queryKey: ['bestellungen-tagesuebersicht', activeLieferant?.id],
    queryFn: () => base44.entities.Bestellung.list(),
    enabled: !!activeLieferant,
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Fetch restaurants
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  // Fetch liefergebiete
  const { data: liefergebiete = [] } = useQuery({
    queryKey: ['liefergebiete', activeLieferant?.id],
    queryFn: () => base44.entities.Liefergebiet.list(),
    enabled: !!activeLieferant
  });

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const baseDate = selectedDay === 'today' ? new Date() : addDays(new Date(), 1);
    return {
      startDate: startOfDay(baseDate),
      endDate: endOfDay(baseDate)
    };
  }, [selectedDay]);

  // Filter bestellungen for selected day and lieferant
  const dayBestellungen = useMemo(() => {
    if (!activeLieferant) return [];

    return bestellungen.filter(b => {
      // Filter by lieferant
      if (b.lieferant !== activeLieferant.id) return false;

      // Filter by date
      const bestellDate = b.lieferzeit_von 
        ? new Date(b.lieferzeit_von)
        : new Date(b.bestelldatum);
      
      return bestellDate >= startDate && bestellDate <= endDate;
    });
  }, [bestellungen, activeLieferant, startDate, endDate]);

  // Get zone for restaurant
  const getZoneForRestaurant = (restaurantId) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    if (!restaurant || !activeLieferant) return null;

    const zone = liefergebiete.find(z => 
      z.lieferant === activeLieferant.id && 
      z.plz === restaurant.plz
    );

    return zone;
  };

  // Apply filters and sorting
  const filteredBestellungen = useMemo(() => {
    let filtered = [...dayBestellungen];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(b => b.status === statusFilter);
    }

    // Zone filter
    if (zoneFilter !== 'all') {
      filtered = filtered.filter(b => {
        const zone = getZoneForRestaurant(b.restaurant);
        return zone?.id === zoneFilter;
      });
    }

    // Restaurant search
    if (restaurantSearch) {
      const search = restaurantSearch.toLowerCase();
      filtered = filtered.filter(b => {
        const restaurant = restaurants.find(r => r.id === b.restaurant);
        return restaurant?.name?.toLowerCase().includes(search);
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'lieferzeit') {
        const dateA = a.lieferzeit_von ? new Date(a.lieferzeit_von) : new Date(a.bestelldatum);
        const dateB = b.lieferzeit_von ? new Date(b.lieferzeit_von) : new Date(b.bestelldatum);
        return dateA - dateB;
      } else if (sortBy === 'restaurant') {
        const nameA = restaurants.find(r => r.id === a.restaurant)?.name || '';
        const nameB = restaurants.find(r => r.id === b.restaurant)?.name || '';
        return nameA.localeCompare(nameB);
      } else if (sortBy === 'status') {
        return (a.status || '').localeCompare(b.status || '');
      }
      return 0;
    });

    return filtered;
  }, [dayBestellungen, statusFilter, zoneFilter, restaurantSearch, sortBy, restaurants]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalOrders = dayBestellungen.length;
    const totalRevenue = dayBestellungen.reduce((sum, b) => sum + (b.gesamtbetrag || 0), 0);
    const uniqueRestaurants = new Set(dayBestellungen.map(b => b.restaurant)).size;
    const openOrders = dayBestellungen.filter(b => 
      b.status === 'gesendet' || b.status === 'eingegangen'
    ).length;

    return {
      totalOrders,
      totalRevenue,
      uniqueRestaurants,
      openOrders
    };
  }, [dayBestellungen]);

  // Get unique zones
  const availableZones = useMemo(() => {
    const zones = new Set();
    dayBestellungen.forEach(b => {
      const zone = getZoneForRestaurant(b.restaurant);
      if (zone) zones.add(JSON.stringify({ id: zone.id, name: zone.name || zone.plz }));
    });
    return Array.from(zones).map(z => JSON.parse(z));
  }, [dayBestellungen]);

  // Status config
  const getStatusConfig = (status) => {
    const configs = {
      'gesendet': { labelKey: 'eingegangen', className: 'bg-orange-100 text-orange-800 border-orange-200' },
      'eingegangen': { labelKey: 'eingegangen', className: 'bg-orange-100 text-orange-800 border-orange-200' },
      'bestätigt': { labelKey: 'bestaetigt', className: 'bg-blue-100 text-blue-800 border-blue-200' },
      'in_vorbereitung': { labelKey: 'inVorbereitungLabel', className: 'bg-purple-100 text-purple-800 border-purple-200' },
      'unterwegs': { labelKey: 'inZustellung', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
      'geliefert': { labelKey: 'geliefert', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    };
    const config = configs[status] || configs['gesendet'];
    return { label: t(config.labelKey), className: config.className };
  };

  // Mutation for quick status update
  const updateStatusMutation = useMutation({
    mutationFn: ({ bestellungId, newStatus }) => 
      base44.entities.Bestellung.update(bestellungId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bestellungen-tagesuebersicht'] });
      toast.success(t('statusAktualisiert'));
    }
  });

  const handleQuickConfirm = (bestellung) => {
    updateStatusMutation.mutate({
      bestellungId: bestellung.id,
      newStatus: 'bestätigt'
    });
  };

  if (!activeLieferant) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('keinLieferantAusgewaehlt')}</h2>
          <p className="text-slate-600">{t('bitteWaehlenSieLieferant')}</p>
        </Card>
      </div>
    );
  }

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
      <Card>
        <div className="divide-y">
          {filteredBestellungen.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-2 text-slate-300" />
              <p>{t('keineBestellungenVorhanden')}</p>
            </div>
          ) : (
            filteredBestellungen.map(bestellung => {
              const restaurant = restaurants.find(r => r.id === bestellung.restaurant);
              const zone = getZoneForRestaurant(bestellung.restaurant);
              const statusConfig = getStatusConfig(bestellung.status);
              const isNew = bestellung.status === 'gesendet' || bestellung.status === 'eingegangen';
              
              const lieferzeit = bestellung.lieferzeit_von 
                ? format(new Date(bestellung.lieferzeit_von), 'HH:mm', { locale: de })
                : format(new Date(bestellung.bestelldatum), 'HH:mm', { locale: de });

              return (
                <div 
                  key={bestellung.id}
                  className="p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Restaurant & Time */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => setSelectedBestellung(bestellung)}
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
                      {(bestellung.status === 'gesendet' || bestellung.status === 'eingegangen') && (
                        <Button
                          size="sm"
                          onClick={() => handleQuickConfirm(bestellung)}
                          disabled={updateStatusMutation.isPending}
                        >
                          {t('bestaetigen')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedBestellung(bestellung)}
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

      {/* Detail Modal */}
      {selectedBestellung && (
        <BestellungDetailModal
          bestellung={selectedBestellung}
          restaurantName={selectedBestellung ? restaurants.find(r => r.id === selectedBestellung.restaurant)?.name : ''}
          lieferantName={activeLieferant?.name || ''}
          restaurant={selectedBestellung ? restaurants.find(r => r.id === selectedBestellung.restaurant) : null}
          lieferant={activeLieferant}
          open={!!selectedBestellung}
          onClose={() => setSelectedBestellung(null)}
        />
      )}
    </div>
  );
}