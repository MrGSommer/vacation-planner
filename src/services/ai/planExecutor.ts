import { createTrip, updateTrip } from '../../api/trips';
import { createDay, createActivities, getActivitiesForTrip } from '../../api/itineraries';
import { searchPhotos, triggerDownload } from '../../api/unsplash';
import { createStop, getStops } from '../../api/stops';
import { createBudgetCategory, getBudgetCategories } from '../../api/budgets';
import { invalidateCache } from '../../utils/queryCache';
import { logError } from '../errorLogger';

export interface AiTripPlan {
  trip?: {
    name: string;
    destination: string;
    destination_lat: number;
    destination_lng: number;
    start_date: string;
    end_date: string;
    currency: string;
    notes: string | null;
  };
  stops: Array<{
    name: string;
    lat: number;
    lng: number;
    address: string | null;
    type: 'overnight' | 'waypoint';
    nights: number | null;
    arrival_date: string | null;
    departure_date: string | null;
    sort_order: number;
  }>;
  days: Array<{
    date: string;
    activities: Array<{
      title: string;
      description: string | null;
      category: string;
      start_time: string | null;
      end_time: string | null;
      location_name: string | null;
      location_lat: number | null;
      location_lng: number | null;
      location_address: string | null;
      cost: number | null;
      sort_order: number;
      check_in_date?: string | null;
      check_out_date?: string | null;
      category_data: Record<string, any>;
    }>;
  }>;
  budget_categories: Array<{
    name: string;
    color: string;
    budget_limit: number | null;
  }>;
}

const VALID_CATEGORIES = ['sightseeing', 'food', 'activity', 'transport', 'hotel', 'shopping', 'relaxation', 'stop', 'other'];

export type ProgressStep = 'structure' | 'trip' | 'days' | 'activities' | 'stops' | 'budget' | 'done';

export interface ExecutionResult {
  tripId: string;
  daysCreated: number;
  activitiesCreated: number;
  stopsCreated: number;
  budgetCategoriesCreated: number;
}

export const executePlan = async (
  plan: AiTripPlan,
  tripId: string | undefined,
  userId: string,
  currency: string,
  onProgress?: (step: ProgressStep) => void,
): Promise<ExecutionResult> => {
  let finalTripId = tripId || '';
  let daysCreated = 0;
  let activitiesCreated = 0;
  let stopsCreated = 0;
  let budgetCategoriesCreated = 0;

  // 1. Create trip if needed (create mode)
  if (plan.trip && !tripId) {
    onProgress?.('trip');
    const trip = await createTrip({
      owner_id: userId,
      name: plan.trip.name,
      destination: plan.trip.destination,
      destination_lat: plan.trip.destination_lat,
      destination_lng: plan.trip.destination_lng,
      cover_image_url: null,
      cover_image_attribution: null,
      start_date: plan.trip.start_date,
      end_date: plan.trip.end_date,
      status: 'planning',
      currency: plan.trip.currency || currency,
      notes: plan.trip.notes,
    });
    finalTripId = trip.id;
  }

  if (!finalTripId) {
    throw new Error('Keine Trip-ID vorhanden');
  }

  // Load existing data for duplicate detection (enhance mode)
  let existingActivityTitles = new Set<string>();
  let existingStopNames = new Set<string>();
  let existingBudgetNames = new Set<string>();

  if (tripId) {
    try {
      const [existingActivities, existingStops, existingBudget] = await Promise.all([
        getActivitiesForTrip(finalTripId),
        getStops(finalTripId),
        getBudgetCategories(finalTripId),
      ]);
      existingActivityTitles = new Set(existingActivities.map(a => a.title.toLowerCase()));
      existingStopNames = new Set(existingStops.map(s => s.name.toLowerCase()));
      existingBudgetNames = new Set(existingBudget.map(b => b.name.toLowerCase()));
    } catch {
      // If loading fails, proceed without duplicate check
    }
  }

  // 2. Create days and activities
  if (plan.days?.length > 0) {
    onProgress?.('days');
    for (const day of plan.days) {
      const createdDay = await createDay(finalTripId, day.date);
      daysCreated++;

      if (day.activities?.length > 0) {
        onProgress?.('activities');
        // Filter out activities that already exist (by title)
        const newActivities = day.activities.filter(
          act => !existingActivityTitles.has(act.title.toLowerCase()),
        );

        if (newActivities.length > 0) {
          const validActivities = newActivities.map((act, idx) => ({
            day_id: createdDay.id,
            trip_id: finalTripId,
            title: act.title,
            description: act.description || null,
            category: VALID_CATEGORIES.includes(act.category) ? act.category : 'other',
            start_time: act.start_time || null,
            end_time: act.end_time || null,
            location_name: act.location_name || null,
            location_lat: act.location_lat || null,
            location_lng: act.location_lng || null,
            location_address: act.location_address || null,
            cost: act.cost || null,
            currency,
            sort_order: act.sort_order ?? idx,
            check_in_date: (act.category === 'hotel' && act.check_in_date) ? act.check_in_date : null,
            check_out_date: (act.category === 'hotel' && act.check_out_date) ? act.check_out_date : null,
            category_data: act.category_data || {},
          }));

          const created = await createActivities(validActivities);
          activitiesCreated += created.length;
        }
      }
    }
  }

  // 3. Create stops (skip duplicates)
  if (plan.stops?.length > 0) {
    onProgress?.('stops');
    const newStops = plan.stops.filter(
      s => !existingStopNames.has(s.name.toLowerCase()),
    );
    for (const stop of newStops) {
      await createStop({
        trip_id: finalTripId,
        name: stop.name,
        place_id: null,
        address: stop.address || null,
        lat: stop.lat,
        lng: stop.lng,
        type: stop.type || 'waypoint',
        nights: stop.nights || null,
        arrival_date: stop.arrival_date || null,
        departure_date: stop.departure_date || null,
        sort_order: stop.sort_order,
        travel_duration_from_prev: null,
        travel_distance_from_prev: null,
      });
      stopsCreated++;
    }
  }

  // 4. Create budget categories (skip duplicates)
  if (plan.budget_categories?.length > 0) {
    onProgress?.('budget');
    const newBudgetCats = plan.budget_categories.filter(
      c => !existingBudgetNames.has(c.name.toLowerCase()),
    );
    for (const cat of newBudgetCats) {
      await createBudgetCategory(finalTripId, cat.name, cat.color, cat.budget_limit || null, 'group');
      budgetCategoriesCreated++;
    }
  }

  // Invalidate caches
  invalidateCache(`trip:${finalTripId}`);
  invalidateCache(`activities:${finalTripId}`);
  invalidateCache('trips:');

  onProgress?.('done');

  // Best-effort: Unsplash cover image for newly created trips
  if (plan.trip) {
    try {
      const photos = await searchPhotos(plan.trip.destination, 6);
      if (photos.length > 0) {
        const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 6))];
        await updateTrip(finalTripId, {
          cover_image_url: photo.urls.regular,
          cover_image_attribution: `${photo.user.name}|${photo.user.links.html}|${photo.links.html}`,
        });
        triggerDownload(photo);
      }
    } catch { /* best-effort */ }
  }

  return {
    tripId: finalTripId,
    daysCreated,
    activitiesCreated,
    stopsCreated,
    budgetCategoriesCreated,
  };
};

export const parsePlanJson = (content: string): AiTripPlan => {
  let cleaned = content.trim();

  // Strip markdown code fences if present
  if (cleaned.includes('```')) {
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1];
    }
  }

  // If it doesn't start with '{', try to extract JSON object from surrounding text
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart !== -1) {
      cleaned = cleaned.substring(jsonStart);
    }
  }

  // If it doesn't end with '}', trim trailing text
  if (!cleaned.endsWith('}')) {
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd !== -1) {
      cleaned = cleaned.substring(0, jsonEnd + 1);
    }
  }

  let plan: AiTripPlan;
  try {
    plan = JSON.parse(cleaned) as AiTripPlan;
  } catch (e) {
    // Truncation recovery: try to repair incomplete JSON
    const repaired = tryRepairTruncatedJson(cleaned);
    if (repaired) {
      try {
        plan = JSON.parse(repaired) as AiTripPlan;
        console.warn('parsePlanJson: recovered truncated JSON');
      } catch {
        console.error('parsePlanJson failed. Raw content:', content.substring(0, 500));
        logError(e, { component: 'planExecutor', context: { action: 'parsePlanJson' } });
        throw e;
      }
    } else {
      console.error('parsePlanJson failed. Raw content:', content.substring(0, 500));
      logError(e, { component: 'planExecutor', context: { action: 'parsePlanJson' } });
      throw e;
    }
  }

  // Basic validation
  if (!plan.days && !plan.stops && !plan.budget_categories) {
    throw new Error('Plan enthält keine verwertbaren Daten');
  }

  return plan;
};

function tryRepairTruncatedJson(json: string): string | null {
  // Count open/close brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  // If balanced, no repair needed (error is something else)
  if (openBraces === 0 && openBrackets === 0) return null;

  // If still in a string, close it
  let repaired = json;
  if (inString) {
    repaired += '"';
  }

  // Remove trailing comma or incomplete key-value
  repaired = repaired.replace(/,\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"?\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*("[^"]*)?$/, '');

  // Re-count after cleanup
  openBraces = 0;
  openBrackets = 0;
  inString = false;
  escaped = false;
  for (const ch of repaired) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  // Append missing closing brackets/braces
  for (let i = 0; i < openBrackets; i++) repaired += ']';
  for (let i = 0; i < openBraces; i++) repaired += '}';

  return repaired;
}
