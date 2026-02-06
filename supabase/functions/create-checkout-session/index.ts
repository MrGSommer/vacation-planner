import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { priceId } = await req.json();
    if (!priceId) return json({ error: 'priceId fehlt' }, 400);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Ungültiges Token' }, 401);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    });

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://vacation-planner-gs.netlify.app';

    // Determine mode based on price type
    const price = await stripe.prices.retrieve(priceId);
    const mode = price.recurring ? 'subscription' : 'payment';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      success_url: `${siteUrl}/subscription-success`,
      cancel_url: `${siteUrl}/subscription-cancel`,
      metadata: {
        supabase_user_id: user.id,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
