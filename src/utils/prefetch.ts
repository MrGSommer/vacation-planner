import { Platform } from 'react-native';
import { getTrips, getTrip } from '../api/trips';
import { getDays, getActivitiesForTrip } from '../api/itineraries';
import { getTripExpenseTotal } from '../api/budgets';
import { getPhotos } from '../api/photos';
import { getDocuments, getActivityIdsWithDocuments } from '../api/documents';
import { getCollaborators } from '../api/invitations';
import { getStops } from '../api/stops';

/**
 * Background prefetch: loads all trip data into cachedQuery (→ localStorage).
 * Runs silently after app start — no UI blocking, no errors shown.
 * Also warms the Service Worker cache for document/photo URLs.
 */
export async function prefetchAllData(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (!navigator.onLine) return;

  try {
    // 1. Load all trips
    const trips = await getTrips(userId);

    // 2. For each trip, prefetch detail data in parallel (throttled)
    const BATCH_SIZE = 3;
    for (let i = 0; i < trips.length; i += BATCH_SIZE) {
      const batch = trips.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(trip => prefetchTrip(trip.id)));
    }
  } catch {
    // Silent — prefetch is best-effort
  }
}

async function prefetchTrip(tripId: string): Promise<void> {
  try {
    // These all go through cachedQuery → auto-persisted to localStorage
    const [, activities, , photos] = await Promise.all([
      getTrip(tripId),
      getActivitiesForTrip(tripId),
      getTripExpenseTotal(tripId).catch(() => 0),
      getPhotos(tripId).catch(() => []),
      getCollaborators(tripId).catch(() => []),
      getStops(tripId).catch(() => []),
    ]);

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

    // Prefetch itinerary days
    await getDays(tripId).catch(() => []);
  } catch {
    // Silent
  }
}

/**
 * Trigger a fetch so the Service Worker caches the response.
 * Uses a low-priority, no-cors request to avoid blocking.
 */
function warmSwCache(url: string | null): void {
  if (!url) return;
  try {
    // Fire-and-forget — SW intercepts and caches
    fetch(url, { mode: 'no-cors', priority: 'low' } as any).catch(() => {});
  } catch {
    // ignore
  }
}
