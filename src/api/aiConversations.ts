import { supabase } from './supabase';

export interface SavedConversation {
  phase: string;
  data: any; // { metadata, plan }
  context_snapshot: { destination?: string; startDate?: string; endDate?: string };
  updated_at: string;
  data_snapshot?: Record<string, any> | null;
}

export const getAiConversation = async (tripId: string): Promise<SavedConversation | null> => {
  const { data, error } = await supabase.rpc('get_ai_conversation', { p_trip_id: tripId });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const row = data[0];
  return {
    phase: row.phase,
    data: JSON.parse(row.data),
    context_snapshot: row.context_snapshot,
    updated_at: row.updated_at,
    data_snapshot: row.data_snapshot || null,
  };
};

export const saveAiConversation = async (
  tripId: string,
  userId: string,
  phase: string,
  conversationData: { metadata: any; plan: any },
  contextSnapshot: { destination?: string; startDate?: string; endDate?: string },
  dataSnapshot?: Record<string, any> | null,
): Promise<void> => {
  const { error } = await supabase.rpc('save_ai_conversation', {
    p_trip_id: tripId,
    p_user_id: userId,
    p_phase: phase,
    p_data: JSON.stringify(conversationData),
    p_context: contextSnapshot,
    p_data_snapshot: dataSnapshot ?? null,
  });

  if (error) throw error;
};

export const deleteAiConversation = async (tripId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_ai_conversation', { p_trip_id: tripId });
  if (error) throw error;
};
