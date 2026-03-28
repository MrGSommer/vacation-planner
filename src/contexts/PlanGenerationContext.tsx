import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getActiveJob, getPlanJobStatus, cancelPlanJob, PlanJob, PlanJobProgress } from '../api/aiPlanJobs';
import { sendAiMessage, AiMessage, AiContext } from '../api/aiChat';
import { parsePlanJson, AiTripPlan, executePlan } from '../services/ai/planExecutor';
import { useAuthContext } from './AuthContext';
import { invalidateCache } from '../utils/queryCache';
import { logError } from '../services/errorLogger';

interface PlanGenerationState {
  activeJobId: string | null;
  tripId: string | null;
  progress: PlanJobProgress | null;
  isGenerating: boolean;
  destination: string | null;
  error: string | null;
  // Client-side generation tracking
  clientGenerating: boolean;
  clientProgress: { current: number; total: number } | null;
}

interface ClientGenerationParams {
  structure: AiTripPlan;
  context: AiContext;
  tripId: string;
  userId: string;
  destination: string;
}

interface PlanGenerationContextValue extends PlanGenerationState {
  startTracking: (jobId: string, destination?: string) => void;
  cancelGeneration: () => Promise<void>;
  dismissError: () => void;
  dismissCompleted: () => void;
  completed: boolean;
  // Client-side generation
  startClientGeneration: (params: ClientGenerationParams) => void;
  cancelClientGeneration: () => void;
}

const PlanGenerationContext = createContext<PlanGenerationContextValue | null>(null);

export const usePlanGeneration = () => {
  const ctx = useContext(PlanGenerationContext);
  if (!ctx) throw new Error('usePlanGeneration must be used within PlanGenerationProvider');
  return ctx;
};

// Merge structure + activities into a full plan
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

const STUCK_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const COMPLETED_DISMISS_MS = 15_000;
const CLIENT_BATCH_SIZE = 3;

export const PlanGenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const [state, setState] = useState<PlanGenerationState>({
    activeJobId: null,
    tripId: null,
    progress: null,
    isGenerating: false,
    destination: null,
    error: null,
    clientGenerating: false,
    clientProgress: null,
  });
  const [completed, setCompleted] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientAbortRef = useRef(false);
  // Stuck-job detection refs
  const lastProgressRef = useRef<{ day: number; timestamp: number } | null>(null);

  // On mount: check for existing active job
  useEffect(() => {
    if (!user?.id) return;
    getActiveJob(user.id).then(job => {
      if (job) {
        // Stuck-job detection on mount: if job is >10min old, cancel it
        const jobAge = Date.now() - new Date(job.created_at).getTime();
        if (jobAge > STUCK_JOB_TIMEOUT_MS) {
          cancelPlanJob(job.id).catch(() => {});
          return;
        }
        setState(prev => ({
          ...prev,
          activeJobId: job.id,
          tripId: job.trip_id || job.progress?.trip_id || null,
          progress: job.progress || null,
          isGenerating: true,
          destination: job.context?.destination || null,
          error: null,
        }));
      }
    }).catch(() => {});
  }, [user?.id]);

  // Polling with stuck-job detection
  useEffect(() => {
    if (!state.activeJobId || !state.isGenerating || state.clientGenerating) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      lastProgressRef.current = null;
      return;
    }

    const poll = async () => {
      try {
        const job = await getPlanJobStatus(state.activeJobId!);
        if (job.status === 'completed') {
          lastProgressRef.current = null;
          setState(prev => ({
            ...prev,
            progress: job.progress,
            tripId: job.trip_id || job.progress?.trip_id || prev.tripId,
            isGenerating: false,
          }));
          setCompleted(true);
          completedTimerRef.current = setTimeout(() => {
            setCompleted(false);
            setState(prev => ({ ...prev, activeJobId: null, progress: null }));
          }, COMPLETED_DISMISS_MS);
        } else if (job.status === 'failed') {
          lastProgressRef.current = null;
          setState(prev => ({
            ...prev,
            isGenerating: false,
            error: job.error || 'Plan-Generierung fehlgeschlagen',
            activeJobId: null,
            progress: null,
          }));
        } else if (job.status === 'cancelled') {
          lastProgressRef.current = null;
          setState(prev => ({
            ...prev,
            isGenerating: false,
            activeJobId: null,
            progress: null,
          }));
        } else {
          // Still generating — update progress + stuck detection
          const currentDay = job.progress?.current_day ?? 0;
          const now = Date.now();

          if (lastProgressRef.current && lastProgressRef.current.day === currentDay) {
            // Progress hasn't changed — check if stuck
            const stale = now - lastProgressRef.current.timestamp;
            const jobAge = now - new Date(job.created_at).getTime();
            if (stale > STUCK_JOB_TIMEOUT_MS && jobAge > STUCK_JOB_TIMEOUT_MS) {
              // Mark as stuck
              cancelPlanJob(state.activeJobId!).catch(() => {});
              lastProgressRef.current = null;
              setState(prev => ({
                ...prev,
                isGenerating: false,
                error: 'Generierung hängt — bitte erneut versuchen',
                activeJobId: null,
                progress: null,
              }));
              return;
            }
          } else {
            // Progress advanced — update tracker
            lastProgressRef.current = { day: currentDay, timestamp: now };
          }

          setState(prev => ({
            ...prev,
            progress: job.progress,
            tripId: job.trip_id || job.progress?.trip_id || prev.tripId,
          }));
        }
      } catch {
        // Ignore polling errors
      }
    };

    poll(); // Immediate first poll
    pollingRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [state.activeJobId, state.isGenerating, state.clientGenerating]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
    };
  }, []);

  const startTracking = useCallback((jobId: string, destination?: string) => {
    // Clear any pending completed-dismiss timer from a prior run
    if (completedTimerRef.current) {
      clearTimeout(completedTimerRef.current);
      completedTimerRef.current = null;
    }
    setCompleted(false);
    setState(prev => ({
      ...prev,
      activeJobId: jobId,
      tripId: null,
      progress: null,
      isGenerating: true,
      destination: destination || null,
      error: null,
    }));
  }, []);

  // Client-side generation: runs tag-by-tag in the context (survives modal close)
  const startClientGeneration = useCallback((params: ClientGenerationParams) => {
    const { structure, context, tripId, userId, destination } = params;
    const dayDates = (structure.days || []).map(d => d.date);
    const totalDays = dayDates.length;

    clientAbortRef.current = false;
    // Clear any pending completed-dismiss timer from a prior run
    if (completedTimerRef.current) {
      clearTimeout(completedTimerRef.current);
      completedTimerRef.current = null;
    }
    setCompleted(false);
    setState(prev => ({
      ...prev,
      activeJobId: null,
      tripId,
      isGenerating: true,
      clientGenerating: true,
      clientProgress: { current: 0, total: totalDays },
      destination: destination || null,
      error: null,
      progress: { phase: 'activities', current_day: 0, total_days: totalDays, trip_id: tripId },
    }));

    // Run the generation loop asynchronously
    (async () => {
      try {
        const batches: string[][] = [];
        for (let i = 0; i < dayDates.length; i += CLIENT_BATCH_SIZE) {
          batches.push(dayDates.slice(i, i + CLIENT_BATCH_SIZE));
        }

        let allActivities: { days: Array<{ date: string; activities: any[] }> } = { days: [] };

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          if (clientAbortRef.current) break;

          const batchDates = batches[batchIdx];
          const completedDays = Math.min((batchIdx + 1) * CLIENT_BATCH_SIZE, totalDays);

          // Update progress before API call
          setState(prev => ({
            ...prev,
            clientProgress: { current: batchIdx * CLIENT_BATCH_SIZE, total: totalDays },
            progress: { phase: 'activities', current_day: batchIdx * CLIENT_BATCH_SIZE, total_days: totalDays, trip_id: tripId },
          }));

          const batchMsg: AiMessage = {
            role: 'user',
            content: `Erstelle Aktivitäten für die Tage ${batchDates.join(', ')} als JSON.`,
          };
          // K16: Pass updated context with previously generated activities
          const batchContext = { ...context, dayDates: batchDates };
          if (allActivities.days.length > 0) {
            // Merge previously generated activities so AI avoids duplicates (works in both create and enhance mode)
            const prevActivities = allActivities.days.flatMap(d =>
              (d.activities || []).map((a: any) => ({
                title: a.title, category: a.category, date: d.date,
                start_time: a.start_time || null, end_time: a.end_time || null,
                cost: a.cost || null, description: a.description || null,
                location_name: a.location_name || null,
              }))
            );
            // Pass as previousBatchActivities (always used regardless of mode)
            batchContext.previousBatchActivities = prevActivities;
            // Also merge into existingData for enhance mode prompt
            batchContext.existingData = {
              ...batchContext.existingData,
              activities: [...(batchContext.existingData?.activities || []), ...prevActivities],
            };
          }
          const batchResponse = await sendAiMessage('plan_activities', [batchMsg], batchContext);
          if (clientAbortRef.current) break;
          const batch = parsePlanJson(batchResponse.content);

          // K17: Filter out days with dates not in the trip structure
          const allValidDates = new Set(dayDates);
          const validBatchDays = (batch.days || []).filter(day => {
            if (allValidDates.has(day.date)) return true;
            console.warn(`[PlanGeneration] Skipping activities for ${day.date} — not in trip structure (expected within: ${batchDates.join(', ')})`);
            return false;
          });

          allActivities.days.push(...validBatchDays);

          // Update progress after batch completes
          setState(prev => ({
            ...prev,
            clientProgress: { current: completedDays, total: totalDays },
            progress: { phase: 'activities', current_day: completedDays, total_days: totalDays, trip_id: tripId },
          }));
        }

        if (clientAbortRef.current) {
          setState(prev => ({
            ...prev,
            isGenerating: false,
            clientGenerating: false,
            clientProgress: null,
          }));
          return;
        }

        // Final abort check before DB write (race: user cancels between last batch and executePlan)
        if (clientAbortRef.current) {
          setState(prev => ({
            ...prev,
            isGenerating: false,
            clientGenerating: false,
            clientProgress: null,
          }));
          return;
        }

        // Execute full plan into DB (days, activities, stops, budget)
        const finalPlan = mergePlan(structure, allActivities);
        await executePlan(finalPlan, tripId, userId, context.currency || 'CHF');
        invalidateCache(`itinerary:${tripId}`);
        invalidateCache(`activities:${tripId}`);
        invalidateCache(`stops:${tripId}`);
        invalidateCache(`budgetCats:${tripId}`);
        invalidateCache(`expenses:${tripId}`);

        // Mark completed
        setState(prev => ({
          ...prev,
          isGenerating: false,
          clientGenerating: false,
          clientProgress: null,
          progress: { phase: 'done', current_day: totalDays, total_days: totalDays, trip_id: tripId },
        }));
        setCompleted(true);
        completedTimerRef.current = setTimeout(() => {
          setCompleted(false);
          setState(prev => ({ ...prev, progress: null }));
        }, COMPLETED_DISMISS_MS);
      } catch (e: any) {
        logError(e, { component: 'PlanGenerationContext', context: { action: 'clientGeneration' } });
        setState(prev => ({
          ...prev,
          isGenerating: false,
          clientGenerating: false,
          clientProgress: null,
          error: e.message || 'Plan-Generierung fehlgeschlagen',
        }));
      }
    })();
  }, []);

  const cancelClientGeneration = useCallback(() => {
    clientAbortRef.current = true;
    setState(prev => ({
      ...prev,
      isGenerating: false,
      clientGenerating: false,
      clientProgress: null,
    }));
  }, []);

  const cancelGeneration = useCallback(async () => {
    // Cancel client-side generation if active
    if (state.clientGenerating) {
      cancelClientGeneration();
      return;
    }
    if (!state.activeJobId) return;
    try {
      await cancelPlanJob(state.activeJobId);
      setState(prev => ({
        ...prev,
        isGenerating: false,
        activeJobId: null,
        progress: null,
      }));
    } catch (e) {
      console.error('Failed to cancel job:', e);
    }
  }, [state.activeJobId, state.clientGenerating, cancelClientGeneration]);

  const dismissError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const dismissCompleted = useCallback(() => {
    setCompleted(false);
    setState(prev => ({ ...prev, activeJobId: null, progress: null }));
    if (completedTimerRef.current) {
      clearTimeout(completedTimerRef.current);
      completedTimerRef.current = null;
    }
  }, []);

  return (
    <PlanGenerationContext.Provider value={{
      ...state,
      completed,
      startTracking,
      cancelGeneration,
      dismissError,
      dismissCompleted,
      startClientGeneration,
      cancelClientGeneration,
    }}>
      {children}
    </PlanGenerationContext.Provider>
  );
};
