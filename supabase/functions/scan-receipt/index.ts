// Beleg-Scanner Edge Function — dedizierter AI-Agent fuer OCR von Kassenbelegen
// Hybrid-Gating: Premium scannt gratis, Free zahlt 1 Inspiration

import { corsHeaders, json } from '../_shared/cors.ts';
import {
  MODELS, CREDIT_COSTS,
  checkRateLimit, getUser, isPremiumUser, deductCreditsAtomic, refundCredits,
  logUsage, callClaude, getMaxTokens, getTemperature, getAnthropicKey,
  extractTextContent, getSupabaseUrl, getServiceRoleKey,
} from '../_shared/claude.ts';
import { buildReceiptScanPrompt } from '../_shared/prompts.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { messages, context } = body;

    if (!messages || !context) {
      return json({ error: 'Fehlende Parameter: messages, context' }, origin, 400);
    }

    // Messages muessen ein Array sein (Vision: content ist ein Array mit image+text Bloecken)
    if (!Array.isArray(messages) || !messages.every(
      (m: any) => m && typeof m === 'object' && typeof m.role === 'string' && (typeof m.content === 'string' || Array.isArray(m.content)),
    )) {
      return json({ error: 'Ungueltiges Nachrichtenformat' }, origin, 400);
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, origin, 401);

    // Rate Limiting
    if (!checkRateLimit(user.id)) {
      return json({ error: 'Zu viele Anfragen. Bitte warte kurz.' }, origin, 429);
    }

    // Hybrid-Gating: Premium scannt gratis, Free zahlt 1 Inspiration
    const premium = await isPremiumUser(user.id);
    const creditsRequired = premium ? 0 : (CREDIT_COSTS['receipt_scan'] ?? 1);

    let newBalance: number | undefined;

    if (creditsRequired > 0) {
      newBalance = await deductCreditsAtomic(user.id, creditsRequired);
      if (newBalance === -1) {
        return json({
          error: `Nicht genuegend Inspirationen. Du brauchst ${creditsRequired}. Kaufe weitere Inspirationen um den Beleg-Scanner zu nutzen.`,
        }, origin, 403);
      }
    }

    // Prompt + Claude aufrufen
    const model = MODELS['receipt_scan'] || MODELS.conversation;
    const systemPrompt = buildReceiptScanPrompt(context);
    const maxTokens = getMaxTokens('receipt_scan');
    const temperature = getTemperature('receipt_scan');

    if (!getAnthropicKey()) return json({ error: 'AI-Service nicht konfiguriert' }, origin, 500);

    const startTime = Date.now();
    const response = await callClaude(model, systemPrompt, messages, maxTokens, temperature);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      // Credits zurueckerstatten bei API-Fehler
      if (creditsRequired > 0) {
        await refundCredits(user.id, creditsRequired);
        if (newBalance !== undefined) newBalance += creditsRequired;
      }

      const status = response.status;
      if (status === 429) return json({ error: 'Rate Limit erreicht – bitte kurz warten', retryable: true, credits_remaining: newBalance ?? null }, origin, 429);
      if (status === 529) return json({ error: 'AI-Service momentan ueberlastet – bitte kurz warten', retryable: true, credits_remaining: newBalance ?? null }, origin, 529);
      console.error(`Claude API error ${status}:`, await response.text().catch(() => ''));
      return json({ error: 'Beleg-Scan fehlgeschlagen', credits_remaining: newBalance ?? null }, origin, 502);
    }

    const result = await response.json();
    const content = extractTextContent(result);

    // Nutzung loggen
    logUsage(user.id, context.tripId || null, 'receipt_scan', creditsRequired, model, result.usage, durationMs);

    return json({ content, usage: result.usage, credits_remaining: newBalance ?? null }, origin);
  } catch (e) {
    console.error('scan-receipt error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.' }, origin, 500);
  }
});
