import { useState, useCallback, useRef, useEffect } from 'react';
import { sendAiMessage, AiMessage, AiContext, AiTask } from '../api/aiChat';
import { executePlan, parsePlanJson, AiTripPlan, ExecutionResult, ProgressStep } from '../services/ai/planExecutor';
import { getActivitiesForTrip } from '../api/itineraries';
import { getStops } from '../api/stops';
import { getBudgetCategories } from '../api/budgets';
import { getProfile } from '../api/auth';
import { getAiConversation, saveAiConversation, deleteAiConversation } from '../api/aiConversations';
import { getAiUserMemory, saveAiUserMemory } from '../api/aiMemory';
import { startPlanGeneration, getPlanJobStatus, getActiveJob, getRecentCompletedJob } from '../api/aiPlanJobs';
import { logError } from '../services/errorLogger';

export type AiPhase = 'idle' | 'conversing' | 'generating_structure' | 'structure_overview' | 'generating_plan' | 'plan_review' | 'previewing_plan' | 'executing_plan' | 'completed';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  creditsCost?: number;
  creditsAfter?: number;
}

export interface AiMetadata {
  ready_to_plan: boolean;
  preferences_gathered: string[];
  suggested_questions: string[];
  trip_type?: 'roundtrip' | 'pointtopoint' | null;
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
    travelersCount?: number;
    groupType?: string;
  };
}

const MAX_MESSAGES = 12;
const MAX_INPUT_TOKENS_ESTIMATE = 15000;
const CHARS_PER_TOKEN = 3.8;
const SAVE_DEBOUNCE_MS = 500;

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

function parseMemoryUpdate(text: string): { cleanText: string; memoryUpdate: string | null } {
  const memoryRegex = /<memory_update>([\s\S]*?)<\/memory_update>/;
  const match = text.match(memoryRegex);

  if (!match) {
    return { cleanText: text, memoryUpdate: null };
  }

  const cleanText = text.replace(memoryRegex, '').trim();
  return { cleanText, memoryUpdate: match[1].trim() };
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

function mergePlan(
  structure: AiTripPlan,
  activities: { days: Array<{ date: string; activities: AiTripPlan['days'][0]['activities'] }> },
): AiTripPlan {
  const activitiesByDate = new Map<string, AiTripPlan['days'][0]['activities']>();
  for (const day of activities.days || []) {
    activitiesByDate.set(day.date, day.activities || []);
  }

  return {
    trip: structure.trip,
    stops: structure.stops || [],
    days: (structure.days || []).map(day => ({
      ...day,
      activities: activitiesByDate.get(day.date) || day.activities || [],
    })),
    budget_categories: structure.budget_categories || [],
  };
}

export type GenerationGranularity = 'all' | 'weekly' | 'daily';

export const useAiPlanner = ({ mode, tripId, userId, initialContext }: UseAiPlannerOptions) => {
  const [phase, setPhase] = useState<AiPhase>('idle');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [metadata, setMetadata] = useState<AiMetadata | null>(null);
  const [plan, setPlan] = useState<AiTripPlan | null>(null);
  const [structure, setStructure] = useState<AiTripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [tokenWarning, setTokenWarning] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contextRef = useRef<AiContext>({
    destination: initialContext.destination,
    destinationLat: initialContext.destinationLat,
    destinationLng: initialContext.destinationLng,
    startDate: initialContext.startDate,
    endDate: initialContext.endDate,
    currency: initialContext.currency,
    mode,
    todayDate: new Date().toISOString().split('T')[0],
    travelersCount: initialContext.travelersCount,
    groupType: initialContext.groupType,
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMemoryRef = useRef<string | undefined>(undefined);
  const prevCreditsRef = useRef<number | null>(null);

  // Time estimation: 8s structure + 12s per 5-day batch
  const estimateTime = useCallback((days: number) => {
    const batches = Math.ceil(days / 5);
    return 8 + batches * 12;
  }, []);

  // Debounced save conversation (fire-and-forget)
  const debouncedSave = useCallback((
    currentPhase: string,
    currentMessages: AiChatMessage[],
    currentMetadata: AiMetadata | null,
    currentPlan: AiTripPlan | null,
  ) => {
    if (!tripId) return; // Can't save without tripId (create mode before plan execution)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAiConversation(
        tripId,
        userId,
        currentPhase as any,
        { messages: currentMessages, metadata: currentMetadata, plan: currentPlan },
        {
          destination: initialContext.destination,
          startDate: initialContext.startDate,
          endDate: initialContext.endDate,
        },
      ).catch(e => console.error('Failed to save conversation:', e));
    }, SAVE_DEBOUNCE_MS);
  }, [tripId, userId, initialContext.destination, initialContext.startDate, initialContext.endDate]);

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
      // Load user memory + existing data in parallel
      const [existingData, userMemory, savedConversation] = await Promise.all([
        loadExistingData(),
        getAiUserMemory().catch(() => null),
        tripId ? getAiConversation(tripId).catch(() => null) : null,
      ]);

      if (existingData) {
        contextRef.current.existingData = existingData;
      }
      if (userMemory) {
        contextRef.current.userMemory = userMemory;
        userMemoryRef.current = userMemory;
      }

      // Check for saved conversation (staleness check)
      if (savedConversation) {
        const snap = savedConversation.context_snapshot;
        const isStale =
          snap.destination !== initialContext.destination ||
          snap.startDate !== initialContext.startDate ||
          snap.endDate !== initialContext.endDate;

        if (!isStale) {
          // Restore conversation
          const { messages: savedMessages, metadata: savedMeta, plan: savedPlan } = savedConversation.data;
          setMessages(savedMessages || []);
          setMetadata(savedMeta || null);
          if (savedPlan) setPlan(savedPlan);
          setPhase(savedConversation.phase as AiPhase);
          setRestored(true);
          setSending(false);
          return;
        }
        // Stale — delete old conversation, start fresh
        deleteAiConversation(tripId!).catch(() => {});
      }

      const destination = initialContext.destination || 'dein Reiseziel';
      const greeting: AiMessage = {
        role: 'user',
        content: mode === 'enhance'
          ? `Hallo! Ich möchte meinen bestehenden Trip nach ${destination} erweitern. Hilf mir, weitere Aktivitäten und Stops zu planen.`
          : `Hallo! Ich plane eine Reise nach ${destination}. Hilf mir bei der Planung.`,
      };

      const response = await sendAiMessage('conversation', [greeting], contextRef.current);

      // Update credits balance from response
      let creditsCost: number | undefined;
      if (response.credits_remaining !== undefined) {
        if (prevCreditsRef.current !== null) {
          creditsCost = prevCreditsRef.current - response.credits_remaining;
        }
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
      }

      const { cleanText: textAfterMemory, memoryUpdate } = parseMemoryUpdate(response.content);
      const { cleanText, metadata: meta } = parseMetadata(textAfterMemory);

      // Save memory update if present
      if (memoryUpdate) {
        userMemoryRef.current = memoryUpdate;
        contextRef.current.userMemory = memoryUpdate;
        saveAiUserMemory(memoryUpdate).catch(e => console.error('Failed to save memory:', e));
      }

      const greetingMsg: AiChatMessage = { id: nextId(), role: 'user', content: greeting.content, timestamp: Date.now() };
      const aiMsg: AiChatMessage = {
        id: nextId(), role: 'assistant', content: cleanText, timestamp: Date.now(),
        creditsCost, creditsAfter: response.credits_remaining,
      };

      const newMessages = [greetingMsg, aiMsg];
      setMessages(newMessages);
      if (meta) {
        setMetadata(meta);
        if (meta.trip_type) {
          contextRef.current.tripType = meta.trip_type;
        }
      }

      // Save conversation (debounced)
      debouncedSave('conversing', newMessages, meta, null);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'startConversation' } });
      setError(e.message || 'Verbindung zum AI-Service fehlgeschlagen');
    } finally {
      setSending(false);
    }
  }, [initialContext.destination, initialContext.startDate, initialContext.endDate, mode, tripId, loadExistingData, debouncedSave]);

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

      // Update credits balance
      let creditsCost: number | undefined;
      if (response.credits_remaining !== undefined) {
        if (prevCreditsRef.current !== null) {
          creditsCost = prevCreditsRef.current - response.credits_remaining;
        }
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
      }

      const { cleanText: textAfterMemory, memoryUpdate } = parseMemoryUpdate(response.content);
      const { cleanText, metadata: meta } = parseMetadata(textAfterMemory);

      // Save memory update if present
      if (memoryUpdate) {
        userMemoryRef.current = memoryUpdate;
        contextRef.current.userMemory = memoryUpdate;
        saveAiUserMemory(memoryUpdate).catch(e => console.error('Failed to save memory:', e));
      }

      const aiMsg: AiChatMessage = {
        id: nextId(), role: 'assistant', content: cleanText, timestamp: Date.now(),
        creditsCost, creditsAfter: response.credits_remaining,
      };
      const allMessages = [...updatedMessages, aiMsg];
      setMessages(allMessages);
      if (meta) {
        setMetadata(meta);
        if (meta.trip_type) {
          contextRef.current.tripType = meta.trip_type;
        }
      }

      // Save conversation (debounced)
      debouncedSave('conversing', allMessages, meta, null);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'sendMessage' } });
      setError(e.message || 'Nachricht konnte nicht gesendet werden');
    } finally {
      setSending(false);
    }
  }, [messages, sending, debouncedSave]);

  const buildPlanSummary = useCallback((p: AiTripPlan): string => {
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
  }, [initialContext.currency]);

  // Build structure summary for overview
  const buildStructureSummary = useCallback((s: AiTripPlan): string => {
    const stopNames = (s.stops || []).map(st => st.name);
    const route = stopNames.length > 0 ? stopNames.join(' → ') : 'Wird generiert...';
    const days = s.days?.length || 0;
    const stops = s.stops?.length || 0;
    const budgetCats = s.budget_categories?.length || 0;
    return `Route: **${route}**\n${days} Tage, ${stops} Stops, ${budgetCats} Budget-Kategorien`;
  }, []);

  // Polling for server-agent jobs
  useEffect(() => {
    if (!activeJobId) return;

    const poll = async () => {
      try {
        const job = await getPlanJobStatus(activeJobId);
        if (job.status === 'completed' && job.plan_json) {
          setPlan(job.plan_json);
          setActiveJobId(null);
          setProgressStep(null);

          const summaryMsg: AiChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: restored
              ? 'Willkommen zurück! Dein Reiseplan ist fertig.'
              : buildPlanSummary(job.plan_json),
            timestamp: Date.now(),
          };
          setMessages(prev => {
            const updated = [...prev, summaryMsg];
            debouncedSave('plan_review', updated, metadata, job.plan_json);
            return updated;
          });
          setPhase('plan_review');
        } else if (job.status === 'failed') {
          setActiveJobId(null);
          setProgressStep(null);
          setError(job.error || 'Plan-Generierung fehlgeschlagen');
          setPhase('conversing');
        }
      } catch {
        // Ignore polling errors — will retry
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeJobId, restored, metadata, buildPlanSummary, debouncedSave]);

  // Phase 1: Generate structure only → show overview
  const generateStructure = useCallback(async () => {
    setPhase('generating_structure');
    setError(null);

    try {
      const preferences = extractPreferences(messages, contextRef.current);
      const planContext: AiContext = {
        ...contextRef.current,
        preferences,
      };

      setProgressStep('structure');
      const structureMessage: AiMessage = {
        role: 'user',
        content: 'Erstelle die Grundstruktur des Reiseplans als JSON (Trip, Stops, Budget, Tage — ohne Aktivitäten).',
      };

      const structureResponse = await sendAiMessage('plan_generation', [structureMessage], planContext);

      if (structureResponse.credits_remaining !== undefined) {
        prevCreditsRef.current = structureResponse.credits_remaining;
        setCreditsBalance(structureResponse.credits_remaining);
      }

      const parsed = parsePlanJson(structureResponse.content);
      setStructure(parsed);

      const dayCount = parsed.days?.length || 0;
      setEstimatedSeconds(estimateTime(dayCount));

      // Show overview with structure summary
      const overviewMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: buildStructureSummary(parsed),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, overviewMsg]);
      setPhase('structure_overview');
      setProgressStep(null);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateStructure' } });
      setError('Struktur konnte nicht erstellt werden – bitte versuche es erneut');
      setPhase('conversing');
      setProgressStep(null);
    }
  }, [messages, estimateTime, buildStructureSummary]);

  // Phase 2a: Generate all activities via server agent (background)
  const generateAllViaServer = useCallback(async () => {
    if (!structure) return;
    setPhase('generating_plan');
    setError(null);
    setProgressStep('activities');

    try {
      const preferences = extractPreferences(messages, contextRef.current);
      const planContext: AiContext = { ...contextRef.current, preferences };

      const { job_id } = await startPlanGeneration(planContext, [], structure);
      setActiveJobId(job_id);
      // Polling will take over from here
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateAllViaServer' } });
      setError('Server-Generierung konnte nicht gestartet werden');
      setPhase('structure_overview');
      setProgressStep(null);
    }
  }, [structure, messages]);

  // Phase 2b: Generate activities client-side (original approach, used for incremental/fallback)
  const generateActivitiesClientSide = useCallback(async (dayDatesToGenerate?: string[]) => {
    if (!structure) return;
    setPhase('generating_plan');
    setError(null);
    setProgressStep('activities');

    try {
      const preferences = extractPreferences(messages, contextRef.current);
      const planContext: AiContext = { ...contextRef.current, preferences };

      const dayDates = dayDatesToGenerate || (structure.days || []).map(d => d.date);
      const activitiesContext: AiContext = { ...planContext, dayDates };

      let allActivities: { days: Array<{ date: string; activities: any[] }> } = { days: [] };
      const BATCH_SIZE = 5;

      if (dayDates.length > BATCH_SIZE) {
        const batches: string[][] = [];
        for (let i = 0; i < dayDates.length; i += BATCH_SIZE) {
          batches.push(dayDates.slice(i, i + BATCH_SIZE));
        }

        for (const batchDates of batches) {
          const batchMsg: AiMessage = {
            role: 'user',
            content: `Erstelle Aktivitäten für die Tage ${batchDates.join(', ')} als JSON.`,
          };
          const batchResponse = await sendAiMessage('plan_activities', [batchMsg], { ...activitiesContext, dayDates: batchDates });
          const batch = parsePlanJson(batchResponse.content);
          allActivities.days.push(...(batch.days || []));
        }
      } else {
        const activitiesMsg: AiMessage = {
          role: 'user',
          content: 'Erstelle die Aktivitäten für alle Tage als JSON.',
        };
        const activitiesResponse = await sendAiMessage('plan_activities', [activitiesMsg], activitiesContext);
        allActivities = parsePlanJson(activitiesResponse.content);
      }

      const mergedPlan = mergePlan(structure, allActivities);
      setPlan(mergedPlan);

      const summaryMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: buildPlanSummary(mergedPlan),
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const updated = [...prev, summaryMsg];
        debouncedSave('plan_review', updated, metadata, mergedPlan);
        return updated;
      });
      setPhase('plan_review');
      setProgressStep(null);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateActivitiesClientSide' } });
      setError('Aktivitäten konnten nicht erstellt werden – bitte versuche es erneut');
      setPhase('structure_overview');
      setProgressStep(null);
    }
  }, [structure, messages, metadata, debouncedSave, buildPlanSummary]);

  // Legacy generatePlan — generates structure + activities in one go (for backward compat)
  const generatePlan = useCallback(async () => {
    await generateStructure();
    // After structure is done, the UI will show structure_overview
    // User picks granularity from there
  }, [generateStructure]);

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

      // Delete saved conversation after successful execution
      if (tripId) {
        deleteAiConversation(tripId).catch(() => {});
      }
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

  const hidePreview = useCallback(() => {
    setPhase('plan_review');
  }, []);

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
      // Use legacy full plan prompt for adjustments
      const response = await sendAiMessage('plan_generation_full', [adjustMessage], planContext);

      // Update credits balance
      if (response.credits_remaining !== undefined) {
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
      }

      const parsed = parsePlanJson(response.content);
      setPlan(parsed);
      const summaryMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: buildPlanSummary(parsed),
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const updated = [...prev, summaryMsg];
        debouncedSave('plan_review', updated, metadata, parsed);
        return updated;
      });
      setPhase('plan_review');
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'adjustPlan' } });
      console.error('Plan adjustment failed:', e.message);
      setError('Anpassung fehlgeschlagen – bitte versuche es erneut');
      setPhase('plan_review');
    }
  }, [messages, sending, initialContext.currency, metadata, debouncedSave]);

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
    setStructure(null);
    setError(null);
    setSending(false);
    setProgressStep(null);
    setExecutionResult(null);
    setTokenWarning(false);
    setConflicts([]);
    setRestored(false);
    setCreditsBalance(null);
    setEstimatedSeconds(null);
    setActiveJobId(null);
    prevCreditsRef.current = null;
    if (pollingRef.current) clearInterval(pollingRef.current);

    // Delete saved conversation
    if (tripId) {
      deleteAiConversation(tripId).catch(() => {});
    }
  }, [tripId]);

  // Save conversation state (for AppState listener in AiTripModal)
  const saveConversationNow = useCallback(() => {
    if (!tripId || phase === 'idle' || phase === 'completed') return;
    saveAiConversation(
      tripId,
      userId,
      phase as any,
      { messages, metadata, plan },
      {
        destination: initialContext.destination,
        startDate: initialContext.startDate,
        endDate: initialContext.endDate,
      },
    ).catch(() => {});
  }, [tripId, userId, phase, messages, metadata, plan, initialContext.destination, initialContext.startDate, initialContext.endDate]);

  return {
    phase,
    messages,
    metadata,
    plan,
    structure,
    error,
    sending,
    progressStep,
    executionResult,
    tokenWarning,
    conflicts,
    restored,
    creditsBalance,
    estimatedSeconds,
    activeJobId,
    startConversation,
    sendMessage,
    generatePlan,
    generateStructure,
    generateAllViaServer,
    generateActivitiesClientSide,
    confirmPlan,
    rejectPlan,
    showPreview,
    hidePreview,
    adjustPlan,
    dismissConflicts,
    confirmWithConflicts,
    reset,
    saveConversationNow,
  };
};
