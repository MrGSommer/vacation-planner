// Server-side plan generation agent — runs in background, survives app closure
// Day-by-day progressive generation: creates trip structure immediately, then inserts activities per day
// ItineraryScreen's Realtime subscription auto-refreshes as activities appear

import { corsHeaders, json } from '../_shared/cors.ts';
import { MODELS, getUser, deductCreditsAtomic, refundCredits, logUsage, callClaude, getAnthropicKey, getSupabaseUrl, getServiceRoleKey, extractTextContent, getTemperature } from '../_shared/claude.ts';
import { buildStructureSystemPrompt, buildActivitiesSystemPrompt } from '../_shared/prompts.ts';
import { enrichPlanWithPlaces, lookupPlace } from '../_shared/places.ts';

const VALID_CATEGORIES = ['sightseeing', 'food', 'activity', 'transport', 'hotel', 'shopping', 'relaxation', 'stop', 'other'];

// --- Supabase REST helpers ---

const restHeaders = () => ({
  'Authorization': `Bearer ${getServiceRoleKey()}`,
  'apikey': getServiceRoleKey(),
  'Content-Type': 'application/json',
});

async function createJob(userId: string, tripId: string | null, context: any, messages: any[]): Promise<string> {
  const res = await fetch(`${getSupabaseUrl()}/rest/v1/ai_plan_jobs`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({
      user_id: userId,
      trip_id: tripId || null,
      status: 'pending',
      context,
      messages,
    }),
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0].id : data.id;
}

async function updateJob(jobId: string, update: Record<string, any>): Promise<void> {
  await fetch(`${getSupabaseUrl()}/rest/v1/ai_plan_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers: { ...restHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(update),
  }).catch((e) => console.error('Failed to update job:', e));
}

async function checkJobCancelled(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getSupabaseUrl()}/rest/v1/ai_plan_jobs?id=eq.${jobId}&select=status`, {
      headers: restHeaders(),
    });
    const data = await res.json();
    const status = Array.isArray(data) ? data[0]?.status : data?.status;
    return status === 'cancelled';
  } catch {
    return false;
  }
}

async function createTripViaRest(userId: string, tripData: any, currency: string): Promise<string> {
  const res = await fetch(`${getSupabaseUrl()}/rest/v1/trips`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({
      owner_id: userId,
      name: tripData.name,
      destination: tripData.destination,
      destination_lat: tripData.destination_lat || null,
      destination_lng: tripData.destination_lng || null,
      cover_image_url: null,
      cover_image_attribution: null,
      start_date: tripData.start_date,
      end_date: tripData.end_date,
      status: 'planning',
      currency: tripData.currency || currency || 'CHF',
      notes: tripData.notes || null,
      travelers_count: 1,
      group_type: 'solo',
    }),
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0].id : data.id;
}

async function createDayViaRest(tripId: string, date: string): Promise<string> {
  const res = await fetch(`${getSupabaseUrl()}/rest/v1/itinerary_days`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({ trip_id: tripId, date }),
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0].id : data.id;
}

async function createActivitiesViaRest(activities: any[]): Promise<void> {
  if (activities.length === 0) return;
  await fetch(`${getSupabaseUrl()}/rest/v1/activities`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(activities),
  });
}

async function createStopViaRest(stop: any): Promise<void> {
  await fetch(`${getSupabaseUrl()}/rest/v1/trip_stops`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(stop),
  });
}

async function createBudgetCategoryViaRest(tripId: string, name: string, color: string, limit: number | null): Promise<void> {
  await fetch(`${getSupabaseUrl()}/rest/v1/budget_categories`, {
    method: 'POST',
    headers: { ...restHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      trip_id: tripId,
      name,
      color,
      budget_limit: limit,
      scope: 'group',
    }),
  });
}

async function setTripCoverImage(tripId: string, destination: string): Promise<void> {
  try {
    const UNSPLASH_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY');
    if (!UNSPLASH_KEY) return;
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(destination)}&per_page=1&orientation=landscape`, {
      headers: { 'Authorization': `Client-ID ${UNSPLASH_KEY}` },
    });
    const data = await res.json();
    const photo = data.results?.[0];
    if (!photo) return;

    // Trigger download (Unsplash API guidelines)
    fetch(photo.links.download_location + `?client_id=${UNSPLASH_KEY}`).catch(() => {});

    await fetch(`${getSupabaseUrl()}/rest/v1/trips?id=eq.${tripId}`, {
      method: 'PATCH',
      headers: { ...restHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        cover_image_url: photo.urls.regular,
        cover_image_attribution: `${photo.user.name} / Unsplash`,
      }),
    });
  } catch (e) {
    console.error('Cover image failed (non-critical):', e);
  }
}

// --- Plan generation logic ---

function parsePlanJson(content: string): any {
  let cleaned = content.trim();
  if (cleaned.includes('```')) {
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) cleaned = fenceMatch[1];
  }
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart !== -1) cleaned = cleaned.substring(jsonStart);
  }
  if (!cleaned.endsWith('}')) {
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd !== -1) cleaned = cleaned.substring(0, jsonEnd + 1);
  }
  return JSON.parse(cleaned);
}

/**
 * Enrich a single day's activities with Google Places data.
 * Like enrichPlanWithPlaces but operates on a flat array of activities.
 */
async function enrichActivitiesWithPlaces(activities: any[], destination: string): Promise<void> {
  const locationMap = new Map<string, { query: string }>();
  for (const act of activities) {
    if (act.location_name && !locationMap.has(act.location_name)) {
      locationMap.set(act.location_name, { query: `${act.location_name}, ${destination}` });
    }
  }
  if (locationMap.size === 0) return;

  const entries = Array.from(locationMap.entries());
  const results = new Map<string, any>();

  // Batch lookup (5 at a time)
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async ([name, { query }]) => {
        const result = await lookupPlace(query);
        return [name, result] as const;
      }),
    );
    for (const [name, result] of batchResults) {
      if (result) results.set(name, result);
    }
  }

  // Apply results
  for (const act of activities) {
    const result = act.location_name ? results.get(act.location_name) : null;
    if (result) {
      act.location_lat = result.lat;
      act.location_lng = result.lng;
      act.location_address = result.address;
      if (!act.category_data) act.category_data = {};
      act.category_data.google_maps_url = result.google_maps_url;
    }
  }
}

// --- Progressive background generation ---

async function generateInBackground(
  jobId: string,
  userId: string,
  context: any,
  structureJson: any | null,
): Promise<void> {
  let totalCredits = 0;
  let tripId = context.tripId || null;

  try {
    await updateJob(jobId, { status: 'generating' });

    // --- Phase 1: Structure ---
    let structure = structureJson;
    if (!structure) {
      const structurePrompt = buildStructureSystemPrompt(context);
      const structureMsg = [{ role: 'user', content: 'Erstelle die Grundstruktur des Reiseplans als JSON (Trip, Stops, Budget, Tage — ohne Aktivitäten).' }];

      const creditsNeeded = 3;
      const balance = await deductCreditsAtomic(userId, creditsNeeded);
      if (balance === -1) {
        await updateJob(jobId, { status: 'failed', error: 'Nicht genügend Inspirationen', completed_at: new Date().toISOString() });
        return;
      }
      totalCredits += creditsNeeded;

      const startTime = Date.now();
      const response = await callClaude(MODELS.plan_generation, structurePrompt, structureMsg, 4096, getTemperature('plan_generation'));
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        // Refund credits on API failure
        await refundCredits(userId, creditsNeeded);
        totalCredits -= creditsNeeded;
        throw new Error(`Claude API error: ${response.status}`);
      }

      const result = await response.json();
      const content = extractTextContent(result);
      structure = parsePlanJson(content);

      logUsage(userId, tripId, 'plan_generation', creditsNeeded, MODELS.plan_generation, result.usage, durationMs);
    }

    const dayDates = (structure.days || []).map((d: any) => d.date);
    const totalDays = dayDates.length;
    const destination = context.destination || structure.trip?.destination || '';
    const currency = context.currency || structure.trip?.currency || 'CHF';

    // Save structure to job
    await updateJob(jobId, {
      structure_json: structure,
      progress: { phase: 'structure', current_day: 0, total_days: totalDays },
    });

    // --- Phase 2: Create trip + structure in DB ---

    // Create trip (create-mode only)
    if (!tripId && structure.trip) {
      tripId = await createTripViaRest(userId, structure.trip, currency);
    }

    if (!tripId) {
      throw new Error('Keine Trip-ID vorhanden');
    }

    // Create days and build date→dayId map
    const dayIdMap = new Map<string, string>();
    for (const date of dayDates) {
      const dayId = await createDayViaRest(tripId, date);
      dayIdMap.set(date, dayId);
    }

    // Create stops (with Places enrichment)
    for (const stop of structure.stops || []) {
      // Enrich stop with Places API
      if (stop.name && !stop.lat) {
        const placeResult = await lookupPlace(`${stop.name}, ${destination}`);
        if (placeResult) {
          stop.lat = placeResult.lat;
          stop.lng = placeResult.lng;
          stop.address = placeResult.address;
          stop.place_id = placeResult.place_id;
        }
      }
      await createStopViaRest({
        trip_id: tripId,
        name: stop.name,
        place_id: stop.place_id || null,
        address: stop.address || null,
        lat: stop.lat || null,
        lng: stop.lng || null,
        type: stop.type || 'waypoint',
        nights: stop.nights || null,
        arrival_date: stop.arrival_date || null,
        departure_date: stop.departure_date || null,
        sort_order: stop.sort_order ?? 0,
      });
    }

    // Create budget categories
    for (const cat of structure.budget_categories || []) {
      await createBudgetCategoryViaRest(tripId, cat.name, cat.color, cat.budget_limit || null);
    }

    // Update job with trip_id and start activities phase
    await updateJob(jobId, {
      trip_id: tripId,
      progress: { phase: 'activities', current_day: 0, total_days: totalDays, trip_id: tripId },
    });

    // Cover image (async, non-blocking)
    setTripCoverImage(tripId, destination).catch(() => {});

    // --- Phase 3: Activities day by day ---
    const activitiesContext = { ...context, dayDates, tripId };

    for (let i = 0; i < totalDays; i++) {
      // Check cancellation
      if (await checkJobCancelled(jobId)) {
        await updateJob(jobId, {
          status: 'cancelled',
          credits_charged: totalCredits,
          completed_at: new Date().toISOString(),
          progress: { phase: 'cancelled', current_day: i, total_days: totalDays, trip_id: tripId },
        });
        return;
      }

      // Deduct credits: 1 credit per 7 days (deduct at day 0, 7, 14, ...)
      if (i % 7 === 0) {
        const creditsNeeded = 1;
        const balance = await deductCreditsAtomic(userId, creditsNeeded);
        if (balance === -1) {
          await updateJob(jobId, {
            status: 'failed',
            error: 'Nicht genügend Inspirationen für alle Tage',
            credits_charged: totalCredits,
            completed_at: new Date().toISOString(),
            progress: { phase: 'activities', current_day: i, total_days: totalDays, trip_id: tripId },
          });
          return;
        }
        totalCredits += creditsNeeded;
      }

      const currentDate = dayDates[i];
      const dayId = dayIdMap.get(currentDate);
      if (!dayId) continue;

      // Claude call for ONE day's activities
      const dayPrompt = buildActivitiesSystemPrompt({ ...activitiesContext, dayDates: [currentDate] });
      const dayMsg = [{ role: 'user', content: `Erstelle Aktivitäten für den Tag ${currentDate} als JSON.` }];

      const startTime = Date.now();
      const response = await callClaude(MODELS.plan_activities, dayPrompt, dayMsg, 4096, getTemperature('plan_activities'));
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        console.error(`Claude API error for day ${currentDate}: ${response.status}`);
        // Continue with next day instead of failing entirely
        await updateJob(jobId, {
          progress: { phase: 'activities', current_day: i + 1, total_days: totalDays, current_date: currentDate, trip_id: tripId },
        });
        continue;
      }

      const result = await response.json();
      const content = extractTextContent(result);

      logUsage(userId, tripId, 'plan_activities', 0, MODELS.plan_activities, result.usage, durationMs);

      let dayActivities: any[] = [];
      try {
        const parsed = parsePlanJson(content);
        dayActivities = parsed.days?.[0]?.activities || parsed.activities || [];
      } catch (parseErr) {
        console.error(`Failed to parse activities for ${currentDate}:`, parseErr);
        // Continue with next day
        await updateJob(jobId, {
          progress: { phase: 'activities', current_day: i + 1, total_days: totalDays, current_date: currentDate, trip_id: tripId },
        });
        continue;
      }

      // Enrich with Places API
      await enrichActivitiesWithPlaces(dayActivities, destination);

      // Insert activities into DB
      const dbActivities = dayActivities.map((act: any, idx: number) => ({
        day_id: dayId,
        trip_id: tripId,
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

      await createActivitiesViaRest(dbActivities);

      // Update progress
      await updateJob(jobId, {
        progress: { phase: 'activities', current_day: i + 1, total_days: totalDays, current_date: currentDate, trip_id: tripId },
      });
    }

    // --- Phase 4: Done ---
    await updateJob(jobId, {
      status: 'completed',
      credits_charged: totalCredits,
      completed_at: new Date().toISOString(),
      progress: { phase: 'done', current_day: totalDays, total_days: totalDays, trip_id: tripId },
    });

    // Push notification
    await sendFablePushNotification(userId, jobId, tripId, destination);
  } catch (e) {
    console.error('Background generation failed:', e);
    await updateJob(jobId, {
      status: 'failed',
      error: (e as Error).message || 'Unbekannter Fehler',
      credits_charged: totalCredits,
      completed_at: new Date().toISOString(),
      progress: tripId ? { phase: 'failed', current_day: 0, total_days: 0, trip_id: tripId } : undefined,
    });
  }
}

// --- Push notification after plan completion ---

async function sendFablePushNotification(userId: string, jobId: string, tripId: string | null, destination: string): Promise<void> {
  try {
    const profileRes = await fetch(`${getSupabaseUrl()}/rest/v1/profiles?id=eq.${userId}&select=notifications_enabled,notification_push_fable`, {
      headers: restHeaders(),
    });
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile?.notifications_enabled || !profile?.notification_push_fable) return;

    // Dedup check
    const dedupRes = await fetch(
      `${getSupabaseUrl()}/rest/v1/notification_logs?user_id=eq.${userId}&type=eq.fable_plan_completed&sent_at=gt.${new Date(Date.now() - 20 * 3600_000).toISOString()}&limit=1`,
      { headers: restHeaders() },
    );
    const dedupLogs = await dedupRes.json();
    if (Array.isArray(dedupLogs) && dedupLogs.length > 0) return;

    const title = 'Reiseplan fertig!';
    const body = tripId
      ? `Fable hat deinen Plan für ${destination} erstellt. Prüfe ihn jetzt!`
      : `Fable hat deinen Reiseplan für ${destination} erstellt.`;
    const url = tripId
      ? `https://wayfable.ch/trip/${tripId}`
      : 'https://wayfable.ch/';

    await fetch(`${getSupabaseUrl()}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getServiceRoleKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, title, body, url, tag: `fable-plan-${jobId}` }),
    });

    await fetch(`${getSupabaseUrl()}/rest/v1/notification_logs`, {
      method: 'POST',
      headers: { ...restHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ user_id: userId, type: 'fable_plan_completed', channel: 'push', sent_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error('Fable push notification failed (non-critical):', e);
  }
}

// --- Main handler ---

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { context, messages, structure_json } = body;

    if (!context || !messages) {
      return json({ error: 'Fehlende Parameter: context, messages' }, origin, 400);
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, origin, 401);

    if (!getAnthropicKey()) return json({ error: 'AI-Service nicht konfiguriert' }, origin, 500);

    // Create job
    const jobId = await createJob(user.id, context.tripId || null, context, messages);

    // Start background generation (Deno-specific: keeps running after response)
    // @ts-ignore — EdgeRuntime.waitUntil is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(generateInBackground(jobId, user.id, context, structure_json || null));
    } else {
      generateInBackground(jobId, user.id, context, structure_json || null).catch(console.error);
    }

    return json({ job_id: jobId, status: 'pending' }, origin);
  } catch (e) {
    console.error('generate-plan error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.' }, origin, 500);
  }
});
