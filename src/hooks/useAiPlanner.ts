import { useState, useCallback, useRef } from 'react';
import { sendAiMessage, AiMessage, AiContext } from '../api/aiChat';
import { executePlan, parsePlanJson, AiTripPlan, ExecutionResult, ProgressStep } from '../services/ai/planExecutor';
import { getActivitiesForTrip } from '../api/itineraries';
import { getStops } from '../api/stops';
import { getBudgetCategories } from '../api/budgets';
import { getProfile } from '../api/auth';
import { logError } from '../services/errorLogger';

export type AiPhase = 'idle' | 'conversing' | 'generating_plan' | 'plan_review' | 'previewing_plan' | 'executing_plan' | 'completed';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AiMetadata {
  ready_to_plan: boolean;
  preferences_gathered: string[];
  suggested_questions: string[];
}

export interface UseAiPlannerOptions {
  mode: 'create' | 'enhance';
  tripId?: string;
  userId: string;
  initialContext: {
    destination?: string;
    destinationLat?: number | null;
    destinationLng?: number | null;
    startDate?: string;
    endDate?: string;
    currency?: string;
    tripName?: string;
    notes?: string | null;
  };
}

const MAX_MESSAGES = 12;
const MAX_INPUT_TOKENS_ESTIMATE = 15000;
const CHARS_PER_TOKEN = 3.8;

let messageIdCounter = 0;
const nextId = () => `msg_${++messageIdCounter}_${Date.now()}`;

function parseMetadata(text: string): { cleanText: string; metadata: AiMetadata | null } {
  const metadataRegex = /<metadata>([\s\S]*?)<\/metadata>/;
  const match = text.match(metadataRegex);

  if (!match) {
    return { cleanText: text, metadata: null };
  }

  const cleanText = text.replace(metadataRegex, '').trim();
  try {
    const metadata = JSON.parse(match[1]) as AiMetadata;
    return { cleanText, metadata };
  } catch {
    return { cleanText, metadata: null };
  }
}

function estimateTokens(messages: AiMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

function trimMessages(messages: AiChatMessage[]): AiChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  // Keep first message (greeting) and last MAX_MESSAGES-1 messages
  return [messages[0], ...messages.slice(-(MAX_MESSAGES - 1))];
}

function extractPreferences(messages: AiChatMessage[], context: AiContext): Record<string, any> {
  // Compress the conversation into a structured preferences object
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  return {
    destination: context.destination,
    startDate: context.startDate,
    endDate: context.endDate,
    currency: context.currency,
    userInput: userMessages,
  };
}

export const useAiPlanner = ({ mode, tripId, userId, initialContext }: UseAiPlannerOptions) => {
  const [phase, setPhase] = useState<AiPhase>('idle');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [metadata, setMetadata] = useState<AiMetadata | null>(null);
  const [plan, setPlan] = useState<AiTripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [tokenWarning, setTokenWarning] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const contextRef = useRef<AiContext>({
    destination: initialContext.destination,
    destinationLat: initialContext.destinationLat,
    destinationLng: initialContext.destinationLng,
    startDate: initialContext.startDate,
    endDate: initialContext.endDate,
    currency: initialContext.currency,
    mode,
  });

  const loadExistingData = useCallback(async (): Promise<AiContext['existingData'] | undefined> => {
    if (mode !== 'enhance' || !tripId) return undefined;

    try {
      const profile = await getProfile(userId);
      if (!profile.ai_trip_context_enabled) return undefined;

      const [activities, stops, budgetCategories] = await Promise.all([
        getActivitiesForTrip(tripId),
        getStops(tripId),
        getBudgetCategories(tripId),
      ]);

      return {
        activities: activities.map(a => ({
          title: a.title,
          category: a.category,
          start_time: a.start_time,
        })),
        stops: stops.map(s => ({
          name: s.name,
          type: s.type,
        })),
        budgetCategories: budgetCategories.map(b => ({
          name: b.name,
          color: b.color,
        })),
      };
    } catch (e) {
      console.error('Failed to load existing data:', e);
      return undefined;
    }
  }, [mode, tripId, userId]);

  const startConversation = useCallback(async () => {
    setPhase('conversing');
    setError(null);
    setSending(true);

    try {
      // Load existing data for enhance mode
      const existingData = await loadExistingData();
      if (existingData) {
        contextRef.current.existingData = existingData;
      }

      const destination = initialContext.destination || 'dein Reiseziel';
      const greeting: AiMessage = {
        role: 'user',
        content: mode === 'enhance'
          ? `Hallo! Ich möchte meinen bestehenden Trip nach ${destination} erweitern. Hilf mir, weitere Aktivitäten und Stops zu planen.`
          : `Hallo! Ich plane eine Reise nach ${destination}. Hilf mir bei der Planung.`,
      };

      const response = await sendAiMessage('conversation', [greeting], contextRef.current);
      const { cleanText, metadata: meta } = parseMetadata(response.content);

      const greetingMsg: AiChatMessage = { id: nextId(), role: 'user', content: greeting.content, timestamp: Date.now() };
      const aiMsg: AiChatMessage = { id: nextId(), role: 'assistant', content: cleanText, timestamp: Date.now() };

      setMessages([greetingMsg, aiMsg]);
      if (meta) setMetadata(meta);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'startConversation' } });
      setError(e.message || 'Verbindung zum AI-Service fehlgeschlagen');
    } finally {
      setSending(false);
    }
  }, [initialContext.destination, mode, loadExistingData]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    setError(null);
    setSending(true);

    const userMsg: AiChatMessage = { id: nextId(), role: 'user', content: text.trim(), timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      // Prepare messages for API (trimmed)
      const trimmed = trimMessages(updatedMessages);
      const apiMessages: AiMessage[] = trimmed.map(m => ({ role: m.role, content: m.content }));

      // Check token budget
      const estimatedTokens = estimateTokens(apiMessages);
      if (estimatedTokens > MAX_INPUT_TOKENS_ESTIMATE) {
        setTokenWarning(true);
      }

      const response = await sendAiMessage('conversation', apiMessages, contextRef.current);
      const { cleanText, metadata: meta } = parseMetadata(response.content);

      const aiMsg: AiChatMessage = { id: nextId(), role: 'assistant', content: cleanText, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      if (meta) setMetadata(meta);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'sendMessage' } });
      setError(e.message || 'Nachricht konnte nicht gesendet werden');
    } finally {
      setSending(false);
    }
  }, [messages, sending]);

  const buildPlanSummary = (p: AiTripPlan): string => {
    const days = p.days?.length || 0;
    const activities = p.days?.reduce((sum, d) => sum + (d.activities?.length || 0), 0) || 0;
    const stops = p.stops?.length || 0;
    const budget = p.budget_categories?.reduce((sum, c) => sum + (c.budget_limit || 0), 0) || 0;
    const currency = initialContext.currency || 'CHF';

    let summary = `Hier ist mein Vorschlag: **${days} Tage**, **${activities} Aktivitäten**`;
    if (stops > 0) summary += `, **${stops} Stops**`;
    if (budget > 0) summary += `, Budget ca. **${budget} ${currency}**`;
    summary += '.\n\nDu kannst dir die Details anschauen, den Plan direkt übernehmen, oder mir sagen was ich anpassen soll.';
    return summary;
  };

  const generatePlan = useCallback(async () => {
    setPhase('generating_plan');
    setError(null);

    try {
      const preferences = extractPreferences(messages, contextRef.current);
      const planContext: AiContext = {
        ...contextRef.current,
        preferences,
      };

      const planMessage: AiMessage = {
        role: 'user',
        content: 'Erstelle jetzt den detaillierten Reiseplan als JSON.',
      };

      const response = await sendAiMessage('plan_generation', [planMessage], planContext);
      const parsed = parsePlanJson(response.content);

      setPlan(parsed);
      const summaryMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: buildPlanSummary(parsed),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, summaryMsg]);
      setPhase('plan_review');
    } catch (e: any) {
      // Retry once on JSON parse error
      if (e instanceof SyntaxError || e.message?.includes('verwertbaren Daten')) {
        logError(e, { component: 'useAiPlanner', context: { action: 'generatePlan' } });
        console.warn('Plan JSON parse failed, retrying...', e.message);
        try {
          const preferences = extractPreferences(messages, contextRef.current);
          const retryContext: AiContext = { ...contextRef.current, preferences };
          const retryMessage: AiMessage = {
            role: 'user',
            content: 'Erstelle den Reiseplan als JSON. Antworte NUR mit validem JSON, kein anderer Text.',
          };
          const retryResponse = await sendAiMessage('plan_generation', [retryMessage], retryContext);
          const parsed = parsePlanJson(retryResponse.content);
          setPlan(parsed);
          const summaryMsg: AiChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: buildPlanSummary(parsed),
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, summaryMsg]);
          setPhase('plan_review');
          return;
        } catch (retryErr: any) {
          logError(retryErr, { component: 'useAiPlanner', context: { action: 'generatePlanRetry' } });
          console.error('Plan retry also failed:', retryErr.message);
          setError('Plan konnte nicht erstellt werden – bitte versuche es erneut');
          setPhase('conversing');
          return;
        }
      }
      setError(e.message || 'Plan-Erstellung fehlgeschlagen');
      setPhase('conversing');
    }
  }, [messages, initialContext.currency]);

  const confirmPlan = useCallback(async (skipConflictCheck = false) => {
    if (!plan) return;

    // Check for conflicts before executing (enhance mode only)
    if (!skipConflictCheck && mode === 'enhance' && tripId) {
      try {
        const existingActivities = await getActivitiesForTrip(tripId);
        const existingTitles = new Set(existingActivities.map(a => a.title.toLowerCase()));
        const conflicting = plan.days?.flatMap(d => d.activities || [])
          .filter(a => existingTitles.has(a.title.toLowerCase()))
          .map(a => a.title) || [];

        if (conflicting.length > 0) {
          setConflicts(conflicting);
          return; // Don't execute until user confirms
        }
      } catch {
        // If check fails, proceed anyway (planExecutor has its own dedup)
      }
    }

    setConflicts([]);
    setPhase('executing_plan');
    setError(null);

    try {
      const result = await executePlan(
        plan,
        tripId,
        userId,
        initialContext.currency || 'CHF',
        (step) => setProgressStep(step),
      );

      setExecutionResult(result);
      setPhase('completed');
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'executePlan' } });
      setError(e.message || 'Plan konnte nicht ausgeführt werden');
      setPhase('previewing_plan');
    }
  }, [plan, tripId, userId, initialContext.currency, mode]);

  const dismissConflicts = useCallback(() => {
    setConflicts([]);
  }, []);

  const confirmWithConflicts = useCallback(() => {
    confirmPlan(true);
  }, [confirmPlan]);

  const showPreview = useCallback(() => {
    if (plan) setPhase('previewing_plan');
  }, [plan]);

  const adjustPlan = useCallback(async (feedback: string) => {
    if (!feedback.trim() || sending) return;
    setPhase('generating_plan');
    setError(null);

    const userMsg: AiChatMessage = { id: nextId(), role: 'user', content: feedback.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const preferences = extractPreferences(messages, contextRef.current);
      const planContext: AiContext = { ...contextRef.current, preferences };
      const adjustMessage: AiMessage = {
        role: 'user',
        content: `Passe den Reiseplan an basierend auf folgendem Feedback: "${feedback}". Antworte NUR mit dem vollständigen, angepassten JSON-Plan.`,
      };
      const response = await sendAiMessage('plan_generation', [adjustMessage], planContext);
      const parsed = parsePlanJson(response.content);
      setPlan(parsed);
      const summaryMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: buildPlanSummary(parsed),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, summaryMsg]);
      setPhase('plan_review');
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'adjustPlan' } });
      console.error('Plan adjustment failed:', e.message);
      setError('Anpassung fehlgeschlagen – bitte versuche es erneut');
      setPhase('plan_review');
    }
  }, [messages, sending, initialContext.currency]);

  const rejectPlan = useCallback(() => {
    setPlan(null);
    setPhase('conversing');
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setMessages([]);
    setMetadata(null);
    setPlan(null);
    setError(null);
    setSending(false);
    setProgressStep(null);
    setExecutionResult(null);
    setTokenWarning(false);
    setConflicts([]);
  }, []);

  return {
    phase,
    messages,
    metadata,
    plan,
    error,
    sending,
    progressStep,
    executionResult,
    tokenWarning,
    conflicts,
    startConversation,
    sendMessage,
    generatePlan,
    confirmPlan,
    rejectPlan,
    showPreview,
    adjustPlan,
    dismissConflicts,
    confirmWithConflicts,
    reset,
  };
};
