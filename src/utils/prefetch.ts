import { Platform } from 'react-native';
import { getTrips, getTrip } from '../api/trips';
import { getDays, getActivitiesForTrip } from '../api/itineraries';
import { getBudgetCategories, getExpenses, getTripExpenseTotal } from '../api/budgets';
import { getPhotos } from '../api/photos';
import { getDocuments, getActivityIdsWithDocuments } from '../api/documents';
import { getCollaborators } from '../api/invitations';
import { getStops } from '../api/stops';
import { getPackingLists, getPackingItems } from '../api/packing';

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
    const [, activities, , photos, , , budgetCats] = await Promise.all([
      getTrip(tripId),
      getActivitiesForTrip(tripId),
      getTripExpenseTotal(tripId).catch(() => 0),
      getPhotos(tripId).catch(() => []),
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

      // Warm SW cache: fetch document URLs so Service Worker caches them
      for (const docs of allDocs) {
        for (const doc of docs) {
          warmSwCache(doc.url);
        }
      }
    }

    // Warm SW cache for photo thumbnails
    for (const photo of photos) {
      warmSwCache(photo.thumbnail_url || photo.url);
    }
  } catch {
    // Silent
  }
}

/**
 * Trigger a fetch so the Service Worker intercepts and caches the response.
 * Uses cors mode so the SW gets a proper response (not opaque) with response.ok=true.
 */
function warmSwCache(url: string | null): void {
  if (!url) return;
  try {
    fetch(url, { priority: 'low' } as any).catch(() => {});
  } catch {
    // ignore
  }
}
