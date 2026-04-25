import { Platform } from 'react-native';
import { getTrips, getTrip } from '../api/trips';
import { getDays, getActivitiesForTrip } from '../api/itineraries';
import { getBudgetCategories, getExpenses, getTripExpenseTotal } from '../api/budgets';
import { getDocuments, getActivityIdsWithDocuments } from '../api/documents';
import { getCollaborators } from '../api/invitations';
import { getPackingLists, getPackingItems } from '../api/packing';
import { ActivityDocument } from '../types/database';
import { upsertDocumentMeta } from './documentStore';
import { syncTripDocuments, SyncResults } from './documentSync';

/**
 * Background prefetch: loads trip data for offline-enabled trips into
 * cachedQuery (→ localStorage), then syncs document blobs via documentSync.
 *
 * Document sync is atomic per-doc and resumable: a failed sync mid-run leaves
 * prior blobs intact, and the next call picks up where it left off.
 */
export async function prefetchAllData(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!navigator.onLine) return;

  try {
    const offlineIds = getOfflineTripIds();

    if (offlineIds.length > 0) {
      for (const tripId of offlineIds) {
        await prefetchTrip(tripId);
      }
    } else {
      // Legacy: prefetch all active trips (metadata only, no document blobs
      // without explicit offline-toggle to keep storage usage reasonable)
      const trips = await getTrips(userId);
      const activeTrips = trips.filter(t => t.status !== 'completed');
      const BATCH_SIZE = 3;
      for (let i = 0; i < activeTrips.length; i += BATCH_SIZE) {
        const batch = activeTrips.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(trip => prefetchTrip(trip.id, undefined, { metadataOnly: true })));
      }
    }
  } catch {
    // Silent — prefetch is best-effort
  }
}

function getOfflineTripIds(): string[] {
  try {
    const raw = localStorage.getItem('wayfable_offline_trips');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface PrefetchOptions {
  /** Skip document blob sync — only warm the data caches. */
  metadataOnly?: boolean;
  /** AbortController signal (cancel on toggle-off / unmount). */
  abortSignal?: AbortSignal;
}

export async function prefetchTrip(
  tripId: string,
  onProgress?: (percent: number) => void,
  opts: PrefetchOptions = {},
): Promise<{ success: boolean; sync?: SyncResults }> {
  try {
    onProgress?.(5);

    // Step 1: Trip data (10%)
    const [, activities] = await Promise.all([
      getTrip(tripId),
      getActivitiesForTrip(tripId),
      getTripExpenseTotal(tripId).catch(() => 0),
      getCollaborators(tripId).catch(() => []),
    ]);
    onProgress?.(20);

    // Step 2: Budget (30%)
    await Promise.all([
      getBudgetCategories(tripId).catch(() => []),
      getExpenses(tripId).catch(() => []),
    ]);
    onProgress?.(30);

    // Step 3: Days (40%) — used for priority computation below.
    // Priority = index of day sorted ascending by date (0 = first day of trip).
    const daysRaw = await getDays(tripId).catch(() => [] as Array<{ id: string; date: string }>);
    const days = [...daysRaw].sort((a, b) => a.date.localeCompare(b.date));
    onProgress?.(40);

    // Step 4: Packing (50%)
    try {
      const lists = await getPackingLists(tripId);
      if (lists.length > 0) {
        await Promise.all(lists.map(l => getPackingItems(l.id).catch(() => [])));
      }
    } catch {
      // Silent
    }
    onProgress?.(50);

    if (opts.metadataOnly) {
      onProgress?.(100);
      return { success: true };
    }

    // Step 5: Document metadata (60%)
    let allDocs: ActivityDocument[] = [];
    if (activities.length > 0) {
      const actIds = activities.map(a => a.id);
      const withDocs = await getActivityIdsWithDocuments(actIds).catch(() => new Set<string>());
      const docPromises = Array.from(withDocs).map(actId =>
        getDocuments(actId).catch(() => [])
      );
      const perActivity = await Promise.all(docPromises);
      allDocs = perActivity.flat();
    }
    onProgress?.(60);

    // Upsert metadata for every doc (marks new as 'pending', keeps synced ones).
    // Priority = day_number from the activity's day (earlier trip days = higher priority).
    if (allDocs.length > 0) {
      const dayIndex = new Map(days.map((d, i) => [d.id, i]));
      const activityToDay = new Map<string, number>();
      for (const a of activities as Array<{ id: string; day_id?: string | null }>) {
        if (!a.day_id) continue;
        const idx = dayIndex.get(a.day_id);
        if (idx !== undefined) activityToDay.set(a.id, idx);
      }

      for (const doc of allDocs) {
        const priority = activityToDay.get(doc.activity_id) ?? 999;
        await upsertDocumentMeta({
          id: doc.id,
          trip_id: doc.trip_id,
          activity_id: doc.activity_id,
          url: doc.url,
          filename: doc.file_name,
          mime_type: doc.file_type,
          server_updated_at: Date.parse(doc.created_at) || 0,
          priority,
        });
      }
    }
    onProgress?.(70);

    // Step 6: Sync blobs via documentSync (60-100%).
    // Progress reporting maps 0..total → 70..100.
    const sync = await syncTripDocuments(tripId, {
      abortSignal: opts.abortSignal,
      onProgress: (done, total) => {
        if (total === 0) return;
        const pct = 70 + Math.round((done / total) * 30);
        onProgress?.(Math.min(pct, 100));
      },
    });

    onProgress?.(100);
    return { success: true, sync };
  } catch {
    return { success: false };
  }
}
