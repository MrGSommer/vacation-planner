// ai-insights-report — Generates KI-based admin insights from analytics data.
// Called on-demand from AdminInsightsScreen or weekly via pg_cron.
//
// Guarantees:
//  - Admin-only (verify is_admin via profiles table)
//  - Evidence-based: every finding references sample_size + data_sufficient
//  - Industry benchmarks baked into the prompt
//  - "Zu wenig Daten" is a valid outcome, returned in data_gaps

import { corsHeaders, json } from '../_shared/cors.ts';
import { callClaude, extractTextContent, getUser, getSupabaseUrl, getServiceRoleKey } from '../_shared/claude.ts';
import { BENCHMARKS_FOR_PROMPT } from '../_shared/benchmarks.ts';

const SUPABASE_URL = getSupabaseUrl();
const SERVICE_ROLE_KEY = getServiceRoleKey();
const MODEL_INSIGHTS = Deno.env.get('MODEL_INSIGHTS') || 'claude-sonnet-4-6';

type Focus = 'full' | 'funnel' | 'retention' | 'monetization' | 'engagement';

interface RequestBody {
  period_start?: string; // YYYY-MM-DD
  period_end?: string;
  focus?: Focus;
  triggered_by?: 'weekly' | 'on_demand';
}

// --- DB helpers ---------------------------------------------------------

async function rpc<T = any>(name: string, params: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.error(`RPC ${name} failed:`, res.status, await res.text());
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`RPC ${name} threw:`, e);
    return null;
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`,
      { headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY } },
    );
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.is_admin === true;
  } catch {
    return false;
  }
}

async function insertReport(row: Record<string, unknown>): Promise<any | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/insights_reports`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error('insertReport failed:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

// --- Prompt construction ------------------------------------------------

function buildSystemPrompt(focus: Focus): string {
  return `Du bist ein Senior Growth-Analyst für WayFable — eine Schweizer Travel-SaaS (Reiseplanung mit KI-Begleiter "Fable").

**ROLLE & AUFGABE**
Du analysierst die gelieferten Analytics-Metriken und lieferst einen evidenzbasierten Report mit konkreten Handlungsempfehlungen ODER — falls die Daten es nicht hergeben — einem ehrlichen "Status quo in Ordnung" oder "zu wenig Daten für fundierte Aussagen".

**KERNREGELN (nicht verhandelbar)**
1. **Evidenzbasiert arbeiten:** Empfehle NUR Änderungen, wenn die Daten eine klare Richtung zeigen.
2. **Sample-Size respektieren:** Wenn ein Metrik-Objekt data_sufficient=false hat ODER N<30 ist, gib KEINE Maßnahme dazu. Stattdessen ins data_gaps-Array: { metric, current_sample, required_sample, blocker }.
3. **"Keine Änderung" ist valides Finding:** Wenn alle relevanten Metriken im Industry-Benchmark-Rahmen liegen, sage das explizit im summary und actions:[] (leeres Array).
4. **Priorisiere nach Impact × Confidence:** Jede Action hat ein confidence-Level (low/medium/high) basierend auf Sample-Size und Klarheit des Signals.
5. **Keine PII:** Nenne nie User-IDs, E-Mails, Namen. Nur aggregierte Metriken.
6. **Deutsch, prägnant:** Keine Marketing-Phrasen, keine Floskeln. Wie ein technischer Memo.

**FOKUS:** ${focus === 'full' ? 'Gesamt-Analyse über alle Kategorien' : `Primär: ${focus}. Andere Kategorien nur erwähnen, wenn direkt relevant.`}

**OUTPUT-FORMAT** (STRIKT JSON, keine Markdown-Codefences):
{
  "summary": "2-3 Sätze Executive Summary. Was ist die Kernaussage? Gibt es Handlungsbedarf?",
  "findings": [
    {
      "severity": "info" | "warning" | "critical",
      "title": "Kurztitel",
      "description": "1-2 Sätze — was sagen die Daten?",
      "evidence": "Konkrete Zahlen + Benchmark-Vergleich (z.B. 'Trial-to-Paid: 18% vs. Industry-Median 30%')",
      "data_sufficient": true | false
    }
  ],
  "actions": [
    {
      "size": "S" | "M" | "L" | "XL",
      "title": "Konkrete Handlungsempfehlung",
      "impact": "Was verändert sich? (z.B. '+5-10% Trial-Conversion erwartet')",
      "effort": "Aufwand-Schätzung (1-3 Tage / 1 Woche / 2-4 Wochen / > 1 Monat)",
      "confidence": "low" | "medium" | "high",
      "benchmark_ref": "Optional: Quelle für die Annahme"
    }
  ],
  "data_gaps": [
    {
      "metric": "z.B. 'Trial-to-Paid conversion'",
      "current_sample": 12,
      "required_sample": 30,
      "blocker": "Mehr Trialing-User benötigt (aktuell N=12, brauchen 30 für 95%-Konfidenz)"
    }
  ]
}

**T-SHIRT-Sizing für actions**
- S: <1 Tag (copy change, button label, price display)
- M: 1-5 Tage (neuer Onboarding-Step, E-Mail-Template)
- L: 1-4 Wochen (neue Funnel-Phase, A/B-Test-Infrastruktur)
- XL: >1 Monat (neues Feature, großer Refactor)

Wenn du keine fundierte Empfehlung geben kannst: actions:[], summary erklärt warum, data_gaps listet was fehlt.`;
}

function buildUserPrompt(metrics: Record<string, unknown>, period: { start: string; end: string }, focus: Focus): string {
  return `Analysiere folgende WayFable-Analytics (Zeitraum: ${period.start} bis ${period.end}).

**METRIKEN**
${JSON.stringify(metrics, null, 2)}

**INDUSTRY-BENCHMARKS (Referenz für Vergleich)**
${JSON.stringify(BENCHMARKS_FOR_PROMPT, null, 2)}

**FOKUS:** ${focus}

Gib deinen Report als JSON zurück (keine Markdown-Codefences, nur das JSON-Objekt).`;
}

// --- Metric collection --------------------------------------------------

async function fetchRevenueStats(): Promise<any | null> {
  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
  if (!STRIPE_KEY) return null;

  try {
    // Active subscriptions for MRR
    const subsRes = await fetch('https://api.stripe.com/v1/subscriptions?status=active&limit=100', {
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
    });
    const subsData = await subsRes.json();
    if (subsData.error) return null;

    let mrr = 0;
    for (const sub of subsData.data || []) {
      const item = sub.items?.data?.[0];
      const amount = item?.price?.unit_amount || 0;
      const interval = item?.price?.recurring?.interval;
      if (interval === 'year') mrr += Math.round(amount / 12);
      else mrr += amount;
    }

    return {
      mrr,
      active_subscriptions: subsData.data?.length || 0,
      currency: 'chf',
    };
  } catch (e) {
    console.error('fetchRevenueStats error:', e);
    return null;
  }
}

async function collectMetrics(fromIso: string, toIso: string) {
  const [liveSnapshot, funnelStats, subscriptionStats, revenueStats] = await Promise.all([
    rpc('admin_get_live_snapshot', {}),
    rpc('admin_get_funnel_stats', { p_from: fromIso, p_to: toIso }),
    rpc('admin_get_subscription_stats', {}),
    fetchRevenueStats(),
  ]);
  return {
    live_snapshot: liveSnapshot,
    funnel: funnelStats,
    subscriptions: subscriptionStats,
    revenue: revenueStats,
    period: { start: fromIso, end: toIso },
  };
}

// --- Response parsing ---------------------------------------------------

function tryParseJson(text: string): any {
  // Strip markdown codefences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last-resort extraction: find first { ... last }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
    }
    return null;
  }
}

// --- Main handler -------------------------------------------------------

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const body: RequestBody = await req.json().catch(() => ({}));
    const focus: Focus = body.focus || 'full';
    const triggeredBy = body.triggered_by || 'on_demand';

    // --- Auth: only admin (via JWT) or weekly-cron (via service-role header) ---
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    let generatedBy: string | null = null;

    if (triggeredBy === 'weekly' && token === SERVICE_ROLE_KEY) {
      // Cron trigger bypass
      generatedBy = null;
    } else {
      const user = await getUser(token);
      if (!user?.id) return json({ error: 'unauthorized' }, origin, 401);
      if (!(await isAdmin(user.id))) return json({ error: 'forbidden' }, origin, 403);
      generatedBy = user.id;
    }

    // --- Compute period ---
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodStart = body.period_start || defaultFrom.toISOString().slice(0, 10);
    const periodEnd = body.period_end || now.toISOString().slice(0, 10);
    const fromIso = `${periodStart}T00:00:00Z`;
    const toIso = `${periodEnd}T23:59:59Z`;

    // --- Gather data ---
    const metrics = await collectMetrics(fromIso, toIso);

    // --- Call Claude ---
    const systemPrompt = buildSystemPrompt(focus);
    const userPrompt = buildUserPrompt(metrics, { start: periodStart, end: periodEnd }, focus);

    const startTime = Date.now();
    const claudeRes = await callClaude(
      MODEL_INSIGHTS,
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      8000,
      0.4,
    );
    const durationMs = Date.now() - startTime;

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude API failed:', claudeRes.status, errText);
      return json({ error: 'ai_generation_failed', detail: errText }, origin, 502);
    }

    const claudeData = await claudeRes.json();
    const text = extractTextContent(claudeData);
    const parsed = tryParseJson(text);

    if (!parsed) {
      console.error('Failed to parse KI response:', text.slice(0, 500));
      return json({ error: 'ai_invalid_response', raw: text.slice(0, 1000) }, origin, 502);
    }

    // --- Persist report ---
    const report = await insertReport({
      period_start: periodStart,
      period_end: periodEnd,
      report_type: triggeredBy === 'weekly' ? 'weekly' : 'on_demand',
      focus,
      metrics,
      summary: parsed.summary || null,
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      data_gaps: Array.isArray(parsed.data_gaps) ? parsed.data_gaps : [],
      generated_by: generatedBy,
    });

    if (!report) return json({ error: 'persistence_failed' }, origin, 500);

    return json({ ...report, generation_duration_ms: durationMs }, origin);
  } catch (e) {
    console.error('ai-insights-report error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
