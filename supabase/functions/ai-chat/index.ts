// AI Chat Edge Function — uses shared modules for prompts, Claude API, and CORS
// Handles conversation, structure generation, activities generation, and full plan generation

import { corsHeaders, json } from '../_shared/cors.ts';
import {
  MODELS, VALID_TASKS, CREDIT_COSTS,
  checkRateLimit, getUser, deductCreditsAtomic, refundCredits,
  logUsage, callClaude, getMaxTokens, getTemperature, getAnthropicKey,
  extractTextContent, validateMessages,
} from '../_shared/claude.ts';
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

    // Task validation
    if (!VALID_TASKS.includes(task)) {
      return json({ error: 'Ungültiger Task-Typ' }, origin, 400);
    }

    // Messages validation
    if (!validateMessages(messages)) {
      return json({ error: 'Ungültiges Nachrichtenformat' }, origin, 400);
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

    // Credit deduction (from central config)
    const creditsRequired = CREDIT_COSTS[task] ?? 1;
    let newBalance: number | undefined;

    if (creditsRequired > 0) {
      newBalance = await deductCreditsAtomic(user.id, creditsRequired);

      if (newBalance === -1) {
        return json({
          error: `Nicht genügend Inspirationen. Du brauchst ${creditsRequired}. Kaufe weitere Inspirationen um Fable zu nutzen.`,
        }, origin, 403);
      }
    }

    // Build prompt + call Claude
    // greeting uses conversation prompt + model
    const effectiveTask = task === 'greeting' ? 'conversation' : task;
    const model = MODELS[effectiveTask as keyof typeof MODELS] || MODELS.conversation;
    const systemPrompt = buildSystemPrompt(effectiveTask, context);
    const maxTokens = getMaxTokens(effectiveTask);
    const temperature = getTemperature(effectiveTask);

    if (!getAnthropicKey()) return json({ error: 'AI-Service nicht konfiguriert' }, origin, 500);

    const startTime = Date.now();
    const response = await callClaude(model, systemPrompt, messages, maxTokens, temperature);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      // Refund credits on API failure
      if (creditsRequired > 0) {
        await refundCredits(user.id, creditsRequired);
        if (newBalance !== undefined) newBalance += creditsRequired;
      }

      const status = response.status;
      if (status === 429) return json({ error: 'Rate Limit erreicht – bitte kurz warten', retryable: true, credits_remaining: newBalance ?? null }, origin, 429);
      if (status === 529) return json({ error: 'AI-Service momentan überlastet – bitte kurz warten', retryable: true, credits_remaining: newBalance ?? null }, origin, 529);
      console.error(`Claude API error ${status}:`, await response.text().catch(() => ''));
      return json({ error: 'AI-Anfrage fehlgeschlagen', credits_remaining: newBalance ?? null }, origin, 502);
    }

    const result = await response.json();
    const content = extractTextContent(result);

    // Log usage
    const logTask = task === 'plan_generation_full' ? 'plan_generation' : (task === 'greeting' || task === 'recap') ? 'conversation' : task;
    logUsage(user.id, context.tripId || null, logTask, creditsRequired, model, result.usage, durationMs);

    return json({ content, usage: result.usage, credits_remaining: newBalance ?? null }, origin);
  } catch (e) {
    console.error('ai-chat error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.' }, origin, 500);
  }
});
