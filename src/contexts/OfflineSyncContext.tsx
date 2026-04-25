import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuthContext } from './AuthContext';
import { getTrips } from '../api/trips';
import { prefetchTrip } from '../utils/prefetch';
import { purgeTripCache } from '../utils/queryCache';
import { uncacheTripDocuments } from '../utils/documentCache';
import { logError } from '../services/errorLogger';

export interface OfflineTripState {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  progress: number;
}

interface OfflineSyncContextValue {
  offlineTrips: Map<string, OfflineTripState>;
  enableOffline: (tripId: string) => void;
  disableOffline: (tripId: string) => void;
  isOffline: (tripId: string) => boolean;
  getStatus: (tripId: string) => OfflineTripState;
}

const defaultState: OfflineTripState = { status: 'idle', progress: 0 };

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  offlineTrips: new Map(),
  enableOffline: () => {},
  disableOffline: () => {},
  isOffline: () => false,
  getStatus: () => defaultState,
});

export const useOfflineSync = () => useContext(OfflineSyncContext);

const STORAGE_KEY = 'wayfable_offline_trips';

function loadOfflineTripIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineTripIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export const OfflineSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (Platform.OS !== 'web') {
    return (
      <OfflineSyncContext.Provider value={{
        offlineTrips: new Map(),
        enableOffline: () => {},
        disableOffline: () => {},
        isOffline: () => false,
        getStatus: () => defaultState,
      }}>
        {children}
      </OfflineSyncContext.Provider>
    );
  }

  return <OfflineSyncProviderWeb>{children}</OfflineSyncProviderWeb>;
};

const OfflineSyncProviderWeb: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthContext();
  const [offlineTrips, setOfflineTrips] = useState<Map<string, OfflineTripState>>(new Map());
  const syncingRef = useRef<Set<string>>(new Set());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const updateTripState = useCallback((tripId: string, state: OfflineTripState) => {
    setOfflineTrips(prev => {
      const next = new Map(prev);
      next.set(tripId, state);
      return next;
    });
  }, []);

  // Request persistent storage once per session — the browser may grant this
  // (Chrome/Firefox desktop always grant for installed PWAs). iOS Safari is
  // known to ignore this, but calling is harmless. Re-requesting on every
  // app-open gives best-effort durability against eviction.
  useEffect(() => {
    (async () => {
      try {
        if (navigator.storage?.persist) {
          const persisted = await navigator.storage.persist();
          if (persisted) {
            // eslint-disable-next-line no-console
            console.log('[OfflineSync] persistent storage granted');
          }
        }
      } catch {
        // Silent — not critical
      }
    })();
  }, []);

  async function checkQuota(): Promise<{ ok: boolean; freeMB: number }> {
    if (!navigator.storage?.estimate) return { ok: true, freeMB: Infinity };
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const freeMB = (quota - usage) / (1024 * 1024);
      return { ok: freeMB >= 50, freeMB };
    } catch {
      return { ok: true, freeMB: Infinity };
    }
  }

  const syncTrip = useCallback(async (tripId: string) => {
    if (syncingRef.current.has(tripId)) return;
    syncingRef.current.add(tripId);

    // Fresh AbortController per sync (allows cancel on toggle-OFF)
    const prev = abortControllersRef.current.get(tripId);
    if (prev) prev.abort();
    const controller = new AbortController();
    abortControllersRef.current.set(tripId, controller);

    updateTripState(tripId, { status: 'syncing', progress: 0 });

    try {
      const quota = await checkQuota();
      if (!quota.ok) {
        logError(new Error(`Low storage: ${quota.freeMB.toFixed(1)}MB free`), {
          component: 'OfflineSyncContext',
          context: { action: 'lowQuota', tripId, freeMB: quota.freeMB },
        });
      }

      await prefetchTrip(
        tripId,
        (progress) => updateTripState(tripId, { status: 'syncing', progress }),
        { abortSignal: controller.signal },
      );
      if (controller.signal.aborted) return;
      updateTripState(tripId, { status: 'synced', progress: 100 });
    } catch (e) {
      if (controller.signal.aborted) return;
      logError(e, { component: 'OfflineSyncContext', context: { action: 'syncTrip', tripId } });
      updateTripState(tripId, { status: 'error', progress: 0 });
    } finally {
      syncingRef.current.delete(tripId);
      if (abortControllersRef.current.get(tripId) === controller) {
        abortControllersRef.current.delete(tripId);
      }
    }
  }, [updateTripState]);

  const enableOffline = useCallback((tripId: string) => {
    const ids = loadOfflineTripIds();
    if (!ids.includes(tripId)) {
      ids.push(tripId);
      saveOfflineTripIds(ids);
    }
    syncTrip(tripId);
  }, [syncTrip]);

  const disableOffline = useCallback(async (tripId: string) => {
    // 1. Cancel any in-flight sync for this trip
    const controller = abortControllersRef.current.get(tripId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(tripId);
    }
    syncingRef.current.delete(tripId);

    // 2. Remove from persisted list + UI state
    const ids = loadOfflineTripIds().filter(id => id !== tripId);
    saveOfflineTripIds(ids);
    setOfflineTrips(prev => {
      const next = new Map(prev);
      next.delete(tripId);
      return next;
    });

    // 3. Purge cached query data (activities, budget, etc.)
    purgeTripCache(tripId);

    // 4. Remove blobs + document metadata for this trip
    try {
      await uncacheTripDocuments(tripId);
    } catch (e) {
      logError(e, { component: 'OfflineSyncContext', context: { action: 'disableOffline.uncacheTripDocuments', tripId } });
    }
  }, []);

  const isOffline = useCallback((tripId: string) => offlineTrips.has(tripId), [offlineTrips]);

  const getStatus = useCallback((tripId: string): OfflineTripState => {
    return offlineTrips.get(tripId) || defaultState;
  }, [offlineTrips]);

  // On mount: restore offline trips + auto-cleanup completed/archived
  useEffect(() => {
    if (!user?.id) return;

    const init = async () => {
      const ids = loadOfflineTripIds();
      if (ids.length === 0) return;

      try {
        const allTrips = await getTrips(user.id);
        const tripMap = new Map(allTrips.map(t => [t.id, t]));
        const cleanedIds: string[] = [];

        for (const id of ids) {
          const trip = tripMap.get(id);
          if (!trip || trip.status === 'completed' || trip.status === 'archived') {
            purgeTripCache(id);
            await uncacheTripDocuments(id).catch(() => {});
          } else {
            cleanedIds.push(id);
          }
        }

        if (cleanedIds.length !== ids.length) {
          saveOfflineTripIds(cleanedIds);
        }

        const initial = new Map<string, OfflineTripState>();
        for (const id of cleanedIds) {
          initial.set(id, { status: 'syncing', progress: 0 });
        }
        setOfflineTrips(initial);

        // Re-sync sequentially in background — resumable, per-doc atomic
        for (const id of cleanedIds) {
          await syncTrip(id);
        }
      } catch (e) {
        logError(e, { component: 'OfflineSyncContext', context: { action: 'init' } });
        const initial = new Map<string, OfflineTripState>();
        for (const id of ids) {
          initial.set(id, { status: 'error', progress: 0 });
        }
        setOfflineTrips(initial);
      }
    };

    init();
  }, [user?.id, syncTrip]);

  // Re-sync when coming back online
  useEffect(() => {
    const handler = () => {
      const ids = loadOfflineTripIds();
      for (const id of ids) {
        syncTrip(id);
      }
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [syncTrip]);

  return (
    <OfflineSyncContext.Provider value={{ offlineTrips, enableOffline, disableOffline, isOffline, getStatus }}>
      {children}
    </OfflineSyncContext.Provider>
  );
};
