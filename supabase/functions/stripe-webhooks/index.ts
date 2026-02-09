import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const ALLOWED_ORIGINS = ['https://wayfable.ch', 'http://localhost:8081', 'http://localhost:19006'];

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (data: unknown, origin: string, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });

const AI_CREDITS_MONTHLY = 20;

/**
 * Resolve profile by stripe_customer_id, with fallback to client_reference_id (Supabase UUID).
 * Links stripe_customer_id on first match via client_reference_id.
 */
async function resolveProfile(
  supabase: ReturnType<typeof createClient>,
  customerId: string | null,
  clientReferenceId: string | null,
): Promise<{ id: string; ai_credits_balance: number } | null> {
  // 1. Try by stripe_customer_id
  if (customerId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, ai_credits_balance')
      .eq('stripe_customer_id', customerId)
      .single();
    if (data) return data;
  }

  // 2. Fallback: client_reference_id = Supabase user UUID
  if (clientReferenceId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, ai_credits_balance')
      .eq('id', clientReferenceId)
      .single();

    if (data) {
      // Link stripe_customer_id for future lookups
      if (customerId) {
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', clientReferenceId);
      }
      return data;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    });

    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) return json({ error: 'Missing signature' }, origin, 400);

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
    // Stripe SDK verifies the webhook signature (HMAC SHA-256)
    const event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Idempotency check
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('id', event.id)
      .single();

    if (existing) {
      return json({ received: true, duplicate: true }, origin);
    }

    await supabase.from('stripe_events').insert({ id: event.id, type: event.type });

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        const tier = sub.status === 'active' || sub.status === 'trialing' ? 'premium' : 'free';
        const status = sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' ? 'past_due'
          : 'canceled';

        // Resolve profile (stripe_customer_id or client_reference_id from metadata)
        const clientRefId = sub.metadata?.supabase_user_id || null;
        const profile = await resolveProfile(supabase, customerId, clientRefId);
        if (!profile) {
          console.error('No profile found for subscription', { customerId, clientRefId });
          break;
        }

        await supabase
          .from('profiles')
          .update({
            subscription_tier: tier,
            subscription_status: status,
            stripe_subscription_id: sub.id,
            subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq('id', profile.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

        await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            subscription_period_end: null,
            ai_credits_balance: 0,
            ai_credits_monthly_quota: 0,
          })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        // Check if this is a subscription renewal (not the first payment)
        if (invoice.billing_reason === 'subscription_cycle') {
          // Reset AI credits to monthly quota
          await supabase
            .from('profiles')
            .update({
              ai_credits_balance: AI_CREDITS_MONTHLY,
              ai_credits_monthly_quota: AI_CREDITS_MONTHLY,
            })
            .eq('stripe_customer_id', customerId);
        } else if (invoice.billing_reason === 'subscription_create') {
          // First subscription: set initial credits
          const profile = await resolveProfile(supabase, customerId, null);
          if (profile) {
            await supabase
              .from('profiles')
              .update({
                ai_credits_balance: AI_CREDITS_MONTHLY,
                ai_credits_monthly_quota: AI_CREDITS_MONTHLY,
              })
              .eq('id', profile.id);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        await supabase
          .from('profiles')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const clientRefId = session.client_reference_id; // Supabase UUID from Payment Link

        if (session.mode === 'payment') {
          // One-time purchase (Inspirationen)
          const profile = await resolveProfile(supabase, customerId || null, clientRefId);
          if (!profile) {
            console.error('No profile for checkout.session.completed', { customerId, clientRefId });
            break;
          }

          await supabase
            .from('profiles')
            .update({
              ai_credits_balance: (profile.ai_credits_balance || 0) + 20,
            })
            .eq('id', profile.id);
        } else if (session.mode === 'subscription') {
          // Subscription via Payment Link — ensure stripe_customer_id is linked
          if (clientRefId && customerId) {
            await resolveProfile(supabase, customerId, clientRefId);
          }
        }
        break;
      }
    }

    return json({ received: true }, origin);
  } catch (e) {
    console.error('stripe-webhooks error:', e);
    return json({ error: (e as Error).message }, origin, 400);
  }
});
