import { useState, useCallback, useRef, useEffect } from 'react';
import { sendAiMessage, AiMessage, AiContext, AiTask } from '../api/aiChat';
import { executePlan, parsePlanJson, AiTripPlan, ExecutionResult, ProgressStep } from '../services/ai/planExecutor';
import { getTrip } from '../api/trips';
import { getCollaborators } from '../api/invitations';
import { getActivitiesForTrip, getDays } from '../api/itineraries';
import { getStops } from '../api/stops';
import { getBudgetCategories } from '../api/budgets';
import { getPackingLists, getPackingItems } from '../api/packing';
import { getProfile } from '../api/auth';
import { getAiConversation, saveAiConversation, deleteAiConversation } from '../api/aiConversations';
import { getAiUserMemory, saveAiUserMemory } from '../api/aiMemory';
import { getAiTripMessages, insertAiTripMessage, deleteAiTripMessages } from '../api/aiTripMessages';
import { getAiTripMemory, saveAiTripMemory, deleteAiTripMemory } from '../api/aiTripMemory';
import { startPlanGeneration, getPlanJobStatus, getActiveJob, getRecentCompletedJob } from '../api/aiPlanJobs';
import { acquireProcessingLock, releaseProcessingLock } from '../api/aiProcessingLock';
import { searchWeb, WebSearchResult } from '../api/webSearch';
import { useAiRealtime, useAiTypingBroadcast } from './useAiRealtime';
import { getShortName } from '../utils/profileHelpers';
import { logError } from '../services/errorLogger';

export type AiPhase = 'idle' | 'conversing' | 'generating_structure' | 'structure_overview' | 'generating_plan' | 'plan_review' | 'previewing_plan' | 'executing_plan' | 'completed';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  creditsCost?: number;
  creditsAfter?: number;
  senderId?: string;
  senderName?: string;
}

export interface AiMetadata {
  ready_to_plan: boolean;
  preferences_gathered: string[];
  suggested_questions: string[];
  trip_type?: 'roundtrip' | 'pointtopoint' | null;
  transport_mode?: 'driving' | 'transit' | 'walking' | 'bicycling' | null;
  agent_action?: 'packing_list' | 'budget_categories' | 'day_plan' | null;
  form_options?: Array<{ label: string; value: string }> | null;
}

export interface UseAiPlannerOptions {
  mode: 'create' | 'enhance';
  tripId?: string;
  userId: string;
  initialContext?: {
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
  initialCredits?: number;
  onCreditsUpdate?: (newBalance: number) => void;
}

const MAX_MESSAGES = 20;
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

function parseTripMemoryUpdate(text: string): { cleanText: string; tripMemoryUpdate: string | null } {
  const tripMemoryRegex = /<trip_memory_update>([\s\S]*?)<\/trip_memory_update>/;
  const match = text.match(tripMemoryRegex);

  if (!match) {
    return { cleanText: text, tripMemoryUpdate: null };
  }

  const cleanText = text.replace(tripMemoryRegex, '').trim();
  return { cleanText, tripMemoryUpdate: match[1].trim() };
}

function parseWebSearchRequest(text: string): { cleanText: string; searchQuery: string | null } {
  const searchRegex = /<web_search>([\s\S]*?)<\/web_search>/;
  const match = text.match(searchRegex);

  if (!match) {
    return { cleanText: text, searchQuery: null };
  }

  const cleanText = text.replace(searchRegex, '').trim();
  return { cleanText, searchQuery: match[1].trim() };
}

function formatSearchResults(results: WebSearchResult[]): string {
  if (results.length === 0) return 'Keine Ergebnisse gefunden.';
  return results.map((r, i) => {
    let entry = `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet}`;
    if (r.pageContent) {
      entry += `\n   Seiteninhalt: ${r.pageContent}`;
    }
    return entry;
  }).join('\n\n');
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

export const useAiPlanner = ({ mode, tripId, userId, initialContext = {}, initialCredits, onCreditsUpdate }: UseAiPlannerOptions) => {
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
  const [creditsBalance, setCreditsBalance] = useState<number | null>(initialCredits ?? null);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [webSearching, setWebSearching] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [lockUserName, setLockUserName] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [contextReady, setContextReady] = useState(false);
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
  const tripMemoryRef = useRef<string | undefined>(undefined);
  const senderNameRef = useRef<string>('');
  const prevCreditsRef = useRef<number | null>(null);
  const fableSettingsRef = useRef<{
    enabled: boolean;
    budgetVisible: boolean;
    packingVisible: boolean;
    webSearch: boolean;
    memoryEnabled: boolean;
    tripInstruction: string | null;
  }>({ enabled: true, budgetVisible: true, packingVisible: true, webSearch: true, memoryEnabled: true, tripInstruction: null });
  const personalMemoryEnabledRef = useRef(true);
  const [fableDisabled, setFableDisabled] = useState(false);

  // Realtime: instant message delivery from other users
  const handleRealtimeMessage = useCallback((messageId: string, senderId: string) => {
    // Skip own messages (already in state)
    if (senderId === userId) return;

    // Fetch all messages and merge
    if (!tripId) return;
    getAiTripMessages(tripId).then(serverMessages => {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = serverMessages.filter(m => !existingIds.has(m.id));
        if (newOnes.length === 0) return prev;
        const mapped: AiChatMessage[] = newOnes.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.decrypted_content,
          timestamp: new Date(m.created_at).getTime(),
          creditsCost: m.credits_cost ?? undefined,
          creditsAfter: m.credits_after ?? undefined,
          senderId: m.sender_id,
          senderName: m.sender_name || (m.role === 'assistant' ? 'Fable' : undefined),
        }));
        return [...prev, ...mapped].sort((a, b) => a.timestamp - b.timestamp);
      });
    }).catch(() => {});
  }, [tripId, userId]);

  useAiRealtime(tripId, phase === 'conversing' || phase === 'plan_review', handleRealtimeMessage);

  // Typing indicators via Realtime Broadcast
  const { broadcastTyping } = useAiTypingBroadcast(
    tripId,
    userId,
    senderNameRef.current || 'User',
    phase === 'conversing',
    setTypingUsers,
  );

  // Load trip data + collaborators when tripId is available (ensure context is always trip-derived)
  useEffect(() => {
    if (!tripId) {
      setContextReady(true);
      return;
    }
    let cancelled = false;
    Promise.all([getTrip(tripId), getCollaborators(tripId).catch(() => [])]).then(([trip, collabs]) => {
      if (cancelled) return;
      const collabNames = collabs
        .map(c => [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(' ') || c.profile?.email || '')
        .filter(Boolean);
      fableSettingsRef.current = {
        enabled: trip.fable_enabled,
        budgetVisible: trip.fable_budget_visible,
        packingVisible: trip.fable_packing_visible,
        webSearch: trip.fable_web_search,
        memoryEnabled: trip.fable_memory_enabled,
        tripInstruction: trip.fable_instruction,
      };
      setFableDisabled(!trip.fable_enabled);
      contextRef.current = {
        ...contextRef.current,
        destination: trip.destination,
        destinationLat: trip.destination_lat,
        destinationLng: trip.destination_lng,
        startDate: trip.start_date,
        endDate: trip.end_date,
        currency: trip.currency,
        travelersCount: trip.travelers_count,
        groupType: trip.group_type,
        collaboratorNames: collabNames.length > 0 ? collabNames : undefined,
        fableSettings: {
          budgetVisible: trip.fable_budget_visible,
          packingVisible: trip.fable_packing_visible,
          webSearch: trip.fable_web_search,
          memoryEnabled: trip.fable_memory_enabled,
          tripInstruction: trip.fable_instruction,
        },
      };
      setContextReady(true);
    }).catch(() => {
      if (!cancelled) setContextReady(true); // proceed with whatever we have
    });
    return () => { cancelled = true; };
  }, [tripId]);

  // Sync creditsBalance when profile refreshes (e.g., modal open triggers refreshProfile)
  useEffect(() => {
    if (initialCredits != null) {
      setCreditsBalance(initialCredits);
      prevCreditsRef.current = initialCredits;
    }
  }, [initialCredits]);

  // Time estimation: 8s structure + 12s per 5-day batch
  const estimateTime = useCallback((days: number) => {
    const batches = Math.ceil(days / 5);
    return 8 + batches * 12;
  }, []);

  // Debounced save conversation — only metadata/plan, no messages (those are individual rows now)
  const debouncedSave = useCallback((
    currentPhase: string,
    currentMetadata: AiMetadata | null,
    currentPlan: AiTripPlan | null,
    dataSnapshot?: Record<string, any> | null,
  ) => {
    if (!tripId) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const ctx = contextRef.current;
      saveAiConversation(
        tripId,
        userId,
        currentPhase as any,
        { metadata: currentMetadata, plan: currentPlan },
        {
          destination: ctx.destination,
          startDate: ctx.startDate,
          endDate: ctx.endDate,
        },
        dataSnapshot,
      ).catch(e => console.error('Failed to save conversation:', e));
    }, SAVE_DEBOUNCE_MS);
  }, [tripId, userId]);

  // Helper: persist a message row (fire-and-forget)
  const persistMessage = useCallback((
    role: 'user' | 'assistant',
    content: string,
    senderName: string,
    creditsCost?: number,
    creditsAfter?: number,
  ) => {
    if (!tripId) return;
    insertAiTripMessage(tripId, userId, senderName, role, content, creditsCost, creditsAfter)
      .catch(e => console.error('Failed to persist message:', e));
  }, [tripId, userId]);

  const loadExistingData = useCallback(async (profileOverride?: { ai_trip_context_enabled: boolean }): Promise<AiContext['existingData'] | undefined> => {
    if (mode !== 'enhance' || !tripId) return undefined;

    try {
      const contextEnabled = profileOverride ? profileOverride.ai_trip_context_enabled : (await getProfile(userId)).ai_trip_context_enabled;
      if (!contextEnabled) return undefined;

      const [activities, stops, budgetCategories, packingLists, days] = await Promise.all([
        getActivitiesForTrip(tripId),
        getStops(tripId),
        fableSettingsRef.current.budgetVisible ? getBudgetCategories(tripId) : Promise.resolve([]),
        fableSettingsRef.current.packingVisible ? getPackingLists(tripId) : Promise.resolve([]),
        getDays(tripId),
      ]);

      // Build day_id → date map
      const dayDateMap = new Map(days.map(d => [d.id, d.date]));

      // Load packing items from all lists
      let allPackingItems: Array<{ name: string; category: string; quantity: number }> = [];
      if (packingLists.length > 0) {
        const itemArrays = await Promise.all(
          packingLists.map(list => getPackingItems(list.id)),
        );
        allPackingItems = itemArrays.flat().map(item => ({
          name: item.name,
          category: item.category,
          quantity: item.quantity,
        }));
      }

      return {
        activities: activities.map(a => ({
          title: a.title,
          category: a.category,
          start_time: a.start_time,
          end_time: a.end_time,
          cost: a.cost,
          description: a.description,
          location_name: a.location_name,
          check_in_date: a.check_in_date,
          check_out_date: a.check_out_date,
          day_id: a.day_id,
          date: dayDateMap.get(a.day_id) || null,
        })),
        stops: stops.map(s => ({
          name: s.name,
          type: s.type,
          arrival_date: s.arrival_date,
          departure_date: s.departure_date,
          address: s.address,
          nights: s.nights,
        })),
        budgetCategories: budgetCategories.map(b => ({
          name: b.name,
          color: b.color,
          budget_limit: b.budget_limit,
        })),
        packingItems: allPackingItems,
      };
    } catch (e) {
      console.error('Failed to load existing data:', e);
      return undefined;
    }
  }, [mode, tripId, userId]);

  const startConversation = useCallback(async (canSend = true) => {
    if (!contextReady) return;

    // Master gate: if Fable is disabled for this trip, show info message
    if (!fableSettingsRef.current.enabled) {
      setPhase('conversing');
      const disabledMsg: AiChatMessage = {
        id: nextId(), role: 'assistant',
        content: 'Fable ist fuer diese Reise deaktiviert. Ein Reise-Admin kann Fable in den Einstellungen aktivieren.',
        timestamp: Date.now(), senderName: 'Fable',
      };
      setMessages([disabledMsg]);
      return;
    }

    setPhase('conversing');
    setError(null);
    setSending(true);

    try {
      const profile = await getProfile(userId);
      personalMemoryEnabledRef.current = profile.fable_memory_enabled;
      const shortName = profile.fable_name_visible
        ? getShortName(profile)
        : 'Reisender';
      senderNameRef.current = shortName;

      const [existingData, userMemory, tripMemory, savedMessages, savedConversation] = await Promise.all([
        loadExistingData(profile),
        profile.fable_memory_enabled ? getAiUserMemory().catch(() => null) : null,
        tripId && fableSettingsRef.current.memoryEnabled ? getAiTripMemory(tripId).catch(() => null) : null,
        tripId ? getAiTripMessages(tripId).catch(() => []) : [],
        tripId ? getAiConversation(tripId).catch(() => null) : null,
      ]);

      if (existingData) {
        contextRef.current.existingData = existingData;
      }
      if (userMemory) {
        contextRef.current.userMemory = userMemory;
        userMemoryRef.current = userMemory;
      }
      if (tripMemory) {
        contextRef.current.tripMemory = tripMemory;
        tripMemoryRef.current = tripMemory;
      }
      if (profile.ai_custom_instruction) {
        contextRef.current.customInstruction = profile.ai_custom_instruction;
      }

      // Restore from individual message rows if they exist
      if (savedMessages && savedMessages.length > 0) {
        const restoredMessages: AiChatMessage[] = savedMessages.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.decrypted_content,
          timestamp: new Date(m.created_at).getTime(),
          creditsCost: m.credits_cost ?? undefined,
          creditsAfter: m.credits_after ?? undefined,
          senderId: m.sender_id,
          senderName: m.sender_name || (m.role === 'assistant' ? 'Fable' : undefined),
        }));
        setMessages(restoredMessages);
        // Restore metadata/plan from conversation state if available
        if (savedConversation) {
          const { metadata: savedMeta, plan: savedPlan } = savedConversation.data || {};
          if (savedMeta) setMetadata(savedMeta);
          if (savedPlan) setPlan(savedPlan);
          setPhase(savedConversation.phase as AiPhase);
        }
        setRestored(true);
        setSending(false);
        return;
      }

      // Check for legacy saved conversation (blob-based, pre-migration)
      if (savedConversation) {
        const snap = savedConversation.context_snapshot;
        const ctx = contextRef.current;
        const isStale =
          snap.destination !== ctx.destination ||
          snap.startDate !== ctx.startDate ||
          snap.endDate !== ctx.endDate;

        if (!isStale && savedConversation.data?.messages?.length > 0) {
          const { messages: legacyMessages, metadata: savedMeta, plan: savedPlan } = savedConversation.data;
          setMessages(legacyMessages || []);
          setMetadata(savedMeta || null);
          if (savedPlan) setPlan(savedPlan);
          setPhase(savedConversation.phase as AiPhase);
          setRestored(true);
          setSending(false);
          return;
        }
        if (isStale) {
          deleteAiConversation(tripId!).catch(() => {});
        }
      }

      // Acquire processing lock for greeting
      if (tripId) {
        const acquired = await acquireProcessingLock(tripId, userId, shortName);
        if (!acquired) {
          // Another user is already generating greeting — just wait for realtime
          setSending(false);
          return;
        }
      }

      // Greeting uses 'greeting' task — AI call happens but no credits are deducted
      // (system-initiated, not user action). Credits only spent on user messages.
      const destination = contextRef.current.destination || 'dein Reiseziel';

      // Smart auto-analysis: detect manual trip changes since last Fable interaction
      let changeNote = '';
      if (mode === 'enhance' && existingData && savedConversation?.data_snapshot) {
        const snap = savedConversation.data_snapshot as Record<string, any>;
        const currentActivities = existingData.activities?.length || 0;
        const currentStops = existingData.stops?.length || 0;
        const snapActivities = snap.activitiesCount || 0;
        const snapStops = snap.stopsCount || 0;
        if (currentActivities !== snapActivities || currentStops !== snapStops) {
          const diffs: string[] = [];
          if (currentActivities > snapActivities) diffs.push(`${currentActivities - snapActivities} neue Aktivitäten`);
          if (currentActivities < snapActivities) diffs.push(`${snapActivities - currentActivities} Aktivitäten entfernt`);
          if (currentStops > snapStops) diffs.push(`${currentStops - snapStops} neue Stops`);
          if (currentStops < snapStops) diffs.push(`${snapStops - currentStops} Stops entfernt`);
          changeNote = ` Seit unserem letzten Gespräch hast du Änderungen vorgenommen: ${diffs.join(', ')}.`;
        }
      }

      const greetingContent = mode === 'enhance'
        ? `Hallo! Ich möchte meinen bestehenden Trip nach ${destination} erweitern. Hilf mir, weitere Aktivitäten und Stops zu planen.${changeNote}`
        : `Hallo! Ich plane eine Reise nach ${destination}. Hilf mir bei der Planung.`;

      const greeting: AiMessage = { role: 'user', content: `[${shortName}]: ${greetingContent}` };

      const response = await sendAiMessage('greeting', [greeting], contextRef.current);

      // Parse trip memory, user memory, and metadata from response
      const { cleanText: textAfterTripMemory, tripMemoryUpdate } = parseTripMemoryUpdate(response.content);
      const { cleanText: textAfterMemory, memoryUpdate } = parseMemoryUpdate(textAfterTripMemory);
      const { cleanText, metadata: meta } = parseMetadata(textAfterMemory);

      // Save user memory update if present (gated by personal setting)
      if (memoryUpdate && personalMemoryEnabledRef.current) {
        userMemoryRef.current = memoryUpdate;
        contextRef.current.userMemory = memoryUpdate;
        saveAiUserMemory(memoryUpdate).catch(e => console.error('Failed to save memory:', e));
      }

      // Save trip memory update if present (gated by trip setting)
      if (tripMemoryUpdate && tripId && fableSettingsRef.current.memoryEnabled) {
        tripMemoryRef.current = tripMemoryUpdate;
        contextRef.current.tripMemory = tripMemoryUpdate;
        saveAiTripMemory(tripId, tripMemoryUpdate).catch(e => console.error('Failed to save trip memory:', e));
      }

      const greetingMsg: AiChatMessage = {
        id: nextId(), role: 'user', content: greetingContent, timestamp: Date.now(),
        senderId: userId, senderName: shortName,
      };
      const aiMsg: AiChatMessage = {
        id: nextId(), role: 'assistant', content: cleanText, timestamp: Date.now(),
        senderName: 'Fable',
      };

      const newMessages = [greetingMsg, aiMsg];
      setMessages(newMessages);

      // Persist messages individually
      persistMessage('user', greetingContent, shortName);
      persistMessage('assistant', cleanText, 'Fable');

      if (meta) {
        setMetadata(meta);
        if (meta.trip_type) contextRef.current.tripType = meta.trip_type;
        if (meta.transport_mode) contextRef.current.transportMode = meta.transport_mode;
      }

      // Save data snapshot for future auto-analysis
      if (tripId && existingData) {
        const snapshot = {
          activitiesCount: existingData.activities?.length || 0,
          stopsCount: existingData.stops?.length || 0,
          timestamp: new Date().toISOString(),
        };
        debouncedSave('conversing', meta, null, snapshot);
      } else {
        debouncedSave('conversing', meta, null);
      }
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'startConversation' } });
      setError(e.message || 'Verbindung zum AI-Service fehlgeschlagen');
    } finally {
      setSending(false);
      // Release processing lock
      if (tripId) {
        releaseProcessingLock(tripId).catch(() => {});
      }
    }
  }, [contextReady, mode, tripId, userId, loadExistingData, debouncedSave, persistMessage]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    setError(null);
    setSending(true);
    broadcastTyping(false);

    const shortName = senderNameRef.current || 'User';
    const userMsg: AiChatMessage = {
      id: nextId(), role: 'user', content: text.trim(), timestamp: Date.now(),
      senderId: userId, senderName: shortName,
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Persist user message immediately
    persistMessage('user', text.trim(), shortName);

    try {
      // Acquire processing lock
      if (tripId) {
        const acquired = await acquireProcessingLock(tripId, userId, shortName);
        if (!acquired) {
          setError('Fable bearbeitet gerade eine Anfrage eines anderen Mitreisenden...');
          setSending(false);
          return;
        }
      }

      // Prepare messages for API (trimmed, with sender prefix for user messages)
      const trimmed = trimMessages(updatedMessages);
      const apiMessages: AiMessage[] = trimmed.map(m => ({
        role: m.role,
        content: m.role === 'user' && m.senderName
          ? `[${m.senderName}]: ${m.content}`
          : m.content,
      }));

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
        onCreditsUpdate?.(response.credits_remaining);
      }

      // Parse trip memory, user memory, and metadata
      let { cleanText: textAfterTripMemory, tripMemoryUpdate } = parseTripMemoryUpdate(response.content);
      let { cleanText: textAfterMemory, memoryUpdate } = parseMemoryUpdate(textAfterTripMemory);
      let { cleanText, metadata: meta } = parseMetadata(textAfterMemory);

      // Save user memory update if present (gated by personal setting)
      if (memoryUpdate && personalMemoryEnabledRef.current) {
        userMemoryRef.current = memoryUpdate;
        contextRef.current.userMemory = memoryUpdate;
        saveAiUserMemory(memoryUpdate).catch(e => console.error('Failed to save memory:', e));
      }

      // Save trip memory update if present (gated by trip setting)
      if (tripMemoryUpdate && tripId && fableSettingsRef.current.memoryEnabled) {
        tripMemoryRef.current = tripMemoryUpdate;
        contextRef.current.tripMemory = tripMemoryUpdate;
        saveAiTripMemory(tripId, tripMemoryUpdate).catch(e => console.error('Failed to save trip memory:', e));
      }

      // Check for web search request (gated by trip setting)
      const { cleanText: textWithoutSearch, searchQuery } = parseWebSearchRequest(cleanText);

      // If web search disabled, strip the tag and use text as-is
      if (searchQuery && !fableSettingsRef.current.webSearch) {
        cleanText = textWithoutSearch || cleanText;
      } else if (searchQuery && fableSettingsRef.current.webSearch) {
        // Show intermediate message + search indicator
        const searchingMsg: AiChatMessage = {
          id: nextId(), role: 'assistant', content: textWithoutSearch || 'Ich suche im Web...', timestamp: Date.now(),
          senderName: 'Fable',
        };
        setMessages([...updatedMessages, searchingMsg]);
        setWebSearching(true);

        try {
          const searchResults = await searchWeb(searchQuery);
          setWebSearching(false);

          // Format results and send follow-up AI call
          const formattedResults = formatSearchResults(searchResults);
          const followUpContext: AiContext = {
            ...contextRef.current,
            webSearchResults: formattedResults,
          };

          // Add the search results as a system-like message in the conversation
          const followUpMessages: AiMessage[] = [
            ...apiMessages,
            { role: 'assistant', content: textWithoutSearch || 'Ich habe im Web gesucht.' },
            { role: 'user', content: `[System]: Web-Suchergebnisse für "${searchQuery}":\n${formattedResults}` },
          ];

          const followUpResponse = await sendAiMessage('conversation', followUpMessages, followUpContext);

          // Parse the follow-up response
          const { cleanText: fuTextAfterTripMemory, tripMemoryUpdate: fuTripMemory } = parseTripMemoryUpdate(followUpResponse.content);
          const { cleanText: fuTextAfterMemory, memoryUpdate: fuMemory } = parseMemoryUpdate(fuTextAfterTripMemory);
          const { cleanText: fuCleanText, metadata: fuMeta } = parseMetadata(fuTextAfterMemory);

          if (fuMemory && personalMemoryEnabledRef.current) {
            userMemoryRef.current = fuMemory;
            contextRef.current.userMemory = fuMemory;
            saveAiUserMemory(fuMemory).catch(e => console.error('Failed to save memory:', e));
          }
          if (fuTripMemory && tripId && fableSettingsRef.current.memoryEnabled) {
            tripMemoryRef.current = fuTripMemory;
            contextRef.current.tripMemory = fuTripMemory;
            saveAiTripMemory(tripId, fuTripMemory).catch(e => console.error('Failed to save trip memory:', e));
          }

          // Update credits from follow-up
          if (followUpResponse.credits_remaining !== undefined) {
            const totalCost = creditsCost !== undefined
              ? (prevCreditsRef.current !== null ? prevCreditsRef.current - followUpResponse.credits_remaining + creditsCost : undefined)
              : undefined;
            prevCreditsRef.current = followUpResponse.credits_remaining;
            setCreditsBalance(followUpResponse.credits_remaining);
            onCreditsUpdate?.(followUpResponse.credits_remaining);
            creditsCost = totalCost;
          }

          cleanText = fuCleanText;
          meta = fuMeta || meta;
        } catch (searchErr) {
          setWebSearching(false);
          // Web search failed — use the original text without search tag
          cleanText = textWithoutSearch || cleanText;
        }
      }

      const aiMsg: AiChatMessage = {
        id: nextId(), role: 'assistant', content: cleanText, timestamp: Date.now(),
        creditsCost, creditsAfter: prevCreditsRef.current ?? undefined,
        senderName: 'Fable',
      };

      // Persist AI message
      persistMessage('assistant', cleanText, 'Fable', creditsCost, prevCreditsRef.current ?? undefined);

      const allMessages = [...updatedMessages, aiMsg];
      setMessages(allMessages);
      if (meta) {
        setMetadata(meta);
        if (meta.trip_type) contextRef.current.tripType = meta.trip_type;
        if (meta.transport_mode) contextRef.current.transportMode = meta.transport_mode;
      }

      debouncedSave('conversing', meta, null);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'sendMessage' } });
      setError(e.message || 'Nachricht konnte nicht gesendet werden');
    } finally {
      setSending(false);
      setWebSearching(false);
      // Release processing lock
      if (tripId) {
        releaseProcessingLock(tripId).catch(() => {});
      }
    }
  }, [messages, sending, userId, tripId, debouncedSave, persistMessage, broadcastTyping]);

  const buildPlanSummary = useCallback((p: AiTripPlan): string => {
    const days = p.days?.length || 0;
    const activities = p.days?.reduce((sum, d) => sum + (d.activities?.length || 0), 0) || 0;
    const stops = p.stops?.length || 0;
    const budget = p.budget_categories?.reduce((sum, c) => sum + (c.budget_limit || 0), 0) || 0;
    const currency = contextRef.current.currency || 'CHF';

    let summary = `Hier ist mein Vorschlag: **${days} Tage**, **${activities} Aktivitäten**`;
    if (stops > 0) summary += `, **${stops} Stops**`;
    if (budget > 0) summary += `, Budget ca. **${budget} ${currency}**`;
    summary += '.\n\nDu kannst dir die Details anschauen, den Plan direkt übernehmen, oder mir sagen was ich anpassen soll.';
    return summary;
  }, []);

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
            senderName: 'Fable',
          };
          setMessages(prev => {
            const updated = [...prev, summaryMsg];
            debouncedSave('plan_review', metadata, job.plan_json);
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
        onCreditsUpdate?.(structureResponse.credits_remaining);
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
        senderName: 'Fable',
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
        senderName: 'Fable',
      };
      setMessages(prev => {
        const updated = [...prev, summaryMsg];
        debouncedSave('plan_review', metadata, mergedPlan);
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
        contextRef.current.currency || 'CHF',
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
  }, [plan, tripId, userId, mode]);

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

    const userMsg: AiChatMessage = {
      id: nextId(), role: 'user', content: feedback.trim(), timestamp: Date.now(),
      senderId: userId, senderName: senderNameRef.current,
    };
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
        onCreditsUpdate?.(response.credits_remaining);
      }

      const parsed = parsePlanJson(response.content);
      setPlan(parsed);
      const summaryMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: buildPlanSummary(parsed),
        timestamp: Date.now(),
        senderName: 'Fable',
      };
      setMessages(prev => {
        const updated = [...prev, summaryMsg];
        debouncedSave('plan_review', metadata, parsed);
        return updated;
      });
      setPhase('plan_review');
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'adjustPlan' } });
      console.error('Plan adjustment failed:', e.message);
      setError('Anpassung fehlgeschlagen – bitte versuche es erneut');
      setPhase('plan_review');
    }
  }, [messages, sending, userId, metadata, debouncedSave]);

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
    setWebSearching(false);
    setTypingUsers([]);
    setLockUserName(null);
    prevCreditsRef.current = null;
    tripMemoryRef.current = undefined;
    if (pollingRef.current) clearInterval(pollingRef.current);

    // Delete saved conversation + trip messages + trip memory
    if (tripId) {
      deleteAiConversation(tripId).catch(() => {});
    }
  }, [tripId]);

  // Save conversation state (for AppState listener in AiTripModal)
  const saveConversationNow = useCallback(() => {
    if (!tripId || phase === 'idle' || phase === 'completed') return;
    const ctx = contextRef.current;
    saveAiConversation(
      tripId,
      userId,
      phase as any,
      { metadata, plan },
      {
        destination: ctx.destination,
        startDate: ctx.startDate,
        endDate: ctx.endDate,
      },
    ).catch(() => {});
  }, [tripId, userId, phase, metadata, plan]);

  // Agent: Generate packing list
  const generatePackingList = useCallback(async () => {
    if (!tripId || sending) return;
    setSending(true);
    setError(null);

    try {
      const agentMsg: AiMessage = {
        role: 'user',
        content: 'Erstelle eine Packliste fuer diese Reise als JSON.',
      };
      const response = await sendAiMessage('agent_packing', [agentMsg], contextRef.current);

      if (response.credits_remaining !== undefined) {
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
        onCreditsUpdate?.(response.credits_remaining);
      }

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Ungueltige Antwort vom AI-Service');
      const parsed = JSON.parse(jsonMatch[0]) as { items: Array<{ name: string; category: string; quantity: number }> };

      if (!parsed.items?.length) throw new Error('Keine Items erhalten');

      // Create packing list + items
      const { createPackingList: createList, createPackingItems: createItems } = await import('../api/packing');
      const list = await createList(tripId, 'Fable Packliste');
      await createItems(list.id, parsed.items);

      const successMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: `Packliste erstellt mit **${parsed.items.length} Items** in ${[...new Set(parsed.items.map(i => i.category))].length} Kategorien. Schau im Packlisten-Tab nach!`,
        timestamp: Date.now(),
        creditsAfter: response.credits_remaining,
        senderName: 'Fable',
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generatePackingList' } });
      setError(e.message || 'Packliste konnte nicht erstellt werden');
    } finally {
      setSending(false);
    }
  }, [tripId, sending, onCreditsUpdate]);

  // Agent: Generate day plan
  const generateDayPlan = useCallback(async () => {
    if (!tripId || sending) return;
    setSending(true);
    setError(null);

    try {
      // Include conversation history so AI knows what was discussed
      const conversationHistory: AiMessage[] = trimMessages(messages).map(m => ({
        role: m.role,
        content: m.role === 'user' && m.senderName
          ? `[${m.senderName}]: ${m.content}`
          : m.content,
      }));
      conversationHistory.push({
        role: 'user',
        content: 'Basierend auf unserem Gespräch: Erstelle einen Tagesplan für den nächsten leeren Tag als JSON.',
      });
      const response = await sendAiMessage('agent_day_plan', conversationHistory, contextRef.current);

      if (response.credits_remaining !== undefined) {
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
        onCreditsUpdate?.(response.credits_remaining);
      }

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Ungültige Antwort vom AI-Service');
      const parsed = JSON.parse(jsonMatch[0]) as { activities: Array<{ date: string; title: string; description: string | null; category: string; start_time: string | null; end_time: string | null; location_name: string | null; location_lat: number | null; location_lng: number | null; location_address: string | null; cost: number | null; sort_order: number; check_in_date: string | null; check_out_date: string | null; category_data: Record<string, any> }> };

      if (!parsed.activities?.length) throw new Error('Keine Aktivitäten erhalten');

      // Find or create the day for the target date
      const { getDays, createDay } = await import('../api/itineraries');
      const { createActivities } = await import('../api/itineraries');
      const days = await getDays(tripId);
      const targetDate = parsed.activities[0].date;

      let dayId: string | undefined;
      const existingDay = days.find(d => d.date === targetDate);
      if (existingDay) {
        dayId = existingDay.id;
      } else {
        const newDay = await createDay(tripId, targetDate);
        dayId = newDay.id;
      }

      // Create activities
      const activitiesToCreate = parsed.activities.map((a, i) => ({
        day_id: dayId!,
        trip_id: tripId,
        title: a.title,
        description: a.description,
        category: a.category,
        start_time: a.start_time,
        end_time: a.end_time,
        location_name: a.location_name,
        location_lat: a.location_lat,
        location_lng: a.location_lng,
        location_address: a.location_address,
        cost: a.cost,
        currency: contextRef.current.currency || 'CHF',
        sort_order: a.sort_order ?? i,
        check_in_date: a.check_in_date,
        check_out_date: a.check_out_date,
        category_data: a.category_data || {},
      }));

      await createActivities(activitiesToCreate);

      const successMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: `Tagesplan für **${targetDate}** erstellt mit **${parsed.activities.length} Aktivitäten**. Schau im Tagesplan nach!`,
        timestamp: Date.now(),
        creditsAfter: response.credits_remaining,
        senderName: 'Fable',
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateDayPlan' } });
      setError(e.message || 'Tagesplan konnte nicht erstellt werden');
    } finally {
      setSending(false);
    }
  }, [tripId, sending, messages, onCreditsUpdate]);

  // Agent: Generate budget categories
  const generateBudgetCategories = useCallback(async () => {
    if (!tripId || sending) return;
    setSending(true);
    setError(null);

    try {
      const agentMsg: AiMessage = {
        role: 'user',
        content: 'Erstelle Budget-Kategorien fuer diese Reise als JSON.',
      };
      const response = await sendAiMessage('agent_budget', [agentMsg], contextRef.current);

      if (response.credits_remaining !== undefined) {
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
        onCreditsUpdate?.(response.credits_remaining);
      }

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Ungueltige Antwort vom AI-Service');
      const parsed = JSON.parse(jsonMatch[0]) as { categories: Array<{ name: string; color: string; budget_limit: number }> };

      if (!parsed.categories?.length) throw new Error('Keine Kategorien erhalten');

      // Create budget categories
      const { createBudgetCategory } = await import('../api/budgets');
      for (const cat of parsed.categories) {
        await createBudgetCategory(tripId, cat.name, cat.color, cat.budget_limit, 'group');
      }

      const totalBudget = parsed.categories.reduce((sum, c) => sum + (c.budget_limit || 0), 0);
      const currency = contextRef.current.currency || 'CHF';
      const successMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: `**${parsed.categories.length} Budget-Kategorien** erstellt (Total: ${totalBudget} ${currency}). Schau im Budget-Tab nach!`,
        timestamp: Date.now(),
        creditsAfter: response.credits_remaining,
        senderName: 'Fable',
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateBudgetCategories' } });
      setError(e.message || 'Budget-Kategorien konnten nicht erstellt werden');
    } finally {
      setSending(false);
    }
  }, [tripId, sending, onCreditsUpdate]);

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
    contextReady,
    webSearching,
    typingUsers,
    lockUserName,
    fableDisabled,
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
    generatePackingList,
    generateBudgetCategories,
    generateDayPlan,
    broadcastTyping,
  };
};
