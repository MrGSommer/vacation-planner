// AI Chat Edge Function — uses shared modules for prompts, Claude API, and CORS
// Handles conversation, structure generation, activities generation, and full plan generation

import { corsHeaders, json } from '../_shared/cors.ts';
import {
  MODELS, VALID_TASKS, CREDIT_COSTS,
  checkRateLimit, checkFableRateLimit, getUser, isPremiumUser, deductCreditsAtomic, refundCredits,
  logUsage, callClaude, getMaxTokens, getTemperature, getAnthropicKey,
  extractTextContent, validateMessages,
  getSupabaseUrl, getServiceRoleKey,
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

    // In-memory per-instance rate limit (fast path, coarse)
    if (!checkRateLimit(user.id)) {
      return json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, origin, 429);
    }

    // Fable tier-based rate limit + abuse/suspension check (DB-backed)
    const rateCheck = await checkFableRateLimit(user.id);
    if (!rateCheck.allowed) {
      const retryAfter = rateCheck.retry_after || 60;
      const errorMsg = rateCheck.limit_type === 'suspended'
        ? 'Fable ist für dein Konto temporär gesperrt. Kontaktiere Support.'
        : rateCheck.limit_type === 'month'
          ? 'Monats-Limit erreicht. Bitte kontaktiere Support wenn du mehr benötigst.'
          : 'Fable macht kurz Pause (zu viele Anfragen). Bitte kurz warten.';
      return new Response(
        JSON.stringify({
          error: errorMsg,
          code: 'rate_limit_exceeded',
          limit_type: rateCheck.limit_type,
          current: rateCheck.current,
          max: rateCheck.max,
          retry_after: retryAfter,
          suspended_until: rateCheck.suspended_until,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    // Credit deduction (from central config) — Premium users skip
    const premium = await isPremiumUser(user.id);
    const creditsRequired = premium ? 0 : (CREDIT_COSTS[task] ?? 1);
    let newBalance: number | undefined;

    if (creditsRequired > 0) {
      newBalance = await deductCreditsAtomic(user.id, creditsRequired);

      if (newBalance === -1) {
        return json({
          error: `Nicht genügend Inspirationen. Du brauchst ${CREDIT_COSTS[task] ?? 1}. Kaufe weitere Inspirationen um Fable zu nutzen.`,
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

    // Onboarding post-processing: profile update + onboarding_completed flag
    if (task === 'onboarding') {
      const supabaseUrl = getSupabaseUrl();
      const serviceKey = getServiceRoleKey();
      const patchHeaders = {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };
      const profileUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`;

      // Parse <profile_update> tags — fire-and-forget (supplementary)
      const profileMatch = content.match(/<profile_update>([\s\S]*?)<\/profile_update>/);
      if (profileMatch) {
        try {
          const profileData = JSON.parse(profileMatch[1]);
          const updates: Record<string, any> = {};
          if (profileData.first_name && typeof profileData.first_name === 'string') {
            updates.first_name = profileData.first_name.slice(0, 100);
          }
          if (profileData.last_name && typeof profileData.last_name === 'string') {
            updates.last_name = profileData.last_name.slice(0, 100);
          }
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            fetch(profileUrl, {
              method: 'PATCH',
              headers: patchHeaders,
              body: JSON.stringify(updates),
            }).catch((e) => console.error('Onboarding profile update failed:', e));
          }
        } catch (e) {
          console.error('Failed to parse profile_update:', e);
        }
      }

      // Parse <metadata> for onboarding_complete flag — awaited so client refresh sees it
      const metaMatch = content.match(/<metadata>([\s\S]*?)<\/metadata>/);
      if (metaMatch) {
        try {
          const meta = JSON.parse(metaMatch[1]);
          if (meta.onboarding_complete === true) {
            await fetch(profileUrl, {
              method: 'PATCH',
              headers: patchHeaders,
              body: JSON.stringify({ onboarding_completed: true, updated_at: new Date().toISOString() }),
            }).catch((e) => console.error('Onboarding completed update failed:', e));
          }
        } catch (e) {
          console.error('Failed to parse onboarding metadata:', e);
        }
      }
    }

    // Log usage
    const logTask = task === 'plan_generation_full' ? 'plan_generation' : (task === 'greeting' || task === 'recap') ? 'conversation' : task;
    logUsage(user.id, context.tripId || null, logTask, creditsRequired, model, result.usage, durationMs);

    return json({ content, usage: result.usage, credits_remaining: newBalance ?? null }, origin);
  } catch (e) {
    console.error('ai-chat error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.' }, origin, 500);
  }
});
