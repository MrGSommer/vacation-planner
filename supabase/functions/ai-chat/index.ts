// Zero npm imports — uses native fetch() for Supabase + Claude APIs
// Fire-and-forget credit deduction for instant response delivery

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const MODELS = {
  conversation: 'claude-haiku-4-5-20251001',
  plan_generation: 'claude-sonnet-4-5-20250929',
} as const;

// --- Supabase helpers (native fetch) ---

async function getUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

async function getProfile(userId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=subscription_tier,subscription_status,ai_credits_balance`,
    { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

function deductCredits(userId: string, currentBalance: number, amount: number) {
  // Fire-and-forget — don't block response
  fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ ai_credits_balance: Math.max(0, currentBalance - amount) }),
  }).catch(() => {});
}

function logUsage(userId: string, tripId: string | null, taskType: string, credits: number) {
  // Fire-and-forget — don't block response
  fetch(`${SUPABASE_URL}/rest/v1/ai_usage_logs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      trip_id: tripId,
      task_type: taskType,
      credits_charged: credits,
    }),
  }).catch(() => {});
}

// --- System prompts ---

function buildConversationSystemPrompt(context: any): string {
  const { destination, startDate, endDate, currency, existingData } = context;

  let prompt = `Du bist Fable, ein freundlicher Reisebegleiter von WayFable. Antworte auf Schweizer Hochdeutsch (kein ß, immer ss).

Hilf dem User, eine Reise zu planen. Stelle gezielte Fragen (1 pro Nachricht), um Vorlieben herauszufinden.

Frage nach (falls nicht bekannt): Reisestil, Stimmung, Interessen, Unterkunft, Budget-Level, besondere Wünsche. Falls Reisedaten fehlen: empfehle die beste Reisezeit.

Kontext:
- Ziel: ${destination || 'nicht festgelegt'}
- Daten: ${startDate && endDate ? `${startDate} bis ${endDate}` : 'nicht festgelegt'}
- Währung: ${currency || 'CHF'}`;

  if (existingData) {
    prompt += `\n\nBestehende Daten:`;
    if (existingData.activities?.length > 0) {
      prompt += `\n- ${existingData.activities.length} Aktivitäten: ${existingData.activities.slice(0, 10).map((a: any) => a.title).join(', ')}`;
    }
    if (existingData.stops?.length > 0) {
      prompt += `\n- ${existingData.stops.length} Stops: ${existingData.stops.map((s: any) => s.name).join(', ')}`;
    }
    prompt += `\nSchlage Ergänzungen vor, keine Duplikate.`;
  }

  prompt += `

Regeln:
- Max 2-3 Sätze + eine Frage. Kurz und freundlich.
- Beende jede Nachricht mit EINER Frage
- Wenn genug Infos: fasse zusammen und frage ob Plan erstellt werden soll
- Wenn User "mach einfach" sagt: respektiere das → ready_to_plan
- Nach 5-6 Nachrichten: ready_to_plan vorschlagen
- NIEMALS ß verwenden, immer ss

Am Ende JEDER Antwort:
<metadata>{"ready_to_plan": false, "preferences_gathered": ["destination"], "suggested_questions": ["Entspannt", "Moderat", "Durchgetaktet"]}</metadata>

ready_to_plan=true wenn genug Infos + User bestätigt, oder User explizit Plan will.
suggested_questions: 2-3 kurze ANTWORT-Vorschläge (nicht Fragen) passend zu deiner Frage.`;

  return prompt;
}

function buildPlanGenerationSystemPrompt(context: any): string {
  const { destination, destinationLat, destinationLng, startDate, endDate, currency, preferences, existingData, mode } = context;

  let prompt = `Du bist ein Experte für Reiseplanung. Generiere einen detaillierten, strukturierten Reiseplan als JSON.

REISE-DETAILS:
- Ziel: ${destination}
- Koordinaten: ${destinationLat}, ${destinationLng}
- Daten: ${startDate} bis ${endDate}
- Währung: ${currency}
- Modus: ${mode === 'enhance' ? 'Ergänzung eines bestehenden Trips' : 'Neuer Trip'}

USER-VORLIEBEN:
${JSON.stringify(preferences, null, 2)}`;

  if (existingData && mode === 'enhance') {
    prompt += `\n\nBESTEHENDE DATEN (nicht duplizieren!):
- Aktivitäten: ${JSON.stringify(existingData.activities?.map((a: any) => ({ title: a.title, category: a.category, date: a.start_time })) || [])}
- Stops: ${JSON.stringify(existingData.stops?.map((s: any) => ({ name: s.name, type: s.type })) || [])}
- Budget-Kategorien: ${JSON.stringify(existingData.budgetCategories?.map((b: any) => b.name) || [])}`;
  }

  prompt += `

ERLAUBTE AKTIVITÄTS-KATEGORIEN: sightseeing, food, activity, transport, hotel, shopping, relaxation, stop, other
BUDGET-FARBEN: Transport #FF6B6B, Unterkunft #4ECDC4, Essen #FFD93D, Aktivitäten #6C5CE7, Einkaufen #74B9FF, Sonstiges #636E72

REGELN:
- Realistische Uhrzeiten (Frühstück 08:00-09:00, Sightseeing ab 09:30, Mittagessen 12:00-13:30, etc.)
- Verwende echte Koordinaten für bekannte Orte und Sehenswürdigkeiten
- Kosten in ${currency} schätzen (realistisch für das Ziel)
- Pro Tag 4-6 Aktivitäten (je nach Reisestil)
- sort_order bei 0 beginnen, pro Tag aufsteigend
- Bei mode="enhance": Erstelle KEINE bestehenden Budget-Kategorien erneut
- Hotels als erste Aktivität des Tages mit category "hotel" und check_in_date/check_out_date
- category_data kann leer sein ({}) oder category-spezifische Felder enthalten

${mode === 'create' ? `Erstelle auch den Trip selbst (trip-Objekt mit name, destination, etc.)` : `KEIN trip-Objekt erstellen – der Trip existiert bereits.`}

Antworte NUR mit validem JSON, kein Text davor oder danach. Schema:
{
  ${mode === 'create' ? `"trip": { "name": "string", "destination": "string", "destination_lat": number, "destination_lng": number, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "currency": "string", "notes": "string|null" },` : ''}
  "stops": [{ "name": "string", "lat": number, "lng": number, "address": "string|null", "type": "overnight|waypoint", "nights": number|null, "arrival_date": "YYYY-MM-DD|null", "departure_date": "YYYY-MM-DD|null", "sort_order": number }],
  "days": [{ "date": "YYYY-MM-DD", "activities": [{ "title": "string", "description": "string|null", "category": "string", "start_time": "HH:MM|null", "end_time": "HH:MM|null", "location_name": "string|null", "location_lat": number|null, "location_lng": number|null, "location_address": "string|null", "cost": number|null, "sort_order": number, "category_data": {} }] }],
  "budget_categories": [{ "name": "string", "color": "#HEXHEX", "budget_limit": number|null }]
}`;

  return prompt;
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { task, messages, context } = body;

    if (!task || !messages || !context) {
      return json({ error: 'Fehlende Parameter: task, messages, context' }, 400);
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, 401);

    // Check credits
    const profile = await getProfile(user.id);
    if (!profile) return json({ error: 'Profil nicht gefunden' }, 403);

    const creditsRequired = task === 'plan_generation' ? 3 : 1;
    if ((profile.ai_credits_balance || 0) < creditsRequired) {
      return json({
        error: `Nicht genügend Inspirationen. Du brauchst ${creditsRequired}, hast aber nur ${profile.ai_credits_balance || 0}. Kaufe weitere Inspirationen um Fable zu nutzen.`,
      }, 403);
    }

    // Build prompt + call Claude
    const model = task === 'plan_generation' ? MODELS.plan_generation : MODELS.conversation;
    const systemPrompt = task === 'plan_generation'
      ? buildPlanGenerationSystemPrompt(context)
      : buildConversationSystemPrompt(context);
    const maxTokens = task === 'plan_generation' ? 8192 : 1024;

    if (!ANTHROPIC_KEY) return json({ error: 'AI-Service nicht konfiguriert' }, 500);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return json({ error: 'Rate Limit erreicht – bitte kurz warten', retryable: true }, 429);
      if (status === 529) return json({ error: 'AI-Service momentan überlastet – bitte kurz warten', retryable: true }, 529);
      console.error(`Claude API error ${status}:`, await response.text().catch(() => ''));
      return json({ error: 'AI-Anfrage fehlgeschlagen' }, 502);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';
    const creditsRemaining = Math.max(0, (profile.ai_credits_balance || 0) - creditsRequired);

    // Fire-and-forget: deduct credits + log usage (don't block response)
    deductCredits(user.id, profile.ai_credits_balance || 0, creditsRequired);
    logUsage(user.id, context.tripId || null, task, creditsRequired);

    return json({ content, usage: result.usage, credits_remaining: creditsRemaining });
  } catch (e) {
    console.error('ai-chat error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
