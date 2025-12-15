import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Pencil, Plus, Search, Trash2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from '@/components/ui/card';
import StatCard from '@/components/dashboard/StatCard';
import { toast } from 'sonner';
import LieferantEditDialog from '@/components/admin/LieferantEditDialog';
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
// ZENTRALE KONFIGURATION
// ============================================================================

const LIEFERANT_STATUS = {
  approved: { 
    labelKey: 'aktiv', 
    class: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle
  },
  pending: { 
    labelKey: 'ausstehend', 
    class: 'bg-amber-100 text-amber-700',
    icon: Clock
  },
  rejected: { 
    labelKey: 'abgelehnt', 
    class: 'bg-red-100 text-red-700',
    icon: XCircle
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet KPIs aus Lieferanten in einem einzigen Durchlauf
 */
function calculateStats(lieferanten) {
  const stats = {
    total: lieferanten.length,
    approved: 0,
    pending: 0,
    rejected: 0
  };

  lieferanten.forEach(l => {
    if (l.status === 'approved') stats.approved++;
    else if (l.status === 'pending') stats.pending++;
    else if (l.status === 'rejected') stats.rejected++;
  });

  return stats;
}

/**
 * Filtert Lieferanten basierend auf aktiven Filtern
 * 
 * @param {Array} lieferanten - Alle Lieferanten
 * @param {string} statusFilter - Gewählter Status oder 'alle'
 * @param {string} searchText - Suchtext (Name, Email, PLZ, Ort)
 * @returns {Array} Gefilterte Lieferanten
 */
function filterLieferanten({ lieferanten, statusFilter, searchText }) {
  return lieferanten.filter(l => {
    // Status Filter
    if (statusFilter !== 'alle' && l.status !== statusFilter) {
      return false;
    }

    // Text-Suche (Multi-Field: Name, Email, PLZ, Ort)
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const name = (l.name || '').toLowerCase();
      const email = (l.email || '').toLowerCase();
      const plz = (l.plz_basis || '').toLowerCase();
      const ort = (l.ort || '').toLowerCase();
      
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

export default function AdminLieferanten() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // State
  const [editingEntity, setEditingEntity] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lieferantToDelete, setLieferantToDelete] = useState(null);

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { 
    data: allLieferanten = [], 
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list(),
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  // KPIs - Single Pass über alle Lieferanten
  const stats = useMemo(() => {
    return calculateStats(allLieferanten);
  }, [allLieferanten]);

  // Gefilterte Lieferanten
  const lieferanten = useMemo(() => {
    return filterLieferanten({
      lieferanten: allLieferanten,
      statusFilter,
      searchText
    });
  }, [allLieferanten, statusFilter, searchText]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getStatusBadge = (status) => {
    const config = LIEFERANT_STATUS[status] || LIEFERANT_STATUS.pending;
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
        await base44.entities.Lieferant.update(data.id, data);
      } else {
        await base44.entities.Lieferant.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lieferanten'] });
      toast.success(t('lieferantGespeichert'));
      setEditingEntity(null);
      setIsCreating(false);
    },
    onError: () => {
      toast.error(t('fehlerBeimSpeichern'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (lieferantId) => {
      const response = await base44.functions.invoke('deleteEntity', {
        entityId: lieferantId,
        entityType: 'lieferant'
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lieferanten'] });
      setDeleteDialogOpen(false);
      setLieferantToDelete(null);
      toast.success(t('lieferantGeloescht'));
    },
    onError: (error) => {
      toast.error(t('fehlerBeimLoeschen'));
    }
  });

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleDelete = (lieferant) => {
    setLieferantToDelete(lieferant);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (lieferantToDelete) {
      deleteMutation.mutate(lieferantToDelete.id);
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
          <h1 className="text-2xl font-bold text-slate-900">{t('lieferantenVerwalten')}</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Fehler beim Laden</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-4">
                Die Lieferanten konnten nicht geladen werden. Bitte versuchen Sie es erneut.
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
          <h1 className="text-2xl font-bold text-slate-900">{t('lieferantenVerwalten')}</h1>
          <p className="text-slate-500 mt-1">
            {lieferanten.length} {t('von')} {stats.total} {t('lieferanten')}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={lieferanten}
            columns={CSV_COLUMNS.lieferanten}
            filename="lieferanten_export"
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
          icon={Truck}
          color="slate"
          subtitle="Alle Lieferanten"
        />
        <StatCard
          title={t('aktiv')}
          value={stats.approved}
          icon={CheckCircle}
          color="emerald"
          subtitle="Freigegeben"
        />
        <StatCard
          title={t('ausstehend')}
          value={stats.pending}
          icon={Clock}
          color="amber"
          subtitle="Warten auf Freigabe"
        />
        <StatCard
          title={t('abgelehnt')}
          value={stats.rejected}
          icon={XCircle}
          color="red"
          subtitle="Nicht genehmigt"
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
              <SelectItem value="approved">{t('aktiv')}</SelectItem>
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
            {lieferanten.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Truck className="h-16 w-16 text-slate-300" />
                    <div>
                      <p className="text-slate-900 font-medium">
                        {t('keineLieferanten')}
                      </p>
                      {(statusFilter !== 'alle' || searchText) && (
                        <p className="text-sm text-slate-500 mt-1">
                          Passen Sie Ihre Filterkriterien an oder erstellen Sie einen neuen Lieferanten
                        </p>
                      )}
                    </div>
                    {allLieferanten.length === 0 && (
                      <Button 
                        onClick={() => setIsCreating(true)} 
                        className="mt-2 bg-emerald-700 hover:bg-emerald-800"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('neuerLieferant')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              lieferanten.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Truck className="h-4 w-4 text-orange-600" />
                      </div>
                      <span className="font-medium text-slate-900">{l.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {l.plz_basis} {l.ort}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {l.kontakt_person || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={getStatusBadge(l.status).class}>
                      {getStatusBadge(l.status).label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingEntity(l)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDelete(l)}
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
            <AlertDialogTitle>{t('lieferantWirklichLoeschen')}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-slate-900">{lieferantToDelete?.name}</span> {t('wirdUnwiderruflichGeloescht')}
              <br /><br />
              <span className="text-red-600 font-medium">
                {t('alleZugehoerigen')}
              </span>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-600">
                <li>{t('alleBestellungenPositionen')}</li>
                <li>{t('alleDokumente')}</li>
                <li>{t('alleProdukte')}</li>
                <li>{t('alleLiefergebiete')}</li>
                <li>{t('alleAktionen')}</li>
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
      <LieferantEditDialog
        open={!!editingEntity || isCreating}
        onClose={() => { setEditingEntity(null); setIsCreating(false); }}
        entity={editingEntity || {}}
        title={editingEntity ? t('lieferantBearbeiten') : t('neuerLieferant')}
        onSave={saveMutation.mutate}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}