import { useState, useCallback, useRef, useEffect } from 'react';
import { requireOnline } from '../utils/offlineGate';
import { sendAiMessage, AiMessage, AiContext, AiTask } from '../api/aiChat';
import { executePlan, parsePlanJson, safeParseAgentJson, AiTripPlan, ExecutionResult, ProgressStep } from '../services/ai/planExecutor';
import { getTrip, updateTrip } from '../api/trips';
import { Trip } from '../types/database';
import { getCollaborators } from '../api/invitations';
import { getActivitiesForTrip, getDays } from '../api/itineraries';
import { getStopLocations } from '../api/stops';
import { getBudgetCategories } from '../api/budgets';
import { getPackingLists, getPackingItems } from '../api/packing';
import { getProfile, updateProfile } from '../api/auth';
import { useToast } from '../contexts/ToastContext';
import { getAiConversation, saveAiConversation, deleteAiConversation } from '../api/aiConversations';
import { getAiTripMessages, insertAiTripMessage, deleteAiTripMessages } from '../api/aiTripMessages';
import { getAiTripMemory, saveAiTripMemory, deleteAiTripMemory } from '../api/aiTripMemory';
import { getPlanJobStatus, getActiveJob, getRecentCompletedJob } from '../api/aiPlanJobs';
import { usePlanGeneration } from '../contexts/PlanGenerationContext';
import { acquireProcessingLock, releaseProcessingLock } from '../api/aiProcessingLock';
import { searchWeb, WebSearchResult } from '../api/webSearch';
import { lookupFlight, FlightInfo } from '../utils/flightLookup';
import { useAiRealtime, useAiTypingBroadcast } from './useAiRealtime';
import { fetchWeatherData } from './useWeather';
import { getShortName } from '../utils/profileHelpers';
import { logError } from '../services/errorLogger';
import { PACKING_CATEGORIES } from '../utils/constants';

export type AiPhase = 'idle' | 'conversing' | 'generating_structure' | 'structure_overview' | 'conflict_review' | 'generating_plan' | 'plan_review' | 'previewing_plan' | 'executing_plan' | 'completed';

export type ConflictResolution = 'overwrite' | 'merge' | 'skip';

export interface ConflictInfo {
  daysWithActivities: Array<{ date: string; activityCount: number }>;
  resolution: ConflictResolution;
  keepAccommodations: boolean;
}

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
  group_type?: 'solo' | 'couple' | 'family' | 'friends' | 'group' | null;
  agent_action?: 'packing_list' | 'budget_categories' | 'day_plan' | null;
  form_options?: Array<{ label: string; value?: string }> | null;
  plan_start_date?: string | null;
  plan_end_date?: string | null;
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

const MAX_MESSAGES = 30;
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

interface MemoryParseResult {
  cleanText: string;
  memoryAdd: string | null;
  memoryConflict: { old: string; new_val: string } | null;
}

function parsePersonalMemory(text: string): MemoryParseResult {
  let cleanText = text;
  let memoryAdd: string | null = null;
  let memoryConflict: { old: string; new_val: string } | null = null;

  // New tag: <memory_add> (strip ALL occurrences, keep first non-empty)
  const addRegex = /<memory_add>([\s\S]*?)<\/memory_add>/g;
  const addMatches = [...cleanText.matchAll(addRegex)];
  if (addMatches.length > 0) {
    memoryAdd = addMatches[0][1].trim() || null;
    cleanText = cleanText.replace(addRegex, '').trim();
  }

  // Fallback: old <memory_update> tag treated as memory_add (strip all)
  const legacyRegex = /<memory_update>([\s\S]*?)<\/memory_update>/g;
  if (!memoryAdd) {
    const legacyMatches = [...cleanText.matchAll(legacyRegex)];
    if (legacyMatches.length > 0) {
      memoryAdd = legacyMatches[0][1].trim() || null;
    }
  }
  cleanText = cleanText.replace(legacyRegex, '').trim();

  // New tag: <memory_conflict old="...">...</memory_conflict> (strip all, keep first)
  const conflictRegex = /<memory_conflict\s+old="([^"]*)">([\s\S]*?)<\/memory_conflict>/g;
  const conflictMatches = [...cleanText.matchAll(conflictRegex)];
  if (conflictMatches.length > 0 && conflictMatches[0][1].trim() && conflictMatches[0][2].trim()) {
    memoryConflict = { old: conflictMatches[0][1].trim(), new_val: conflictMatches[0][2].trim() };
  }
  cleanText = cleanText.replace(conflictRegex, '').trim();

  return { cleanText, memoryAdd, memoryConflict };
}

interface TripMemoryParseResult {
  cleanText: string;
  tripMemoryAdd: string | null;
  tripMemoryConflict: { old: string; new_val: string } | null;
}

function parseTripMemory(text: string): TripMemoryParseResult {
  let cleanText = text;
  let tripMemoryAdd: string | null = null;
  let tripMemoryConflict: { old: string; new_val: string } | null = null;

  // New tag: <trip_memory_add> (strip ALL occurrences, keep first non-empty)
  const addRegex = /<trip_memory_add>([\s\S]*?)<\/trip_memory_add>/g;
  const addMatches = [...cleanText.matchAll(addRegex)];
  if (addMatches.length > 0) {
    tripMemoryAdd = addMatches[0][1].trim() || null;
    cleanText = cleanText.replace(addRegex, '').trim();
  }

  // Fallback: old <trip_memory_update> tag treated as trip_memory_add (strip all)
  const legacyRegex = /<trip_memory_update>([\s\S]*?)<\/trip_memory_update>/g;
  if (!tripMemoryAdd) {
    const legacyMatches = [...cleanText.matchAll(legacyRegex)];
    if (legacyMatches.length > 0) {
      tripMemoryAdd = legacyMatches[0][1].trim() || null;
    }
  }
  cleanText = cleanText.replace(legacyRegex, '').trim();

  // New tag: <trip_memory_conflict old="...">...</trip_memory_conflict> (strip all, keep first)
  const conflictRegex = /<trip_memory_conflict\s+old="([^"]*)">([\s\S]*?)<\/trip_memory_conflict>/g;
  const conflictMatches = [...cleanText.matchAll(conflictRegex)];
  if (conflictMatches.length > 0 && conflictMatches[0][1].trim() && conflictMatches[0][2].trim()) {
    tripMemoryConflict = { old: conflictMatches[0][1].trim(), new_val: conflictMatches[0][2].trim() };
  }
  cleanText = cleanText.replace(conflictRegex, '').trim();

  return { cleanText, tripMemoryAdd, tripMemoryConflict };
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

function parseFlightLookupRequest(text: string): { cleanText: string; flightIata: string | null } {
  const flightRegex = /<flight_lookup>([\s\S]*?)<\/flight_lookup>/;
  const match = text.match(flightRegex);

  if (!match) {
    return { cleanText: text, flightIata: null };
  }

  const cleanText = text.replace(flightRegex, '').trim();
  return { cleanText, flightIata: match[1].trim() };
}

function formatFlightResult(flight: FlightInfo): string {
  if (!flight.found) return 'Flug nicht gefunden.';
  const parts: string[] = [];
  parts.push(`Flug: ${flight.flight_iata}`);
  if (flight.airline_name) parts.push(`Airline: ${flight.airline_name}`);
  if (flight.dep_city && flight.dep_airport) parts.push(`Abflug: ${flight.dep_city} (${flight.dep_airport})`);
  if (flight.arr_city && flight.arr_airport) parts.push(`Ankunft: ${flight.arr_city} (${flight.arr_airport})`);
  if (flight.dep_time_local) parts.push(`Abflugzeit: ${flight.dep_time_local}`);
  if (flight.arr_time_local) parts.push(`Ankunftszeit: ${flight.arr_time_local}`);
  if (flight.duration_min) parts.push(`Flugdauer: ${Math.floor(flight.duration_min / 60)}h${String(flight.duration_min % 60).padStart(2, '0')}`);
  if (flight.dep_terminal) parts.push(`Abflug-Terminal: ${flight.dep_terminal}${flight.dep_gate ? `, Gate ${flight.dep_gate}` : ''}`);
  if (flight.arr_terminal) parts.push(`Ankunfts-Terminal: ${flight.arr_terminal}${flight.arr_gate ? `, Gate ${flight.arr_gate}` : ''}`);
  if (flight.status) parts.push(`Status: ${flight.status}`);
  if (flight.aircraft) parts.push(`Flugzeug: ${flight.aircraft}`);
  return parts.join('\n');
}

const CUSTOM_INSTRUCTION_MAX_LENGTH = 1000;

/** Dedup: check if the new entry is semantically already present */
function isDuplicate(existing: string, newEntry: string): boolean {
  if (!newEntry || !existing) return false;
  const normalizedExisting = existing.toLowerCase();
  const normalizedNew = newEntry.toLowerCase();
  // Check exact containment first
  if (normalizedExisting.includes(normalizedNew)) return true;
  // Extract meaningful words (3+ chars) and check overlap
  const extractWords = (s: string) => s.split(/\s+/).filter(w => w.length >= 3);
  const existingWords = new Set(extractWords(normalizedExisting));
  const newWords = extractWords(normalizedNew);
  if (newWords.length === 0) return false;
  const matchCount = newWords.filter(w => existingWords.has(w)).length;
  return matchCount / newWords.length >= 0.6;
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
  // Build structured preferences from metadata + context instead of raw message dump
  const prefs: Record<string, any> = {
    destination: context.destination,
    startDate: context.startDate,
    endDate: context.endDate,
    currency: context.currency,
    tripType: context.tripType || null,
    transportMode: context.transportMode || null,
    groupType: context.groupType || null,
    travelersCount: context.travelersCount || null,
  };
  if (context.lastPreferencesGathered?.length) {
    prefs.preferencesGathered = context.lastPreferencesGathered;
  }
  // Include only user messages as a compact summary (skip greetings/system)
  const userMessages = messages
    .filter(m => m.role === 'user' && !m.content.startsWith('[System]'))
    .map(m => m.content);
  if (userMessages.length > 0) {
    // Keep only the last 6 user messages to avoid noise
    prefs.userInput = userMessages.slice(-6).join('\n');
  }
  if (context.tripMemory) {
    prefs.tripMemory = context.tripMemory;
  }
  return prefs;
}

function mergePlan(
  structure: AiTripPlan,
  activities: { days: Array<{ date: string; activities: AiTripPlan['days'][0]['activities'] }> },
): AiTripPlan {
  // K15: MERGE activities for same dates instead of replacing (prevents batch overlap loss)
  const activitiesByDate = new Map<string, AiTripPlan['days'][0]['activities']>();
  for (const day of activities.days || []) {
    const existing = activitiesByDate.get(day.date) || [];
    activitiesByDate.set(day.date, [...existing, ...(day.activities || [])]);
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
  const planGeneration = usePlanGeneration();
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
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [restored, setRestored] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(initialCredits ?? null);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [webSearching, setWebSearching] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [lockUserName, setLockUserName] = useState<string | null>(null);
  const lastFailedActionRef = useRef<{ type: 'greeting' | 'message' | 'structure' | 'plan'; text?: string } | null>(null);
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
  const { showToast } = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const collabList = collabs
        .filter(c => c.profile?.id)
        .map(c => ({
          id: c.profile!.id,
          name: [c.profile?.first_name, c.profile?.last_name].filter(Boolean).join(' ') || c.profile?.email || '',
        }))
        .filter(c => c.name);
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
        collaborators: collabList.length > 0 ? collabList : undefined,
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
        currentPhase,
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

  // Helper: apply personal memory updates from AI response
  const applyPersonalMemory = useCallback((parsed: MemoryParseResult) => {
    const { memoryAdd, memoryConflict } = parsed;

    if (memoryAdd && personalMemoryEnabledRef.current) {
      const existing = contextRef.current.customInstruction || '';
      if (!isDuplicate(existing, memoryAdd)) {
        const merged = existing ? `${existing}\n- ${memoryAdd}` : `- ${memoryAdd}`;
        if (merged.length <= CUSTOM_INSTRUCTION_MAX_LENGTH) {
          updateProfile(userId, { ai_custom_instruction: merged })
            .catch(e => logError(e, { component: 'useAiPlanner', context: { action: 'applyPersonalMemory', detail: 'updateProfile failed' } }));
          contextRef.current.customInstruction = merged;
        } else {
          console.warn('[Fable Memory] ai_custom_instruction max length reached, skipping append');
        }
      }
    }

    if (memoryConflict) {
      showToast(`Fable bemerkt: "${memoryConflict.old}" → "${memoryConflict.new_val}". Passe es in den Fable-Einstellungen an.`, 'info');
    }
  }, [userId, showToast]);

  // Helper: apply trip memory updates from AI response
  const applyTripMemory = useCallback((parsed: TripMemoryParseResult) => {
    const { tripMemoryAdd, tripMemoryConflict } = parsed;

    if (tripMemoryAdd && tripId && fableSettingsRef.current.memoryEnabled) {
      const existingTrip = tripMemoryRef.current || '';
      if (!isDuplicate(existingTrip, tripMemoryAdd)) {
        const merged = existingTrip ? `${existingTrip}\n- ${tripMemoryAdd}` : `- ${tripMemoryAdd}`;
        tripMemoryRef.current = merged;
        contextRef.current.tripMemory = merged;
        saveAiTripMemory(tripId, merged)
          .catch(e => logError(e, { component: 'useAiPlanner', context: { action: 'applyTripMemory', detail: 'saveAiTripMemory failed' } }));
      }
    }

    if (tripMemoryConflict) {
      showToast(`Trip-Update: "${tripMemoryConflict.old}" → "${tripMemoryConflict.new_val}". Prüfe die Trip-Einstellungen.`, 'info');
    }
  }, [tripId, showToast]);

  const loadExistingData = useCallback(async (profileOverride?: { ai_trip_context_enabled: boolean }): Promise<AiContext['existingData'] | undefined> => {
    if (mode !== 'enhance' || !tripId) return undefined;

    try {
      const contextEnabled = profileOverride ? profileOverride.ai_trip_context_enabled : (await getProfile(userId)).ai_trip_context_enabled;
      if (!contextEnabled) return undefined;

      const [activities, stops, budgetCategories, packingLists, days] = await Promise.all([
        getActivitiesForTrip(tripId),
        getStopLocations(tripId),
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
    if (!requireOnline('Fable')) return;
    if (!contextReady) return;

    // Master gate: if Fable is disabled for this trip, show info message
    if (!fableSettingsRef.current.enabled) {
      setPhase('conversing');
      const disabledMsg: AiChatMessage = {
        id: nextId(), role: 'assistant',
        content: 'Fable ist für diese Reise deaktiviert. Ein Reise-Admin kann Fable in den Einstellungen aktivieren.',
        timestamp: Date.now(), senderName: 'Fable',
      };
      setMessages([disabledMsg]);
      return;
    }

    setPhase('conversing');
    setError(null);
    setSending(true);

    let lockAcquired = false;
    try {
      const profile = await getProfile(userId);
      personalMemoryEnabledRef.current = profile.fable_memory_enabled;
      const shortName = profile.fable_name_visible
        ? getShortName(profile)
        : 'Reisender';
      senderNameRef.current = shortName;

      const [existingData, tripMemory, savedMessages, savedConversation, weatherMap] = await Promise.all([
        loadExistingData(profile),
        tripId && fableSettingsRef.current.memoryEnabled ? getAiTripMemory(tripId).catch(() => null) : null,
        tripId ? getAiTripMessages(tripId).catch(() => []) : [],
        tripId ? getAiConversation(tripId).catch(() => null) : null,
        (tripId && contextRef.current.startDate && contextRef.current.endDate)
          ? fetchWeatherData(tripId, contextRef.current.startDate, contextRef.current.endDate, contextRef.current.destinationLat ?? null, contextRef.current.destinationLng ?? null).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (existingData) {
        contextRef.current.existingData = existingData;
      }
      if (weatherMap && weatherMap.size > 0) {
        contextRef.current.weatherData = Array.from(weatherMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, w]) => ({ date, tempMax: w.tempMax, tempMin: w.tempMin, icon: w.icon }));
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

        // M9: Detect unanswered last user message (app crashed between user msg and AI response)
        // Remove it from UI to avoid confusing "hanging" messages
        // Note: DB message persists but is harmless — it will be naturally part of history
        if (restoredMessages.length > 0 && restoredMessages[restoredMessages.length - 1].role === 'user') {
          const cleaned = restoredMessages.slice(0, -1);
          setMessages(cleaned);
        }
        // Check for active plan generation job — delegate to global context
        const activeJob = await getActiveJob(userId).catch(() => null);
        if (activeJob) {
          setActiveJobId(activeJob.id);
          if (activeJob.structure_json) setStructure(activeJob.structure_json);
          // Show info in chat rather than blocking
          const progressInfo = activeJob.progress;
          const progressText = progressInfo?.phase === 'activities' && progressInfo.total_days > 0
            ? `Tag ${progressInfo.current_day}/${progressInfo.total_days}`
            : 'Wird erstellt';
          const infoMsg: AiChatMessage = {
            id: nextId(),
            role: 'assistant',
            content: `Dein Reiseplan wird gerade erstellt (${progressText}). Der Fortschritt wird oben im Bildschirm angezeigt.`,
            timestamp: Date.now(),
            senderName: 'Fable',
          };
          setMessages(prev => [...prev, infoMsg]);
          setPhase('generating_plan');
          setProgressStep('activities');
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
        lockAcquired = true;
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

      // Check if trip is in the past (completed)
      const isTripPast = contextRef.current.endDate && new Date(contextRef.current.endDate + 'T23:59:59') < new Date();

      const greetingContent = isTripPast
        ? `Hallo! Meine Reise nach ${destination} ist bereits vorbei. Was kann ich mit diesem Trip machen?`
        : mode === 'enhance'
        ? `Hallo! Ich möchte meinen bestehenden Trip nach ${destination} erweitern. Hilf mir, weitere Aktivitäten und Stops zu planen.${changeNote}`
        : `Hallo! Ich plane eine Reise nach ${destination}. Hilf mir bei der Planung.`;

      const greeting: AiMessage = { role: 'user', content: `[${shortName}]: ${greetingContent}` };

      const response = await sendAiMessage('greeting', [greeting], contextRef.current);

      // Parse trip memory, personal memory, and metadata from response
      const tripParsed = parseTripMemory(response.content);
      const personalParsed = parsePersonalMemory(tripParsed.cleanText);
      const { cleanText, metadata: meta } = parseMetadata(personalParsed.cleanText);

      applyPersonalMemory(personalParsed);
      applyTripMemory(tripParsed);

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
        if (meta.preferences_gathered?.length) {
          contextRef.current.lastPreferencesGathered = meta.preferences_gathered;
        }
        if (meta.group_type && tripId) {
          contextRef.current.groupType = meta.group_type;
          const updates: Partial<Trip> = { group_type: meta.group_type };
          if (meta.group_type === 'solo') updates.travelers_count = 1;
          else if (meta.group_type === 'couple') updates.travelers_count = 2;
          else if (meta.group_type === 'family') updates.travelers_count = 4;
          else if (meta.group_type === 'friends' || meta.group_type === 'group') updates.travelers_count = 4;
          updateTrip(tripId, updates).catch(e => console.error('group_type update failed:', e));
        }
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
      logError(e, { component: 'useAiPlanner', context: { action: 'startConversation', task: 'greeting', status: e?.status, detail: e?.message } });
      setError(e.message || 'Verbindung zum AI-Service fehlgeschlagen');
      lastFailedActionRef.current = { type: 'greeting' };
    } finally {
      setSending(false);
      // Release processing lock only if we actually acquired it
      if (tripId && lockAcquired) {
        releaseProcessingLock(tripId).catch(() => {});
      }
    }
  }, [contextReady, mode, tripId, userId, loadExistingData, debouncedSave, persistMessage]);

  const sendMessage = useCallback(async (text: string) => {
    if (!requireOnline('Fable')) return;
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

    let lockAcquired = false;
    try {
      // Acquire processing lock
      if (tripId) {
        const acquired = await acquireProcessingLock(tripId, userId, shortName);
        if (!acquired) {
          setError('Fable bearbeitet gerade eine Anfrage eines anderen Mitreisenden...');
          setSending(false);
          return;
        }
        lockAcquired = true;
      }

      // Prepare messages for API (trimmed, with sender prefix for user messages)
      const trimmed = trimMessages(updatedMessages);
      const apiMessages: AiMessage[] = trimmed.map(m => ({
        role: m.role,
        content: m.role === 'user' && m.senderName
          ? `[${m.senderName}]: ${m.content}`
          : m.content,
      }));

      // Anti-loop: inject system hint after 8+ messages without ready_to_plan
      // Only if destination AND dates are known (otherwise Fable still needs info)
      const turnCount = updatedMessages.filter(m => m.role === 'user').length;
      const hasDestination = !!contextRef.current.destination;
      const hasDates = !!contextRef.current.startDate && !!contextRef.current.endDate;
      if (turnCount >= 4 && !metadata?.ready_to_plan && hasDestination && hasDates) {
        apiMessages.push({
          role: 'user',
          content: '[System]: Du hast bereits ' + (turnCount * 2) + '+ Nachrichten ausgetauscht. Destination und Daten sind bekannt. Setze jetzt ready_to_plan=true in der metadata und fasse kurz zusammen was du planst. Der User wartet auf den Plan-Button.',
        });
      }

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

      // Parse trip memory, personal memory, and metadata
      let tripParsed = parseTripMemory(response.content);
      let personalParsed = parsePersonalMemory(tripParsed.cleanText);
      let { cleanText, metadata: meta } = parseMetadata(personalParsed.cleanText);

      applyPersonalMemory(personalParsed);
      applyTripMemory(tripParsed);

      // Track intermediate message IDs (searching bubbles) to exclude from final merge
      const intermediateIds = new Set<string>();

      // Check for flight lookup request
      const { cleanText: textWithoutFlight, flightIata } = parseFlightLookupRequest(cleanText);
      if (flightIata) {
        const searchingMsg: AiChatMessage = {
          id: nextId(), role: 'assistant', content: textWithoutFlight || 'Ich suche die Flugdaten...', timestamp: Date.now(),
          senderName: 'Fable',
        };
        intermediateIds.add(searchingMsg.id);
        setMessages(prev => {
          const existingIds = new Set(updatedMessages.map(m => m.id));
          const realtimeOnly = prev.filter(m => !existingIds.has(m.id));
          return [...updatedMessages, ...realtimeOnly, searchingMsg];
        });

        try {
          const flightResult = await lookupFlight(flightIata);
          const formattedFlight = flightResult ? formatFlightResult(flightResult) : 'Flug nicht gefunden.';

          const followUpMessages: AiMessage[] = [
            ...apiMessages,
            { role: 'assistant', content: textWithoutFlight || 'Ich suche die Flugdaten.' },
            { role: 'user', content: `[System]: Flugdaten für "${flightIata}":\n${formattedFlight}` },
          ];

          // Use 'greeting' (0 credits) for follow-up — user already paid for the initial conversation call
          const followUpResponse = await sendAiMessage('greeting', followUpMessages, contextRef.current);

          const fuTripParsed = parseTripMemory(followUpResponse.content);
          const fuPersonalParsed = parsePersonalMemory(fuTripParsed.cleanText);
          const { cleanText: fuCleanText, metadata: fuMeta } = parseMetadata(fuPersonalParsed.cleanText);

          applyPersonalMemory(fuPersonalParsed);
          applyTripMemory(fuTripParsed);

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
        } catch (flightErr) {
          cleanText = textWithoutFlight || cleanText;
        }
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
        intermediateIds.add(searchingMsg.id);
        setMessages(prev => {
          const existingIds = new Set(updatedMessages.map(m => m.id));
          const realtimeOnly = prev.filter(m => !existingIds.has(m.id));
          return [...updatedMessages, ...realtimeOnly, searchingMsg];
        });
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

          // Use 'greeting' (0 credits) for follow-up — user already paid for the initial conversation call
          const followUpResponse = await sendAiMessage('greeting', followUpMessages, followUpContext);

          // Parse the follow-up response
          const fuTripParsed = parseTripMemory(followUpResponse.content);
          const fuPersonalParsed = parsePersonalMemory(fuTripParsed.cleanText);
          const { cleanText: fuCleanText, metadata: fuMeta } = parseMetadata(fuPersonalParsed.cleanText);

          applyPersonalMemory(fuPersonalParsed);
          applyTripMemory(fuTripParsed);

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

      // Use functional updater to avoid overwriting realtime-injected messages
      setMessages(prev => {
        // Keep any messages that arrived via realtime during the AI call
        // Exclude intermediate "searching..." bubbles (they're replaced by the final AI response)
        const excludeIds = new Set([...updatedMessages.map(m => m.id), ...intermediateIds]);
        const realtimeMessages = prev.filter(m => !excludeIds.has(m.id));
        return [...updatedMessages, ...realtimeMessages, aiMsg];
      });
      if (meta) {
        setMetadata(meta);
        if (meta.trip_type) contextRef.current.tripType = meta.trip_type;
        if (meta.transport_mode) contextRef.current.transportMode = meta.transport_mode;
        if (meta.preferences_gathered?.length) {
          contextRef.current.lastPreferencesGathered = meta.preferences_gathered;
        }
        if (meta.group_type && tripId) {
          contextRef.current.groupType = meta.group_type;
          const updates: Partial<Trip> = { group_type: meta.group_type };
          if (meta.group_type === 'solo') updates.travelers_count = 1;
          else if (meta.group_type === 'couple') updates.travelers_count = 2;
          else if (meta.group_type === 'family') updates.travelers_count = 4;
          else if (meta.group_type === 'friends' || meta.group_type === 'group') updates.travelers_count = 4;
          updateTrip(tripId, updates).catch(e => console.error('group_type update failed:', e));
        }
      } else {
        // K10: Reset stale agent_action when Fable doesn't include <metadata> tags
        // Keep ready_to_plan — user may still want to trigger plan generation
        setMetadata(prev => prev ? { ...prev, agent_action: null } : prev);
      }

      debouncedSave('conversing', meta, null);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'sendMessage', task: 'conversation', status: e?.status, detail: e?.message } });
      setError(e.message || 'Nachricht konnte nicht gesendet werden');
      lastFailedActionRef.current = { type: 'message', text: text.trim() };
    } finally {
      setSending(false);
      setWebSearching(false);
      // Release processing lock only if we actually acquired it
      if (tripId && lockAcquired) {
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

  // Sync with global PlanGenerationContext for job/client-generation completion/failure
  useEffect(() => {
    // Server job tracking
    if (activeJobId) {
      if (planGeneration.completed && planGeneration.activeJobId === activeJobId) {
        setActiveJobId(null);
        setProgressStep(null);

        const completedMsg: AiChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: restored
            ? 'Willkommen zurück! Dein Reiseplan ist fertig.'
            : 'Dein Reiseplan ist fertig! Alle Tage und Aktivitäten wurden erstellt. Schau im Tagesplan nach.',
          timestamp: Date.now(),
          senderName: 'Fable',
        };
        setMessages(prev => [...prev, completedMsg]);
        setPhase('completed');
      }

      if (planGeneration.error && !planGeneration.isGenerating && planGeneration.activeJobId === null) {
        setActiveJobId(null);
        setProgressStep(null);
        setError(planGeneration.error);
        setPhase('conversing');
        planGeneration.dismissError();
      }
    }

    // Client-side generation tracking
    if (phase === 'generating_plan' && !activeJobId) {
      if (planGeneration.completed && !planGeneration.clientGenerating) {
        setProgressStep(null);
        const completedMsg: AiChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: 'Dein Reiseplan ist fertig! Alle Tage und Aktivitäten wurden erstellt. Schau im Tagesplan nach.',
          timestamp: Date.now(),
          senderName: 'Fable',
        };
        setMessages(prev => [...prev, completedMsg]);
        setPhase('completed');
      }

      if (planGeneration.error && !planGeneration.isGenerating) {
        setProgressStep(null);
        setError(planGeneration.error);
        setPhase('structure_overview');
        planGeneration.dismissError();
      }
    }
  }, [activeJobId, phase, planGeneration.completed, planGeneration.error, planGeneration.isGenerating, planGeneration.activeJobId, planGeneration.clientGenerating, restored]);

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

      // Partial plan: use date range from metadata if available
      const planStartDate = metadata?.plan_start_date || null;
      const planEndDate = metadata?.plan_end_date || null;
      if (planStartDate) planContext.planStartDate = planStartDate;
      if (planEndDate) planContext.planEndDate = planEndDate;

      // H8: Refresh weather data (dates may have changed since startConversation)
      if (tripId && contextRef.current.startDate && contextRef.current.endDate) {
        try {
          const weatherMap = await fetchWeatherData(tripId, contextRef.current.startDate, contextRef.current.endDate, contextRef.current.destinationLat ?? null, contextRef.current.destinationLng ?? null);
          if (weatherMap && weatherMap.size > 0) {
            planContext.weatherData = Array.from(weatherMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, w]) => ({ date, tempMax: w.tempMax, tempMin: w.tempMin, icon: w.icon }));
            contextRef.current.weatherData = planContext.weatherData;
          }
        } catch { /* weather is best-effort */ }
      }

      setProgressStep('structure');
      const dateRangeHint = planStartDate && planEndDate
        ? ` NUR für den Zeitraum ${planStartDate} bis ${planEndDate}`
        : planStartDate
        ? ` ab ${planStartDate}`
        : '';

      // K2: Include conversation history so AI knows what was discussed
      const conversationHistory: AiMessage[] = trimMessages(messages).map(m => ({
        role: m.role,
        content: m.role === 'user' && m.senderName
          ? `[${m.senderName}]: ${m.content}`
          : m.content,
      }));
      conversationHistory.push({
        role: 'user',
        content: `Erstelle die Grundstruktur des Reiseplans als JSON (Trip, Stops, Budget, Tage — ohne Aktivitäten).${dateRangeHint}`,
      });

      const structureResponse = await sendAiMessage('plan_generation', conversationHistory, planContext);

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
      logError(e, { component: 'useAiPlanner', context: { action: 'generateStructure', status: e?.status, detail: e?.message } });
      setError('Struktur konnte nicht erstellt werden – bitte versuche es erneut');
      lastFailedActionRef.current = { type: 'structure' };
      setPhase('conversing');
      setProgressStep(null);
    }
  }, [messages, metadata, estimateTime, buildStructureSummary]);

  // Start the actual generation (called after conflict resolution or directly)
  // Accepts optional structureOverride for skip-resolution where state hasn't committed yet
  const startGeneration = useCallback((structureOverride?: AiTripPlan) => {
    const activeStructure = structureOverride || structure;
    if (!activeStructure || !tripId) return;
    setPhase('generating_plan');
    setError(null);
    setProgressStep('activities');

    const preferences = extractPreferences(messages, contextRef.current);
    const planContext: AiContext = { ...contextRef.current, preferences };

    // K7: Inject generated stops into context so activities know the route
    if (activeStructure.stops?.length) {
      planContext.structureStops = activeStructure.stops;
    }
    // Include conversation summary for batch context
    const conversationSummary = messages
      .filter(m => m.role === 'user' && !m.content.startsWith('[System]'))
      .slice(-6)
      .map(m => m.content)
      .join('\n');
    if (conversationSummary) {
      planContext.conversationSummary = conversationSummary;
    }

    // Delegate to PlanGenerationContext (runs tag-by-tag, survives modal close)
    planGeneration.startClientGeneration({
      structure: activeStructure,
      context: planContext,
      tripId,
      userId,
      destination: contextRef.current.destination || '',
    });

    // Show info message so user can close modal
    const infoMsg: AiChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: 'Fable erstellt deinen Plan Tag für Tag. Du kannst dieses Fenster schliessen — der Fortschritt wird oben im Bildschirm angezeigt.',
      timestamp: Date.now(),
      senderName: 'Fable',
    };
    setMessages(prev => [...prev, infoMsg]);
  }, [structure, messages, planGeneration, tripId, userId]);

  // Check for existing activities before generating — shows conflict_review if needed
  const checkConflictsAndGenerate = useCallback(async () => {
    if (!structure || !tripId) return;

    // In enhance mode, check for existing activities on planned days
    if (mode === 'enhance') {
      const existingData = contextRef.current.existingData;
      if (existingData?.activities?.length) {
        const planDates = new Set((structure.days || []).map(d => d.date));
        const daysWithActivities = new Map<string, number>();

        for (const act of existingData.activities) {
          if (act.date && planDates.has(act.date)) {
            daysWithActivities.set(act.date, (daysWithActivities.get(act.date) || 0) + 1);
          }
        }

        if (daysWithActivities.size > 0) {
          setConflictInfo({
            daysWithActivities: Array.from(daysWithActivities.entries())
              .map(([date, activityCount]) => ({ date, activityCount }))
              .sort((a, b) => a.date.localeCompare(b.date)),
            resolution: 'merge',
            keepAccommodations: true,
          });
          setPhase('conflict_review');
          return;
        }
      }
    }

    // No conflicts — start generation directly
    startGeneration();
  }, [structure, tripId, mode, startGeneration]);

  // Resolve conflicts and proceed with generation
  const resolveConflicts = useCallback(async (resolution: ConflictResolution, keepAccommodations: boolean) => {
    setConflictInfo(null);
    let generationStructure = structure; // track the structure to generate with

    if (resolution === 'skip') {
      // Skip conflicting days — filter structure to only non-conflicting days
      if (structure && conflictInfo) {
        const conflictDates = new Set(conflictInfo.daysWithActivities.map(d => d.date));
        const filteredStructure: AiTripPlan = {
          ...structure,
          days: (structure.days || []).filter(d => !conflictDates.has(d.date)),
        };
        if (filteredStructure.days.length === 0) {
          setError('Alle Tage haben bereits Aktivitäten — nichts zu generieren');
          setPhase('structure_overview');
          return;
        }
        setStructure(filteredStructure);
        generationStructure = filteredStructure; // use filtered version directly
      }
    } else if (resolution === 'overwrite' && tripId && structure && conflictInfo) {
      // K4+K8: Actually delete existing activities on conflicting days before generating
      try {
        const { getActivitiesForTrip, getDays: getDaysForTrip, deleteActivity } = await import('../api/itineraries');
        const [allActivities, allDays] = await Promise.all([getActivitiesForTrip(tripId), getDaysForTrip(tripId)]);
        const dayDateMap = new Map(allDays.map(d => [d.id, d.date]));
        const conflictDates = new Set(conflictInfo.daysWithActivities.map(d => d.date));
        for (const act of allActivities) {
          const actDate = dayDateMap.get(act.day_id);
          if (actDate && conflictDates.has(actDate)) {
            // K8: keepAccommodations — skip hotel activities if user wants to keep them
            if (keepAccommodations && act.category === 'hotel') continue;
            await deleteActivity(act.id);
          }
        }
        // Refresh existing data in context
        const remainingActivities = contextRef.current.existingData?.activities?.filter(a =>
          !a.date || !conflictDates.has(a.date) || (keepAccommodations && a.category === 'hotel')
        );
        contextRef.current.existingData = {
          ...contextRef.current.existingData,
          activities: remainingActivities || [],
        };
      } catch (e) {
        console.error('Failed to delete existing activities for overwrite:', e);
      }
    }
    // 'merge' uses executePlan's dedup (keeps both, skips duplicates)
    // Pass generationStructure directly to avoid stale closure on structure state
    startGeneration(generationStructure || undefined);
  }, [structure, conflictInfo, startGeneration, tripId]);

  // Legacy generatePlan — generates structure + activities in one go (for backward compat)
  const generatePlan = useCallback(async () => {
    await generateStructure();
    // After structure is done, the UI will show structure_overview
    // User picks granularity from there
  }, [generateStructure]);

  const confirmPlan = useCallback(async (skipConflictCheck = false, overridePlan?: AiTripPlan) => {
    const activePlan = overridePlan || plan;
    if (!activePlan) return;

    // Check for conflicts before executing (enhance mode only)
    if (!skipConflictCheck && mode === 'enhance' && tripId) {
      try {
        const existingActivities = await getActivitiesForTrip(tripId);
        const existingTitles = new Set(existingActivities.map(a => a.title.toLowerCase()));
        const conflicting = activePlan.days?.flatMap(d => d.activities || [])
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
        activePlan,
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
      logError(e, { component: 'useAiPlanner', context: { action: 'executePlan', status: e?.status, detail: e?.message } });
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

      // K1+K14: Include conversation history + current plan so AI has full context
      const conversationHistory: AiMessage[] = trimMessages(messages).map(m => ({
        role: m.role,
        content: m.role === 'user' && m.senderName
          ? `[${m.senderName}]: ${m.content}`
          : m.content,
      }));

      // Add the current plan as context
      const currentPlanJson = plan ? JSON.stringify(plan, null, 2) : '';
      if (currentPlanJson) {
        conversationHistory.push({
          role: 'assistant',
          content: `[Aktueller Plan als JSON]:\n${currentPlanJson}`,
        });
      }

      conversationHistory.push({
        role: 'user',
        content: `Passe den Reiseplan an basierend auf folgendem Feedback: "${feedback}". Antworte NUR mit dem vollständigen, angepassten JSON-Plan.`,
      });
      // Use legacy full plan prompt for adjustments
      const response = await sendAiMessage('plan_generation_full', conversationHistory, planContext);

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
      setMessages(prev => [...prev, summaryMsg]);
      debouncedSave('plan_review', metadata, parsed);
      setPhase('plan_review');
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'adjustPlan', status: e?.status, detail: e?.message } });
      console.error('Plan adjustment failed:', e.message);
      setError('Anpassung fehlgeschlagen – bitte versuche es erneut');
      setPhase('plan_review');
    }
  }, [messages, sending, userId, metadata, plan, debouncedSave]);

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
    setConflictInfo(null);
    setRestored(false);
    setCreditsBalance(null);
    setEstimatedSeconds(null);
    setActiveJobId(null);
    setBatchProgress(null);
    setWebSearching(false);
    setTypingUsers([]);
    setLockUserName(null);
    prevCreditsRef.current = null;
    tripMemoryRef.current = undefined;
    if (pollingRef.current) clearInterval(pollingRef.current);

    // H4: Release processing lock and delete saved conversation — but keep trip memory
    // Trip memory contains valuable info from past conversations, don't destroy it on reset
    if (tripId) {
      releaseProcessingLock(tripId).catch(() => {});
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
        content: 'Erstelle eine Packliste für diese Reise als JSON.',
      };
      const response = await sendAiMessage('agent_packing', [agentMsg], contextRef.current);

      if (response.credits_remaining !== undefined) {
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
        onCreditsUpdate?.(response.credits_remaining);
      }

      // Parse JSON from response (with repair for truncated responses)
      const parsed = safeParseAgentJson<{ items: Array<{ name: string; category: string; quantity: number; assigned_to?: string | null }> }>(
        response.content, 'generatePackingList'
      );

      if (!parsed.items?.length) throw new Error('Keine Items erhalten');

      // Validate categories against DB constraint + assigned_to against known collaborators
      const validCategories = new Set<string>(PACKING_CATEGORIES);
      const validCollabIds = new Set(contextRef.current.collaborators?.map(c => c.id) || []);
      const validItems = parsed.items.map(item => ({
        ...item,
        category: validCategories.has(item.category) ? item.category : 'Sonstiges',
        assigned_to: item.assigned_to && validCollabIds.has(item.assigned_to) ? item.assigned_to : null,
      }));

      // H1: Add items to existing packing list with dedup
      const { getPackingLists, getPackingItems: getExistingItems, createPackingList: createList, createPackingItems: createItems } = await import('../api/packing');
      const existingLists = await getPackingLists(tripId);
      const list = existingLists.length > 0 ? existingLists[0] : await createList(tripId, 'Packliste');

      // Filter out items that already exist (by name, case-insensitive)
      const existingItems = existingLists.length > 0 ? await getExistingItems(list.id) : [];
      const existingNames = new Set(existingItems.map(i => i.name.toLowerCase()));
      const newItems = validItems.filter(item => !existingNames.has(item.name.toLowerCase()));
      if (newItems.length > 0) {
        await createItems(list.id, newItems);
      }

      // K11: Clear agent_action after successful execution + force-save to prevent stale DB state
      const clearedMeta = metadata ? { ...metadata, agent_action: null } : null;
      setMetadata(clearedMeta);
      debouncedSave('conversing', clearedMeta, null);

      const successMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: newItems.length > 0
          ? `Packliste erstellt mit **${newItems.length} Items** in ${[...new Set(newItems.map(i => i.category))].length} Kategorien.${validItems.length > newItems.length ? ` (${validItems.length - newItems.length} Duplikate übersprungen)` : ''} Schau im Packlisten-Tab nach!`
          : 'Alle vorgeschlagenen Items sind bereits in der Packliste vorhanden.',
        timestamp: Date.now(),
        creditsAfter: response.credits_remaining,
        senderName: 'Fable',
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generatePackingList', status: e?.status, detail: e?.message } });
      setError(e.message || 'Packliste konnte nicht erstellt werden');
    } finally {
      setSending(false);
    }
  }, [tripId, sending, onCreditsUpdate, metadata, debouncedSave]);

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

      // Parse JSON from response (with repair for truncated responses)
      const parsed = safeParseAgentJson<{ activities: Array<{ date: string; title: string; description: string | null; category: string; start_time: string | null; end_time: string | null; location_name: string | null; location_lat: number | null; location_lng: number | null; location_address: string | null; cost: number | null; sort_order: number; check_in_date: string | null; check_out_date: string | null; category_data: Record<string, any> }> }>(
        response.content, 'generateDayPlan'
      );

      if (!parsed.activities?.length) throw new Error('Keine Aktivitäten erhalten');

      const targetDate = parsed.activities[0].date;
      if (!targetDate) throw new Error('Kein Datum in AI-Antwort');

      // Find or create the day for the target date
      const { getDays, createDay } = await import('../api/itineraries');
      const { createActivities } = await import('../api/itineraries');
      const days = await getDays(tripId);

      let dayId: string | undefined;
      const existingDay = days.find(d => d.date === targetDate);
      if (existingDay) {
        dayId = existingDay.id;
      } else {
        const newDay = await createDay(tripId, targetDate);
        dayId = newDay.id;
      }

      // H3: Dedup — filter out activities that already exist for this day
      const existingTitlesForDay = new Set<string>();
      if (dayId && existingDay) {
        const { getActivitiesForTrip: getTripsActivities } = await import('../api/itineraries');
        const existingActivities = await getTripsActivities(tripId);
        for (const a of existingActivities) {
          if (a.day_id === dayId) {
            existingTitlesForDay.add(a.title.toLowerCase());
          }
        }
      }

      const newActivities = parsed.activities.filter(a => !existingTitlesForDay.has(a.title.toLowerCase()));

      // Create activities
      if (newActivities.length > 0) {
        const activitiesToCreate = newActivities.map((a, i) => ({
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
      }

      // K11: Clear agent_action after successful execution + force-save to prevent stale DB state
      const clearedDayMeta = metadata ? { ...metadata, agent_action: null } : null;
      setMetadata(clearedDayMeta);
      debouncedSave('conversing', clearedDayMeta, null);

      const skipped = parsed.activities.length - newActivities.length;
      const successMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: newActivities.length > 0
          ? `Tagesplan für **${targetDate}** erstellt mit **${newActivities.length} Aktivitäten**.${skipped > 0 ? ` (${skipped} Duplikate übersprungen)` : ''} Schau im Tagesplan nach!`
          : 'Alle vorgeschlagenen Aktivitäten existieren bereits für diesen Tag.',
        timestamp: Date.now(),
        creditsAfter: response.credits_remaining,
        senderName: 'Fable',
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateDayPlan', status: e?.status, detail: e?.message } });
      setError(e.message || 'Tagesplan konnte nicht erstellt werden');
    } finally {
      setSending(false);
    }
  }, [tripId, sending, messages, onCreditsUpdate, metadata, debouncedSave]);

  // Agent: Generate budget categories
  const generateBudgetCategories = useCallback(async () => {
    if (!tripId || sending) return;
    setSending(true);
    setError(null);

    try {
      const agentMsg: AiMessage = {
        role: 'user',
        content: 'Erstelle Budget-Kategorien für diese Reise als JSON.',
      };
      const response = await sendAiMessage('agent_budget', [agentMsg], contextRef.current);

      if (response.credits_remaining !== undefined) {
        prevCreditsRef.current = response.credits_remaining;
        setCreditsBalance(response.credits_remaining);
        onCreditsUpdate?.(response.credits_remaining);
      }

      // Parse JSON from response (with repair for truncated responses)
      const parsed = safeParseAgentJson<{ categories: Array<{ name: string; color: string; budget_limit: number }> }>(
        response.content, 'generateBudgetCategories'
      );

      if (!parsed.categories?.length) throw new Error('Keine Kategorien erhalten');

      // H2: Dedup — filter out budget categories that already exist
      const { getBudgetCategories: getExistingCats, createBudgetCategory } = await import('../api/budgets');
      const existingCats = await getExistingCats(tripId);
      const existingCatNames = new Set(existingCats.map(c => c.name.toLowerCase()));
      const newCategories = parsed.categories.filter(cat => !existingCatNames.has(cat.name.toLowerCase()));

      for (const cat of newCategories) {
        await createBudgetCategory(tripId, cat.name, cat.color, cat.budget_limit);
      }

      // K11: Clear agent_action after successful execution + force-save to prevent stale DB state
      const clearedBudgetMeta = metadata ? { ...metadata, agent_action: null } : null;
      setMetadata(clearedBudgetMeta);
      debouncedSave('conversing', clearedBudgetMeta, null);

      const totalBudget = newCategories.reduce((sum, c) => sum + (c.budget_limit || 0), 0);
      const currency = contextRef.current.currency || 'CHF';
      const skipped = parsed.categories.length - newCategories.length;
      const successMsg: AiChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: newCategories.length > 0
          ? `**${newCategories.length} Budget-Kategorien** erstellt (Total: ${totalBudget} ${currency}).${skipped > 0 ? ` (${skipped} Duplikate übersprungen)` : ''} Schau im Budget-Tab nach!`
          : 'Alle vorgeschlagenen Budget-Kategorien existieren bereits.',
        timestamp: Date.now(),
        creditsAfter: response.credits_remaining,
        senderName: 'Fable',
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (e: any) {
      logError(e, { component: 'useAiPlanner', context: { action: 'generateBudgetCategories', status: e?.status, detail: e?.message } });
      setError(e.message || 'Budget-Kategorien konnten nicht erstellt werden');
    } finally {
      setSending(false);
    }
  }, [tripId, sending, onCreditsUpdate, metadata, debouncedSave]);

  // Retry the last failed action
  const retryLastAction = useCallback(() => {
    const failed = lastFailedActionRef.current;
    setError(null);
    lastFailedActionRef.current = null;

    if (!failed) return;

    switch (failed.type) {
      case 'greeting':
        // Reset state and restart conversation
        setMessages([]);
        setMetadata(null);
        setPhase('idle');
        // Small delay to allow state reset, then restart
        setTimeout(() => startConversation(), 100);
        break;
      case 'message':
        if (failed.text) {
          // Remove the failed user message (last user msg) before resending
          setMessages(prev => {
            const lastUserIdx = [...prev].reverse().findIndex(m => m.role === 'user');
            if (lastUserIdx >= 0) {
              const idx = prev.length - 1 - lastUserIdx;
              return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            }
            return prev;
          });
          // Small delay to allow state update, then resend
          setTimeout(() => sendMessage(failed.text!), 100);
        }
        break;
      case 'structure':
        generateStructure();
        break;
      case 'plan':
        checkConflictsAndGenerate();
        break;
    }
  }, [startConversation, sendMessage, generateStructure, checkConflictsAndGenerate]);

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
    batchProgress,
    contextReady,
    webSearching,
    typingUsers,
    lockUserName,
    fableDisabled,
    startConversation,
    sendMessage,
    generatePlan,
    generateStructure,
    checkConflictsAndGenerate,
    conflictInfo,
    resolveConflicts,
    confirmPlan,
    rejectPlan,
    showPreview,
    hidePreview,
    adjustPlan,
    dismissConflicts,
    confirmWithConflicts,
    retryLastAction,
    reset,
    saveConversationNow,
    generatePackingList,
    generateBudgetCategories,
    generateDayPlan,
    broadcastTyping,
  };
};
