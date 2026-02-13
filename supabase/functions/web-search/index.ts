// Web Search Edge Function — DuckDuckGo HTML + page content extraction
// Falls back to Brave Search API if BRAVE_SEARCH_API_KEY is set

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
  pageContent?: string;
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

function extractTextFromHtml(html: string, maxLength = 3000): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<[^>]*>/g, ' ');
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }
  return text;
}

async function fetchPageContent(url: string, timeoutMs = 5000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return '';
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return '';
    const html = await response.text();
    return extractTextFromHtml(html);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

// --- DuckDuckGo HTML Search ---

function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG HTML results: <a rel="nofollow" class="result__a" href="URL">Title</a>
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  // DDG HTML snippets: <a class="result__snippet" ...>text</a>
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const links: { url: string; title: string }[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let url = decodeHtmlEntities(match[1].trim());
    // DDG wraps URLs in a redirect: //duckduckgo.com/l/?uddg=ENCODED_URL
    if (url.includes('uddg=')) {
      const uddgMatch = url.match(/uddg=([^&]*)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
    }
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

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  // Use POST to html.duckduckgo.com/html/ with form data (mimics browser form submission)
  const response = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
      'Referer': 'https://html.duckduckgo.com/',
    },
    body: `q=${encodeURIComponent(query)}&b=&kl=ch-de&df=`,
  });

  if (!response.ok) {
    console.error(`DDG error: ${response.status}`);
    return [];
  }

  const html = await response.text();

  // Detect CAPTCHA
  if (html.includes('challenge') && html.includes('duck')) {
    console.warn('DDG returned CAPTCHA — trying Lite endpoint');
    return searchDuckDuckGoLite(query, maxResults);
  }

  return parseDuckDuckGoHtml(html, maxResults);
}

async function searchDuckDuckGoLite(query: string, maxResults: number): Promise<SearchResult[]> {
  const response = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=ch-de`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
    },
  });

  if (!response.ok) return [];
  const html = await response.text();

  if (html.includes('challenge') && html.includes('duck')) {
    console.warn('DDG Lite also returned CAPTCHA');
    return [];
  }

  // Lite: <a rel="nofollow" href="..." class="result-link">Title</a>
  const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const results: SearchResult[] = [];
  const links: { url: string; title: string }[] = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = decodeHtmlEntities(match[1].trim());
    const title = decodeHtmlEntities(match[2].replace(/<[^>]*>/g, '').trim());
    if (url && title && url.startsWith('http')) links.push({ url, title });
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHtmlEntities(match[1].replace(/<[^>]*>/g, '').trim()));
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] || '' });
  }

  return results;
}

// --- Brave Search API (optional, if key is set) ---

async function searchBrave(query: string, apiKey: string, maxResults: number): Promise<SearchResult[]> {
  const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}&search_lang=de&text_decorations=false`;

  const response = await fetch(searchUrl, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    console.error(`Brave Search error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const webResults = data?.web?.results || [];

  return webResults.slice(0, maxResults).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }));
}

// --- Main Handler ---

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
    const { query, num_results = 5, fetch_content = true } = body;

    if (!query || typeof query !== 'string') {
      return json({ error: 'Suchbegriff fehlt' }, origin, 400);
    }

    const count = Math.min(num_results, 10);
    let results: SearchResult[] = [];

    // Try Brave first if API key is available, otherwise use DDG
    const braveKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
    if (braveKey) {
      results = await searchBrave(query, braveKey, count);
    }

    // Fallback to DuckDuckGo if Brave not available or returned no results
    if (results.length === 0) {
      results = await searchDuckDuckGo(query, count);
    }

    // Fetch page content for top results (parallel, with timeout)
    if (fetch_content && results.length > 0) {
      const topResults = results.slice(0, 3);
      const contentPromises = topResults.map(r => fetchPageContent(r.url));
      const contents = await Promise.all(contentPromises);

      contents.forEach((content, i) => {
        if (content && content.length > 50) {
          results[i].pageContent = content;
        }
      });
    }

    return json({ results }, origin);
  } catch (e) {
    console.error('web-search error:', e);
    return json({ error: (e as Error).message }, origin, 500);
  }
});
