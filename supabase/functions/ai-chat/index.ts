import { createClient } from 'npm:@supabase/supabase-js@2';

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

const MODELS = {
  conversation: 'claude-haiku-4-5-20251001',
  plan_generation: 'claude-sonnet-4-5-20250929',
} as const;

function buildConversationSystemPrompt(context: any): string {
  const { destination, startDate, endDate, currency, existingData } = context;

  let prompt = `Du bist Fable, ein freundlicher und hilfsbereiter Reisebegleiter von WayFable. Du antwortest immer auf Deutsch.

Deine Aufgabe: Hilf dem User, eine Reise zu planen. Stelle gezielte Fragen (1-2 pro Nachricht), um die Vorlieben herauszufinden.

Frage nach (falls noch nicht bekannt):
- Reisestil (entspannt / moderat / durchgetaktet)
- Stimmung (romantisch / Abenteuer / Kultur / Familie)
- Interessen (Essen, Natur, Geschichte, Kunst, Nachtleben etc.)
- Unterkunft (Hotel / Airbnb / Hostel / egal)
- Budget-Level (günstig / mittel / luxus)
- Besondere Wünsche oder Must-sees
- Falls Reisedaten fehlen: empfehle die beste Reisezeit und frage nach gewünschter Dauer

Kontext der Reise:
- Reiseziel: ${destination || 'noch nicht festgelegt'}`;

  if (startDate && endDate) {
    prompt += `\n- Reisedaten: ${startDate} bis ${endDate}`;
  } else {
    prompt += `\n- Reisedaten: noch nicht festgelegt`;
  }

  prompt += `\n- Währung: ${currency || 'CHF'}`;

  if (existingData) {
    prompt += `\n\nBestehende Trip-Daten (Enhance-Modus):`;
    if (existingData.activities?.length > 0) {
      prompt += `\n- ${existingData.activities.length} bestehende Aktivitäten: ${existingData.activities.slice(0, 10).map((a: any) => a.title).join(', ')}`;
    }
    if (existingData.stops?.length > 0) {
      prompt += `\n- ${existingData.stops.length} bestehende Stops: ${existingData.stops.map((s: any) => s.name).join(', ')}`;
    }
    if (existingData.budgetCategories?.length > 0) {
      prompt += `\n- Budget-Kategorien: ${existingData.budgetCategories.map((b: any) => b.name).join(', ')}`;
    }
    prompt += `\nBerücksichtige die bestehenden Daten und schlage Ergänzungen vor, keine Duplikate.`;
  }

  prompt += `

Wichtige Regeln:
- Halte deine Antworten kurz und freundlich (max 3-4 Sätze + Frage)
- Wenn genug Infos gesammelt sind, fasse die Vorlieben zusammen und frage ob du den Plan erstellen sollst
- Wenn der User "mach einfach" oder ähnliches sagt, respektiere das und gehe zu ready_to_plan
- Beharr nicht zu lang auf Details – nach 5-6 Nachrichten solltest du ready_to_plan vorschlagen

Am Ende JEDER Antwort füge unsichtbare Metadaten ein (wird vom Client geparst):
<metadata>{"ready_to_plan": false, "preferences_gathered": ["destination"], "suggested_questions": ["Was für ein Reisetyp bist du?", "Hast du ein bestimmtes Budget?"]}</metadata>

Setze ready_to_plan auf true wenn:
- Du genug Infos hast UND der User bestätigt hat
- Oder der User explizit sagt er will den Plan jetzt

suggested_questions: 2-3 kurze Vorschläge die der User als Quick-Reply antippen kann.`;

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

    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Nicht authentifiziert' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ error: 'Ungültiges Token – bitte erneut anmelden' }, 401);
    }

    // Check subscription & credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_status, ai_credits_balance')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return json({ error: 'Profil nicht gefunden' }, 403);
    }

    const creditsRequired = task === 'plan_generation' ? 3 : 1;
    if ((profile.ai_credits_balance || 0) < creditsRequired) {
      return json({ error: `Nicht genügend Inspirationen. Du brauchst ${creditsRequired}, hast aber nur ${profile.ai_credits_balance || 0}. Kaufe weitere Inspirationen um Fable zu nutzen.` }, 403);
    }

    // Select model and build system prompt
    const model = task === 'plan_generation' ? MODELS.plan_generation : MODELS.conversation;
    const systemPrompt = task === 'plan_generation'
      ? buildPlanGenerationSystemPrompt(context)
      : buildConversationSystemPrompt(context);

    const maxTokens = task === 'plan_generation' ? 8192 : 1024;

    // Call Claude API
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ error: 'AI-Service nicht konfiguriert' }, 500);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return json({ error: 'Rate Limit erreicht – bitte kurz warten', retryable: true }, 429);
      }
      if (status === 529) {
        return json({ error: 'AI-Service momentan überlastet – bitte kurz warten', retryable: true }, 529);
      }
      const errBody = await response.text().catch(() => '');
      console.error(`Claude API error ${status}:`, errBody);
      return json({ error: 'AI-Anfrage fehlgeschlagen' }, 502);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    // Deduct credits and log usage
    await supabase
      .from('profiles')
      .update({ ai_credits_balance: Math.max(0, (profile.ai_credits_balance || 0) - creditsRequired) })
      .eq('id', user.id);

    await supabase
      .from('ai_usage_logs')
      .insert({
        user_id: user.id,
        trip_id: context.tripId || null,
        task_type: task,
        credits_charged: creditsRequired,
      });

    return json({ content, usage: result.usage, credits_remaining: Math.max(0, (profile.ai_credits_balance || 0) - creditsRequired) });
  } catch (e) {
    console.error('ai-chat error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});
