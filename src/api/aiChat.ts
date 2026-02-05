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
  preferences?: Record<string, any>;
  existingData?: {
    activities?: Array<{ title: string; category: string; start_time: string | null }>;
    stops?: Array<{ name: string; type: string }>;
    budgetCategories?: Array<{ name: string; color: string }>;
  };
}

export interface AiResponse {
  content: string;
  usage?: { input_tokens: number; output_tokens: number };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const sendAiMessage = async (
  task: 'conversation' | 'plan_generation',
  messages: AiMessage[],
  context: AiContext,
): Promise<AiResponse> => {
  const attempt = async (): Promise<AiResponse> => {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { task, messages, context },
    });

    if (error) {
      throw new Error(error.message || 'AI-Anfrage fehlgeschlagen');
    }

    if (data?.error) {
      const err = new Error(data.error) as any;
      err.retryable = data.retryable || false;
      err.status = data.status;
      throw err;
    }

    return { content: data.content, usage: data.usage };
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
