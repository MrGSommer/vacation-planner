import { supabase } from './supabase';
import { SupportConversation, SupportMessage, SupportInsight } from '../types/database';

export async function createSupportConversation(): Promise<SupportConversation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht angemeldet');

  const { data, error } = await supabase
    .from('support_conversations')
    .insert({ user_id: user.id, messages: [] })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSupportConversation(
  id: string,
  update: { status?: string; messages?: SupportMessage[]; resolved_by?: string },
): Promise<void> {
  const { error } = await supabase
    .from('support_conversations')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function sendSupportMessage(
  messages: { role: string; content: string }[],
): Promise<{ content: string; resolved: boolean; category: string }> {
  const { data, error } = await supabase.functions.invoke('support-chat', {
    body: { messages },
  });

  if (error) throw error;
  return data;
}

export async function parseSupportConversation(
  conversationId: string,
  messages: SupportMessage[],
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  // Fire-and-forget
  supabase.functions.invoke('parse-support', {
    body: { conversation_id: conversationId, messages, user_id: user?.id },
  }).catch(() => {});
}

// --- Admin functions ---

export async function adminGetSupportInsights(options?: {
  category?: string;
  limit?: number;
}): Promise<SupportInsight[]> {
  let query = supabase
    .from('support_insights')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.category) {
    query = query.eq('category', options.category);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function adminGetSupportStats(): Promise<{
  total: number;
  resolved: number;
  resolution_rate: number;
  by_category: Record<string, number>;
  top_questions: { question: string; count: number }[];
  improvements: string[];
}> {
  const { data: insights, error } = await supabase
    .from('support_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  const all = insights || [];
  const resolved = all.filter(i => i.resolved).length;
  const byCategory: Record<string, number> = {};
  const questionMap = new Map<string, number>();
  const improvements: string[] = [];

  for (const insight of all) {
    if (insight.category) {
      byCategory[insight.category] = (byCategory[insight.category] || 0) + 1;
    }
    if (insight.key_question) {
      questionMap.set(insight.key_question, (questionMap.get(insight.key_question) || 0) + 1);
    }
    if (insight.suggested_improvement) {
      improvements.push(insight.suggested_improvement);
    }
  }

  const topQuestions = Array.from(questionMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));

  return {
    total: all.length,
    resolved,
    resolution_rate: all.length > 0 ? Math.round((resolved / all.length) * 100) : 0,
    by_category: byCategory,
    top_questions: topQuestions,
    improvements: improvements.slice(0, 20),
  };
}

export async function adminGetRecentConversations(limit = 20): Promise<SupportConversation[]> {
  const { data, error } = await supabase
    .from('support_conversations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
