// AI Chat Edge Function — uses shared modules for prompts, Claude API, and CORS
// Handles conversation, structure generation, activities generation, and full plan generation

import { corsHeaders, json } from '../_shared/cors.ts';
import { MODELS, checkRateLimit, getUser, deductCreditsAtomic, logUsage, callClaude, getMaxTokens, getAnthropicKey } from '../_shared/claude.ts';
import { buildSystemPrompt } from '../_shared/prompts.ts';

// --- Main handler ---

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { task, messages, context } = body;

    if (!task || !messages || !context) {
      return json({ error: 'Fehlende Parameter: task, messages, context' }, origin, 400);
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, origin, 401);

    // Rate limiting
    if (!checkRateLimit(user.id)) {
      return json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, origin, 429);
    }

    // Credit deduction: plan_generation/plan_generation_full=3, all others=1
    const creditsRequired = (task === 'plan_generation' || task === 'plan_generation_full') ? 3 : 1;
    // Agent tasks: log as their own task_type (already in CHECK constraint)
    const newBalance = await deductCreditsAtomic(user.id, creditsRequired);

    if (newBalance === -1) {
      return json({
        error: `Nicht genügend Inspirationen. Du brauchst ${creditsRequired}. Kaufe weitere Inspirationen um Fable zu nutzen.`,
      }, origin, 403);
    }

    // Build prompt + call Claude
    const model = MODELS[task as keyof typeof MODELS] || MODELS.conversation;
    const systemPrompt = buildSystemPrompt(task, context);
    const maxTokens = getMaxTokens(task);

    if (!getAnthropicKey()) return json({ error: 'AI-Service nicht konfiguriert' }, origin, 500);

    const startTime = Date.now();
    const response = await callClaude(model, systemPrompt, messages, maxTokens);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return json({ error: 'Rate Limit erreicht – bitte kurz warten', retryable: true }, origin, 429);
      if (status === 529) return json({ error: 'AI-Service momentan überlastet – bitte kurz warten', retryable: true }, origin, 529);
      console.error(`Claude API error ${status}:`, await response.text().catch(() => ''));
      return json({ error: 'AI-Anfrage fehlgeschlagen' }, origin, 502);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    // Log as valid task_type (plan_generation_full → plan_generation for DB constraint)
    const logTask = task === 'plan_generation_full' ? 'plan_generation' : task;
    logUsage(user.id, context.tripId || null, logTask, creditsRequired, model, result.usage, durationMs);

    return json({ content, usage: result.usage, credits_remaining: newBalance }, origin);
  } catch (e) {
    console.error('ai-chat error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
