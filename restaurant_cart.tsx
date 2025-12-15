import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useCart } from '@/components/cart/CartContext';
import { useRole } from '@/components/RoleContext';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import WarenkorbLieferantGruppe from '@/components/warenkorb/WarenkorbLieferantGruppe';
import { notifyNewOrder } from '@/components/notifications/notificationService';
import { useTranslation } from '@/components/utils/translations';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Berechnet die Summe für eine einzelne Position
 */
function calculatePositionTotal(preis: number, menge: number): number {
  return preis * menge;
}

/**
 * Berechnet die Gesamtsumme für eine Liste von Positionen
 */
function calculatePositionsTotal(positionen: any[]): number {
  return positionen.reduce(
    (sum, pos) => sum + calculatePositionTotal(pos.preis, pos.menge),
    0
  );
}

/**
 * Berechnet die Gesamtsumme über alle Warenkorb-Items
 */
function calculateCartTotal(cartItems: any[]): number {
  return cartItems.reduce(
    (sum, item) => sum + calculatePositionTotal(item.preis, item.menge),
    0
  );
}

/**
 * Gruppiert Warenkorb-Items nach Lieferant
 * @returns Array von Gruppen mit { lieferantId, lieferantName, positionen[] }
 */
function groupCartItemsBySupplier(cartItems: any[]): any[] {
  const gruppen: Record<string, any> = {};
  
  cartItems.forEach(item => {
    if (!gruppen[item.lieferantId]) {
      gruppen[item.lieferantId] = {
        lieferantId: item.lieferantId,
        lieferantName: item.lieferantName,
        positionen: []
      };
    }
    gruppen[item.lieferantId].positionen.push(item);
  });
  
  return Object.values(gruppen);
}

/**
 * Validiert Stock-Verfügbarkeit für eine Position
 * @throws Error wenn Produkt nicht verfügbar oder Stock nicht ausreichend
 * 
 * TODO: Diese Validierung sollte server-seitig in einem atomaren Order-Endpoint erfolgen
 * Aktuelles Problem: Race Condition zwischen Client-Check und tatsächlicher Bestellung
 */
function validateProductStock(position: any, produkt: any): void {
  // Check 1: Produkt existiert
  if (!produkt) {
    throw new Error(`Produkt ${position.produktName} nicht gefunden`);
  }
  
  // Check 2: Status ist nicht "out_of_stock"
  if (produkt.stock_status === 'out_of_stock') {
    throw new Error(`${produkt.name} ist nicht mehr verfügbar`);
  }
  
  // Check 3: Ausreichend Stock vorhanden
  // WARNUNG: Fallback zu 999999 bedeutet "unbegrenzt" wenn current_stock nicht gesetzt
  const availableStock = produkt.current_stock ?? 999999;
  if (position.menge > availableStock) {
    throw new Error(
      `${produkt.name}: Nur ${availableStock} ${produkt.einheit} verfügbar (bestellt: ${position.menge})`
    );
  }
}

/**
 * Erstellt Bestellpositionen-Array für API
 */
function createOrderPositions(bestellungId: string, positionen: any[]): any[] {
  return positionen.map(pos => ({
    bestellung: bestellungId,
    produkt: pos.produktId,
    menge: pos.menge,
    einzelpreis: pos.preis,
    positions_summe: calculatePositionTotal(pos.preis, pos.menge)
  }));
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Empty State - Warenkorb ist leer
 */
function EmptyCartState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="p-6 bg-slate-100 rounded-full mb-6">
        <ShoppingCart className="h-12 w-12 text-slate-400" />
      </div>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        {t('warekorbLeer')}
      </h2>
      <p className="text-slate-500 mb-6 max-w-md">
        {t('produkteHinzufuegen')}
      </p>
      <Link to={createPageUrl('Produktkatalog')}>
        <Button className="bg-emerald-700 hover:bg-emerald-800">
          {t('zumKatalog')}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
    </div>
  );
}

/**
 * Warenkorb Header mit Statistiken und Gesamtsumme
 */
function CartHeader({
  itemCount,
  supplierCount,
  totalAmount,
  t
}: {
  itemCount: number;
  supplierCount: number;
  totalAmount: number;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      {/* Linke Seite: Titel + Statistik */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('warenkorb')}</h1>
        <p className="text-slate-500 mt-1">
          {itemCount} Produkt{itemCount !== 1 ? 'e' : ''} von {supplierCount}{' '}
          {t('lieferant')}{supplierCount !== 1 ? 'en' : ''}
        </p>
      </div>
      
      {/* Rechte Seite: Gesamtsumme */}
      <div className="text-right">
        <p className="text-sm text-slate-500">{t('gesamtsumme')}</p>
        <p className="text-2xl font-bold text-emerald-700">
          {totalAmount.toFixed(2)} €
        </p>
      </div>
    </div>
  );
}

/**
 * Lieferanten-Gruppen Bereich
 */
function SupplierGroupsSection({
  gruppen,
  onUpdateMenge,
  onRemove,
  onSendOrder,
  sendingLieferant
}: any) {
  return (
    <div className="space-y-6">
      {gruppen.map((gruppe: any) => (
        <WarenkorbLieferantGruppe
          key={gruppe.lieferantId}
          lieferantName={gruppe.lieferantName}
          positionen={gruppe.positionen}
          onUpdateMenge={onUpdateMenge}
          onRemove={onRemove}
          onBestellungSenden={() => onSendOrder(gruppe.lieferantId, gruppe.positionen)}
          isSending={sendingLieferant === gruppe.lieferantId}
        />
      ))}
    </div>
  );
}

/**
 * Actions Bereich - "Weiter einkaufen" Button
 */
function CartActions({ t }: { t: (key: string) => string }) {
  return (
    <div className="text-center pt-4">
      <Link to={createPageUrl('Produktkatalog')}>
        <Button variant="outline">
          Weitere Produkte hinzufügen
        </Button>
      </Link>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Warenkorb() {
  const { impersonatedRestaurant } = useRole();
  const activeRestaurantId = impersonatedRestaurant || DEFAULT_RESTAURANT_ID;
  const { t } = useTranslation();
  
  const { cartItems, updateMenge, removeFromCart } = useCart();
  const [sendingLieferant, setSendingLieferant] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // ========== DATA FETCHING ==========
  
  // Produkte laden für Stock-Validierung
  // TODO: Sollte nur die Produkte im Warenkorb laden, nicht alle 10.000+
  const { data: produkte = [] } = useQuery({
    queryKey: ['produkte'],
    queryFn: () => base44.entities.Produkt.list(),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Restaurant und Lieferanten für Benachrichtigungen
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  // ========== COMPUTED DATA ==========
  
  const activeRestaurant = useMemo(
    () => restaurants.find(r => r.id === activeRestaurantId),
    [restaurants, activeRestaurantId]
  );

  // Gruppiere Items nach Lieferant
  const gruppiertNachLieferant = useMemo(
    () => groupCartItemsBySupplier(cartItems),
    [cartItems]
  );

  // Gesamtsumme über alle Items
  const gesamtsumme = useMemo(
    () => calculateCartTotal(cartItems),
    [cartItems]
  );

  // ========== ORDER MUTATION ==========
  
  /**
   * Mutation zum Erstellen einer Bestellung
   * 
   * WICHTIGE HINWEISE ZU KRITISCHEN STELLEN:
   * 1. Stock-Validierung ist client-seitig → Race Condition möglich
   * 2. Zwei separate API-Calls → Nicht atomar, kein Rollback
   * 3. Sechs Query-Invalidierungen → Kann Server überlasten
   * 
   * TODO: In zukünftiger Iteration sollte dies durch einen atomaren
   * Backend-Endpoint ersetzt werden: POST /api/orders/create
   */
  const createBestellungMutation = useMutation({
    mutationFn: async ({ lieferantId, positionen }: { lieferantId: string; positionen: any[] }) => {
      // ========== KRITISCHER PUNKT 1: CLIENT-SEITIGE STOCK-VALIDIERUNG ==========
      // PROBLEM: Race Condition zwischen Check und tatsächlicher Bestellung
      // LÖSUNG: Server-seitiges Locking in atomarem Order-Endpoint
      for (const pos of positionen) {
        const produkt = produkte.find(p => p.id === pos.produktId);
        validateProductStock(pos, produkt);
      }

      const gesamtbetrag = calculatePositionsTotal(positionen);
      
      // ========== KRITISCHER PUNKT 2: ZWEI SEPARATE API-CALLS (NICHT ATOMAR) ==========
      // PROBLEM: Bestellung kann erstellt werden, aber Positionen fehlschlagen
      // LÖSUNG: Backend-Transaction oder atomarer Endpoint
      
      // API Call 1: Bestellung-Header erstellen
      const bestellung = await base44.entities.Bestellung.create({
        restaurant: activeRestaurantId,
        lieferant: lieferantId,
        bestelldatum: new Date().toISOString(),
        status: 'gesendet',
        gesamtbetrag: gesamtbetrag
      });

      // API Call 2: Bestellpositionen erstellen (Bulk)
      const bestellpositionen = createOrderPositions(bestellung.id, positionen);
      await base44.entities.Bestellposition.bulkCreate(bestellpositionen);

      return { bestellung, lieferantId, positionen };
    },
    
    onSuccess: async ({ bestellung, lieferantId, positionen }) => {
      // 1. Positionen aus Warenkorb entfernen
      positionen.forEach(pos => removeFromCart(pos.produktId));
      
      // ========== KRITISCHER PUNKT 3: MASSIVE QUERY-INVALIDIERUNG ==========
      // PROBLEM: 6 separate API-Calls werden gleichzeitig gefeuert
      // AUSWIRKUNG: Bei vielen Bestellungen kann Server überlastet werden
      // LÖSUNG: Selektive Invalidierung oder Optimistic Updates
      queryClient.invalidateQueries({ queryKey: ['produkte'] });
      queryClient.invalidateQueries({ queryKey: ['produkte-lagerbestand'] });
      queryClient.invalidateQueries({ queryKey: ['bestellungen'] });
      queryClient.invalidateQueries({ queryKey: ['lieferant-bestellungen'] });
      queryClient.invalidateQueries({ queryKey: ['bestellungen-tagesuebersicht'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-bestellungen'] });
      
      // 2. Email-Benachrichtigung an Lieferant
      const lieferant = lieferanten.find(l => l.id === lieferantId);
      
      if (lieferant?.email && activeRestaurant?.name) {
        try {
          await notifyNewOrder(bestellung, activeRestaurant.name, lieferant.email);
        } catch (error) {
          // Email-Fehler wird nur geloggt, blockiert nicht die Bestellung
          console.error('Fehler beim Senden der Benachrichtigung:', error);
        }
      }
      
      // 3. Erfolgs-Toast
      const lieferantName = positionen[0]?.lieferantName || 'Lieferant';
      toast.success(`Bestellung an ${lieferantName} wurde erfolgreich gesendet!`);
      
      // 4. Loading-State zurücksetzen
      setSendingLieferant(null);
    },
    
    onError: (error: any) => {
      // Zeige spezifische Fehlermeldung wenn verfügbar, sonst generisch
      const errorMessage = error.message || 'Fehler beim Senden der Bestellung';
      toast.error(errorMessage);
      
      setSendingLieferant(null);
    }
  });

  // ========== EVENT HANDLERS ==========
  
  /**
   * Zentrale Handler-Funktion zum Senden einer Bestellung
   * Wird für jede Lieferanten-Gruppe separat aufgerufen
   */
  const handleBestellungSenden = (lieferantId: string, positionen: any[]) => {
    // 1. UI: Markiere diesen Lieferanten als "wird gesendet"
    setSendingLieferant(lieferantId);
    
    // 2. Starte Mutation (siehe oben für Details)
    createBestellungMutation.mutate({ lieferantId, positionen });
  };

  // ========== RENDER ==========
  
  // Empty State: Warenkorb ist leer
  if (cartItems.length === 0) {
    return <EmptyCartState t={t} />;
  }

  // Main Layout: Header + Gruppen + Actions
  return (
    <div className="space-y-6">
      {/* ========== BLOCK 1: HEADER MIT SUMMEN ========== */}
      <CartHeader
        itemCount={cartItems.length}
        supplierCount={gruppiertNachLieferant.length}
        totalAmount={gesamtsumme}
        t={t}
      />

      {/* ========== BLOCK 2: LIEFERANTEN-GRUPPEN (POSITIONEN) ========== */}
      <SupplierGroupsSection
        gruppen={gruppiertNachLieferant}
        onUpdateMenge={updateMenge}
        onRemove={removeFromCart}
        onSendOrder={handleBestellungSenden}
        sendingLieferant={sendingLieferant}
      />

      {/* ========== BLOCK 3: ACTIONS ========== */}
      <CartActions t={t} />
    </div>
  );
}