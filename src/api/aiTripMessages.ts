import { supabase } from './supabase';

export interface AiTripMessageRow {
  id: string;
  sender_id: string;
  sender_name: string;
  role: 'user' | 'assistant';
  decrypted_content: string;
  credits_cost: number | null;
  credits_after: number | null;
  created_at: string;
}

export const getAiTripMessages = async (tripId: string): Promise<AiTripMessageRow[]> => {
  const { data, error } = await supabase.rpc('get_ai_trip_messages', { p_trip_id: tripId });
  if (error) throw error;
  return (data as AiTripMessageRow[]) || [];
};

export const insertAiTripMessage = async (
  tripId: string,
  senderId: string,
  senderName: string,
  role: 'user' | 'assistant',
  content: string,
  creditsCost?: number,
  creditsAfter?: number,
): Promise<string> => {
  const { data, error } = await supabase.rpc('insert_ai_trip_message', {
    p_trip_id: tripId,
    p_sender_id: senderId,
    p_sender_name: senderName,
    p_role: role,
    p_content: content,
    p_credits_cost: creditsCost ?? null,
    p_credits_after: creditsAfter ?? null,
  });
  if (error) throw error;
  return data as string;
};

export const deleteAiTripMessages = async (tripId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_ai_trip_messages', { p_trip_id: tripId });
  if (error) throw error;
};
