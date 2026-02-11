import { supabase } from './supabase';

export const getAiUserMemory = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc('get_ai_user_memory');

  if (error) throw error;
  if (!data) return null;
  // RPC returns {decrypted_memory, updated_at} — extract the string
  if (typeof data === 'object' && 'decrypted_memory' in data) {
    return (data as { decrypted_memory: string }).decrypted_memory || null;
  }
  return typeof data === 'string' ? data : null;
};

export const saveAiUserMemory = async (memoryText: string): Promise<void> => {
  const { error } = await supabase.rpc('save_ai_user_memory', { p_memory_text: memoryText });
  if (error) throw error;
};

export const deleteAiUserMemory = async (): Promise<void> => {
  const { error } = await supabase.rpc('delete_ai_user_memory');
  if (error) throw error;
};
