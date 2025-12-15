import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRole, ROLES } from '@/components/RoleContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, AlertCircle, Search, Save, Check, X } from 'lucide-react';
import { useTranslation } from '@/components/utils/translations';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_STOCK_VALUE = 999999;
const POLLING_INTERVAL = 10000; // 10 Sekunden

/**
 * Zentrale Stock-Status-Konfiguration
 */
const STOCK_STATUS = {
  in_stock: {
    label: 'Auf Lager',
    color: 'bg-green-100 text-green-800'
  },
  low: {
    label: 'Niedrig',
    color: 'bg-yellow-100 text-yellow-800'
  },
  out_of_stock: {
    label: 'Ausverkauft',
    color: 'bg-red-100 text-red-800'
  }
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validiert einen Stock-Wert
 * @returns { isValid: boolean, error?: string }
 */
function validateStockValue(value: any): { isValid: boolean; error?: string } {
  // Check 1: Ist es eine Zahl?
  const numValue = parseFloat(value);
  if (isNaN(numValue)) {
    return { isValid: false, error: 'Ungültige Zahl eingegeben' };
  }
  
  // Check 2: Keine negativen Werte
  if (numValue < 0) {
    return { isValid: false, error: 'Bestand kann nicht negativ sein' };
  }
  
  // Check 3: Maximalwert
  if (numValue > MAX_STOCK_VALUE) {
    return { isValid: false, error: `Maximalwert ist ${MAX_STOCK_VALUE.toLocaleString()}` };
  }
  
  return { isValid: true };
}

/**
 * Berechnet automatischen Status basierend auf Bestand
 */
function calculateAutoStatus(
  currentStock: number,
  minStock: number = 5
): 'in_stock' | 'low' | 'out_of_stock' {
  if (currentStock === 0) return 'out_of_stock';
  if (currentStock <= minStock) return 'low';
  return 'in_stock';
}

/**
 * Gibt Status-Config zurück
 */
function getStatusConfig(status: string) {
  return STOCK_STATUS[status as keyof typeof STOCK_STATUS] || STOCK_STATUS.in_stock;
}

/**
 * Ermittelt aktive Lieferanten-ID
 */
function getActiveSupplierId(
  impersonatedLieferant: string | null,
  currentUser: any,
  lieferanten: any[]
): string | null {
  if (impersonatedLieferant) return impersonatedLieferant;
  
  if (currentUser) {
    const userLieferant = lieferanten.find(
      l => l.auth_user_id === currentUser.id || l.email === currentUser.email
    );
    if (userLieferant) return userLieferant.id;
  }
  
  return null;
}

/**
 * Prüft ob Polling aktiv sein soll
 */
function shouldEnablePolling(hasEdits: boolean): number | false {
  // Kein Polling wenn User editiert
  if (hasEdits) return false;
  
  // Kein Polling wenn Tab nicht sichtbar
  if (typeof document !== 'undefined' && document.hidden) return false;
  
  return POLLING_INTERVAL;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Loading Skeleton für Tabelle
 */
function InventoryTableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * Empty State
 */
function EmptyInventoryState({ t }: { t: (key: string) => string }) {
  return (
    <tr>
      <td colSpan={6} className="text-center py-8 text-slate-500">
        {t('keineProdukte')}
      </td>
    </tr>
  );
}

/**
 * Stock-Anzeige mit Unterscheidung null vs 0
 */
function StockDisplay({
  produkt,
  editingValue,
  onStockChange
}: {
  produkt: any;
  editingValue: number | null;
  onStockChange: (id: string, value: string) => void;
}) {
  const displayValue = editingValue ?? produkt.current_stock;
  
  // Unterscheidung: null = nicht getrackt, 0 = ausverkauft
  if (displayValue === null) {
    return (
      <Badge variant="outline" className="text-xs">
        Nicht getrackt
      </Badge>
    );
  }
  
  return (
    <Input
      type="number"
      min="0"
      max={MAX_STOCK_VALUE}
      step="0.1"
      value={displayValue}
      onChange={(e) => onStockChange(produkt.id, e.target.value)}
      className="w-24 h-8"
    />
  );
}

/**
 * Status-Select
 */
function StatusSelect({
  produkt,
  editingValue,
  onStatusChange
}: {
  produkt: any;
  editingValue: string | null;
  onStatusChange: (id: string, value: string) => void;
}) {
  const value = editingValue ?? produkt.stock_status ?? 'in_stock';
  
  return (
    <Select
      value={value}
      onValueChange={(val) => onStatusChange(produkt.id, val)}
    >
      <SelectTrigger className="w-32 h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STOCK_STATUS).map(([key, config]) => (
          <SelectItem key={key} value={key}>
            <span className={`px-2 py-0.5 rounded text-xs ${config.color}`}>
              {config.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Action-Buttons (Speichern / Abbrechen)
 */
function ActionButtons({
  produktId,
  hasChanges,
  onSave,
  onCancel,
  isSaving
}: {
  produktId: string;
  hasChanges: boolean;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  if (!hasChanges) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <Check className="h-3 w-3 text-green-600" />
        <span className="text-xs text-slate-500">Gespeichert</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 justify-end">
      <Button
        size="sm"
        variant="ghost"
        onClick={onCancel}
        disabled={isSaving}
        className="h-8"
      >
        <X className="h-3 w-3" />
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={isSaving}
        className="h-8"
      >
        <Save className="h-3 w-3 mr-1" />
        Speichern
      </Button>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Lagerbestand() {
  const { t } = useTranslation();
  const { currentRole, impersonatedLieferant } = useRole();
  const queryClient = useQueryClient();
  
  // ========== STATE ==========
  const [searchText, setSearchText] = useState('');
  const [editingStocks, setEditingStocks] = useState<Record<string, any>>({});

  // ========== AUTH CHECK ==========
  if (currentRole !== ROLES.LIEFERANT && currentRole !== ROLES.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle className="h-16 w-16 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold">{t('keinZugriff')}</h2>
        <p className="text-slate-500">Diese Seite ist nur für Lieferanten verfügbar.</p>
      </div>
    );
  }

  // ========== DATA FETCHING ==========
  
  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const activeLieferantId = useMemo(
    () => getActiveSupplierId(impersonatedLieferant, currentUser, lieferanten),
    [impersonatedLieferant, currentUser, lieferanten]
  );

  const hasActiveEdits = Object.keys(editingStocks).length > 0;

  const { data: produkte = [], isLoading } = useQuery({
    queryKey: ['produkte-lagerbestand', activeLieferantId],
    queryFn: () => base44.entities.Produkt.filter({ lieferant: activeLieferantId }),
    enabled: !!activeLieferantId,
    // Intelligentes Polling: Nur wenn kein Edit aktiv und Tab sichtbar
    refetchInterval: () => shouldEnablePolling(hasActiveEdits),
    refetchIntervalInBackground: false
  });

  // ========== MUTATION WITH OPTIMISTIC UPDATE ==========
  
  const updateStockMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      base44.entities.Produkt.update(id, data),
    
    // Optimistic Update: Sofort UI aktualisieren
    onMutate: async (variables) => {
      // Cancel laufende Queries
      await queryClient.cancelQueries({ 
        queryKey: ['produkte-lagerbestand', activeLieferantId] 
      });
      
      // Snapshot für Rollback
      const previousData = queryClient.getQueryData([
        'produkte-lagerbestand', 
        activeLieferantId
      ]);
      
      // Optimistic Update
      queryClient.setQueryData(
        ['produkte-lagerbestand', activeLieferantId],
        (old: any[] = []) => old.map(p => 
          p.id === variables.id 
            ? { ...p, ...variables.data } 
            : p
        )
      );
      
      return { previousData };
    },
    
    // Bei Erfolg: Nur spezifische Query invalidieren
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['produkte-lagerbestand', activeLieferantId],
        exact: true
      });
      toast.success('Lagerbestand aktualisiert');
    },
    
    // Bei Fehler: Rollback
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['produkte-lagerbestand', activeLieferantId],
          context.previousData
        );
      }
      toast.error('Fehler beim Speichern. Änderungen wurden rückgängig gemacht.');
    }
  });

  // ========== COMPUTED DATA ==========
  
  const filteredProdukte = useMemo(() => {
    if (!searchText) return produkte;
    
    const search = searchText.toLowerCase();
    return produkte.filter(p => 
      p.name?.toLowerCase().includes(search) ||
      p.kategorie?.toLowerCase().includes(search)
    );
  }, [produkte, searchText]);

  // ========== EVENT HANDLERS ==========
  
  const handleStockChange = (produktId: string, value: string) => {
    // Nur numerische Werte akzeptieren
    const numValue = parseFloat(value);
    if (value !== '' && isNaN(numValue)) return;
    
    setEditingStocks(prev => ({
      ...prev,
      [produktId]: { 
        ...prev[produktId], 
        current_stock: numValue
      }
    }));
  };

  const handleStatusChange = (produktId: string, value: string) => {
    setEditingStocks(prev => ({
      ...prev,
      [produktId]: { 
        ...prev[produktId], 
        stock_status: value 
      }
    }));
  };

  const handleSave = (produkt: any) => {
    const changes = editingStocks[produkt.id] || {};
    const newStock = changes.current_stock ?? produkt.current_stock ?? 0;
    
    // VALIDIERUNG
    const validation = validateStockValue(newStock);
    if (!validation.isValid) {
      toast.error(validation.error);
      return;
    }
    
    // Auto-Status berechnen
    const minStock = produkt.min_stock ?? 5;
    const autoStatus = calculateAutoStatus(newStock, minStock);
    const finalStatus = changes.stock_status ?? autoStatus;

    // Mutation ausführen
    updateStockMutation.mutate({
      id: produkt.id,
      data: {
        current_stock: newStock,
        stock_status: finalStatus
      }
    });

    // Lokalen Edit-State löschen
    setEditingStocks(prev => {
      const newState = { ...prev };
      delete newState[produkt.id];
      return newState;
    });
  };

  const handleCancel = (produktId: string) => {
    setEditingStocks(prev => {
      const newState = { ...prev };
      delete newState[produktId];
      return newState;
    });
  };

  const getStockValue = (produkt: any): number | null => {
    return editingStocks[produkt.id]?.current_stock ?? produkt.current_stock;
  };

  const getStatusValue = (produkt: any): string | null => {
    return editingStocks[produkt.id]?.stock_status ?? produkt.stock_status;
  };

  const hasChanges = (produktId: string): boolean => {
    return !!editingStocks[produktId];
  };

  // ========== RENDER ==========
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            Lagerbestand
          </h1>
          <p className="text-slate-500 mt-1">Verwalten Sie Ihren Produktbestand</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <InventoryTableSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Package className="h-6 w-6 text-blue-600" />
          Lagerbestand
        </h1>
        <p className="text-slate-500 mt-1">
          Verwalten Sie Ihren Produktbestand
          {hasActiveEdits && (
            <span className="ml-2 text-amber-600 text-sm">
              • {Object.keys(editingStocks).length} ungespeicherte Änderung(en)
            </span>
          )}
        </p>
      </div>

      {/* Suchfeld */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Produkt suchen..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabelle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {filteredProdukte.length} {t('produkte')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Produkt
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Kategorie
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Einheit
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Bestand
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-sm">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-sm">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProdukte.length === 0 ? (
                  <EmptyInventoryState t={t} />
                ) : (
                  filteredProdukte.map(produkt => (
                    <tr key={produkt.id} className="border-b hover:bg-slate-50">
                      {/* Produkt-Name & Preis */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {produkt.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          € {produkt.standard_preis?.toFixed(2)}
                        </div>
                      </td>
                      
                      {/* Kategorie */}
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {produkt.kategorie}
                        </Badge>
                      </td>
                      
                      {/* Einheit */}
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {produkt.einheit}
                      </td>
                      
                      {/* Bestand */}
                      <td className="py-3 px-4">
                        <StockDisplay
                          produkt={produkt}
                          editingValue={getStockValue(produkt)}
                          onStockChange={handleStockChange}
                        />
                      </td>
                      
                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusSelect
                          produkt={produkt}
                          editingValue={getStatusValue(produkt)}
                          onStatusChange={handleStatusChange}
                        />
                      </td>
                      
                      {/* Aktionen */}
                      <td className="py-3 px-4">
                        <ActionButtons
                          produktId={produkt.id}
                          hasChanges={hasChanges(produkt.id)}
                          onSave={() => handleSave(produkt)}
                          onCancel={() => handleCancel(produkt.id)}
                          isSaving={updateStockMutation.isPending}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}