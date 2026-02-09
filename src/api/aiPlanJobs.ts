import { supabase } from './supabase';
import { AiContext } from './aiChat';

export interface PlanJob {
  id: string;
  trip_id: string | null;
  user_id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  plan_json: any | null;
  structure_json: any | null;
  error: string | null;
  credits_charged: number;
  created_at: string;
  completed_at: string | null;
}

export async function startPlanGeneration(
  context: AiContext,
  messages: Array<{ role: string; content: string }>,
  structureJson?: any,
): Promise<{ job_id: string }> {
  const { data, error } = await supabase.functions.invoke('generate-plan', {
    body: { context, messages, structure_json: structureJson || null },
  });

  if (data?.error) {
    throw new Error(data.error);
  }
  if (error) {
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (body?.error) throw new Error(body.error);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw new Error(error.message || 'Plan-Generierung konnte nicht gestartet werden');
  }

  return { job_id: data.job_id };
}

export async function getPlanJobStatus(jobId: string): Promise<PlanJob> {
  const { data, error } = await supabase
    .from('ai_plan_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) throw new Error(error.message);
  return data as PlanJob;
}

export async function getActiveJob(userId: string): Promise<PlanJob | null> {
  const { data, error } = await supabase
    .from('ai_plan_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'generating'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as PlanJob | null;
}

export async function getRecentCompletedJob(userId: string, tripId?: string): Promise<PlanJob | null> {
  let query = supabase
    .from('ai_plan_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (tripId) {
    query = query.eq('trip_id', tripId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data as PlanJob | null;
}
