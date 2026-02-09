// Zero npm imports — uses native fetch() for Stripe + Supabase APIs

const ALLOWED_ORIGINS = ['https://wayfable.ch', 'http://localhost:8081', 'http://localhost:19006'];

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (data: unknown, origin: string, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://wayfable.ch';

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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const body = await req.json().catch(() => ({}));
    const clientCustomerId = body?.customerId;

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Ungültiges Token' }, origin, 401);

    const customerId = clientCustomerId || await getCustomerId(user.id);
    if (!customerId) return json({ error: 'Kein Stripe-Konto verknüpft' }, origin, 400);

    // Create billing portal session via Stripe REST API
    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': customerId,
        'return_url': `${SITE_URL}/profile`,
      }).toString(),
    });

    const session = await res.json();
    if (session.error) throw new Error(session.error.message);

    return json({ url: session.url }, origin);
  } catch (e) {
    console.error('create-portal-session error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
