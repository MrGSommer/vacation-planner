import { supabase } from './supabase';
import { BetaFeedback } from './feedback';

// --- Feedback (Admin view) ---

export interface FeedbackWithUser extends BetaFeedback {
  profile: { id: string; email: string; first_name: string | null; last_name: string | null };
}

export async function adminGetAllFeedback(filters?: {
  type?: BetaFeedback['type'];
  status?: BetaFeedback['status'];
}): Promise<FeedbackWithUser[]> {
  let query = supabase
    .from('beta_feedback')
    .select('*, profile:profiles!user_id(id, email, first_name, last_name)')
    .order('created_at', { ascending: false });

  if (filters?.type) query = query.eq('type', filters.type);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as FeedbackWithUser[];
}

export async function adminUpdateFeedbackStatus(
  id: string,
  status: BetaFeedback['status'],
): Promise<void> {
  const { error } = await supabase
    .from('beta_feedback')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// --- Beta Stats (comprehensive KPIs) ---

export interface BetaStats {
  // Growth
  total_users: number;
  premium_users: number;
  trialing_users: number;
  signups_today: number;
  signups_7d: number;
  signups_30d: number;
  conversion_rate: number;
  // Engagement
  dau: number;
  wau: number;
  mau: number;
  // Content
  total_trips: number;
  trips_7d: number;
  total_activities: number;
  avg_activities_per_trip: number;
  total_packing_items: number;
  total_photos: number;
  // Feature Adoption
  users_with_trips: number;
  users_using_fable: number;
  trips_with_packing: number;
  trips_with_budget: number;
  trips_with_stops: number;
  trips_with_photos: number;
  // Collaboration
  total_invites: number;
  accepted_invites: number;
  collab_trips: number;
  // AI / Fable
  ai_calls_today: number;
  ai_calls_7d: number;
  ai_calls_30d: number;
  ai_unique_users_7d: number;
  ai_avg_response_ms: number;
  total_credits_consumed: number;
  ai_conversations: number;
  ai_plan_generations: number;
  ai_web_searches: number;
  ai_agent_calls: number;
  // Health
  errors_today: number;
  errors_7d: number;
  critical_errors_7d: number;
  top_error_components: { component: string; count: number }[];
  // Feedback
  feedback_total: number;
  feedback_open: number;
  feedback_bugs: number;
}

export async function adminGetBetaStats(): Promise<BetaStats> {
  const { data, error } = await supabase.rpc('admin_get_beta_stats');
  if (error) throw error;
  return data as BetaStats;
}

// --- Beta Tasks CRUD ---

export interface BetaTask {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function getBetaTasks(): Promise<BetaTask[]> {
  const { data, error } = await supabase
    .from('beta_tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createBetaTask(
  title: string,
  description?: string,
  priority: BetaTask['priority'] = 'medium',
): Promise<BetaTask> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('beta_tasks')
    .insert({ title, description: description || null, priority, created_by: user?.id || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBetaTask(
  id: string,
  updates: Partial<Pick<BetaTask, 'title' | 'description' | 'status' | 'priority'>>,
): Promise<BetaTask> {
  const payload: Record<string, any> = { ...updates };
  if (updates.status === 'done') payload.completed_at = new Date().toISOString();
  if (updates.status && updates.status !== 'done') payload.completed_at = null;

  const { data, error } = await supabase
    .from('beta_tasks')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBetaTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('beta_tasks')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
