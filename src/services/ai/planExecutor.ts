import { createTrip, updateTrip } from '../../api/trips';
import { createDay, createActivities, getActivitiesForTrip } from '../../api/itineraries';
import { searchPhotos, triggerDownload } from '../../api/unsplash';
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
  /** @deprecated — stops are now created as activities (category='hotel'/'stop') within days */
  stops?: Array<{
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

export type ProgressStep = 'structure' | 'trip' | 'days' | 'activities' | 'budget' | 'done';

export interface ExecutionResult {
  tripId: string;
  daysCreated: number;
  activitiesCreated: number;
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
      theme_color: null,
      start_date: plan.trip.start_date,
      end_date: plan.trip.end_date,
      status: 'planning',
      currency: plan.trip.currency || currency,
      notes: plan.trip.notes,
      travelers_count: 1,
      group_type: 'solo',
      fable_enabled: true,
      fable_budget_visible: true,
      fable_packing_visible: true,
      fable_web_search: true,
      fable_memory_enabled: true,
      fable_instruction: null,
      fable_recap: null,
      is_round_trip: false,
    });
    finalTripId = trip.id;
  }

  if (!finalTripId) {
    throw new Error('Keine Trip-ID vorhanden');
  }

  // Load existing data for duplicate detection (enhance mode)
  let existingActivityTitles = new Set<string>();
  let existingBudgetNames = new Set<string>();

  if (tripId) {
    try {
      const [existingActivities, existingBudget] = await Promise.all([
        getActivitiesForTrip(finalTripId),
        getBudgetCategories(finalTripId),
      ]);
      existingActivityTitles = new Set(existingActivities.map(a => a.title.toLowerCase()));
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
            start_time: act.category === 'hotel' ? null : (act.start_time || null),
            end_time: act.category === 'hotel' ? null : (act.end_time || null),
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

  // 3. Create budget categories (skip duplicates)
  if (plan.budget_categories?.length > 0) {
    onProgress?.('budget');
    const newBudgetCats = plan.budget_categories.filter(
      c => !existingBudgetNames.has(c.name.toLowerCase()),
    );
    for (const cat of newBudgetCats) {
      await createBudgetCategory(finalTripId, cat.name, cat.color, cat.budget_limit || null);
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
          theme_color: photo.color || null,
        });
        triggerDownload(photo);
      }
    } catch { /* best-effort */ }
  }

  return {
    tripId: finalTripId,
    daysCreated,
    activitiesCreated,
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
        logError(e, { component: 'planExecutor', context: { action: 'parsePlanJson', raw_preview: cleaned.substring(0, 300), raw_length: cleaned.length } });
        throw e;
      }
    } else {
      console.error('parsePlanJson failed. Raw content:', content.substring(0, 500));
      logError(e, { component: 'planExecutor', context: { action: 'parsePlanJson', raw_preview: cleaned.substring(0, 300), raw_length: cleaned.length } });
      throw e;
    }
  }

  // Basic validation
  if (!plan.days && !plan.budget_categories) {
    throw new Error('Plan enthält keine verwertbaren Daten');
  }

  return plan;
};

/**
 * Safe JSON parse for agent responses (packing, budget, day plan).
 * Extracts JSON from markdown/text, attempts repair on truncated responses.
 */
export function safeParseAgentJson<T>(content: string, action: string): T {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logError(new Error('No JSON found in AI response'), {
      component: 'safeParseAgentJson',
      context: { action, raw_preview: content.substring(0, 300) },
    });
    throw new Error('Ungültige Antwort vom AI-Service');
  }

  let raw = jsonMatch[0];
  try {
    return JSON.parse(raw) as T;
  } catch (firstError) {
    // Attempt repair
    const repaired = tryRepairTruncatedJson(raw);
    if (repaired) {
      try {
        const result = JSON.parse(repaired) as T;
        console.warn(`safeParseAgentJson[${action}]: recovered truncated JSON`);
        return result;
      } catch {
        // Repair failed too
      }
    }
    logError(firstError, {
      component: 'safeParseAgentJson',
      context: { action, raw_preview: raw.substring(0, 300), raw_length: raw.length },
    });
    throw new Error('AI-Antwort konnte nicht verarbeitet werden');
  }
}

export function tryRepairTruncatedJson(json: string): string | null {
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
