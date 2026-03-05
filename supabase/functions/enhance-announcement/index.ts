// Enhance-Announcement Edge Function — AI-powered marketing text enhancement for admin announcements
// Admin-only, no credit cost, standalone function to keep ai-chat lean

import { corsHeaders, json } from '../_shared/cors.ts';
import {
  checkRateLimit, getUser, getAnthropicKey, callClaude, extractTextContent,
} from '../_shared/claude.ts';

const SYSTEM_PROMPT = (audience: string) => `Du bist Fable, der Marketing-Assistent von WayFable — einer Reiseplanungs-App aus der Schweiz.

Deine Aufgabe: Verbessere die gegebene In-App-Ankündigung. Mache Titel knackiger, Text überzeugender, und schlage passende CTA-Buttons und Bilder vor.

KONTEXT:
- App-Name: WayFable
- Zielgruppe: ${audience === 'premium' ? 'Premium-Abonnenten' : audience === 'free' ? 'Gratis-Nutzer (Upselling erwünscht)' : 'Alle Nutzer'}

TONALITÄT:
- Freundlich, persönlich, leicht humorvoll
- Kurz und knackig — keine Romane
- Begeisterung wecken, nicht aufdringlich sein
- Emojis sparsam und gezielt (max 1-2)

VERFÜGBARE INTERNE ROUTEN für cta_url:
- /subscription — Premium-Abo Seite
- /profile — Profil bearbeiten
- /feedback — Feedback geben
- /trip/{latestTrip} — Zum aktuellsten Trip des Users
- /trip/{latestTrip}/budget — Budget-Übersicht
- /trip/{latestTrip}/packing — Packliste
- /trip/{latestTrip}/itinerary — Reiseprogramm
- /trip/{latestTrip}/photos — Fotos
- /trip/{latestTrip}/stops — Stopps/Unterkünfte
- /trip/{latestTrip}/map — Karte
Nutze {latestTrip} als Platzhalter — wird automatisch durch die Trip-ID des Users ersetzt.
Wähle die Route passend zum Ankündigungs-Inhalt (z.B. Budget-Feature → /trip/{latestTrip}/budget).

REGELN:
- Behalte die Kernaussage bei, verbessere nur Formulierung und Wirkung
- Wenn CTA-Text/URL leer sind: schlage passende Werte vor
- Wenn bereits gut: kleine Feinschliff-Verbesserungen reichen

Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Codeblock):
{
  "title": "Kurzer, packender Titel (max 50 Zeichen)",
  "body": "Beschreibender Text (2-3 Sätze, max 200 Zeichen)",
  "cta_text": "Button-Text (2-4 Wörter, z.B. 'Jetzt entdecken')",
  "cta_url": "Interne Route oder externe URL",
  "image_search": "Ein englischer Suchbegriff für Unsplash (z.B. 'tropical beach sunset', 'mountain hiking adventure')"
}`;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { messages, context } = body;

    if (!messages || !Array.isArray(messages)) {
      return json({ error: 'Fehlende Parameter: messages' }, origin, 400);
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

    if (!getAnthropicKey()) return json({ error: 'AI-Service nicht konfiguriert' }, origin, 500);

    const model = Deno.env.get('MODEL_CONVERSATION') || 'claude-haiku-4-5';
    const systemPrompt = SYSTEM_PROMPT(context?.audience || 'all');

    const response = await callClaude(model, systemPrompt, messages, 1024, 0.4);

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return json({ error: 'Rate Limit erreicht – bitte kurz warten', retryable: true }, origin, 429);
      if (status === 529) return json({ error: 'AI-Service momentan überlastet – bitte kurz warten', retryable: true }, origin, 529);
      console.error(`Claude API error ${status}:`, await response.text().catch(() => ''));
      return json({ error: 'Enhance fehlgeschlagen' }, origin, 502);
    }

    const result = await response.json();
    const content = extractTextContent(result);

    return json({ content, usage: result.usage }, origin);
  } catch (e) {
    console.error('enhance-announcement error:', e);
    return json({ error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.' }, origin, 500);
  }
});
