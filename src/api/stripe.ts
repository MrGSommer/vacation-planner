import { supabase } from './supabase';
import { STRIPE_CONFIG } from '../config/stripe';

export async function createCheckoutSession(priceId: string, mode?: 'subscription' | 'payment'): Promise<{ url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht authentifiziert');

  const res = await supabase.functions.invoke('create-checkout-session', {
    body: { priceId, mode },
  });

  if (res.error) throw new Error(res.error.message || 'Checkout fehlgeschlagen');
  return res.data;
}

export async function createPortalSession(): Promise<{ url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Nicht authentifiziert');

  const res = await supabase.functions.invoke('create-portal-session', {
    body: {},
  });

  if (res.error) throw new Error(res.error.message || 'Portal fehlgeschlagen');
  return res.data;
}

export async function purchaseInspirations(): Promise<{ url: string }> {
  return createCheckoutSession(STRIPE_CONFIG.priceAiCredits, 'payment');
}
