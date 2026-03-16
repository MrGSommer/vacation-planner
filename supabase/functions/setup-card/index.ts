/**
 * setup-card — Create a Stripe SetupIntent for card collection during onboarding.
 *
 * Zero npm imports — uses native fetch() for Stripe + Supabase APIs.
 * Creates a Stripe Customer (if not exists) and SetupIntent.
 * The card is stored for future use but NOT charged.
 *
 * Returns { clientSecret: string, customerId: string }
 */

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

async function getUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe not configured' }, origin, 500);

    // Verify the request comes from an authenticated user
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) {
      return json({ error: 'Unauthorized' }, origin, 401);
    }

    // Get profile to check for existing stripe_customer_id
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id,email,first_name,last_name`,
      { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
    );
    const profiles = await profileRes.json();
    const profile = profiles?.[0];

    if (!profile) return json({ error: 'Profile not found' }, origin, 404);

    let customerId = profile.stripe_customer_id;

    // Create Stripe Customer if needed
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: profile.email || user.email || '',
          name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '',
          'metadata[supabase_user_id]': user.id,
        }),
      });

      if (!customerRes.ok) {
        const err = await customerRes.text();
        console.error('Stripe customer creation failed:', err);
        return json({ error: 'Failed to create customer' }, origin, 500);
      }

      const customer = await customerRes.json();
      customerId = customer.id;

      // Save customer ID to profile
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
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

    // Create SetupIntent — card is stored but NOT charged
    const setupRes = await fetch('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId!,
        'payment_method_types[]': 'card',
        'metadata[supabase_user_id]': user.id,
        usage: 'off_session',
      }),
    });

    if (!setupRes.ok) {
      const err = await setupRes.text();
      console.error('Stripe SetupIntent creation failed:', err);
      return json({ error: 'Failed to create setup intent' }, origin, 500);
    }

    const setupIntent = await setupRes.json();

    return json({
      clientSecret: setupIntent.client_secret,
      customerId,
    }, origin);
  } catch (e) {
    console.error('setup-card error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
