/**
 * Verify and adjust activity times based on real travel data from Google Routes API.
 * Fail-open: returns original activities on any error.
 */

import { haversineDistance, computeTravelTime } from './routes.ts';

type TravelMode = 'DRIVE' | 'TRANSIT' | 'WALK' | 'BICYCLE';

const TRANSPORT_MAP: Record<string, TravelMode> = {
  driving: 'DRIVE',
  transit: 'TRANSIT',
  walking: 'WALK',
  bicycling: 'BICYCLE',
};

const BUFFER_MINUTES = 10;
const MAX_END_MINUTES = 23 * 60; // 23:00

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface ActivityPair {
  indexA: number;
  indexB: number;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

export async function verifyAndAdjustDayActivities(
  activities: any[],
  transportMode: string,
): Promise<any[]> {
  try {
    if (!activities || activities.length < 2) return activities;

    const apiMode = TRANSPORT_MAP[transportMode] ?? 'DRIVE';

    // 1. Identify consecutive non-hotel pairs needing verification
    const pairs: ActivityPair[] = [];

    for (let i = 0; i < activities.length - 1; i++) {
      const a = activities[i];
      const b = activities[i + 1];

      // Skip hotels
      if (a.category === 'hotel' || b.category === 'hotel') continue;

      // Need coordinates (field names: location_lat/location_lng after Places enrichment)
      const aLat = a.location_lat ?? a.lat;
      const aLng = a.location_lng ?? a.lng;
      const bLat = b.location_lat ?? b.lat;
      const bLng = b.location_lng ?? b.lng;
      if (aLat == null || aLng == null || bLat == null || bLng == null) continue;

      // Skip same location
      if (a.location_name && b.location_name && a.location_name === b.location_name) continue;

      // Skip if very close
      const dist = haversineDistance(
        { lat: aLat, lng: aLng },
        { lat: bLat, lng: bLng },
      );
      if (dist < 200) continue;

      pairs.push({
        indexA: i,
        indexB: i + 1,
        origin: { lat: aLat, lng: aLng },
        destination: { lat: bLat, lng: bLng },
      });
    }

    if (pairs.length === 0) return activities;

    // 2. Batch API calls (max 3 parallel)
    const BATCH_SIZE = 3;
    const results: ({ duration_minutes: number; distance_meters: number } | null)[] = [];

    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((p) => computeTravelTime(p.origin, p.destination, apiMode)),
      );
      results.push(...batchResults);
    }

    // 3. Check gaps and shift if needed
    for (let r = 0; r < pairs.length; r++) {
      const travel = results[r];
      if (!travel) continue;

      const pair = pairs[r];
      const a = activities[pair.indexA];
      const b = activities[pair.indexB];

      if (!a.end_time || !b.start_time) continue;

      const aEnd = parseTime(a.end_time);
      const bStart = parseTime(b.start_time);
      const gap = bStart - aEnd;
      const needed = travel.duration_minutes + BUFFER_MINUTES;

      if (gap >= needed) continue;

      const deficit = needed - gap;
      console.log(
        `[verifyTravelTimes] Shifting activity "${b.title}" (+${deficit}min): ` +
        `travel ${travel.duration_minutes}min + ${BUFFER_MINUTES}min buffer, gap was ${gap}min`,
      );

      // Shift B and all following activities forward
      for (let j = pair.indexB; j < activities.length; j++) {
        const act = activities[j];
        if (!act.start_time || !act.end_time) continue;

        const newStart = Math.min(parseTime(act.start_time) + deficit, MAX_END_MINUTES);
        const duration = parseTime(act.end_time) - parseTime(act.start_time);
        const newEnd = Math.min(newStart + duration, MAX_END_MINUTES);

        act.start_time = formatTime(newStart);
        act.end_time = formatTime(newEnd);
      }
    }

    return activities;
  } catch (err) {
    console.warn('[verifyTravelTimes] Error, returning original activities:', err);
    return activities;
  }
}
