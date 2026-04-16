// Zero npm imports — uses native fetch() + Web Crypto for Stripe signature verification
// Cold start: ~200ms instead of ~3500ms with npm:stripe

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

// --- Native Stripe webhook signature verification (replaces npm:stripe) ---

async function verifyStripeSignature(body: string, sig: string, secret: string): Promise<any> {
  const parts = sig.split(',').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) throw new Error('Invalid signature header');

  // Reject events older than 5 minutes (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) throw new Error('Webhook timestamp too old');

  // HMAC-SHA256 verification
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (expected !== signature) throw new Error('Signature verification failed');

  return JSON.parse(body);
}

// --- Native Supabase helpers (replaces npm:@supabase/supabase-js) ---

async function dbSelect(table: string, filter: string, select: string): Promise<any[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${filter}&select=${select}`,
    { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
  );
  return res.json();
}

async function dbUpdate(table: string, filter: string, updates: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(updates),
  });
}

async function dbUpsert(table: string, row: Record<string, unknown>, onConflict: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=ignore-duplicates',
    },
    body: JSON.stringify(row),
  });
  const data = await res.json();
  // If array with data, insert succeeded (not a duplicate)
  return Array.isArray(data) && data.length > 0;
}

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
  });
  return res.json();
}

/** Fire-and-forget server-side analytics event.
 *  Uses the log_analytics_event RPC with a synthetic session id so the event
 *  still joins to the user's analytics history. */
function logServerEvent(
  userId: string | null,
  eventName: string,
  category: 'landing'|'auth'|'activation'|'monetization'|'retention'|'system',
  stripeEventId: string,
  properties: Record<string, unknown> = {},
): void {
  const sessionId = userId ? `user_${userId}` : `stripe_${stripeEventId}`;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/log_analytics_event`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_session_id: sessionId,
      p_event_name: eventName,
      p_category: category,
      p_properties: properties,
      p_user_id: userId,
      p_platform: 'stripe',
    }),
  }).catch((e) => console.error('logServerEvent failed:', e));
}

/** Fire-and-forget admin notification */
function notifyAdmin(type: string, data: Record<string, string>) {
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-admin`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, data }),
  }).catch((e) => console.error('notify-admin failed:', e));
}

/**
 * Resolve profile by stripe_customer_id, with fallback to client_reference_id (Supabase UUID).
 * Links stripe_customer_id on first match via client_reference_id.
 */
async function resolveProfile(
  customerId: string | null,
  clientReferenceId: string | null,
): Promise<{ id: string; ai_credits_balance: number; ai_credits_purchased: number } | null> {
  // 1. Try by stripe_customer_id
  if (customerId) {
    const rows = await dbSelect('profiles', `stripe_customer_id=eq.${customerId}`, 'id,ai_credits_balance,ai_credits_purchased');
    if (rows?.[0]) return rows[0];
  }

  // 2. Fallback: client_reference_id = Supabase user UUID
  if (clientReferenceId) {
    const rows = await dbSelect('profiles', `id=eq.${clientReferenceId}`, 'id,ai_credits_balance,ai_credits_purchased');
    if (rows?.[0]) {
      // Link stripe_customer_id for future lookups
      if (customerId) {
        await dbUpdate('profiles', `id=eq.${clientReferenceId}`, { stripe_customer_id: customerId });
      }
      return rows[0];
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
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) return json({ error: 'Missing signature' }, origin, 400);

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
    // Native HMAC-SHA256 verification (no npm:stripe needed)
    const event = await verifyStripeSignature(body, sig, webhookSecret);

    // Atomic idempotency check
    const inserted = await dbUpsert('stripe_events', { id: event.id, type: event.type }, 'id');
    if (!inserted) {
      return json({ received: true, duplicate: true }, origin);
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        const tier = sub.status === 'active' || sub.status === 'trialing' ? 'premium' : 'free';
        const status = sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' ? 'past_due'
          : 'canceled';

        const clientRefId = sub.metadata?.supabase_user_id || null;
        const profile = await resolveProfile(customerId, clientRefId);
        if (!profile) {
          console.error('No profile found for subscription', { customerId, clientRefId });
          break;
        }

        await dbUpdate('profiles', `id=eq.${profile.id}`, {
          subscription_tier: tier,
          subscription_status: status,
          stripe_subscription_id: sub.id,
          subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });

        if (event.type === 'customer.subscription.created' && tier === 'premium') {
          logServerEvent(profile.id, 'subscription_purchased', 'monetization', event.id, {
            price_id: sub.items?.data?.[0]?.price?.id,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        const cancelProfiles = await dbSelect('profiles', `stripe_customer_id=eq.${customerId}`, 'id,email,first_name,last_name,ai_credits_purchased');
        const cancelProfile = cancelProfiles?.[0];

        await dbUpdate('profiles', `stripe_customer_id=eq.${customerId}`, {
          subscription_tier: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          subscription_period_end: null,
          ai_credits_balance: cancelProfile?.ai_credits_purchased ?? 0,
          ai_credits_monthly_quota: 0,
        });

        if (cancelProfile) {
          logServerEvent(cancelProfile.id, 'subscription_cancelled', 'monetization', event.id);
          notifyAdmin('cancellation', {
            user_email: cancelProfile.email,
            user_name: `${cancelProfile.first_name || ''} ${cancelProfile.last_name || ''}`.trim() || cancelProfile.email,
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        if (invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_create') {
          const profile = await resolveProfile(customerId, null);
          if (profile) {
            await dbUpdate('profiles', `id=eq.${profile.id}`, {
              ai_credits_balance: (profile.ai_credits_balance || 0) + AI_CREDITS_MONTHLY,
              ai_credits_monthly_quota: AI_CREDITS_MONTHLY,
              subscription_status: 'active',
              payment_error_message: null,
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        // Extract human-readable error from Stripe
        const charge = invoice.charge;
        let errorMessage: string | null = null;
        if (charge && typeof charge === 'string') {
          try {
            const chargeObj = await stripeGet(`/charges/${charge}`);
            errorMessage = chargeObj.failure_message || chargeObj.outcome?.seller_message || null;
          } catch {
            // Ignore — keep null
          }
        }

        await dbUpdate('profiles', `stripe_customer_id=eq.${customerId}`, {
          subscription_status: 'past_due',
          payment_error_message: errorMessage || 'Zahlung fehlgeschlagen',
        });
        break;
      }

      case 'setup_intent.succeeded': {
        const si = event.data.object;
        const siCustomerId = typeof si.customer === 'string' ? si.customer : si.customer?.id;
        const siUserId = si.metadata?.supabase_user_id;
        if (siCustomerId && siUserId) {
          await dbUpdate('profiles', `id=eq.${siUserId}`, { stripe_customer_id: siCustomerId });
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const clientRefId = session.client_reference_id;

        if (session.mode === 'payment') {
          const profile = await resolveProfile(customerId || null, clientRefId);
          if (!profile) {
            console.error('No profile for checkout.session.completed', { customerId, clientRefId });
            break;
          }

          await dbUpdate('profiles', `id=eq.${profile.id}`, {
            ai_credits_balance: (profile.ai_credits_balance || 0) + 20,
            ai_credits_purchased: (profile.ai_credits_purchased || 0) + 20,
          });
          logServerEvent(profile.id, 'inspirations_purchased', 'monetization', event.id, {
            amount_chf: (session.amount_total ?? 0) / 100,
          });
        } else if (session.mode === 'subscription') {
          await resolveProfile(customerId || null, clientRefId);

          notifyAdmin('premium', {
            user_email: session.customer_details?.email || '',
            user_name: session.customer_details?.name || session.customer_details?.email || '',
          });
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
