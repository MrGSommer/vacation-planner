import { supabase } from './supabase';

export interface ActivityLogEntry {
  id: string;
  trip_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any>;
  created_at: string;
  profile?: { first_name: string | null; last_name: string | null; avatar_url: string | null };
}

export const getActivityLog = async (tripId: string, limit = 50): Promise<ActivityLogEntry[]> => {
  const { data, error } = await supabase
    .from('trip_activity_log')
    .select('*, profile:profiles!user_id(first_name, last_name, avatar_url)')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLogEntry[];
};
