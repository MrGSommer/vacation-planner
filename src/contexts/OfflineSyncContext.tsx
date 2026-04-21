import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuthContext } from './AuthContext';
import { getTrips } from '../api/trips';
import { prefetchTrip } from '../utils/prefetch';
import { purgeTripCache } from '../utils/queryCache';
import { uncacheTripDocuments } from '../utils/documentCache';
import { getDocuments, getActivityIdsWithDocuments } from '../api/documents';
import { getActivitiesForTrip } from '../api/itineraries';
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
  // Only active on web
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

  const updateTripState = useCallback((tripId: string, state: OfflineTripState) => {
    setOfflineTrips(prev => {
      const next = new Map(prev);
      next.set(tripId, state);
      return next;
    });
  }, []);

  const syncTrip = useCallback(async (tripId: string) => {
    if (syncingRef.current.has(tripId)) return;
    syncingRef.current.add(tripId);
    updateTripState(tripId, { status: 'syncing', progress: 0 });

    try {
      await prefetchTrip(tripId, (progress) => {
        updateTripState(tripId, { status: 'syncing', progress });
      });
      updateTripState(tripId, { status: 'synced', progress: 100 });
    } catch (e) {
      logError(e, { component: 'OfflineSyncContext', context: { action: 'syncTrip', tripId } });
      updateTripState(tripId, { status: 'error', progress: 0 });
    } finally {
      syncingRef.current.delete(tripId);
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
    const ids = loadOfflineTripIds().filter(id => id !== tripId);
    saveOfflineTripIds(ids);
    setOfflineTrips(prev => {
      const next = new Map(prev);
      next.delete(tripId);
      return next;
    });

    // Purge cached data
    purgeTripCache(tripId);

    // Purge cached documents
    try {
      const activities = await getActivitiesForTrip(tripId);
      const actIds = activities.map(a => a.id);
      const withDocs = await getActivityIdsWithDocuments(actIds).catch(() => new Set<string>());
      const docPromises = Array.from(withDocs).map(actId => getDocuments(actId).catch(() => []));
      const allDocs = await Promise.all(docPromises);
      const urls = allDocs.flat().map(d => d.url).filter(Boolean);
      if (urls.length > 0) {
        await uncacheTripDocuments(urls);
      }
    } catch {
      // Best-effort cleanup
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

      // Auto-cleanup: remove completed/archived trips
      try {
        const allTrips = await getTrips(user.id);
        const tripMap = new Map(allTrips.map(t => [t.id, t]));
        const cleanedIds: string[] = [];

        for (const id of ids) {
          const trip = tripMap.get(id);
          if (!trip || trip.status === 'completed' || trip.status === 'archived') {
            // Purge cache for removed trips
            purgeTripCache(id);
          } else {
            cleanedIds.push(id);
          }
        }

        if (cleanedIds.length !== ids.length) {
          saveOfflineTripIds(cleanedIds);
        }

        // Initialize state + re-sync
        const initial = new Map<string, OfflineTripState>();
        for (const id of cleanedIds) {
          initial.set(id, { status: 'syncing', progress: 0 });
        }
        setOfflineTrips(initial);

        // Re-sync sequentially in background
        for (const id of cleanedIds) {
          await syncTrip(id);
        }
      } catch (e) {
        logError(e, { component: 'OfflineSyncContext', context: { action: 'init' } });
        // Still mark them as having unknown state
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
