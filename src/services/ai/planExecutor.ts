import { createTrip } from '../../api/trips';
import { createDay, createActivities } from '../../api/itineraries';
import { createStop } from '../../api/stops';
import { createBudgetCategory } from '../../api/budgets';
import { invalidateCache } from '../../utils/queryCache';

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

export type ProgressStep = 'trip' | 'days' | 'activities' | 'stops' | 'budget' | 'done';

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

  // 2. Create days and activities
  if (plan.days?.length > 0) {
    onProgress?.('days');
    for (const day of plan.days) {
      const createdDay = await createDay(finalTripId, day.date);
      daysCreated++;

      if (day.activities?.length > 0) {
        onProgress?.('activities');
        const validActivities = day.activities.map((act, idx) => ({
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
          check_in_date: null as string | null,
          check_out_date: null as string | null,
          category_data: act.category_data || {},
        }));

        const created = await createActivities(validActivities);
        activitiesCreated += created.length;
      }
    }
  }

  // 3. Create stops
  if (plan.stops?.length > 0) {
    onProgress?.('stops');
    for (const stop of plan.stops) {
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

  // 4. Create budget categories
  if (plan.budget_categories?.length > 0) {
    onProgress?.('budget');
    for (const cat of plan.budget_categories) {
      await createBudgetCategory(finalTripId, cat.name, cat.color, cat.budget_limit || null, 'group');
      budgetCategoriesCreated++;
    }
  }

  // Invalidate caches
  invalidateCache(`trip:${finalTripId}`);
  invalidateCache(`activities:${finalTripId}`);
  invalidateCache('trips:');

  onProgress?.('done');

  return {
    tripId: finalTripId,
    daysCreated,
    activitiesCreated,
    stopsCreated,
    budgetCategoriesCreated,
  };
};

export const parsePlanJson = (content: string): AiTripPlan => {
  // Strip markdown code fences if present
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  const plan = JSON.parse(cleaned) as AiTripPlan;

  // Basic validation
  if (!plan.days && !plan.stops && !plan.budget_categories) {
    throw new Error('Plan enthält keine verwertbaren Daten');
  }

  return plan;
};
