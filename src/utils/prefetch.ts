import { Platform } from 'react-native';
import { getTrips, getTrip } from '../api/trips';
import { getDays, getActivitiesForTrip } from '../api/itineraries';
import { getBudgetCategories, getExpenses, getTripExpenseTotal } from '../api/budgets';
import { getDocuments, getActivityIdsWithDocuments } from '../api/documents';
import { getCollaborators } from '../api/invitations';
import { getStops } from '../api/stops';
import { getPackingLists, getPackingItems } from '../api/packing';
import { cacheDocuments } from './documentCache';

/**
 * Background prefetch: loads ALL trip data for ALL active trips into
 * cachedQuery (→ localStorage). Runs silently after app start.
 * Also warms the Service Worker cache for document/photo URLs.
 */
export async function prefetchAllData(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!navigator.onLine) return;

  try {
    // 1. Load all trips
    const trips = await getTrips(userId);

    // 2. Only prefetch non-completed trips (planning, upcoming, active)
    const activeTrips = trips.filter(t => t.status !== 'completed');

    // 3. For each active trip, prefetch ALL data in parallel (throttled)
    const BATCH_SIZE = 3;
    for (let i = 0; i < activeTrips.length; i += BATCH_SIZE) {
      const batch = activeTrips.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(trip => prefetchTrip(trip.id)));
    }
  } catch {
    // Silent — prefetch is best-effort
  }
}

async function prefetchTrip(tripId: string): Promise<void> {
  try {
    // These all go through cachedQuery → auto-persisted to localStorage
    const [, activities] = await Promise.all([
      getTrip(tripId),
      getActivitiesForTrip(tripId),
      getTripExpenseTotal(tripId).catch(() => 0),
      getCollaborators(tripId).catch(() => []),
      getStops(tripId).catch(() => []),
      getBudgetCategories(tripId).catch(() => []),
      getExpenses(tripId).catch(() => []),
      getDays(tripId).catch(() => []),
    ]);

    // Prefetch packing lists + items
    try {
      const lists = await getPackingLists(tripId);
      if (lists.length > 0) {
        await Promise.all(lists.map(l => getPackingItems(l.id).catch(() => [])));
      }
    } catch {
      // Silent
    }

    // Prefetch documents for all activities
    if (activities.length > 0) {
      const actIds = activities.map(a => a.id);
      const withDocs = await getActivityIdsWithDocuments(actIds).catch(() => new Set<string>());

      // Load document metadata for activities that have docs
      const docPromises = Array.from(withDocs).map(actId =>
        getDocuments(actId).catch(() => [])
      );
      const allDocs = await Promise.all(docPromises);

      // Cache document files for offline access (awaited, persistent cache)
      const allUrls = allDocs.flat().map(d => d.url).filter(Boolean);
      if (allUrls.length > 0) {
        await cacheDocuments(allUrls);
      }
    }

  } catch {
    // Silent
  }
}