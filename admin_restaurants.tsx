import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Store, Pencil, Plus, Search, Trash2, CheckCircle, Activity, Clock, XCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/StatCard';
import { toast } from 'sonner';
import EntityEditDialog from '@/components/admin/EntityEditDialog';
import ExportButton from '@/components/ui/ExportButton';
import { CSV_COLUMNS } from '@/components/utils/csvExport';
import { useTranslation } from '@/components/utils/translations';
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

// ============================================================================
// ZENTRALE KONFIGURATIONEN
// ============================================================================

/**
 * Formular-Felder für Restaurant-Erstellung/-Bearbeitung
 */
const FIELDS = [
  { key: 'name', label: 'Name', placeholder: 'Restaurant Name' },
  { key: 'plz', label: 'PLZ', placeholder: '12345' },
  { key: 'ort', label: 'Ort', placeholder: 'Stadt' },
  { key: 'kontakt_person', label: 'Kontaktperson', placeholder: 'Max Mustermann' },
  { key: 'email', label: 'E-Mail', placeholder: 'email@restaurant.de' },
];

/**
 * Restaurant-Status Konfiguration
 * 
 * Unterschied approved vs. active:
 * - approved: Restaurant wurde vom Admin freigegeben und kann sich einloggen
 * - active: Restaurant nimmt aktiv Bestellungen an (kann approved sein aber temporär inaktiv)
 * - pending: Registrierung wartet auf Admin-Freigabe
 * - rejected: Registrierung wurde abgelehnt
 * 
 * TODO: Business-Logik für approved vs active mit Product Owner klären
 * - Ist active ein separater Status oder ein Flag zusätzlich zu approved?
 * - Kann ein Restaurant approved aber nicht active sein?
 * - Workflow dokumentieren: pending → approved → active?
 */
const RESTAURANT_STATUS = {
  approved: { 
    labelKey: 'freigegeben', 
    class: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle,
    description: 'Restaurant ist freigegeben'
  },
  active: { 
    labelKey: 'aktiv', 
    class: 'bg-blue-100 text-blue-700',
    icon: Activity,
    description: 'Restaurant nimmt aktiv Bestellungen an'
  },
  pending: { 
    labelKey: 'ausstehend', 
    class: 'bg-amber-100 text-amber-700',
    icon: Clock,
    description: 'Registrierung wartet auf Admin-Freigabe'
  },
  rejected: { 
    labelKey: 'abgelehnt', 
    class: 'bg-red-100 text-red-700',
    icon: XCircle,
    description: 'Registrierung wurde abgelehnt'
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Restaurants in einem einzigen Durchlauf
 */
function calculateStats(restaurants) {
  const stats = {
    total: restaurants.length,
    approved: 0,
    active: 0,
    pending: 0,
    rejected: 0
  };

  restaurants.forEach(r => {
    if (r.status === 'approved') stats.approved++;
    else if (r.status === 'active') stats.active++;
    else if (r.status === 'pending') stats.pending++;
    else if (r.status === 'rejected') stats.rejected++;
  });

  return stats;
}

/**
 * Filtert Restaurants basierend auf aktiven Filtern
 * 
 * @param {Array} restaurants - Alle Restaurants
 * @param {string} statusFilter - Gewählter Status oder 'alle'
 * @param {string} searchText - Suchtext (Name, Email, PLZ, Ort)
 * @returns {Array} Gefilterte Restaurants
 */
function filterRestaurants({ restaurants, statusFilter, searchText }) {
  return restaurants.filter(r => {
    // Status Filter
    if (statusFilter !== 'alle' && r.status !== statusFilter) {
      return false;
    }

    // Text-Suche (Multi-Field: Name, Email, PLZ, Ort)
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const name = (r.name || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const plz = (r.plz || '').toLowerCase();
      const ort = (r.ort || '').toLowerCase();
      
      if (!name.includes(searchLower) && 
          !email.includes(searchLower) &&
          !plz.includes(searchLower) &&
          !ort.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminRestaurants() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // State
  const [editingEntity, setEditingEntity] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restaurantToDelete, setRestaurantToDelete] = useState(null);

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { 
    data: allRestaurants = [], 
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list(),
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  // KPIs - Single Pass über alle Restaurants
  const stats = useMemo(() => {
    return calculateStats(allRestaurants);
  }, [allRestaurants]);

  // Gefilterte Restaurants
  const restaurants = useMemo(() => {
    return filterRestaurants({
      restaurants: allRestaurants,
      statusFilter,
      searchText
    });
  }, [allRestaurants, statusFilter, searchText]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getStatusBadge = (status) => {
    const config = RESTAURANT_STATUS[status] || RESTAURANT_STATUS.pending;
    return {
      label: t(config.labelKey),
      class: config.class,
      icon: config.icon
    };
  };

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        await base44.entities.Restaurant.update(data.id, data);
      } else {
        await base44.entities.Restaurant.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      toast.success(t('restaurantGespeichert'));
      setEditingEntity(null);
      setIsCreating(false);
    },
    onError: () => {
      toast.error(t('fehlerBeimSpeichern'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (restaurantId) => {
      const response = await base44.functions.invoke('deleteEntity', {
        entityId: restaurantId,
        entityType: 'restaurant'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      setDeleteDialogOpen(false);
      setRestaurantToDelete(null);
      toast.success(t('restaurantGeloescht'));
    },
    onError: (error) => {
      toast.error(t('fehlerBeimLoeschen'));
    }
  });

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleDelete = (restaurant) => {
    setRestaurantToDelete(restaurant);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (restaurantToDelete) {
      deleteMutation.mutate(restaurantToDelete.id);
    }
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

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
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('restaurantsVerwalten')}</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Fehler beim Laden</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-4">
                Die Restaurants konnten nicht geladen werden. Bitte versuchen Sie es erneut.
              </p>
              <Button onClick={() => refetch()} variant="outline">
                Erneut versuchen
              </Button>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('restaurantsVerwalten')}</h1>
          <p className="text-slate-500 mt-1">
            {restaurants.length} {t('von')} {stats.total} {t('restaurants')}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={restaurants}
            columns={CSV_COLUMNS.restaurants}
            filename="restaurants_export"
          />
          <Button onClick={() => setIsCreating(true)} className="bg-emerald-700 hover:bg-emerald-800">
            <Plus className="h-4 w-4 mr-2" />
            {t('neu')}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('gesamt')}
          value={stats.total}
          icon={Store}
          color="slate"
          subtitle="Alle Restaurants"
        />
        <StatCard
          title={t('freigegeben')}
          value={stats.approved}
          icon={CheckCircle}
          color="emerald"
          subtitle="Vom Admin freigegeben"
        />
        <StatCard
          title={t('aktiv')}
          value={stats.active}
          icon={Activity}
          color="blue"
          subtitle="Nehmen Bestellungen an"
        />
        <StatCard
          title={t('ausstehend')}
          value={stats.pending}
          icon={Clock}
          color="amber"
          subtitle="Warten auf Freigabe"
        />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('nameEmailPlzSuchen')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">{t('alleStatus')}</SelectItem>
              <SelectItem value="approved">{t('freigegeben')}</SelectItem>
              <SelectItem value="active">{t('aktiv')}</SelectItem>
              <SelectItem value="pending">{t('ausstehend')}</SelectItem>
              <SelectItem value="rejected">{t('abgelehnt')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                {t('name')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                {t('plzOrt')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                {t('kontakt')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                {t('status')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                {t('aktion')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {restaurants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Store className="h-16 w-16 text-slate-300" />
                    <div>
                      <p className="text-slate-900 font-medium">
                        {allRestaurants.length === 0 
                          ? 'Noch keine Restaurants im System'
                          : 'Keine Restaurants gefunden'
                        }
                      </p>
                      {allRestaurants.length > 0 && (statusFilter !== 'alle' || searchText) && (
                        <p className="text-sm text-slate-500 mt-1">
                          Passen Sie Ihre Filterkriterien an oder erstellen Sie ein neues Restaurant
                        </p>
                      )}
                    </div>
                    {allRestaurants.length === 0 && (
                      <Button 
                        onClick={() => setIsCreating(true)} 
                        className="mt-2 bg-emerald-700 hover:bg-emerald-800"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('neuesRestaurant')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              restaurants.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Store className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="font-medium text-slate-900">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {r.plz} {r.ort}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {r.kontakt_person || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getStatusBadge(r.status).class}>
                      {getStatusBadge(r.status).label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingEntity(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDelete(r)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restaurantWirklichLoeschen')}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-slate-900">{restaurantToDelete?.name}</span> {t('wirdUnwiderruflichGeloescht')}
              <br /><br />
              <span className="text-red-600 font-medium">
                {t('alleZugehoerigen')}
              </span>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>{t('alleBestellungenPositionen')}</li>
                <li>{t('alleDokumente')}</li>
                <li>{t('allePreislisten')}</li>
                <li>{t('alleBestellvorlagen')}</li>
                <li>{t('alleBenachrichtigungen')}</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('abbrechen')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('wirdGeloescht') : t('jaEndgueltigLoeschen')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit/Create Dialog */}
      <EntityEditDialog
        open={!!editingEntity || isCreating}
        onClose={() => { setEditingEntity(null); setIsCreating(false); }}
        entity={editingEntity || {}}
        fields={FIELDS}
        title={editingEntity ? t('restaurantBearbeiten') : t('neuesRestaurant')}
        onSave={saveMutation.mutate}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}