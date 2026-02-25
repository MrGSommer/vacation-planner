import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getActiveJob, getPlanJobStatus, cancelPlanJob, PlanJob, PlanJobProgress } from '../api/aiPlanJobs';
import { useAuthContext } from './AuthContext';

interface PlanGenerationState {
  activeJobId: string | null;
  tripId: string | null;
  progress: PlanJobProgress | null;
  isGenerating: boolean;
  destination: string | null;
  error: string | null;
}

interface PlanGenerationContextValue extends PlanGenerationState {
  startTracking: (jobId: string, destination?: string) => void;
  cancelGeneration: () => Promise<void>;
  dismissError: () => void;
  dismissCompleted: () => void;
  completed: boolean;
}

const PlanGenerationContext = createContext<PlanGenerationContextValue | null>(null);

export const usePlanGeneration = () => {
  const ctx = useContext(PlanGenerationContext);
  if (!ctx) throw new Error('usePlanGeneration must be used within PlanGenerationProvider');
  return ctx;
};

export const PlanGenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const [state, setState] = useState<PlanGenerationState>({
    activeJobId: null,
    tripId: null,
    progress: null,
    isGenerating: false,
    destination: null,
    error: null,
  });
  const [completed, setCompleted] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: check for existing active job
  useEffect(() => {
    if (!user?.id) return;
    getActiveJob(user.id).then(job => {
      if (job) {
        setState({
          activeJobId: job.id,
          tripId: job.trip_id || job.progress?.trip_id || null,
          progress: job.progress || null,
          isGenerating: true,
          destination: job.context?.destination || null,
          error: null,
        });
      }
    }).catch(() => {});
  }, [user?.id]);

  // Polling
  useEffect(() => {
    if (!state.activeJobId || !state.isGenerating) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const job = await getPlanJobStatus(state.activeJobId!);
        if (job.status === 'completed') {
          setState(prev => ({
            ...prev,
            progress: job.progress,
            tripId: job.trip_id || job.progress?.trip_id || prev.tripId,
            isGenerating: false,
          }));
          setCompleted(true);
          // Auto-dismiss after 5s
          completedTimerRef.current = setTimeout(() => {
            setCompleted(false);
            setState(prev => ({ ...prev, activeJobId: null, progress: null }));
          }, 5000);
        } else if (job.status === 'failed') {
          setState(prev => ({
            ...prev,
            isGenerating: false,
            error: job.error || 'Plan-Generierung fehlgeschlagen',
            activeJobId: null,
            progress: null,
          }));
        } else if (job.status === 'cancelled') {
          setState(prev => ({
            ...prev,
            isGenerating: false,
            activeJobId: null,
            progress: null,
          }));
        } else {
          // Still generating — update progress
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
  }, [state.activeJobId, state.isGenerating]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
    };
  }, []);

  const startTracking = useCallback((jobId: string, destination?: string) => {
    setCompleted(false);
    setState({
      activeJobId: jobId,
      tripId: null,
      progress: null,
      isGenerating: true,
      destination: destination || null,
      error: null,
    });
  }, []);

  const cancelGeneration = useCallback(async () => {
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
  }, [state.activeJobId]);

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
    }}>
      {children}
    </PlanGenerationContext.Provider>
  );
};
