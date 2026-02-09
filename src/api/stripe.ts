import { supabase } from './supabase';
import { STRIPE_CONFIG } from '../config/stripe';

export function buildPaymentLinkUrl(baseUrl: string, userId: string, email: string): string {
  const params = new URLSearchParams({
    client_reference_id: userId,
    locked_prefilled_email: email,
    locale: 'de',
  });
  return `${baseUrl}?${params.toString()}`;
}

export function getSubscriptionUrl(billing: 'monthly' | 'yearly', userId: string, email: string): string {
  const baseUrl = billing === 'monthly'
    ? STRIPE_CONFIG.paymentLinkMonthly
    : STRIPE_CONFIG.paymentLinkYearly;
  return buildPaymentLinkUrl(baseUrl, userId, email);
}

export function getInspirationsUrl(userId: string, email: string): string {
  return buildPaymentLinkUrl(STRIPE_CONFIG.paymentLinkInspirations, userId, email);
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
