import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Search, Store, Truck, Package, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/StatCard';
import moment from 'moment';
import DateRangeFilter from '@/components/filters/DateRangeFilter';
import ExportButton from '@/components/ui/ExportButton';
import { CSV_COLUMNS } from '@/components/utils/csvExport';
import { useTranslation } from '@/components/utils/translations';

// ============================================================================
// ZENTRALE KONFIGURATION
// ============================================================================

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
    icon: ClipboardList
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
  },
  verspaetet: { 
    labelKey: 'verspaetet', 
    class: 'bg-orange-100 text-orange-700',
    icon: AlertTriangle
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Bestellungen in einem einzigen Durchlauf
 */
function calculateStats(bestellungen) {
  const stats = {
    gesendet: 0,
    bestaetigt: 0,
    inVorbereitung: 0,
    unterwegs: 0,
    geliefert: 0,
    storniert: 0,
    verspaetet: 0,
    total: bestellungen.length
  };

  bestellungen.forEach(b => {
    if (b.status === 'gesendet') stats.gesendet++;
    else if (b.status === 'bestätigt') stats.bestaetigt++;
    else if (b.status === 'in_vorbereitung') stats.inVorbereitung++;
    else if (b.status === 'unterwegs') stats.unterwegs++;
    else if (b.status === 'geliefert') stats.geliefert++;
    else if (b.status === 'storniert') stats.storniert++;
    else if (b.status === 'verspaetet') stats.verspaetet++;
  });

  return stats;
}

/**
 * Filtert Bestellungen basierend auf allen aktiven Filtern
 * Verwendet Maps für O(1) Lookups
 */
function filterBestellungen({
  bestellungen,
  statusFilter,
  restaurantFilter,
  lieferantFilter,
  vonDatum,
  bisDatum,
  searchText,
  restaurantsMap,
  lieferantenMap
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

    // Lieferant Filter
    if (lieferantFilter !== 'alle' && b.lieferant !== lieferantFilter) {
      return false;
    }

    // Datum Filter - Von
    if (vonDatum) {
      const bestellDatum = new Date(b.bestelldatum);
      const von = new Date(vonDatum);
      if (bestellDatum < von) return false;
    }

    // Datum Filter - Bis
    if (bisDatum) {
      const bestellDatum = new Date(b.bestelldatum);
      const bis = new Date(bisDatum);
      bis.setHours(23, 59, 59, 999);
      if (bestellDatum > bis) return false;
    }

    // Text-Suche (mit O(1) Map-Lookups)
    if (searchText) {
      const searchLower = searchText.toLowerCase();

      // Bestellnummer
      const bestellId = b.id.toLowerCase();
      if (bestellId.includes(searchLower)) return true;

      // Restaurant Name
      const restaurant = restaurantsMap.get(b.restaurant);
      const restaurantName = restaurant?.name || '';
      if (restaurantName.toLowerCase().includes(searchLower)) return true;

      // Lieferant Name
      const lieferant = lieferantenMap.get(b.lieferant);
      const lieferantName = lieferant?.name || '';
      if (lieferantName.toLowerCase().includes(searchLower)) return true;

      return false;
    }

    return true;
  });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminBestellungen() {
  const { t } = useTranslation();

  // State
  const [statusFilter, setStatusFilter] = useState('alle');
  const [searchText, setSearchText] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('alle');
  const [lieferantFilter, setLieferantFilter] = useState('alle');
  const [vonDatum, setVonDatum] = useState('');
  const [bisDatum, setBisDatum] = useState('');

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { 
    data: bestellungen = [], 
    isLoading: bestellungenLoading,
    isError: bestellungenError 
  } = useQuery({
    queryKey: ['bestellungen'],
    queryFn: () => base44.entities.Bestellung.list('-bestelldatum'),
    staleTime: 2 * 60 * 1000 // 2 Minuten
  });

  // TODO F12: Später umstellen auf id__in-basierte Queries
  // 1. Extrahiere unique IDs aus bestellungen: restaurant_ids, lieferant_ids
  // 2. Lade nur benötigte Entitäten: base44.entities.Restaurant.list({ id__in: restaurant_ids })
  // 3. Reduziert Query-Last erheblich bei vielen Bestellungen
  const { 
    data: restaurants = [],
    isLoading: restaurantsLoading,
    isError: restaurantsError
  } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list(),
    staleTime: 10 * 60 * 1000 // 10 Minuten (ändert sich selten)
  });

  const { 
    data: lieferanten = [],
    isLoading: lieferantenLoading,
    isError: lieferantenError
  } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list(),
    staleTime: 10 * 60 * 1000 // 10 Minuten (ändert sich selten)
  });

  // ============================================================================
  // MAPS für O(1) Lookups
  // ============================================================================

  const restaurantsMap = useMemo(() => {
    return new Map(restaurants.map(r => [r.id, r]));
  }, [restaurants]);

  const lieferantenMap = useMemo(() => {
    return new Map(lieferanten.map(l => [l.id, l]));
  }, [lieferanten]);

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  // KPIs - Single Pass über alle Bestellungen
  const stats = useMemo(() => {
    return calculateStats(bestellungen);
  }, [bestellungen]);

  // Gefilterte Bestellungen
  const filteredBestellungen = useMemo(() => {
    return filterBestellungen({
      bestellungen,
      statusFilter,
      restaurantFilter,
      lieferantFilter,
      vonDatum,
      bisDatum,
      searchText,
      restaurantsMap,
      lieferantenMap
    });
  }, [
    bestellungen,
    statusFilter,
    restaurantFilter,
    lieferantFilter,
    vonDatum,
    bisDatum,
    searchText,
    restaurantsMap,
    lieferantenMap
  ]);

  // Export-Daten (mit Map-Lookups)
  const exportData = useMemo(() => {
    return filteredBestellungen.map(b => ({
      ...b,
      restaurantName: restaurantsMap.get(b.restaurant)?.name || '-',
      lieferantName: lieferantenMap.get(b.lieferant)?.name || '-',
      bestelldatum: moment(b.bestelldatum).format('DD.MM.YYYY HH:mm'),
    }));
  }, [filteredBestellungen, restaurantsMap, lieferantenMap]);

  // ============================================================================
  // HELPER FUNCTIONS (mit Maps)
  // ============================================================================

  const getRestaurantName = (id) => {
    return restaurantsMap.get(id)?.name || '-';
  };

  const getLieferantName = (id) => {
    return lieferantenMap.get(id)?.name || '-';
  };

  const getStatusConfig = (status) => {
    const config = ORDER_STATUS[status] || ORDER_STATUS['gesendet'];
    return {
      label: t(config.labelKey),
      class: config.class,
      icon: config.icon
    };
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = bestellungenLoading || restaurantsLoading || lieferantenLoading;
  const hasError = bestellungenError || restaurantsError || lieferantenError;

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
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64" />
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
              <p className="text-slate-500 max-w-md mx-auto">
                Die Bestelldaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
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
        <h1 className="text-2xl font-bold text-slate-900">{t('bestellungen')}</h1>
        <p className="text-slate-500 mt-1">{stats.total} {t('bestellungenInsgesamt')}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('gesendet')}
          value={stats.gesendet}
          icon={Package}
          color="blue"
          subtitle="Neu eingegangen"
        />
        <StatCard
          title={t('inVorbereitungLabel')}
          value={stats.inVorbereitung + stats.bestaetigt}
          icon={Clock}
          color="purple"
          subtitle="Werden vorbereitet"
        />
        <StatCard
          title={t('unterwegs')}
          value={stats.unterwegs}
          icon={Truck}
          color="cyan"
          subtitle="In Zustellung"
        />
        <StatCard
          title={t('geliefert')}
          value={stats.geliefert}
          icon={CheckCircle2}
          color="emerald"
          subtitle="Erfolgreich zugestellt"
        />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('bestellnummerRestaurantLieferant')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder={t('status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t('alleStatus')}</SelectItem>
              <SelectItem value="gesendet">{t('gesendet')}</SelectItem>
              <SelectItem value="bestätigt">{t('bestaetigt')}</SelectItem>
              <SelectItem value="in_vorbereitung">{t('inVorbereitungLabel')}</SelectItem>
              <SelectItem value="unterwegs">{t('unterwegs')}</SelectItem>
              <SelectItem value="geliefert">{t('geliefert')}</SelectItem>
              <SelectItem value="storniert">{t('storniert')}</SelectItem>
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
              {restaurants.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lieferantFilter} onValueChange={setLieferantFilter}>
            <SelectTrigger className="w-full lg:w-48">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-slate-400" />
                <SelectValue placeholder={t('lieferant')} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t('alleLieferanten')}</SelectItem>
              {lieferanten.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <DateRangeFilter
            vonDatum={vonDatum}
            setVonDatum={setVonDatum}
            bisDatum={bisDatum}
            setBisDatum={setBisDatum}
          />
          <ExportButton
            data={exportData}
            columns={CSV_COLUMNS.bestellungen}
            filename="bestellungen_export"
            label="CSV Export"
          />
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('datum')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('restaurant')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('lieferant')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t('status')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">{t('betrag')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredBestellungen.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <ClipboardList className="h-12 w-12 text-slate-300" />
                    <p>{t('keineBestellungenGefunden')}</p>
                    <p className="text-sm text-slate-400">Passen Sie Ihre Filterkriterien an</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredBestellungen.map(b => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <ClipboardList className="h-4 w-4 text-purple-600" />
                      </div>
                      <span className="text-sm text-slate-900">
                        {moment(b.bestelldatum).format('DD.MM.YYYY HH:mm')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{getRestaurantName(b.restaurant)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{getLieferantName(b.lieferant)}</td>
                  <td className="px-4 py-3">
                    <Badge className={getStatusConfig(b.status).class}>
                      {getStatusConfig(b.status).label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium text-right">
                    {b.gesamtbetrag?.toFixed(2) || '0.00'} €
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}