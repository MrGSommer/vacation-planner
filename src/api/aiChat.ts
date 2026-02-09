import { supabase } from './supabase';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiContext {
  destination?: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  startDate?: string;
  endDate?: string;
  currency?: string;
  mode?: 'create' | 'enhance';
  travelersCount?: number;
  groupType?: string;
  tripType?: 'roundtrip' | 'pointtopoint';
  todayDate?: string;
  preferences?: Record<string, any>;
  existingData?: {
    activities?: Array<{ title: string; category: string; start_time: string | null }>;
    stops?: Array<{ name: string; type: string }>;
    budgetCategories?: Array<{ name: string; color: string }>;
  };
  dayDates?: string[];
  userMemory?: string;
}

export interface AiResponse {
  content: string;
  usage?: { input_tokens: number; output_tokens: number };
  credits_remaining?: number;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type AiTask = 'conversation' | 'plan_generation' | 'plan_activities' | 'plan_generation_full';

export const sendAiMessage = async (
  task: AiTask,
  messages: AiMessage[],
  context: AiContext,
): Promise<AiResponse> => {
  const attempt = async (): Promise<AiResponse> => {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { task, messages, context },
    });

    // Check data.error first — on non-2xx, Supabase still populates data with the JSON body
    if (data?.error) {
      const err = new Error(data.error) as any;
      err.retryable = data.retryable || false;
      err.status = data.status;
      throw err;
    }

    if (error) {
      // Try to extract response body from FunctionsHttpError
      if (error.context instanceof Response) {
        try {
          const body = await error.context.json();
          console.error('AI-Chat error body:', body);
          if (body?.error) {
            const err = new Error(body.error) as any;
            err.retryable = body.retryable || false;
            err.status = error.context.status;
            throw err;
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
        }
      }
      throw new Error(error.message || 'AI-Anfrage fehlgeschlagen');
    }

    return { content: data.content, usage: data.usage, credits_remaining: data.credits_remaining };
  };

  try {
    return await attempt();
  } catch (e: any) {
    // Retry once on rate limit
    if (e.retryable) {
      await delay(2000);
      return await attempt();
    }
    throw e;
  }
};
