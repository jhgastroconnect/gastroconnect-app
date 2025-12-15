import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, XCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/components/utils/translations';

// ============================================================================
// KATEGORIEN KONFIGURATION
// ============================================================================

// TODO F13: Später dynamisch aus DB laden
// - Entweder als eigene Kategorie-Entity
// - Oder unique Kategorien aus allen Produkten extrahieren
// - Optional: Icons pro Kategorie hinzufügen
const KATEGORIEN = [
  'Alle', 
  'Gemüse', 
  'Fleisch', 
  'Fisch', 
  'Milchprodukte', 
  'Backwaren', 
  'Getränke', 
  'Tiefkühlware'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Filtert Produkte basierend auf aktiven Filtern
 * 
 * @param {Array} produkte - Alle Produkte
 * @param {string} kategorieFilter - Gewählte Kategorie oder 'Alle'
 * @param {string} searchText - Suchtext (wird nur auf Produktname angewendet)
 * @returns {Array} Gefilterte Produkte
 * 
 * TODO F13: Search erweitern auf Lieferant-Name, SKU, Beschreibung
 */
function filterProdukte({ produkte, kategorieFilter, searchText }) {
  return produkte.filter(p => {
    // Kategorie Filter
    if (kategorieFilter !== 'Alle' && p.kategorie !== kategorieFilter) {
      return false;
    }

    // Text-Suche (aktuell nur Produktname)
    if (searchText) {
      const produktName = p.name.toLowerCase();
      const search = searchText.toLowerCase();
      
      if (!produktName.includes(search)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Berechnet KPIs aus Produkten in einem einzigen Durchlauf
 * 
 * TODO F13: Später erweitern um:
 * - Anzahl aktive vs. inaktive Produkte
 * - Anzahl Produkte mit niedrigem Lagerbestand
 * - Durchschnittspreis
 */
function calculateStats(produkte) {
  const stats = {
    total: produkte.length,
    byKategorie: {}
  };

  produkte.forEach(p => {
    // Zähle Produkte pro Kategorie
    if (p.kategorie) {
      stats.byKategorie[p.kategorie] = (stats.byKategorie[p.kategorie] || 0) + 1;
    }
  });

  return stats;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminProdukte() {
  const { t } = useTranslation();

  // State
  const [kategorieFilter, setKategorieFilter] = useState('Alle');
  const [searchText, setSearchText] = useState('');

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { 
    data: produkte = [], 
    isLoading: produkteLoading,
    isError: produkteError 
  } = useQuery({
    queryKey: ['produkte'],
    queryFn: () => base44.entities.Produkt.list(),
    staleTime: 5 * 60 * 1000 // 5 Minuten
  });

  // TODO F13: Später umstellen auf id__in-basierte Query
  // 1. Extrahiere unique lieferant_ids aus produkten
  // 2. Lade nur benötigte Lieferanten: base44.entities.Lieferant.list({ id__in: lieferant_ids })
  // 3. Reduziert Query-Last erheblich bei vielen Produkten
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

  const lieferantenMap = useMemo(() => {
    return new Map(lieferanten.map(l => [l.id, l]));
  }, [lieferanten]);

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  // KPIs - Single Pass über alle Produkte
  const stats = useMemo(() => {
    return calculateStats(produkte);
  }, [produkte]);

  // Gefilterte Produkte (mit useMemo für Performance)
  const filteredProdukte = useMemo(() => {
    return filterProdukte({
      produkte,
      kategorieFilter,
      searchText
    });
  }, [produkte, kategorieFilter, searchText]);

  // ============================================================================
  // HELPER FUNCTIONS (mit Maps)
  // ============================================================================

  const getLieferantName = (id) => {
    return lieferantenMap.get(id)?.name || '-';
  };

  // ============================================================================
  // LOADING & ERROR STATES
  // ============================================================================

  const isLoading = produkteLoading || lieferantenLoading;
  const hasError = produkteError || lieferantenError;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('produktkatalog')}</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Fehler beim Laden</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                Die Produktdaten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.
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
        <h1 className="text-2xl font-bold text-slate-900">{t('produktkatalog')}</h1>
        <p className="text-slate-500 mt-1">
          {stats.total} {t('alleProdukteAdminAnsicht')}
        </p>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('produktSuchen')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={kategorieFilter} onValueChange={setKategorieFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('kategorie')} />
            </SelectTrigger>
            <SelectContent>
              {KATEGORIEN.map(k => (
                <SelectItem key={k} value={k}>
                  {k}
                  {k !== 'Alle' && stats.byKategorie[k] && (
                    <span className="ml-2 text-slate-400">({stats.byKategorie[k]})</span>
                  )}
                </SelectItem>
              ))}
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
                {t('produkt')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                {t('kategorie')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                {t('lieferant')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                {t('preis')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProdukte.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="h-12 w-12 text-slate-300" />
                    <p>{t('keineProdukte')}</p>
                    {(kategorieFilter !== 'Alle' || searchText) && (
                      <p className="text-sm text-slate-400">Passen Sie Ihre Filterkriterien an</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredProdukte.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-900">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{p.kategorie}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {getLieferantName(p.lieferant)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium text-right">
                    {p.standard_preis?.toFixed(2)} € / {p.einheit}
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