import { Platform } from 'react-native';
import { getTrips, getTrip } from '../api/trips';
import { getDays, getActivitiesForTrip } from '../api/itineraries';
import { getBudgetCategories, getExpenses, getTripExpenseTotal } from '../api/budgets';
import { getDocuments, getActivityIdsWithDocuments } from '../api/documents';
import { getCollaborators } from '../api/invitations';
import { getPackingLists, getPackingItems } from '../api/packing';
import { cacheDocument } from './documentCache';

/**
 * Background prefetch: loads trip data for offline-enabled trips into
 * cachedQuery (→ localStorage). Runs silently after app start.
 * Also warms the Service Worker cache for document/photo URLs.
 *
 * If no offline trips are configured, prefetches all active trips (legacy behavior).
 */
export async function prefetchAllData(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!navigator.onLine) return;

  try {
    // Check if user has explicit offline trips
    const offlineIds = getOfflineTripIds();

    if (offlineIds.length > 0) {
      // Only prefetch offline-enabled trips
      for (const tripId of offlineIds) {
        await prefetchTrip(tripId);
      }
    } else {
      // Legacy: prefetch all active trips
      const trips = await getTrips(userId);
      const activeTrips = trips.filter(t => t.status !== 'completed');
      const BATCH_SIZE = 3;
      for (let i = 0; i < activeTrips.length; i += BATCH_SIZE) {
        const batch = activeTrips.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(trip => prefetchTrip(trip.id)));
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

export async function prefetchTrip(
  tripId: string,
  onProgress?: (percent: number) => void,
): Promise<{ success: boolean }> {
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

    // Step 3: Days (40%)
    await getDays(tripId).catch(() => []);
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

    // Step 5: Document metadata (60%)
    let allUrls: string[] = [];
    if (activities.length > 0) {
      const actIds = activities.map(a => a.id);
      const withDocs = await getActivityIdsWithDocuments(actIds).catch(() => new Set<string>());
      const docPromises = Array.from(withDocs).map(actId =>
        getDocuments(actId).catch(() => [])
      );
      const allDocs = await Promise.all(docPromises);
      allUrls = allDocs.flat().map(d => d.url).filter(Boolean);
    }
    onProgress?.(60);

    // Step 6: Cache document files (60-100%)
    if (allUrls.length > 0) {
      const BATCH = 4;
      for (let i = 0; i < allUrls.length; i += BATCH) {
        const batch = allUrls.slice(i, i + BATCH);
        await Promise.all(batch.map(url => cacheDocument(url)));
        const docProgress = 60 + Math.round(((i + BATCH) / allUrls.length) * 40);
        onProgress?.(Math.min(docProgress, 100));
      }
    } else {
      onProgress?.(100);
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}
