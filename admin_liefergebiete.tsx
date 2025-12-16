import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Truck, CheckCircle, XCircle, Map as MapIcon, Search, ArrowUpDown } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import LiefergebietEditor from '@/components/liefergebiete/LiefergebietEditor';
import StatCard from '@/components/dashboard/StatCard';
import DashboardListDialog from '@/components/dashboard/DashboardListDialog';
import { useTranslation } from '@/components/utils/translations';
import MapTypeSwitcher, { MAP_TYPES } from '@/components/map/MapTypeSwitcher';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ============================================================================
// LEAFLET CONFIGURATION
// ============================================================================

// TODO F17: Später in /src/config/mapConfig.js auslagern
// Fix für Leaflet Marker Icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Supplier Icon (Grün für Lieferanten)
const supplierIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Lieferanten und Liefergebieten in einem Pass
 * 
 * @param {Array} lieferanten - Gefilterte Lieferanten (active/approved)
 * @param {Map} liefergebietMap - Map von Lieferant-ID zu Gebiete-Array
 * @returns {Object} Stats-Objekt
 */
function calculateStats(lieferanten, liefergebietMap) {
  const stats = {
    totalLieferanten: lieferanten.length,
    mitGebieten: 0,
    ohneGebiete: 0,
    totalGebiete: 0
  };

  lieferanten.forEach(lieferant => {
    const gebiete = liefergebietMap.get(lieferant.id) || [];
    if (gebiete.length > 0) {
      stats.mitGebieten++;
      stats.totalGebiete += gebiete.length;
    } else {
      stats.ohneGebiete++;
    }
  });

  return stats;
}

/**
 * Filtert Lieferanten basierend auf Search und Toggle
 * 
 * @param {Array} lieferanten - Alle Lieferanten
 * @param {string} searchText - Suchtext (Name, Ort, PLZ)
 * @param {boolean} onlyWithZones - Nur Lieferanten mit Gebieten zeigen
 * @param {Map} liefergebietMap - Map für Gebiets-Check
 * @returns {Array} Gefilterte Lieferanten
 */
function filterLieferanten(lieferanten, searchText, onlyWithZones, liefergebietMap) {
  return lieferanten.filter(l => {
    // Text-Suche
    if (searchText) {
      const search = searchText.toLowerCase();
      const name = (l.name || '').toLowerCase();
      const ort = (l.ort || '').toLowerCase();
      const plz = (l.plz_basis || '').toLowerCase();
      
      if (!name.includes(search) && 
          !ort.includes(search) && 
          !plz.includes(search)) {
        return false;
      }
    }

    // Toggle: Nur mit Gebieten
    if (onlyWithZones) {
      const gebiete = liefergebietMap.get(l.id) || [];
      if (gebiete.length === 0) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sortiert groupedByLieferant nach gewähltem Kriterium
 * 
 * @param {Array} grouped - Array von { lieferant, gebiete }
 * @param {string} sortKey - 'name' | 'zones'
 * @param {string} sortDir - 'asc' | 'desc'
 * @returns {Array} Sortiertes Array
 */
function sortGroupedLieferanten(grouped, sortKey, sortDir) {
  const sorted = [...grouped].sort((a, b) => {
    let compareValue = 0;

    if (sortKey === 'name') {
      const nameA = (a.lieferant.name || '').toLowerCase();
      const nameB = (b.lieferant.name || '').toLowerCase();
      compareValue = nameA.localeCompare(nameB);
    } else if (sortKey === 'zones') {
      compareValue = a.gebiete.length - b.gebiete.length;
    }

    return sortDir === 'asc' ? compareValue : -compareValue;
  });

  return sorted;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminLiefergebiete() {
  const { t } = useTranslation();

  // State
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [mapType, setMapType] = useState('satellite');
  const [searchText, setSearchText] = useState('');
  const [onlyWithZones, setOnlyWithZones] = useState(false);
  const [sortKey, setSortKey] = useState('name'); // 'name' | 'zones'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Liefergebiete Query
   */
  const { 
    data: liefergebiete = [], 
    isLoading: lgLoading,
    isError: lgError,
    error: lgErrorMsg,
    refetch: refetchLiefergebiete
  } = useQuery({
    queryKey: ['liefergebiete'],
    queryFn: () => base44.entities.Liefergebiet.list(),
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  /**
   * Lieferanten Query mit server-side Filter
   * 
   * TODO F17: Prüfen ob base44 filter() unterstützt
   * Ideal: base44.entities.Lieferant.filter({ status__in: ['active', 'approved'] })
   * 
   * Falls filter() nicht verfügbar: list() + client-side filter mit TODO-Kommentar
   * Status 'active' und 'approved' aligned mit F14 LIEFERANT_STATUS
   */
  const { 
    data: allLieferanten = [], 
    isLoading: lLoading,
    isError: lError,
    error: lErrorMsg,
    refetch: refetchLieferanten
  } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: async () => {
      // TODO F17: Server-side filter wenn base44.entities.Lieferant.filter() verfügbar
      // return base44.entities.Lieferant.filter({ status__in: ['active', 'approved'] });
      
      // Fallback: list() + client-side filter
      const all = await base44.entities.Lieferant.list();
      return all.filter(l => l.status === 'approved' || l.status === 'active');
    },
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  // ============================================================================
  // MAPS für O(1) Lookups
  // ============================================================================

  /**
   * Map: Lieferant-ID → Array von Liefergebieten
   * Ersetzt wiederholte Array.filter (O(n×m) → O(1))
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

  // Gefilterte Lieferanten
  const filteredLieferanten = useMemo(() => {
    return filterLieferanten(allLieferanten, searchText, onlyWithZones, liefergebietMap);
  }, [allLieferanten, searchText, onlyWithZones, liefergebietMap]);

  // Grouped by Lieferant mit Map-Lookup (O(1) statt O(n))
  const groupedByLieferant = useMemo(() => {
    return filteredLieferanten.map(l => ({
      lieferant: l,
      gebiete: liefergebietMap.get(l.id) || []
    }));
  }, [filteredLieferanten, liefergebietMap]);

  // Sortierte Gruppen
  const sortedGroupedByLieferant = useMemo(() => {
    return sortGroupedLieferanten(groupedByLieferant, sortKey, sortDir);
  }, [groupedByLieferant, sortKey, sortDir]);

  // KPIs - Single Pass über alle Lieferanten
  const stats = useMemo(() => {
    return calculateStats(allLieferanten, liefergebietMap);
  }, [allLieferanten, liefergebietMap]);

  // Lieferanten mit GPS-Koordinaten für Karte
  const lieferantenMitKoordinaten = useMemo(() => {
    return filteredLieferanten.filter(l => l.latitude && l.longitude);
  }, [filteredLieferanten]);

  // Karten-Zentrum (Durchschnitt aller Koordinaten)
  const mapCenter = useMemo(() => {
    if (lieferantenMitKoordinaten.length > 0) {
      const avgLat = lieferantenMitKoordinaten.reduce((sum, l) => sum + l.latitude, 0) / lieferantenMitKoordinaten.length;
      const avgLng = lieferantenMitKoordinaten.reduce((sum, l) => sum + l.longitude, 0) / lieferantenMitKoordinaten.length;
      return [avgLat, avgLng];
    }
    return [46.4983, 11.3548]; // Südtirol Zentrum
  }, [lieferantenMitKoordinaten]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const toggleSort = (key) => {
    if (sortKey === key) {
      // Toggle direction
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      // New sort key
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = lgLoading || lLoading;
  const hasError = lgError || lError;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-12" />
        <Skeleton className="h-[500px]" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('liefergebiete')}</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Fehler beim Laden</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-4">
                Die Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => refetchLieferanten()} variant="outline">
                  Lieferanten erneut laden
                </Button>
                <Button onClick={() => refetchLiefergebiete()} variant="outline">
                  Liefergebiete erneut laden
                </Button>
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
        <h1 className="text-2xl font-bold text-slate-900">{t('liefergebiete')}</h1>
        <p className="text-slate-500 mt-1">
          {stats.totalGebiete} {t('liefergebiete')} von {stats.totalLieferanten} {t('lieferanten')}
          {stats.totalLieferanten > 0 && (
            <> • Ø {(stats.totalGebiete / stats.totalLieferanten).toFixed(1)} {t('gebieteProLieferant')}</>
          )}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('alleLieferanten')}
          value={stats.totalLieferanten}
          icon={Truck}
          color="slate"
          subtitle="Aktive Lieferanten"
          onClick={() => setListDialogOpen(true)}
        />
        <StatCard
          title="Mit Gebieten"
          value={stats.mitGebieten}
          icon={CheckCircle}
          color="emerald"
          subtitle="Haben Liefergebiete"
        />
        <StatCard
          title="Ohne Gebiete"
          value={stats.ohneGebiete}
          icon={XCircle}
          color="red"
          subtitle="Keine Gebiete definiert"
        />
        <StatCard
          title="Total Gebiete"
          value={stats.totalGebiete}
          icon={MapIcon}
          color="blue"
          subtitle={stats.totalLieferanten > 0 ? `Ø ${(stats.totalGebiete / stats.totalLieferanten).toFixed(1)} pro Lieferant` : ''}
        />
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('lieferantSuchen')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="only-with-zones"
              checked={onlyWithZones}
              onCheckedChange={setOnlyWithZones}
            />
            <Label htmlFor="only-with-zones" className="text-sm">
              Nur mit Gebieten
            </Label>
          </div>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex gap-2">
        <Button
          variant={sortKey === 'name' ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleSort('name')}
        >
          Name {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
        </Button>
        <Button
          variant={sortKey === 'zones' ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggleSort('zones')}
        >
          Anzahl Gebiete {sortKey === 'zones' && (sortDir === 'asc' ? '↑' : '↓')}
        </Button>
      </div>

      {/* Karte */}
      <Card className="overflow-hidden">
        <CardContent className="p-0 relative">
          {lieferantenMitKoordinaten.length > 0 ? (
            <div className="relative">
              <MapTypeSwitcher currentType={mapType} onTypeChange={setMapType} />
              <MapContainer 
                center={mapCenter} 
                zoom={9} 
                style={{ height: '500px', width: '100%' }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url={MAP_TYPES.find(t => t.id === mapType)?.url || MAP_TYPES[0].url}
                />
                {lieferantenMitKoordinaten.map(lieferant => {
                  const gebiete = liefergebietMap.get(lieferant.id) || [];
                  return (
                    <Marker 
                      key={lieferant.id} 
                      position={[lieferant.latitude, lieferant.longitude]}
                      icon={supplierIcon}
                    >
                      <Popup maxWidth={320} className="supplier-popup">
                        <div className="min-w-[280px] max-w-[320px]">
                          <div className="flex items-center gap-2 mb-2">
                            <Truck className="h-5 w-5 text-emerald-600" />
                            <h3 className="font-semibold text-slate-900">{lieferant.name}</h3>
                          </div>
                          <p className="text-sm text-slate-600 mb-1">
                            {lieferant.strasse && `${lieferant.strasse}, `}
                            {lieferant.plz_basis} {lieferant.ort}
                          </p>
                          <p className="text-sm text-emerald-600 font-medium mb-2">
                            {gebiete.length} {gebiete.length === 1 ? 'Liefergebiet' : 'Liefergebiete'}
                          </p>
                          {lieferant.kontakt_person && (
                            <p className="text-sm text-slate-500 mb-2">
                             {t('kontakt')}: {lieferant.kontakt_person}
                            </p>
                          )}
                          {lieferant.email && (
                            <p className="text-sm text-slate-500 mb-3">
                              E-Mail: {lieferant.email}
                            </p>
                          )}

                          {/* Social Media */}
                          {(lieferant.instagram_url || lieferant.facebook_url || lieferant.tiktok_url || lieferant.website_url) && (
                            <div className="mb-3 pb-3 border-b border-slate-200">
                              <p className="text-xs font-medium text-slate-500 mb-2">Social Media</p>
                              <div className="flex items-center gap-2">
                                {lieferant.instagram_url && (
                                  <a href={lieferant.instagram_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-pink-50 hover:bg-pink-100 flex items-center justify-center transition-colors">
                                    <svg className="h-4 w-4 text-pink-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                                  </a>
                                )}
                                {lieferant.facebook_url && (
                                  <a href={lieferant.facebook_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors">
                                    <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                  </a>
                                )}
                                {lieferant.tiktok_url && (
                                  <a href={lieferant.tiktok_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors">
                                    <svg className="h-4 w-4 text-slate-900" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/></svg>
                                  </a>
                                )}
                                {lieferant.website_url && (
                                  <a href={lieferant.website_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors">
                                    <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Showcase Images */}
                          {(lieferant.image1_url || lieferant.image2_url || lieferant.image3_url) && (
                            <div className="mb-3">
                              <div className="grid grid-cols-3 gap-1.5">
                                {lieferant.image1_url && (
                                  <img src={lieferant.image1_url} alt="" className="w-full h-20 object-cover rounded" />
                                )}
                                {lieferant.image2_url && (
                                  <img src={lieferant.image2_url} alt="" className="w-full h-20 object-cover rounded" />
                                )}
                                {lieferant.image3_url && (
                                  <img src={lieferant.image3_url} alt="" className="w-full h-20 object-cover rounded" />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          ) : (
            <div className="h-[500px] flex flex-col items-center justify-center bg-slate-50 text-center p-6">
              <MapPin className="h-16 w-16 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 mb-2">
                {filteredLieferanten.length > 0 
                  ? 'Keine Lieferanten mit GPS-Koordinaten'
                  : t('keineLieferantenMitKoordinaten')
                }
              </h3>
              <p className="text-slate-500 max-w-md">
                {filteredLieferanten.length > 0 
                  ? `${filteredLieferanten.length} Lieferanten ohne Standort-Koordinaten`
                  : allLieferanten.length > 0
                    ? `${allLieferanten.length} Lieferanten gefiltert - passen Sie Ihre Suche an`
                    : t('keineLieferantenRegistriert')
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lieferanten Liste */}
      <div className="grid gap-4">
        {sortedGroupedByLieferant.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <Truck className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {allLieferanten.length === 0 
                ? t('keineLieferantenVorhanden')
                : 'Keine Lieferanten gefunden'
              }
            </h3>
            <p className="text-slate-500">
              {allLieferanten.length === 0 
                ? t('nochKeineLieferanten')
                : 'Passen Sie Ihre Filterkriterien an'
              }
            </p>
          </div>
        ) : (
          sortedGroupedByLieferant.map(({ lieferant, gebiete }) => (
            <LiefergebietEditor
              key={lieferant.id}
              lieferant={lieferant}
              liefergebietRecords={liefergebiete}
            />
          ))
        )}
      </div>

      {/* Lieferanten Dialog */}
      <DashboardListDialog
        open={listDialogOpen}
        onClose={() => setListDialogOpen(false)}
        title={t('alleLieferanten')}
        type="lieferanten"
        data={allLieferanten}
      />
    </div>
  );
}