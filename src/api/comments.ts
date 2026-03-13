import { supabase } from './supabase';
import { ActivityComment, ActivityReaction } from '../types/database';
import { offlineMutation } from '../utils/offlineMutation';

export const getComments = async (activityId: string): Promise<ActivityComment[]> => {
  const { data, error } = await supabase
    .from('activity_comments')
    .select('*, profile:profiles!user_id(first_name, last_name, avatar_url)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivityComment[];
};

const _addComment = async (activityId: string, userId: string, content: string): Promise<ActivityComment> => {
  const { data, error } = await supabase
    .from('activity_comments')
    .insert({ activity_id: activityId, user_id: userId, content })
    .select('*, profile:profiles!user_id(first_name, last_name, avatar_url)')
    .single();
  if (error) throw error;
  return data as ActivityComment;
};

export const addComment = async (activityId: string, userId: string, content: string): Promise<ActivityComment> => {
  return offlineMutation({
    operation: 'addComment', table: 'activity_comments',
    args: [activityId, userId, content], cacheKeys: [],
    fn: _addComment,
    optimisticResult: { id: `temp_${Date.now()}`, activity_id: activityId, user_id: userId, content, created_at: new Date().toISOString() } as ActivityComment,
  });
};

const _deleteComment = async (commentId: string): Promise<void> => {
  const { error } = await supabase.from('activity_comments').delete().eq('id', commentId);
  if (error) throw error;
};

export const deleteComment = async (commentId: string): Promise<void> => {
  return offlineMutation({
    operation: 'deleteComment', table: 'activity_comments',
    args: [commentId], cacheKeys: [],
    fn: _deleteComment,
  });
};

export const getReactions = async (activityId: string): Promise<ActivityReaction[]> => {
  const { data, error } = await supabase
    .from('activity_reactions')
    .select('*')
    .eq('activity_id', activityId);
  if (error) throw error;
  return (data ?? []) as ActivityReaction[];
};

const _toggleReaction = async (activityId: string, userId: string, emoji: string): Promise<void> => {
  const { error } = await supabase.rpc('toggle_reaction', {
    p_activity_id: activityId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw error;
};

export const toggleReaction = async (activityId: string, userId: string, emoji: string): Promise<void> => {
  return offlineMutation({
    operation: 'toggleReaction', table: 'activity_reactions',
    args: [activityId, userId, emoji], cacheKeys: [],
    fn: _toggleReaction,
  });
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
