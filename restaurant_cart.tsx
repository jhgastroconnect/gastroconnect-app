import React, { useState, useMemo, useEffect } from 'react';
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

const DEFAULT_RESTAURANT_ID = '692b178b8af1f276d86a6a78';

export default function Warenkorb() {
  const { impersonatedRestaurant } = useRole();
  const activeRestaurantId = impersonatedRestaurant || DEFAULT_RESTAURANT_ID;
  const { t } = useTranslation();
  
  const { cartItems, updateMenge, removeFromCart } = useCart();
  const [sendingLieferant, setSendingLieferant] = useState(null);
  const queryClient = useQueryClient();

  // Produkte laden für Stock-Validierung mit Auto-Refresh
  const { data: produkte = [] } = useQuery({
    queryKey: ['produkte'],
    queryFn: () => base44.entities.Produkt.list(),
    refetchInterval: 3000,
    refetchIntervalInBackground: true
  });

  // Restaurant und Lieferanten laden für Benachrichtigungen
  const { data: restaurants = [] } = useQuery({
    queryKey: ['restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  const { data: lieferanten = [] } = useQuery({
    queryKey: ['lieferanten'],
    queryFn: () => base44.entities.Lieferant.list()
  });

  const activeRestaurant = restaurants.find(r => r.id === activeRestaurantId);

  // Gruppiere nach Lieferant
  const gruppiertNachLieferant = useMemo(() => {
    const gruppen = {};
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
  }, [cartItems]);

  const gesamtsumme = cartItems.reduce((sum, item) => sum + (item.preis * item.menge), 0);

  // Mutation für Bestellung erstellen
  const createBestellungMutation = useMutation({
    mutationFn: async ({ lieferantId, positionen }) => {
      // STOCK-VALIDIERUNG: Prüfe ob alle Produkte verfügbar sind
      for (const pos of positionen) {
        const produkt = produkte.find(p => p.id === pos.produktId);
        if (!produkt) {
          throw new Error(`Produkt ${pos.produktName} nicht gefunden`);
        }
        
        const availableStock = produkt.current_stock ?? 999999;
        if (produkt.stock_status === 'out_of_stock') {
          throw new Error(`${produkt.name} ist nicht mehr verfügbar`);
        }
        
        if (pos.menge > availableStock) {
          throw new Error(`${produkt.name}: Nur ${availableStock} ${produkt.einheit} verfügbar (bestellt: ${pos.menge})`);
        }
      }

      const gesamtbetrag = positionen.reduce((sum, pos) => sum + (pos.preis * pos.menge), 0);
      
      // Bestellung erstellen
      const bestellung = await base44.entities.Bestellung.create({
        restaurant: activeRestaurantId,
        lieferant: lieferantId,
        bestelldatum: new Date().toISOString(),
        status: 'gesendet',
        gesamtbetrag: gesamtbetrag
      });

      // Bestellpositionen erstellen
      const bestellpositionen = positionen.map(pos => ({
        bestellung: bestellung.id,
        produkt: pos.produktId,
        menge: pos.menge,
        einzelpreis: pos.preis,
        positions_summe: pos.preis * pos.menge
      }));

      await base44.entities.Bestellposition.bulkCreate(bestellpositionen);

      return { bestellung, lieferantId, positionen };
    },
    onSuccess: async ({ bestellung, lieferantId, positionen }) => {
      // Positionen aus Warenkorb entfernen
      positionen.forEach(pos => removeFromCart(pos.produktId));
      
      // GLOBAL QUERY INVALIDATION für Stock-Sync
      queryClient.invalidateQueries({ queryKey: ['produkte'] });
      queryClient.invalidateQueries({ queryKey: ['produkte-lagerbestand'] });
      queryClient.invalidateQueries({ queryKey: ['bestellungen'] });
      queryClient.invalidateQueries({ queryKey: ['lieferant-bestellungen'] });
      queryClient.invalidateQueries({ queryKey: ['bestellungen-tagesuebersicht'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-bestellungen'] });
      
      // Benachrichtigung an Lieferant senden
      const lieferant = lieferanten.find(l => l.id === lieferantId);
      console.log('Sende Benachrichtigung an Lieferant:', lieferant?.email, 'Restaurant:', activeRestaurant?.name);
      if (lieferant?.email && activeRestaurant?.name) {
        try {
          await notifyNewOrder(bestellung, activeRestaurant.name, lieferant.email);
          console.log('Benachrichtigung erfolgreich gesendet');
        } catch (e) {
          console.error('Fehler beim Senden der Benachrichtigung:', e);
        }
      } else {
        console.warn('Benachrichtigung nicht gesendet - fehlende Daten:', { 
          lieferantEmail: lieferant?.email, 
          restaurantName: activeRestaurant?.name 
        });
      }
      
      const lieferantName = positionen[0]?.lieferantName || 'Lieferant';
      toast.success(`Bestellung an ${lieferantName} wurde erfolgreich gesendet!`);
      setSendingLieferant(null);
    },
    onError: (error) => {
      toast.error('Fehler beim Senden der Bestellung');
      setSendingLieferant(null);
    }
  });

  const handleBestellungSenden = (lieferantId, positionen) => {
    setSendingLieferant(lieferantId);
    createBestellungMutation.mutate({ lieferantId, positionen });
  };

  if (cartItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="p-6 bg-slate-100 rounded-full mb-6">
          <ShoppingCart className="h-12 w-12 text-slate-400" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">{t('warekorbLeer')}</h2>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('warenkorb')}</h1>
          <p className="text-slate-500 mt-1">
            {cartItems.length} Produkt{cartItems.length !== 1 ? 'e' : ''} von {gruppiertNachLieferant.length} {t('lieferant')}{gruppiertNachLieferant.length !== 1 ? 'en' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">{t('gesamtsumme')}</p>
          <p className="text-2xl font-bold text-emerald-700">{gesamtsumme.toFixed(2)} €</p>
        </div>
      </div>

      {/* Lieferanten-Gruppen */}
      <div className="space-y-6">
        {gruppiertNachLieferant.map(gruppe => (
          <WarenkorbLieferantGruppe
            key={gruppe.lieferantId}
            lieferantName={gruppe.lieferantName}
            positionen={gruppe.positionen}
            onUpdateMenge={updateMenge}
            onRemove={removeFromCart}
            onBestellungSenden={() => handleBestellungSenden(gruppe.lieferantId, gruppe.positionen)}
            isSending={sendingLieferant === gruppe.lieferantId}
          />
        ))}
      </div>

      {/* Weiter einkaufen */}
      <div className="text-center pt-4">
        <Link to={createPageUrl('Produktkatalog')}>
          <Button variant="outline">
            Weitere Produkte hinzufügen
          </Button>
        </Link>
      </div>
    </div>
  );
}