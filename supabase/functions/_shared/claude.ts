const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

export const MODELS: Record<string, string> = {
  conversation: 'claude-haiku-4-5-20251001',
  plan_generation: 'claude-sonnet-4-5-20250929',
  plan_activities: 'claude-sonnet-4-5-20250929',
  plan_generation_full: 'claude-sonnet-4-5-20250929',
};

// --- Rate limiting (in-memory, per user, 10 req/min) ---

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// --- Auth ---

export async function getUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Credits ---

export async function deductCreditsAtomic(userId: string, amount: number): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deduct_ai_credits`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
  });
  const result = await res.json();
  return typeof result === 'number' ? result : -1;
}

// --- Logging ---

export function logUsage(
  userId: string,
  tripId: string | null,
  taskType: string,
  credits: number,
  model: string,
  usage?: { input_tokens?: number; output_tokens?: number },
  durationMs?: number,
) {
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
      input_tokens: usage?.input_tokens || null,
      output_tokens: usage?.output_tokens || null,
      model,
      duration_ms: durationMs || null,
    }),
  }).catch(() => {});
}

// --- Claude API ---

export function callClaude(model: string, systemPrompt: string, messages: any[], maxTokens: number) {
  return fetch('https://api.anthropic.com/v1/messages', {
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
}

export function getMaxTokens(task: string): number {
  switch (task) {
    case 'plan_generation':
      return 4096; // Structure only — small JSON
    case 'plan_activities':
      return 12288; // Activities — can be large
    case 'plan_generation_full':
      return 12288; // Legacy full plan
    default:
      return 1024; // Conversation
  }
}

export function getAnthropicKey(): string {
  return ANTHROPIC_KEY;
}

export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

export function getServiceRoleKey(): string {
  return SERVICE_ROLE_KEY;
}
