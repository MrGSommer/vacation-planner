import { supabase } from './supabase';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(
  query: string,
  numResults = 5,
): Promise<WebSearchResult[]> {
  const { data, error } = await supabase.functions.invoke('web-search', {
    body: { query, num_results: numResults },
  });

  if (data?.error) throw new Error(data.error);
  if (error) throw new Error(error.message || 'Websuche fehlgeschlagen');

  return data?.results || [];
}
