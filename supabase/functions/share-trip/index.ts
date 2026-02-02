import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token) {
      return json({ error: 'Token fehlt' }, 400);
    }

    // Look up invitation — must be type 'info'
    const { data: invitation, error: invError } = await supabase
      .from('trip_invitations')
      .select('*')
      .eq('token', token)
      .eq('type', 'info')
      .single();

    if (invError || !invitation) {
      return json({ error: 'Share-Link nicht gefunden' }, 404);
    }

    // Load trip
    const { data: trip } = await supabase
      .from('trips')
      .select('id, name, destination, start_date, end_date, cover_image_url')
      .eq('id', invitation.trip_id)
      .single();

    if (!trip) {
      return json({ error: 'Reise nicht gefunden' }, 404);
    }

    // Load stops
    const { data: stops } = await supabase
      .from('trip_stops')
      .select('id, name, latitude, longitude, order_index, arrival_date, departure_date')
      .eq('trip_id', invitation.trip_id)
      .order('order_index');

    // Load activities
    const { data: activities } = await supabase
      .from('activities')
      .select('id, title, description, category, date, start_time, end_time, location_name, latitude, longitude, stop_id, is_checked_in')
      .eq('trip_id', invitation.trip_id)
      .order('date')
      .order('start_time');

    return json({
      trip,
      stops: stops || [],
      activities: activities || [],
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
