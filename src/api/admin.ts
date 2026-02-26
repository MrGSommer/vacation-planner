import { supabase } from './supabase';
import { Profile, AiUsageLog, StripeCharge, StripeInvoice, StripeSubscriptionDetail, RevenueStats, EmailTest } from '../types/database';

interface AdminListUsersParams {
  search?: string;
  tier?: 'free' | 'premium' | 'trialing';
  limit?: number;
  offset?: number;
}

export const adminListUsers = async ({
  search,
  tier,
  limit = 20,
  offset = 0,
}: AdminListUsersParams): Promise<{ users: Profile[]; count: number }> => {
  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }
  if (tier === 'trialing') {
    query = query.eq('subscription_status', 'trialing');
  } else if (tier) {
    query = query.eq('subscription_tier', tier);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { users: data || [], count: count || 0 };
};

export const adminGetUser = async (userId: string): Promise<Profile> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
};

export const adminUpdateUser = async (
  userId: string,
  updates: Partial<Pick<Profile, 'ai_credits_balance' | 'subscription_tier' | 'subscription_status' | 'is_admin'>>
): Promise<Profile> => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const adminGetUserAiUsage = async (userId: string): Promise<AiUsageLog[]> => {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

interface AdminStats {
  totalUsers: number;
  premiumUsers: number;
  totalTrips: number;
  totalAiUsage: number;
}

export const adminGetStats = async (): Promise<AdminStats> => {
  const { data, error } = await supabase.rpc('admin_get_stats');
  if (error) throw error;
  return data as AdminStats;
};

export const adminGetRecentSignups = async (limit = 10): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

// --- Stripe Admin Functions ---

async function adminStripeCall<T>(action: string, params: Record<string, any> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht authentifiziert');

  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-stripe`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...params }),
    },
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Admin-Stripe Fehler');
  return json as T;
}

export const adminGetUserBilling = async (
  stripeCustomerId: string
): Promise<{ charges: StripeCharge[]; totals: { gross: number; fees: number; net: number; currency: string } }> => {
  return adminStripeCall('user_billing', { stripe_customer_id: stripeCustomerId });
};

export const adminGetUserInvoices = async (
  stripeCustomerId: string
): Promise<{ invoices: StripeInvoice[] }> => {
  return adminStripeCall('user_invoices', { stripe_customer_id: stripeCustomerId });
};

export const adminGetUserSubscription = async (
  stripeSubscriptionId: string
): Promise<{ subscription: StripeSubscriptionDetail }> => {
  return adminStripeCall('user_subscription', { stripe_subscription_id: stripeSubscriptionId });
};

export const adminGrantTrial = async (
  userId: string,
  trialDays: number,
): Promise<{ success: boolean; trial_end: number }> => {
  return adminStripeCall('grant_trial', {
    user_id: userId,
    trial_days: trialDays,
  });
};

export const adminGetRevenueStats = async (): Promise<RevenueStats> => {
  return adminStripeCall('revenue_stats');
};

// --- Email Test Functions ---

export const adminSendTestEmail = async (email: string): Promise<{ sent: boolean; error?: string; timestamp: string }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht authentifiziert');

  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-email-test`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: email }),
    },
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'E-Mail-Test fehlgeschlagen');
  return json;
};

export const adminSaveEmailTest = async (
  adminId: string,
  recipientEmail: string,
  subject: string,
  sendSuccess: boolean,
  sendError?: string,
): Promise<EmailTest> => {
  const { data, error } = await supabase
    .from('email_tests')
    .insert({
      admin_id: adminId,
      recipient_email: recipientEmail,
      subject,
      send_success: sendSuccess,
      send_error: sendError || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const adminGetEmailTests = async (limit = 20): Promise<EmailTest[]> => {
  const { data, error } = await supabase
    .from('email_tests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

export const adminConfirmEmailTest = async (testId: string): Promise<EmailTest> => {
  const { data, error } = await supabase
    .from('email_tests')
    .update({ manually_confirmed: true, confirmed_at: new Date().toISOString() })
    .eq('id', testId)
    .select()
    .single();

  if (error) throw error;
  return data;
};
