import { supabase } from './supabase';

export const getAiTripMemory = async (tripId: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('get_ai_trip_memory', { p_trip_id: tripId });
  if (error) throw error;
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.decrypted_memory || null;
};

export const saveAiTripMemory = async (tripId: string, memoryText: string): Promise<void> => {
  const { error } = await supabase.rpc('save_ai_trip_memory', {
    p_trip_id: tripId,
    p_memory_text: memoryText,
  });
  if (error) throw error;
};

export const deleteAiTripMemory = async (tripId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_ai_trip_memory', { p_trip_id: tripId });
  if (error) throw error;
};
