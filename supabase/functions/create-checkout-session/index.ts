// Zero npm imports — uses native fetch() for Stripe + Supabase APIs
// Cold start: ~200ms instead of ~3500ms

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://vacation-planner-gs.netlify.app';

async function getUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

async function getCustomerId(userId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
    { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
  );
  const rows = await res.json();
  return rows?.[0]?.stripe_customer_id || null;
}

async function saveCustomerId(userId: string, customerId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ stripe_customer_id: customerId }),
  });
}

async function stripePost(endpoint: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { priceId, mode, customerId: clientCustomerId } = await req.json();
    if (!priceId) return json({ error: 'priceId fehlt' }, 400);
    if (!mode) return json({ error: 'mode fehlt' }, 400);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Ungültiges Token' }, 401);

    // Get or create Stripe customer
    let customerId = clientCustomerId || await getCustomerId(user.id);

    if (!customerId) {
      const customer = await stripePost('/customers', {
        'email': user.email || '',
        'metadata[supabase_user_id]': user.id,
      });
      customerId = customer.id;
      await saveCustomerId(user.id, customerId);
    }

    // Create checkout session
    const session = await stripePost('/checkout/sessions', {
      'customer': customerId,
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'mode': mode,
      'success_url': `${SITE_URL}/subscription-success`,
      'cancel_url': `${SITE_URL}/subscription-cancel`,
      'metadata[supabase_user_id]': user.id,
    });

    return json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
