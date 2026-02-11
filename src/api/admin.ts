import { supabase } from './supabase';
import { Profile, Trip, AiUsageLog } from '../types/database';

interface AdminListUsersParams {
  search?: string;
  tier?: 'free' | 'premium';
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
  if (tier) {
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

export const adminGetUserTrips = async (userId: string): Promise<Trip[]> => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
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
  const [users, premium, trips, aiUsage] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_tier', 'premium'),
    supabase.from('trips').select('*', { count: 'exact', head: true }),
    supabase.from('ai_usage_logs').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalUsers: users.count || 0,
    premiumUsers: premium.count || 0,
    totalTrips: trips.count || 0,
    totalAiUsage: aiUsage.count || 0,
  };
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
