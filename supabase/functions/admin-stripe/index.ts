// Zero npm imports — uses native fetch() for Stripe + Supabase APIs
// Admin-only Edge Function: JWT + is_admin check on every request

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

// --- Auth helpers ---

async function getUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

async function isAdmin(userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`,
    { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
  );
  const rows = await res.json();
  return rows?.[0]?.is_admin === true;
}

// --- Stripe helpers ---

async function stripeGet(path: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`https://api.stripe.com/v1${path}${qs}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
  });
  return res.json();
}

async function stripePost(path: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  return res.json();
}

async function updateProfile(userId: string, updates: Record<string, unknown>) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(updates),
    },
  );
}

// --- Actions ---

async function userBilling(customerId: string) {
  // Fetch all charges with balance_transaction expanded for fee details
  const charges: any[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Record<string, string> = {
      'customer': customerId,
      'limit': '100',
      'expand[]': 'data.balance_transaction',
    };
    if (startingAfter) params['starting_after'] = startingAfter;

    const result = await stripeGet('/charges', params);
    if (result.error) throw new Error(result.error.message);

    charges.push(...(result.data || []));
    hasMore = result.has_more;
    if (charges.length > 0) startingAfter = charges[charges.length - 1].id;
  }

  let totalGross = 0;
  let totalFees = 0;

  const mapped = charges.map((ch: any) => {
    const bt = ch.balance_transaction;
    const gross = ch.amount || 0;
    const fee = bt?.fee || 0;
    const net = bt?.net || (gross - fee);

    if (ch.status === 'succeeded') {
      totalGross += gross;
      totalFees += fee;
    }

    return {
      id: ch.id,
      amount: gross,
      fee,
      net,
      currency: ch.currency,
      status: ch.status,
      created: ch.created,
      description: ch.description,
    };
  });

  return {
    charges: mapped,
    totals: {
      gross: totalGross,
      fees: totalFees,
      net: totalGross - totalFees,
      currency: mapped[0]?.currency || 'chf',
    },
  };
}

async function userInvoices(customerId: string) {
  const result = await stripeGet('/invoices', {
    'customer': customerId,
    'limit': '50',
  });
  if (result.error) throw new Error(result.error.message);

  const invoices = (result.data || []).map((inv: any) => ({
    id: inv.id,
    number: inv.number,
    amount_due: inv.amount_due,
    amount_paid: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    created: inv.created,
    invoice_pdf: inv.invoice_pdf,
    hosted_invoice_url: inv.hosted_invoice_url,
  }));

  return { invoices };
}

async function userSubscription(subscriptionId: string) {
  const sub = await stripeGet(`/subscriptions/${subscriptionId}`);
  if (sub.error) throw new Error(sub.error.message);

  const item = sub.items?.data?.[0];
  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at,
      trial_start: sub.trial_start,
      trial_end: sub.trial_end,
      plan_amount: item?.price?.unit_amount || 0,
      plan_currency: item?.price?.currency || 'chf',
      plan_interval: item?.price?.recurring?.interval || 'month',
      plan_product_name: item?.price?.product?.name || null,
    },
  };
}

async function grantTrial(params: { user_id: string; trial_days: number; stripe_customer_id?: string; stripe_subscription_id?: string }) {
  const { user_id, trial_days, stripe_customer_id, stripe_subscription_id } = params;
  const trialEnd = Math.floor(Date.now() / 1000) + trial_days * 86400;

  if (stripe_subscription_id) {
    // Extend trial on existing subscription
    const sub = await stripePost(`/subscriptions/${stripe_subscription_id}`, {
      'trial_end': String(trialEnd),
    });
    if (sub.error) throw new Error(sub.error.message);

    await updateProfile(user_id, {
      subscription_tier: 'premium',
      subscription_status: 'trialing',
      subscription_period_end: new Date(trialEnd * 1000).toISOString(),
    });

    return { success: true, subscription_id: sub.id, trial_end: trialEnd };
  }

  // No existing subscription — create one with trial
  let customerId = stripe_customer_id;

  if (!customerId) {
    // Look up user email for Stripe customer creation
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=email`,
      { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
    );
    const rows = await profileRes.json();
    const email = rows?.[0]?.email;

    const customer = await stripePost('/customers', {
      ...(email ? { 'email': email } : {}),
      'metadata[supabase_user_id]': user_id,
    });
    if (customer.error) throw new Error(customer.error.message);
    customerId = customer.id;

    await updateProfile(user_id, { stripe_customer_id: customerId });
  }

  // Create subscription with trial (auto-cancels when trial ends without payment method)
  const sub = await stripePost('/subscriptions', {
    'customer': customerId!,
    'items[0][price]': 'price_1SxlEiGtIWkM8nDay8lOyYFi', // monthly price
    'trial_end': String(trialEnd),
    'payment_behavior': 'default_incomplete',
    'trial_settings[end_behavior][missing_payment_method]': 'cancel',
  });
  if (sub.error) throw new Error(sub.error.message);

  await updateProfile(user_id, {
    subscription_tier: 'premium',
    subscription_status: 'trialing',
    stripe_subscription_id: sub.id,
    subscription_period_end: new Date(trialEnd * 1000).toISOString(),
  });

  return { success: true, subscription_id: sub.id, trial_end: trialEnd };
}

async function revenueStats() {
  // Fetch all succeeded charges with balance_transaction for fee breakdown
  const charges: any[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Record<string, string> = {
      'status': 'succeeded' as string,
      'limit': '100',
      'expand[]': 'data.balance_transaction',
    };
    if (startingAfter) params['starting_after'] = startingAfter;

    // Safety: cap at 1000 charges to avoid runaway pagination
    if (charges.length >= 1000) break;

    const result = await stripeGet('/charges', params);
    if (result.error) throw new Error(result.error.message);

    charges.push(...(result.data || []));
    hasMore = result.has_more;
    if (charges.length > 0) startingAfter = charges[charges.length - 1].id;
  }

  let totalGross = 0;
  let totalFees = 0;

  for (const ch of charges) {
    totalGross += ch.amount || 0;
    totalFees += ch.balance_transaction?.fee || 0;
  }

  // Active subscriptions for MRR
  const activeSubs = await stripeGet('/subscriptions', { 'status': 'active', 'limit': '100' });
  if (activeSubs.error) throw new Error(activeSubs.error.message);

  let mrr = 0;
  for (const sub of activeSubs.data || []) {
    const item = sub.items?.data?.[0];
    const amount = item?.price?.unit_amount || 0;
    const interval = item?.price?.recurring?.interval;
    if (interval === 'year') mrr += Math.round(amount / 12);
    else mrr += amount; // monthly
  }

  return {
    total_revenue_gross: totalGross,
    total_fees: totalFees,
    total_revenue_net: totalGross - totalFees,
    mrr,
    active_subscriptions: activeSubs.data?.length || 0,
    currency: 'chf',
  };
}

// --- Main handler ---

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    // 1. Auth: validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Ungültiges Token' }, origin, 401);

    // 2. Auth: verify admin
    const admin = await isAdmin(user.id);
    if (!admin) return json({ error: 'Keine Admin-Berechtigung' }, origin, 403);

    // 3. Parse request
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'user_billing': {
        const { stripe_customer_id } = body;
        if (!stripe_customer_id) return json({ error: 'stripe_customer_id erforderlich' }, origin, 400);
        const result = await userBilling(stripe_customer_id);
        return json(result, origin);
      }

      case 'user_invoices': {
        const { stripe_customer_id } = body;
        if (!stripe_customer_id) return json({ error: 'stripe_customer_id erforderlich' }, origin, 400);
        const result = await userInvoices(stripe_customer_id);
        return json(result, origin);
      }

      case 'user_subscription': {
        const { stripe_subscription_id } = body;
        if (!stripe_subscription_id) return json({ error: 'stripe_subscription_id erforderlich' }, origin, 400);
        const result = await userSubscription(stripe_subscription_id);
        return json(result, origin);
      }

      case 'grant_trial': {
        const { user_id, trial_days, stripe_customer_id, stripe_subscription_id } = body;
        if (!user_id || !trial_days) return json({ error: 'user_id und trial_days erforderlich' }, origin, 400);
        const result = await grantTrial({ user_id, trial_days, stripe_customer_id, stripe_subscription_id });
        return json(result, origin);
      }

      case 'revenue_stats': {
        const result = await revenueStats();
        return json(result, origin);
      }

      default:
        return json({ error: `Unbekannte Aktion: ${action}` }, origin, 400);
    }
  } catch (e) {
    console.error('admin-stripe error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
