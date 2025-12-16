import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import StatCard from '@/components/dashboard/StatCard';
import { MapPin, Search, Edit, Trash2, Plus, Truck, CheckCircle, XCircle, Map as MapIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from '@/components/utils/translations';
import LieferzoneDialog from '@/components/liefergebiete/LieferzoneDialog';
import { toast } from 'sonner';
import GCMap from '@/components/map/GCMap';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Lieferanten und Liefergebieten
 * 
 * @param {Array} lieferanten - Alle Lieferanten
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
 * Filtert Lieferanten basierend auf Suchtext
 * 
 * @param {Array} lieferanten - Alle Lieferanten
 * @param {string} searchText - Suchtext (Name, Ort, PLZ)
 * @returns {Array} Gefilterte Lieferanten
 */
function filterLieferanten(lieferanten, searchText) {
  if (!searchText) return lieferanten;
  
  const search = searchText.toLowerCase();
  return lieferanten.filter(l => 
    l.name?.toLowerCase().includes(search) ||
    l.ort?.toLowerCase().includes(search) ||
    l.plz_basis?.includes(search)
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminLieferantenGebiete() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // State
  const [searchText, setSearchText] = useState('');
  const [selectedLieferant, setSelectedLieferant] = useState(null);
  const [editingZone, setEditingZone] = useState(null);
  const [showNewZoneDialog, setShowNewZoneDialog] = useState(false);
  const [showZonenDialog, setShowZonenDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState(null);

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Lieferanten Query mit server-side Filter
   * 
   * TODO F16: Server-side Filter funktioniert mit base44.entities.Lieferant.filter()
   * Falls filter() nicht verfügbar, kann man auch list() + client-side nutzen,
   * aber mit dokumentiertem TODO für spätere Backend-Optimierung
   * 
   * Aktuell: Nutzt server-side Filter für status (wenn verfügbar)
   * Status-Werte: 'active' und 'approved' (aligned mit F14 LIEFERANT_STATUS)
   */
  const { 
    data: lieferanten = [],
    isLoading: lieferantenLoading,
    isError: lieferantenError,
    error: lieferantenErrorMsg,
    refetch: refetchLieferanten
  } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: async () => {
      // TODO F16: Prüfen ob base44 filter() unterstützt
      // Ideal: return base44.entities.Lieferant.filter({ status__in: ['active', 'approved'] });
      
      // Fallback: list() + client-side filter mit Dokumentation
      const all = await base44.entities.Lieferant.list();
      return all.filter(l => l.status === 'active' || l.status === 'approved');
    },
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  const { 
    data: liefergebiete = [],
    isLoading: liefergebieteLoading,
    isError: liefergebieteError,
    refetch: refetchLiefergebiete
  } = useQuery({
    queryKey: ['liefergebiete'],
    queryFn: () => base44.entities.Liefergebiet.list(),
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  // ============================================================================
  // MAPS für O(1) Lookups
  // ============================================================================

  /**
   * Map: Lieferant-ID → Array von Liefergebieten
   * Ersetzt Array.filter in Render-Loop (O(n) → O(1))
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

  // KPIs - Single Pass
  const stats = useMemo(() => {
    return calculateStats(lieferanten, liefergebietMap);
  }, [lieferanten, liefergebietMap]);

  // Lieferanten mit GPS-Koordinaten für die Karte
  const lieferantenMitKoordinaten = useMemo(() => {
    return lieferanten.filter(l => l.latitude && l.longitude);
  }, [lieferanten]);

  // Gefilterte Lieferanten
  const filteredLieferanten = useMemo(() => {
    return filterLieferanten(lieferanten, searchText);
  }, [lieferanten, searchText]);

  // Map markers für GCMap
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
      logistik_hinweise: lieferant.logistik_hinweise
    }));
  }, [lieferantenMitKoordinaten]);

  // ============================================================================
  // HELPER FUNCTIONS (mit Maps)
  // ============================================================================

  const getZonenCount = (lieferantId) => {
    return liefergebietMap.get(lieferantId)?.length || 0;
  };

  const getZonenForLieferant = (lieferantId) => {
    return liefergebietMap.get(lieferantId) || [];
  };

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const createZoneMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Liefergebiet.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liefergebiete'] });
      toast.success(t('liefergebietGespeichert'));
      setShowNewZoneDialog(false);
    },
    onError: () => {
      toast.error(t('fehlerBeimSpeichern'));
    }
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Liefergebiet.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liefergebiete'] });
      toast.success(t('liefergebietGespeichert'));
      setEditingZone(null);
    },
    onError: () => {
      toast.error(t('fehlerBeimSpeichern'));
    }
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId) => {
      return await base44.entities.Liefergebiet.delete(zoneId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liefergebiete'] });
      toast.success(t('liefergebietGeloescht'));
      setDeleteDialogOpen(false);
      setZoneToDelete(null);
    },
    onError: () => {
      toast.error(t('fehlerBeimLoeschen'));
    }
  });

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleDeleteZone = (zone) => {
    setZoneToDelete(zone);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteZone = () => {
    if (zoneToDelete) {
      deleteZoneMutation.mutate(zoneToDelete.id);
    }
  };

  const handleCreateZone = (data) => {
    if (selectedLieferant?.id) {
      createZoneMutation.mutate({
        ...data,
        lieferant: selectedLieferant.id
      });
    }
  };

  const handleUpdateZone = (data) => {
    if (editingZone) {
      updateZoneMutation.mutate({
        id: editingZone.id,
        data
      });
    }
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = lieferantenLoading || liefergebieteLoading;
  const hasError = lieferantenError || liefergebieteError;

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
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('lieferantenVerwalten')}</h1>
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
        <h1 className="text-2xl font-bold text-slate-900">{t('lieferantenVerwalten')}</h1>
        <p className="text-slate-600 mt-1">
          Übersicht aller Lieferanten und deren Liefergebiete
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('gesamt')}
          value={stats.totalLieferanten}
          icon={Truck}
          color="slate"
          subtitle="Aktive Lieferanten"
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
          subtitle="Alle Lieferzonen"
        />
      </div>

      {/* Map */}
      {lieferantenMitKoordinaten.length > 0 ? (
        <GCMap
          context="admin"
          markers={mapMarkers}
          currentUser={null}
        />
      ) : (
        <Card className="p-6 text-center text-slate-500">
          <MapPin className="h-12 w-12 mx-auto mb-2 text-slate-300" />
          <p>Keine Lieferanten mit GPS-Koordinaten verfügbar</p>
          <p className="text-sm text-slate-400 mt-1">
            Koordinaten können in den Lieferanten-Einstellungen hinterlegt werden
          </p>
        </Card>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t('nameEmailPlzSuchen')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Lieferanten Liste */}
      <Card>
        <div className="divide-y">
          {filteredLieferanten.length === 0 ? (
            <div className="p-12 text-center">
              <Truck className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-900 font-medium">
                {lieferanten.length === 0 
                  ? 'Noch keine aktiven Lieferanten'
                  : 'Keine Lieferanten gefunden'
                }
              </p>
              {lieferanten.length > 0 && searchText && (
                <p className="text-sm text-slate-500 mt-1">
                  Passen Sie Ihre Suchkriterien an
                </p>
              )}
            </div>
          ) : (
            filteredLieferanten.map(lieferant => {
              const zonenCount = getZonenCount(lieferant.id);
              return (
                <div key={lieferant.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-900">{lieferant.name}</h3>
                        <Badge 
                          variant="outline" 
                          className={zonenCount > 0 ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}
                        >
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
                        onClick={() => {
                          setSelectedLieferant(lieferant);
                          setShowZonenDialog(true);
                        }}
                      >
                        {t('liefergebiete')}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Liefergebiete Modal */}
      <Dialog open={showZonenDialog} onOpenChange={() => {
        setShowZonenDialog(false);
        setSelectedLieferant(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[9999]">
          <DialogHeader>
            <DialogTitle>
              {t('liefergebiete')}: {selectedLieferant?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Neue Zone Button */}
            <Button
              onClick={() => {
                setShowNewZoneDialog(true);
              }}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('liefergebietHinzufuegen')}
            </Button>

            {/* Zonen Grid */}
            {getZonenForLieferant(selectedLieferant?.id).length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p className="font-medium text-slate-900">{t('keineLiefergebieteDefiniert')}</p>
                <p className="text-sm text-slate-400 mt-1">
                  Fügen Sie das erste Liefergebiet für diesen Lieferanten hinzu
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getZonenForLieferant(selectedLieferant?.id).map(zone => (
                  <Card key={zone.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {zone.name || zone.plz || t('unbenannt')}
                        </h4>
                        <p className="text-sm text-slate-600 mt-1">
                          PLZ: {zone.plz_liste || zone.plz || '-'}
                        </p>
                        {zone.gemeinde && (
                          <p className="text-sm text-slate-600">
                            {t('gemeinde')}: {zone.gemeinde}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingZone(zone);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteZone(zone)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                    {zone.mindestbestellwert && (
                      <p className="text-sm text-slate-600">
                        {t('minBestellwert')}: {zone.mindestbestellwert} €
                      </p>
                    )}
                    {zone.lieferkosten && (
                      <p className="text-sm text-slate-600">
                        {t('lieferkosten')}: {zone.lieferkosten} €
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liefergebiet löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-slate-900">
                {zoneToDelete?.name || zoneToDelete?.plz || 'Dieses Liefergebiet'}
              </span> wird unwiderruflich gelöscht.
              <br /><br />
              <span className="text-amber-600 font-medium">
                Hinweis:
              </span>
              <p className="mt-2 text-slate-600">
                Restaurants in diesem Gebiet können nach dem Löschen möglicherweise keine 
                Bestellungen mehr von diesem Lieferanten aufgeben.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('abbrechen')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteZone}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteZoneMutation.isPending}
            >
              {deleteZoneMutation.isPending ? 'Wird gelöscht...' : 'Ja, löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Zone Dialog */}
      <LieferzoneDialog
        open={!!editingZone}
        onClose={() => setEditingZone(null)}
        zone={editingZone}
        lieferantId={selectedLieferant?.id}
        onSave={handleUpdateZone}
      />

      {/* New Zone Dialog */}
      <LieferzoneDialog
        open={showNewZoneDialog}
        onClose={() => setShowNewZoneDialog(false)}
        lieferantId={selectedLieferant?.id}
        onSave={handleCreateZone}
      />
    </div>
  );
}