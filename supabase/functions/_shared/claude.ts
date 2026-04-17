const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// --- Models (configurable via env vars, with sensible defaults) ---

export const MODELS: Record<string, string> = {
  conversation: Deno.env.get('MODEL_CONVERSATION') || 'claude-haiku-4-5',
  plan_generation: Deno.env.get('MODEL_PLANNING') || 'claude-sonnet-4-6',
  plan_activities: Deno.env.get('MODEL_PLANNING') || 'claude-sonnet-4-6',
  plan_generation_full: Deno.env.get('MODEL_PLANNING') || 'claude-sonnet-4-6',
  agent_packing: Deno.env.get('MODEL_CONVERSATION') || 'claude-haiku-4-5',
  agent_budget: Deno.env.get('MODEL_CONVERSATION') || 'claude-haiku-4-5',
  agent_day_plan: Deno.env.get('MODEL_PLANNING') || 'claude-sonnet-4-6',
  receipt_scan: Deno.env.get('MODEL_PLANNING') || 'claude-sonnet-4-6',
  packing_import: Deno.env.get('MODEL_CONVERSATION') || 'claude-haiku-4-5',
  onboarding: Deno.env.get('MODEL_CONVERSATION') || 'claude-haiku-4-5',
};

// --- Task validation & credit costs (single source of truth) ---

export const VALID_TASKS = [
  'greeting', 'conversation', 'plan_generation', 'plan_activities',
  'plan_generation_full', 'agent_packing', 'agent_budget', 'agent_day_plan',
  'web_search', 'recap', 'receipt_scan', 'packing_import', 'onboarding',
] as const;

export const CREDIT_COSTS: Record<string, number> = {
  greeting: 0,
  conversation: 1,
  recap: 1,
  plan_generation: 3,
  plan_generation_full: 3,
  plan_activities: 1,
  agent_packing: 1,
  agent_budget: 1,
  agent_day_plan: 1,
  web_search: 1,
  receipt_scan: 1,
  packing_import: 0,
  onboarding: 0,
};

// Tasks that produce structured JSON output → lower temperature for consistency
const STRUCTURED_TASKS = new Set([
  'plan_generation', 'plan_activities', 'plan_generation_full',
  'agent_packing', 'agent_budget', 'agent_day_plan', 'receipt_scan', 'packing_import',
]);

export function getTemperature(task: string): number {
  return STRUCTURED_TASKS.has(task) ? 0.4 : 1.0;
}

// --- Rate limiting (in-memory, per user, 10 req/min) ---

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ENTRIES = 500;

const rateLimits = new Map<string, { count: number; resetAt: number }>();

function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, val] of rateLimits) {
    if (now > val.resetAt) rateLimits.delete(key);
  }
}

export function checkRateLimit(userId: string): boolean {
  cleanupRateLimits();
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
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

// --- Premium check ---

export async function isPremiumUser(userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=subscription_tier,subscription_status,subscription_period_end`,
    {
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
    },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  if (!rows?.length) return false;
  const p = rows[0];
  // Premium: tier=premium AND (active, trialing with valid end date, or past_due)
  if (p.subscription_tier !== 'premium') return false;
  if (p.subscription_status === 'active' || p.subscription_status === 'past_due') return true;
  if (p.subscription_status === 'trialing' && p.subscription_period_end) {
    return new Date(p.subscription_period_end) > new Date();
  }
  return false;
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

// --- Fable rate-limit / suspension check ---
// See supabase/migrations/20260416140000_fable_rate_limiting.sql
export interface FableRateLimitResult {
  allowed: boolean;
  limit_type?: 'minute' | 'hour' | 'day' | 'month' | 'suspended';
  current?: number;
  max?: number;
  retry_after?: number;
  suspended_until?: string;
  tier?: 'admin' | 'premium' | 'free';
}

export async function checkFableRateLimit(userId: string): Promise<FableRateLimitResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_fable_rate_limit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (!res.ok) {
      console.error('checkFableRateLimit RPC failed:', res.status, await res.text());
      // Fail-open: if rate-limit check is broken, don't block legitimate users.
      return { allowed: true };
    }
    return await res.json() as FableRateLimitResult;
  } catch (e) {
    console.error('checkFableRateLimit threw:', e);
    return { allowed: true };
  }
}

// --- Credit refund (on API failure) ---

export async function refundCredits(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/refund_ai_credits`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
  }).catch((e) => console.error('Credit refund failed:', e));
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

export function callClaude(model: string, systemPrompt: string, messages: any[], maxTokens: number, temperature = 1.0) {
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
      temperature,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    }),
  });
}

// --- Response parsing ---

export function extractTextContent(result: any): string {
  if (!result?.content || !Array.isArray(result.content)) return '';
  return result.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
}

export function getMaxTokens(task: string): number {
  switch (task) {
    case 'plan_generation':
      return 4096; // Structure only — small JSON
    case 'plan_activities':
      return 12288; // Activities — can be large
    case 'plan_generation_full':
      return 12288; // Legacy full plan
    case 'agent_packing':
      return 4096;
    case 'agent_budget':
      return 2048;
    case 'agent_day_plan':
      return 4096;
    case 'receipt_scan':
      return 2048;
    case 'packing_import':
      return 4096;
    default:
      return 1024; // Conversation
  }
}

// --- Input validation ---

export function validateMessages(messages: unknown): messages is Array<{ role: string; content: string | any[] }> {
  if (!Array.isArray(messages)) return false;
  return messages.every(
    (m) => m && typeof m === 'object' && typeof m.role === 'string' && (typeof m.content === 'string' || Array.isArray(m.content)),
  );
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
