import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function tryGetUser(req: Request): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SERVICE_ROLE_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id ? { id: data.id } : null;
  } catch {
    return null;
  }
}

const DEFAULT_SHARE_CONFIG = {
  activities: true,
  stops: true,
  photos: false,
  budget: false,
  packing: false,
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token) {
      return json({ error: 'Token fehlt' }, origin, 400);
    }

    // Look up invitation — must be type 'info' and still active
    const { data: invitation, error: invError } = await supabase
      .from('trip_invitations')
      .select('*')
      .eq('token', token)
      .eq('type', 'info')
      .eq('is_active', true)
      .single();

    if (invError || !invitation) {
      return json({ error: 'Share-Link nicht gefunden' }, origin, 404);
    }

    const tripId = invitation.trip_id;
    const shareConfig = invitation.share_config ?? DEFAULT_SHARE_CONFIG;

    // Load trip (always)
    const { data: trip } = await supabase
      .from('trips')
      .select('id, name, destination, start_date, end_date, cover_image_url, currency')
      .eq('id', tripId)
      .single();

    if (!trip) {
      return json({ error: 'Reise nicht gefunden' }, origin, 404);
    }

    // Check if user is authenticated
    const user = await tryGetUser(req);
    const isAuthenticated = !!user;

    // Anonymous users: only trip basics
    if (!isAuthenticated) {
      return json({
        trip,
        stops: [],
        activities: [],
        photos: [],
        budget: null,
        packing: [],
        shared_sections: shareConfig,
        is_authenticated: false,
      }, origin);
    }

    // Authenticated users: load data based on share_config
    let stops: unknown[] = [];
    let activities: unknown[] = [];
    let photos: unknown[] = [];
    let budget: unknown = null;
    let packing: unknown[] = [];

    if (shareConfig.stops) {
      const { data } = await supabase
        .from('activities')
        .select('id, title, location_name, location_lat, location_lng, location_address, check_in_date, check_out_date, category, sort_order')
        .eq('trip_id', tripId)
        .in('category', ['hotel', 'stop'])
        .order('sort_order');
      stops = data || [];
    }

    if (shareConfig.activities) {
      const { data } = await supabase
        .from('activities')
        .select('id, title, description, category, date, start_time, end_time, location_name, latitude, longitude, stop_id, is_checked_in')
        .eq('trip_id', tripId)
        .order('date')
        .order('start_time');
      activities = data || [];
    }

    if (shareConfig.photos) {
      const { data } = await supabase
        .from('photos')
        .select('id, url, thumbnail_url, caption, taken_at')
        .eq('trip_id', tripId)
        .order('taken_at', { ascending: false });
      photos = data || [];
    }

    if (shareConfig.budget) {
      const { data: categories } = await supabase
        .from('budget_categories')
        .select('id, name, color')
        .eq('trip_id', tripId);
      const catMap = new Map((categories || []).map((c: any) => [c.id, c]));

      const { data: expenses } = await supabase
        .from('expenses')
        .select('description, amount, date, category_id, currency')
        .eq('trip_id', tripId)
        .order('date', { ascending: false });

      const expenseList = (expenses || []).map((e: any) => {
        const cat = catMap.get(e.category_id);
        return {
          description: e.description,
          amount: e.amount,
          date: e.date,
          category_name: cat?.name ?? '',
          category_color: cat?.color ?? '#999',
        };
      });

      const total = (expenses || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      const currency = expenses?.[0]?.currency ?? trip.currency ?? 'CHF';

      budget = { total, currency, expenses: expenseList };
    }

    if (shareConfig.packing) {
      const { data: lists } = await supabase
        .from('packing_lists')
        .select('id, name')
        .eq('trip_id', tripId);

      if (lists && lists.length > 0) {
        const listIds = lists.map((l: any) => l.id);
        const { data: items } = await supabase
          .from('packing_items')
          .select('list_id, name, category, is_packed')
          .in('list_id', listIds);

        packing = lists.map((l: any) => ({
          name: l.name,
          items: (items || []).filter((i: any) => i.list_id === l.id).map((i: any) => ({
            name: i.name,
            category: i.category,
            is_packed: i.is_packed,
          })),
        }));
      }
    }

    return json({
      trip,
      stops,
      activities,
      photos,
      budget,
      packing,
      shared_sections: shareConfig,
      is_authenticated: true,
    }, origin);
  } catch (e) {
    return json({ error: (e as Error).message }, origin, 500);
  }
});
