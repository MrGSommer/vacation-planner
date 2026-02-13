// Web Search Edge Function — DuckDuckGo HTML Lite scraping
// No API key needed, JWT-verified, rate-limited

import { corsHeaders, json } from '../_shared/cors.ts';
import { getUser } from '../_shared/claude.ts';

// In-memory rate limiting: 5 searches per minute per user
const searchLimits = new Map<string, { count: number; resetAt: number }>();

function checkSearchRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = searchLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    searchLimits.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function parseDuckDuckGoLite(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo Lite returns results in a table with class="result-link" for titles
  // and class="result-snippet" for snippets. We parse with regex since Deno edge has no DOM parser.

  // Match result links: <a rel="nofollow" href="..." class="result-link">Title</a>
  const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Match snippets: <td class="result-snippet">...</td>
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = decodeHtmlEntities(match[1].trim());
    const title = decodeHtmlEntities(match[2].replace(/<[^>]*>/g, '').trim());
    if (url && title && url.startsWith('http')) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    const snippet = decodeHtmlEntities(match[1].replace(/<[^>]*>/g, '').trim());
    snippets.push(snippet);
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    });
  }

  return results;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Nicht authentifiziert' }, origin, 401);

    const token = authHeader.replace('Bearer ', '');
    const user = await getUser(token);
    if (!user?.id) return json({ error: 'Auth fehlgeschlagen' }, origin, 401);

    // Rate limit
    if (!checkSearchRateLimit(user.id)) {
      return json({ error: 'Zu viele Suchanfragen. Bitte warte kurz.' }, origin, 429);
    }

    const body = await req.json().catch(() => ({}));
    const { query, num_results = 5 } = body;

    if (!query || typeof query !== 'string') {
      return json({ error: 'Suchbegriff fehlt' }, origin, 400);
    }

    // Fetch DuckDuckGo Lite
    const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WayFable/1.0)',
        'Accept': 'text/html',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      console.error(`DuckDuckGo error: ${response.status}`);
      return json({ error: 'Websuche fehlgeschlagen' }, origin, 502);
    }

    const html = await response.text();
    const results = parseDuckDuckGoLite(html, Math.min(num_results, 10));

    return json({ results }, origin);
  } catch (e) {
    console.error('web-search error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
