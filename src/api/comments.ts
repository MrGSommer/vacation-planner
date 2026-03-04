import { supabase } from './supabase';
import { ActivityComment, ActivityReaction } from '../types/database';

export const getComments = async (activityId: string): Promise<ActivityComment[]> => {
  const { data, error } = await supabase
    .from('activity_comments')
    .select('*, profile:profiles!user_id(first_name, last_name, avatar_url)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivityComment[];
};

export const addComment = async (activityId: string, userId: string, content: string): Promise<ActivityComment> => {
  const { data, error } = await supabase
    .from('activity_comments')
    .insert({ activity_id: activityId, user_id: userId, content })
    .select('*, profile:profiles!user_id(first_name, last_name, avatar_url)')
    .single();
  if (error) throw error;
  return data as ActivityComment;
};

export const deleteComment = async (commentId: string): Promise<void> => {
  const { error } = await supabase.from('activity_comments').delete().eq('id', commentId);
  if (error) throw error;
};

export const getReactions = async (activityId: string): Promise<ActivityReaction[]> => {
  const { data, error } = await supabase
    .from('activity_reactions')
    .select('*')
    .eq('activity_id', activityId);
  if (error) throw error;
  return (data ?? []) as ActivityReaction[];
};

export const toggleReaction = async (activityId: string, userId: string, emoji: string): Promise<void> => {
  // Check if this exact reaction exists (toggle off)
  const { data: existing } = await supabase
    .from('activity_reactions')
    .select('id')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    // Remove the reaction (toggle off)
    await supabase.from('activity_reactions').delete().eq('id', existing.id);
  } else {
    // Remove any other reaction by this user on this activity (one per user)
    await supabase
      .from('activity_reactions')
      .delete()
      .eq('activity_id', activityId)
      .eq('user_id', userId);
    // Insert the new reaction
    const { error } = await supabase
      .from('activity_reactions')
      .insert({ activity_id: activityId, user_id: userId, emoji });
    if (error) throw error;
  }
};

/** Get reactions for multiple activities at once (for list views) */
export const getReactionsByActivities = async (activityIds: string[]): Promise<Record<string, ActivityReaction[]>> => {
  if (activityIds.length === 0) return {};
  const { data, error } = await supabase
    .from('activity_reactions')
    .select('*')
    .in('activity_id', activityIds);
  if (error) throw error;
  const map: Record<string, ActivityReaction[]> = {};
  for (const r of (data ?? [])) {
    if (!map[r.activity_id]) map[r.activity_id] = [];
    map[r.activity_id].push(r);
  }
  return map;
};
