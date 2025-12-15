import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download, AlertTriangle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import StatusTracker from './StatusTracker';
import EmpfangBestaetigenButton from './EmpfangBestaetigenButton';
import { toast } from 'sonner';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Zentrale Status-Konfiguration für Bestellungen
 * TODO: Sollte aus @/config/orderStatus.ts importiert werden
 */
const ORDER_STATUS = {
  gesendet: {
    label: 'Offen',
    className: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  bestätigt: {
    label: 'Bestätigt',
    className: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  in_vorbereitung: {
    label: 'In Vorbereitung',
    className: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  unterwegs: {
    label: 'Unterwegs',
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200'
  },
  geliefert: {
    label: 'Geliefert',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  storniert: {
    label: 'Storniert',
    className: 'bg-red-100 text-red-800 border-red-200'
  },
  verspaetet: {
    label: 'Verspätet',
    className: 'bg-amber-100 text-amber-800 border-amber-200'
  }
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Erstellt eine Map für schnellen Produkt-Lookup
 * @param produkte - Array von Produkt-Objekten
 * @returns Map mit produkt.id als Key
 */
function createProductMap(produkte: any[]): Map<string, any> {
  return new Map(produkte.map(p => [p.id, p]));
}

/**
 * Gibt Status-Konfiguration zurück
 */
function getStatusConfig(status: string) {
  return ORDER_STATUS[status as keyof typeof ORDER_STATUS] || ORDER_STATUS.gesendet;
}

/**
 * Formatiert Bestelldatum für Anzeige
 */
function formatOrderDate(bestelldatum: string | null): string {
  if (!bestelldatum) return '-';
  return format(new Date(bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de });
}

/**
 * Prüft ob "Empfang bestätigen" Button angezeigt werden soll
 */
function shouldShowConfirmButton(status: string): boolean {
  return status === 'unterwegs';
}

/**
 * Gibt Produkt-Namen zurück (mit Fallback)
 */
function getProductName(produktId: string, produktMap: Map<string, any>): string {
  return produktMap.get(produktId)?.name || 'Unbekanntes Produkt';
}

/**
 * Gibt Produkt-Einheit zurück (mit Fallback)
 */
function getProductUnit(produktId: string, produktMap: Map<string, any>): string {
  return produktMap.get(produktId)?.einheit || 'Stk';
}

/**
 * Generiert Order-ID für Anzeige (letzte 6 Zeichen, uppercase)
 */
function formatOrderId(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Error State für Query-Fehler
 */
function QueryErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-center">
      <div>
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}

/**
 * Loading State für Positionen-Tabelle
 */
function PositionsLoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}

/**
 * Tabelle mit Bestellpositionen
 */
function OrderPositionsTable({
  positionen,
  produktMap,
  gesamtbetrag
}: {
  positionen: any[];
  produktMap: Map<string, any>;
  gesamtbetrag: number;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">
              Produkt
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
              Menge
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
              Einzelpreis
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">
              Summe
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {positionen.map(pos => (
            <tr key={pos.id}>
              <td className="px-4 py-3 text-sm text-slate-900">
                {getProductName(pos.produkt, produktMap)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 text-right">
                {pos.menge} {getProductUnit(pos.produkt, produktMap)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 text-right">
                {(pos.einzelpreis || 0).toFixed(2)} €
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                {(pos.positions_summe || 0).toFixed(2)} €
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50">
          <tr>
            <td colSpan={3} className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
              Gesamtbetrag
            </td>
            <td className="px-4 py-3 text-sm font-bold text-emerald-700 text-right">
              {gesamtbetrag.toFixed(2)} €
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Dokumente-Sektion mit Loading/Empty States
 */
function DocumentsSection({
  dokumente,
  isLoading,
  isError
}: {
  dokumente: any[];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div>
      <h4 className="font-medium text-slate-900 mb-3">Dokumente</h4>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-4 text-center">
          Fehler beim Laden der Dokumente
        </p>
      ) : dokumente.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-4 text-center">
          Keine Dokumente vorhanden
        </p>
      ) : (
        <div className="space-y-2">
          {dokumente.map(dok => (
            <div key={dok.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-900">{dok.typ}</span>
              </div>
              {dok.datei && (
                <a 
                  href={dok.datei} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-600 hover:underline"
                >
                  Öffnen
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      
      <Link to={createPageUrl('RestaurantDokumente')}>
        <Button variant="outline" size="sm" className="mt-3">
          <FileText className="h-4 w-4 mr-2" />
          Alle Dokumente verwalten
        </Button>
      </Link>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function BestellungDetailModal({
  bestellung,
  lieferantName,
  lieferantEmail,
  restaurantName,
  open,
  onClose
}: {
  bestellung: any;
  lieferantName: string;
  lieferantEmail: string;
  restaurantName: string;
  open: boolean;
  onClose: () => void;
}) {
  // ========== STATE ==========
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // ========== DATA FETCHING ==========
  
  // Bestellpositionen laden
  const {
    data: positionen = [],
    isLoading: positionenLoading,
    isError: positionenError
  } = useQuery({
    queryKey: ['bestellpositionen', bestellung?.id],
    queryFn: () => base44.entities.Bestellposition.filter({ bestellung: bestellung.id }),
    enabled: !!bestellung?.id,
    staleTime: 5 * 60 * 1000  // 5 Minuten Cache
  });

  // Produkte laden
  // TODO: Sollte auf filter({ id__in: [...] }) umgestellt werden
  // Aktuell werden ALLE Produkte geladen, obwohl nur 3-5 benötigt werden
  const {
    data: produkte = [],
    isLoading: produkteLoading,
    isError: produkteError
  } = useQuery({
    queryKey: ['produkte'],
    queryFn: () => base44.entities.Produkt.list(),
    enabled: !!bestellung?.id,
    staleTime: 10 * 60 * 1000  // 10 Minuten Cache
  });

  // Dokumente laden
  const {
    data: dokumente = [],
    isLoading: dokumenteLoading,
    isError: dokumenteError
  } = useQuery({
    queryKey: ['dokumente', bestellung?.id],
    queryFn: () => base44.entities.Dokument.filter({ bestellung: bestellung.id }),
    enabled: !!bestellung?.id,
    staleTime: 5 * 60 * 1000  // 5 Minuten Cache
  });

  // ========== COMPUTED DATA ==========
  
  // Produkt-Map für O(1) Lookups statt O(n)
  const produktMap = useMemo(
    () => createProductMap(produkte),
    [produkte]
  );

  // Status-Config
  const statusConfig = bestellung ? getStatusConfig(bestellung.status) : null;

  // Formatiertes Datum
  const formattedDate = bestellung ? formatOrderDate(bestellung.bestelldatum) : '-';

  // ========== EVENT HANDLERS ==========
  
  /**
   * Generiert PDF und triggert Download
   */
  const handleDownloadPdf = async () => {
    if (!bestellung) return;
    
    setIsGeneratingPdf(true);
    
    try {
      const response = await base44.functions.invoke('generateBestellungPdf', {
        bestellungId: bestellung.id
      });
      
      if (response.data?.success && response.data?.pdf) {
        // PDF herunterladen via temporärer Link
        const link = document.createElement('a');
        link.href = response.data.pdf;
        link.download = response.data.filename || `Bestellung_${formatOrderId(bestellung.id)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success('PDF heruntergeladen');
      } else {
        toast.error('PDF konnte nicht generiert werden');
      }
    } catch (error) {
      console.error('PDF error:', error);
      toast.error('Fehler beim Generieren des PDFs');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  /**
   * Navigiert zu Reklamationen-Seite
   */
  const handleReportProblem = () => {
    if (!bestellung) return;
    window.location.href = createPageUrl('RestaurantReklamationen') + '?bestellung=' + bestellung.id;
  };

  // ========== RENDER ==========
  
  // Guard: Keine Bestellung vorhanden
  if (!bestellung) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Bestellung #{formatOrderId(bestellung.id)}
            {statusConfig && (
              <Badge variant="outline" className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Tracker */}
          <StatusTracker bestellung={bestellung} />

          {/* Empfang bestätigen Button - nur bei Status "unterwegs" */}
          {shouldShowConfirmButton(bestellung.status) && (
            <div className="flex justify-center">
              <EmpfangBestaetigenButton
                bestellung={bestellung}
                lieferantEmail={lieferantEmail}
                restaurantName={restaurantName}
                onSuccess={onClose}
              />
            </div>
          )}

          {/* Bestellungs-Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Lieferant</p>
              <p className="font-medium text-slate-900">{lieferantName}</p>
            </div>
            <div>
              <p className="text-slate-500">Bestelldatum</p>
              <p className="font-medium text-slate-900">{formattedDate}</p>
            </div>
          </div>

          {/* Bestellpositionen */}
          <div>
            <h4 className="font-medium text-slate-900 mb-3">Bestellpositionen</h4>
            
            {positionenLoading || produkteLoading ? (
              <PositionsLoadingState />
            ) : positionenError || produkteError ? (
              <QueryErrorState message="Fehler beim Laden der Bestellpositionen" />
            ) : (
              <OrderPositionsTable
                positionen={positionen}
                produktMap={produktMap}
                gesamtbetrag={bestellung.gesamtbetrag || 0}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={handleReportProblem}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Problem melden
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Bestellung als PDF
            </Button>
          </div>

          {/* Dokumente */}
          <DocumentsSection
            dokumente={dokumente}
            isLoading={dokumenteLoading}
            isError={dokumenteError}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}