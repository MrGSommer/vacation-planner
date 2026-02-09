// Server-side plan generation agent — runs in background, survives app closure
// Creates a job in ai_plan_jobs, responds immediately, generates plan asynchronously

import { corsHeaders, json } from '../_shared/cors.ts';
import { MODELS, getUser, deductCreditsAtomic, logUsage, callClaude, getAnthropicKey, getSupabaseUrl, getServiceRoleKey } from '../_shared/claude.ts';
import { buildStructureSystemPrompt, buildActivitiesSystemPrompt } from '../_shared/prompts.ts';
import { enrichPlanWithPlaces } from '../_shared/places.ts';

const BATCH_SIZE = 5;

// --- Supabase helpers ---

async function createJob(userId: string, tripId: string | null, context: any, messages: any[]): Promise<string> {
  const res = await fetch(`${getSupabaseUrl()}/rest/v1/ai_plan_jobs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getServiceRoleKey()}`,
      'apikey': getServiceRoleKey(),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
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
    headers: {
      'Authorization': `Bearer ${getServiceRoleKey()}`,
      'apikey': getServiceRoleKey(),
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(update),
  }).catch((e) => console.error('Failed to update job:', e));
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

async function generateInBackground(
  jobId: string,
  userId: string,
  context: any,
  structureJson: any | null,
): Promise<void> {
  let totalCredits = 0;

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
      const response = await callClaude(MODELS.plan_generation, structurePrompt, structureMsg, 4096);
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.content?.[0]?.text || '';
      structure = parsePlanJson(content);

      logUsage(userId, context.tripId || null, 'plan_generation', creditsNeeded, MODELS.plan_generation, result.usage, durationMs);

      // Save intermediate structure
      await updateJob(jobId, { structure_json: structure });
    }

    const dayDates = (structure.days || []).map((d: any) => d.date);

    // --- Phase 2: Activities in batches ---
    const activitiesContext = { ...context, dayDates };
    const allDays: any[] = [];

    const batches: string[][] = [];
    for (let i = 0; i < dayDates.length; i += BATCH_SIZE) {
      batches.push(dayDates.slice(i, i + BATCH_SIZE));
    }

    for (const batchDates of batches) {
      const batchPrompt = buildActivitiesSystemPrompt({ ...activitiesContext, dayDates: batchDates });
      const batchMsg = [{ role: 'user', content: `Erstelle Aktivitäten für die Tage ${batchDates.join(', ')} als JSON.` }];

      const creditsNeeded = 1;
      const balance = await deductCreditsAtomic(userId, creditsNeeded);
      if (balance === -1) {
        // Save partial progress and fail
        const partialPlan = mergePlan(structure, allDays);
        await updateJob(jobId, {
          status: 'failed',
          error: 'Nicht genügend Inspirationen für alle Tage',
          plan_json: partialPlan,
          completed_at: new Date().toISOString(),
        });
        return;
      }
      totalCredits += creditsNeeded;

      const startTime = Date.now();
      const response = await callClaude(MODELS.plan_activities, batchPrompt, batchMsg, 12288);
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.content?.[0]?.text || '';
      const batch = parsePlanJson(content);
      allDays.push(...(batch.days || []));

      logUsage(userId, context.tripId || null, 'plan_activities', creditsNeeded, MODELS.plan_activities, result.usage, durationMs);
    }

    // --- Phase 3: Merge ---
    const mergedPlan = mergePlan(structure, allDays);

    // --- Phase 4: Places API enrichment ---
    const destination = context.destination || structure.trip?.destination || '';
    await enrichPlanWithPlaces(mergedPlan, destination);

    // --- Done ---
    await updateJob(jobId, {
      status: 'completed',
      plan_json: mergedPlan,
      credits_charged: totalCredits,
      completed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Background generation failed:', e);
    await updateJob(jobId, {
      status: 'failed',
      error: (e as Error).message || 'Unbekannter Fehler',
      credits_charged: totalCredits,
      completed_at: new Date().toISOString(),
    });
  }
}

function mergePlan(structure: any, activityDays: any[]): any {
  const activitiesByDate = new Map<string, any[]>();
  for (const day of activityDays) {
    activitiesByDate.set(day.date, day.activities || []);
  }

  return {
    trip: structure.trip,
    stops: structure.stops || [],
    days: (structure.days || []).map((day: any) => ({
      ...day,
      activities: activitiesByDate.get(day.date) || day.activities || [],
    })),
    budget_categories: structure.budget_categories || [],
  };
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
      // Fallback: run inline (blocks response but still works)
      generateInBackground(jobId, user.id, context, structure_json || null).catch(console.error);
    }

    return json({ job_id: jobId, status: 'pending' }, origin);
  } catch (e) {
    console.error('generate-plan error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
