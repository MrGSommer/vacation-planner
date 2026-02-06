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

const AI_CREDITS_MONTHLY = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-12-18.acacia',
    });

    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) return json({ error: 'Missing signature' }, 400);

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
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
      return json({ received: true, duplicate: true });
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

        await supabase
          .from('profiles')
          .update({
            subscription_tier: tier,
            subscription_status: status,
            stripe_subscription_id: sub.id,
            subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_customer_id', customerId);
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
          await supabase
            .from('profiles')
            .update({
              ai_credits_balance: AI_CREDITS_MONTHLY,
              ai_credits_monthly_quota: AI_CREDITS_MONTHLY,
            })
            .eq('stripe_customer_id', customerId);
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
        if (session.mode === 'payment') {
          // One-time purchase (AI credits)
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          if (!customerId) break;

          // Add 10 credits to balance
          const { data: profile } = await supabase
            .from('profiles')
            .select('ai_credits_balance')
            .eq('stripe_customer_id', customerId)
            .single();

          if (profile) {
            await supabase
              .from('profiles')
              .update({
                ai_credits_balance: (profile.ai_credits_balance || 0) + 10,
              })
              .eq('stripe_customer_id', customerId);
          }
        }
        break;
      }
    }

    return json({ received: true });
  } catch (e) {
    console.error('stripe-webhooks error:', e);
    return json({ error: (e as Error).message }, 400);
  }
});
