import { supabase } from './supabase';

export async function acquireProcessingLock(
  tripId: string,
  userId: string,
  userName: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('acquire_ai_processing_lock', {
    p_trip_id: tripId,
    p_user_id: userId,
    p_user_name: userName,
  });
  if (error) throw error;
  return data === true;
}

export async function releaseProcessingLock(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('release_ai_processing_lock', {
    p_trip_id: tripId,
  });
  if (error) throw error;
}

export async function getProcessingLock(
  tripId: string,
): Promise<{ userId: string; userName: string; startedAt: string } | null> {
  const { data, error } = await supabase.rpc('get_ai_processing_lock', {
    p_trip_id: tripId,
  });
  if (error) throw error;
  if (!data || data.length === 0 || !data[0].processing_user_id) return null;
  return {
    userId: data[0].processing_user_id,
    userName: data[0].processing_user_name,
    startedAt: data[0].processing_started_at,
  };
}
