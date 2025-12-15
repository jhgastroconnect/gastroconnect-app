import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import StatusTracker from './StatusTracker';
import EmpfangBestaetigenButton from './EmpfangBestaetigenButton';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  'gesendet': { label: 'Offen', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  'bestätigt': { label: 'Bestätigt', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  'in_vorbereitung': { label: 'In Vorbereitung', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  'unterwegs': { label: 'Unterwegs', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  'geliefert': { label: 'Geliefert', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  'storniert': { label: 'Storniert', className: 'bg-red-100 text-red-800 border-red-200' },
  'verspaetet': { label: 'Verspätet', className: 'bg-amber-100 text-amber-800 border-amber-200' }
};

export default function BestellungDetailModal({ bestellung, lieferantName, lieferantEmail, restaurantName, open, onClose }) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // PDF generieren und herunterladen
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const response = await base44.functions.invoke('generateBestellungPdf', {
        bestellungId: bestellung.id
      });
      
      if (response.data?.success && response.data?.pdf) {
        // PDF herunterladen
        const link = document.createElement('a');
        link.href = response.data.pdf;
        link.download = response.data.filename || `Bestellung_${bestellung.id.slice(-6)}.pdf`;
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

  // Bestellpositionen laden
  const { data: positionen = [], isLoading: positionenLoading } = useQuery({
    queryKey: ['bestellpositionen', bestellung?.id],
    queryFn: () => base44.entities.Bestellposition.filter({ bestellung: bestellung.id }),
    enabled: !!bestellung?.id
  });

  // Produkte laden
  const { data: produkte = [] } = useQuery({
    queryKey: ['produkte'],
    queryFn: () => base44.entities.Produkt.list()
  });

  // Dokumente laden
  const { data: dokumente = [] } = useQuery({
    queryKey: ['dokumente', bestellung?.id],
    queryFn: () => base44.entities.Dokument.filter({ bestellung: bestellung.id }),
    enabled: !!bestellung?.id
  });

  const getProduktName = (produktId) => {
    const produkt = produkte.find(p => p.id === produktId);
    return produkt?.name || 'Unbekanntes Produkt';
  };

  const getProduktEinheit = (produktId) => {
    const produkt = produkte.find(p => p.id === produktId);
    return produkt?.einheit || 'Stk';
  };

  if (!bestellung) return null;

  const datum = bestellung.bestelldatum 
    ? format(new Date(bestellung.bestelldatum), 'dd.MM.yyyy HH:mm', { locale: de })
    : '-';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Bestellung #{bestellung.id.slice(-6).toUpperCase()}
            <Badge variant="outline" className={STATUS_CONFIG[bestellung.status]?.className}>
              {STATUS_CONFIG[bestellung.status]?.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Tracker */}
          <StatusTracker bestellung={bestellung} />

          {/* Empfang bestätigen Button - nur wenn Status "unterwegs" */}
          {bestellung.status === 'unterwegs' && (
            <div className="flex justify-center">
              <EmpfangBestaetigenButton
                bestellung={bestellung}
                lieferantEmail={lieferantEmail}
                restaurantName={restaurantName}
                onSuccess={onClose}
              />
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Lieferant</p>
              <p className="font-medium text-slate-900">{lieferantName}</p>
            </div>
            <div>
              <p className="text-slate-500">Bestelldatum</p>
              <p className="font-medium text-slate-900">{datum}</p>
            </div>
          </div>

          {/* Positionen */}
          <div>
            <h4 className="font-medium text-slate-900 mb-3">Bestellpositionen</h4>
            {positionenLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Produkt</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Menge</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Einzelpreis</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">Summe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {positionen.map(pos => (
                      <tr key={pos.id}>
                        <td className="px-4 py-3 text-sm text-slate-900">{getProduktName(pos.produkt)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">
                          {pos.menge} {getProduktEinheit(pos.produkt)}
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
                        {(bestellung.gesamtbetrag || 0).toFixed(2)} €
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = createPageUrl('RestaurantReklamationen') + '?bestellung=' + bestellung.id;
              }}
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
          <div>
            <h4 className="font-medium text-slate-900 mb-3">Dokumente</h4>
            {dokumente.length === 0 ? (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}