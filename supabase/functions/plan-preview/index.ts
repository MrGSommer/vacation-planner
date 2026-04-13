import { corsHeaders, json } from '../_shared/cors.ts';
import { callClaude, extractTextContent } from '../_shared/claude.ts';
import { buildPreviewPromptLight } from '../_shared/prompts.ts';

// IP-based rate limiting: 3 requests per IP per hour
const IP_RATE_LIMIT_MAX = 3;
const IP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IP_RATE_LIMIT_MAX_ENTRIES = 1000;

const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

function cleanupIpRateLimits(): void {
  const now = Date.now();
  for (const [key, val] of ipRateLimits) {
    if (now > val.resetAt) ipRateLimits.delete(key);
  }
  // Prevent unbounded memory growth
  if (ipRateLimits.size > IP_RATE_LIMIT_MAX_ENTRIES) {
    const entries = [...ipRateLimits.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (let i = 0; i < entries.length - IP_RATE_LIMIT_MAX_ENTRIES; i++) {
      ipRateLimits.delete(entries[i][0]);
    }
  }
}

function checkIpRateLimit(ip: string): boolean {
  cleanupIpRateLimits();
  const now = Date.now();
  const entry = ipRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + IP_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= IP_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return json({ error: 'Bitte beschreibe deine Reise (z.B. "3 Wochen Japan").' }, origin, 400);
    }

    // Sanitize query: max 200 chars, strip tags
    const sanitizedQuery = query.trim().slice(0, 200).replace(/<\/?[a-zA-Z_][^>]*>/g, '');

    // IP-based rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || 'unknown';

    if (!checkIpRateLimit(ip)) {
      return json({
        error: 'Zu viele Anfragen. Registriere dich für unbegrenzten Zugang.',
      }, origin, 429);
    }

    // Haiku + light prompt for fast landing page previews (5-15s instead of 60s)
    const systemPrompt = buildPreviewPromptLight(sanitizedQuery);
    const model = 'claude-haiku-4-5';
    const maxTokens = 6144;
    const temperature = 0.4; // Structured JSON output

    const startTime = Date.now();
    const response = await callClaude(model, systemPrompt, [
      { role: 'user', content: `Erstelle einen kompletten Reiseplan für: "${sanitizedQuery}"` },
    ], maxTokens, temperature);

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Claude API error:', response.status, errBody);
      return json({ error: 'Reiseplan konnte nicht erstellt werden. Bitte versuche es erneut.' }, origin, 500);
    }

    const result = await response.json();
    const text = extractTextContent(result);
    const durationMs = Date.now() - startTime;

    // Log for monitoring (no credit deduction, no usage logging to DB)
    console.log(`plan-preview: ip=${ip}, query="${sanitizedQuery.slice(0, 50)}", model=${model}, duration=${durationMs}ms, tokens_in=${result.usage?.input_tokens}, tokens_out=${result.usage?.output_tokens}, stop=${result.stop_reason}`);

    // Parse the JSON response
    let plan;
    try {
      let cleaned = text.trim();
      // Strip markdown code fences if present
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      plan = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse plan JSON:', text.substring(0, 500));
      return json({ error: 'Reiseplan konnte nicht verarbeitet werden. Bitte versuche es erneut.' }, origin, 500);
    }

    // If plan was capped at 5 days, hint the user that there's more
    const previewHint = (plan.days?.length >= 5)
      ? `Dies ist eine Vorschau der ersten ${plan.days.length} Tage. Registriere dich kostenlos, um den kompletten Plan mit Fable zu erstellen — mit Details, Buchungslinks und mehr.`
      : undefined;

    return json({ plan, ...(previewHint && { preview_hint: previewHint }) }, origin);
  } catch (e) {
    console.error('plan-preview error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' }, origin, 500);
  }
});
