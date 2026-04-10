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
  transportMode?: 'driving' | 'transit' | 'walking' | 'bicycling';
  todayDate?: string;
  preferences?: Record<string, any>;
  existingData?: {
    activities?: Array<{
      title: string; category: string;
      start_time: string | null; end_time: string | null;
      cost: number | null; description: string | null;
      location_name: string | null;
      check_in_date?: string | null;
      check_out_date?: string | null;
      day_id?: string;
      date?: string | null;
    }>;
    stops?: Array<{
      name: string; type: string;
      arrival_date: string | null; departure_date: string | null;
      address: string | null; nights: number | null;
    }>;
    budgetCategories?: Array<{
      name: string; color: string; budget_limit: number | null;
    }>;
    packingItems?: Array<{
      name: string; category: string; quantity: number;
    }>;
  };
  dayDates?: string[];
  planStartDate?: string | null;
  planEndDate?: string | null;
  tripMemory?: string;
  senderName?: string;
  customInstruction?: string;
  webSearchResults?: string;
  collaboratorNames?: string[];
  collaborators?: Array<{ id: string; name: string }>;
  lastPreferencesGathered?: string[];
  weatherData?: Array<{
    date: string;
    tempMax: number;
    tempMin: number;
    icon: string;
  }>;
  fableSettings?: {
    budgetVisible: boolean;
    packingVisible: boolean;
    webSearch: boolean;
    memoryEnabled: boolean;
    tripInstruction: string | null;
  };
  structureStops?: Array<{
    name: string; type?: string;
    arrival_date?: string | null; departure_date?: string | null;
  }>;
  conversationSummary?: string;
  categories?: string[];
  previousBatchActivities?: Array<{
    title: string; category: string; date: string;
  }>;
}

export interface AiResponse {
  content: string;
  usage?: { input_tokens: number; output_tokens: number };
  credits_remaining?: number;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type AiTask = 'greeting' | 'conversation' | 'plan_generation' | 'plan_activities'
  | 'plan_generation_full' | 'agent_packing' | 'agent_budget' | 'agent_day_plan' | 'web_search' | 'recap' | 'receipt_scan' | 'packing_import'
;

export const sendReceiptScan = async (
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  context: AiContext,
): Promise<AiResponse> => {
  const messages = [{
    role: 'user' as const,
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: imageBase64 },
      },
      { type: 'text', text: 'Bitte analysiere diesen Kassenbeleg und extrahiere alle Positionen als JSON.' },
    ],
  }];

  const { data, error } = await supabase.functions.invoke('scan-receipt', {
    body: { messages, context },
  });

  if (data?.error) {
    const err = new Error(data.error) as any;
    err.retryable = data.retryable || false;
    throw err;
  }
  if (error) {
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (body?.error) {
          const err = new Error(body.error) as any;
          err.retryable = body.retryable || false;
          throw err;
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw new Error(error.message || 'Beleg-Scan fehlgeschlagen');
  }

  return { content: data.content, usage: data.usage, credits_remaining: data.credits_remaining };
};

export const sendAiMessage = async (
  task: AiTask,
  messages: AiMessage[],
  context: AiContext,
): Promise<AiResponse> => {
  const attempt = async (): Promise<AiResponse> => {
    // Refresh session token before AI calls (prevents 401 during long sessions)
    await supabase.auth.getSession();

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
      let status: number | undefined;
      if (error.context instanceof Response) {
        status = error.context.status;
        try {
          const body = await error.context.json();
          console.error(`AI-Chat[${task}] error ${status}:`, body);
          if (body?.error) {
            const err = new Error(body.error) as any;
            err.retryable = body.retryable || false;
            err.status = status;
            throw err;
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
        }
      }
      const err = new Error(error.message || 'AI-Anfrage fehlgeschlagen') as any;
      err.task = task;
      err.status = status;
      throw err;
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
