import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye, FileText, AlertTriangle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { createPageUrl } from '@/utils';
import BestellungFilters from '@/components/restaurant/BestellungFilters';
import BestellungDetailModal from '@/components/restaurant/BestellungDetailModal';
import { useRole } from '@/components/RoleContext';
import ExportButton from '@/components/ui/ExportButton';
import { CSV_COLUMNS } from '@/components/utils/csvExport';
import { useTranslation } from '@/components/utils/translations';
import EntityNameLink from '@/components/profile/EntityNameLink';

const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

export default function RestaurantBestellungen() {
  const { impersonatedRestaurant } = useRole();
  const activeRestaurantId = impersonatedRestaurant || DEFAULT_RESTAURANT_ID;
  const { t } = useTranslation();
  
  const getStatusConfig = (status) => {
    const configs = {
      'gesendet': { labelKey: 'offen', className: 'bg-orange-100 text-orange-800 border-orange-200' },
      'bestätigt': { labelKey: 'bestaetigt', className: 'bg-blue-100 text-blue-800 border-blue-200' },
      'in_vorbereitung': { labelKey: 'inVorbereitungLabel', className: 'bg-purple-100 text-purple-800 border-purple-200' },
      'unterwegs': { labelKey: 'unterwegs', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
      'geliefert': { labelKey: 'geliefert', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      'storniert': { labelKey: 'storniert', className: 'bg-red-100 text-red-800 border-red-200' },
      'verspaetet': { labelKey: 'verspaetet', className: 'bg-amber-100 text-amber-800 border-amber-200' }
    };
    const config = configs[status] || configs['gesendet'];
    return { label: t(config.labelKey), className: config.className };
  };

  const [activeTab, setActiveTab] = useState('offen');
  const [vonDatum, setVonDatum] = useState('');
  const [bisDatum, setBisDatum] = useState('');
  const [lieferantFilter, setLieferantFilter] = useState('alle');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [selectedBestellung, setSelectedBestellung] = useState(null);

  // Offene Status: alles außer geliefert und storniert
  const OFFENE_STATUS = ['gesendet', 'bestätigt', 'in_vorbereitung', 'unterwegs', 'verspaetet'];
  const GESCHLOSSENE_STATUS = ['geliefert', 'storniert'];

  const { data: bestellungen = [], isLoading } = useQuery({
    queryKey: ['restaurant-bestellungen', activeRestaurantId],
    queryFn: () => base44.entities.Bestellung.filter({ restaurant: activeRestaurantId }),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  const getLieferant = (lieferantId) => {
    return lieferanten.find(l => l.id === lieferantId);
  };

  const getLieferantName = (lieferantId) => {
    return getLieferant(lieferantId)?.name || 'Unbekannt';
  };

  const getLieferantEmail = (lieferantId) => {
    return getLieferant(lieferantId)?.email || null;
  };

  const activeRestaurant = restaurants.find(r => r.id === activeRestaurantId);

  // Bestellungen nach Tab filtern
  const offeneBestellungen = useMemo(() => 
    bestellungen.filter(b => OFFENE_STATUS.includes(b.status)), 
    [bestellungen]
  );
  
  const geschlosseneBestellungen = useMemo(() => 
    bestellungen.filter(b => GESCHLOSSENE_STATUS.includes(b.status)), 
    [bestellungen]
  );

  // Basis-Bestellungen je nach Tab
  const basisBestellungen = activeTab === 'offen' ? offeneBestellungen : geschlosseneBestellungen;

  // Gefilterte Bestellungen
  const gefilterteBestellungen = useMemo(() => {
    return basisBestellungen.filter(b => {
      // Zeitraum von
      if (vonDatum) {
        const bestellDatum = new Date(b.bestelldatum);
        const von = new Date(vonDatum);
        if (bestellDatum < von) return false;
      }

      // Zeitraum bis
      if (bisDatum) {
        const bestellDatum = new Date(b.bestelldatum);
        const bis = new Date(bisDatum);
        bis.setHours(23, 59, 59, 999);
        if (bestellDatum > bis) return false;
      }

      // Lieferant
      if (lieferantFilter !== 'alle' && b.lieferant !== lieferantFilter) {
        return false;
      }

      // Status
      if (statusFilter !== 'alle' && b.status !== statusFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => new Date(b.bestelldatum) - new Date(a.bestelldatum));
  }, [basisBestellungen, vonDatum, bisDatum, lieferantFilter, statusFilter]);

  // Export-Daten vorbereiten
  const exportData = useMemo(() => {
    return gefilterteBestellungen.map(b => ({
      ...b,
      lieferantName: getLieferantName(b.lieferant),
      restaurantName: activeRestaurant?.name || '',
      bestelldatum: b.bestelldatum ? format(new Date(b.bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de }) : '-',
    }));
  }, [gefilterteBestellungen, activeRestaurant]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 mb-2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('meineBestellungenTitle')}</h1>
          <p className="text-slate-500 mt-1">
            {bestellungen.length} {t('bestellungenInsgesamt')}
          </p>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="offen" className="gap-2">
              {t('offeneBestellungen')}
              {offeneBestellungen.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-orange-100 text-orange-700">
                  {offeneBestellungen.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="geschlossen" className="gap-2">
              {t('geschlosseneBestellungen')}
              {geschlosseneBestellungen.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-slate-100 text-slate-600">
                  {geschlosseneBestellungen.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Export Button */}
      <div className="flex justify-end mb-4">
        <ExportButton
          data={exportData}
          columns={CSV_COLUMNS.bestellungen}
          filename="bestellungen_export"
        />
      </div>

      {/* Filter */}
      <BestellungFilters
        vonDatum={vonDatum}
        setVonDatum={setVonDatum}
        bisDatum={bisDatum}
        setBisDatum={setBisDatum}
        lieferant={lieferantFilter}
        setLieferant={setLieferantFilter}
        status={statusFilter}
        setStatus={setStatusFilter}
        lieferanten={lieferanten}
      />

      {/* Tabelle */}
      {gefilterteBestellungen.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            {activeTab === 'offen' ? t('keineOffenenBestellungen') : t('keineGeschlossenenBestellungen')}
          </h3>
          <p className="text-slate-500">
            {basisBestellungen.length > 0 
              ? t('passenSieFilterAn')
              : activeTab === 'offen' 
                ? t('alleBestellungenAbgeschlossen')
                : t('nochKeineAbgeschlossen')}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('datum')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('lieferant')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{t('status')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('betrag')}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">{t('lieferschein')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">{t('aktion')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gefilterteBestellungen.map(bestellung => {
                  const statusConfig = getStatusConfig(bestellung.status);
                  const datum = bestellung.bestelldatum 
                    ? format(new Date(bestellung.bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de })
                    : '-';

                  return (
                    <tr key={bestellung.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-600">{datum}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {getLieferant(bestellung.lieferant) ? (
                          <EntityNameLink
                            entity={getLieferant(bestellung.lieferant)}
                            type="supplier"
                            currentEntityId={activeRestaurantId}
                            className="text-sm font-medium"
                          />
                        ) : (
                          <span>{getLieferantName(bestellung.lieferant)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant="outline" className={`${statusConfig.className} whitespace-nowrap`}>
                            {statusConfig.label}
                          </Badge>
                          {bestellung.status === 'verspaetet' && bestellung.verspaetung_grund && (
                            <span className="text-xs text-amber-600 max-w-[150px] truncate" title={bestellung.verspaetung_grund}>
                              ⚠️ {bestellung.verspaetung_grund}
                            </span>
                          )}
                          {bestellung.voraussichtliche_lieferung && bestellung.status !== 'geliefert' && bestellung.status !== 'storniert' && (
                            <span className="text-xs text-slate-500">
                              ETA: {bestellung.voraussichtliche_lieferung}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 text-right">
                        {(bestellung.gesamtbetrag || 0).toFixed(2)} €
                      </td>
                      <td className="px-4 py-3 text-center">
                        {bestellung.lieferschein_url ? (
                          <a
                            href={bestellung.lieferschein_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedBestellung(bestellung)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {t('details')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.location.href = createPageUrl('RestaurantReklamationen') + '?bestellung=' + bestellung.id}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Problem melden
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anzahl Ergebnisse */}
      {gefilterteBestellungen.length > 0 && gefilterteBestellungen.length !== basisBestellungen.length && (
        <p className="text-sm text-slate-500 text-center">
          {gefilterteBestellungen.length} {t('von')} {basisBestellungen.length} {activeTab === 'offen' ? t('offenenBestellungen') : t('geschlossenenBestellungen')}
        </p>
      )}

      {/* Detail Modal */}
      <BestellungDetailModal
        bestellung={selectedBestellung}
        lieferantName={selectedBestellung ? getLieferantName(selectedBestellung.lieferant) : ''}
        lieferantEmail={selectedBestellung ? getLieferantEmail(selectedBestellung.lieferant) : ''}
        restaurantName={activeRestaurant?.name || ''}
        open={!!selectedBestellung}
        onClose={() => setSelectedBestellung(null)}
      />
    </div>
  );
}