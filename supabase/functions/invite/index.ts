import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const { token, userId } = body;

    if (!token) {
      return json({ error: 'Token fehlt' }, 400);
    }

    // Look up invitation
    const { data: invitation, error: invError } = await supabase
      .from('trip_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (invError || !invitation) {
      return json({ error: 'Einladung nicht gefunden' }, 404);
    }

    // If no userId provided, just return invitation + trip info (lookup mode)
    if (!userId) {
      const { data: trip } = await supabase
        .from('trips')
        .select('id, name, destination, start_date, end_date')
        .eq('id', invitation.trip_id)
        .single();

      return json({ invitation, trip });
    }

    // Accept mode: userId is provided
    if (invitation.status !== 'pending') {
      return json({ error: 'Einladung wurde bereits verwendet' }, 400);
    }

    const { error: collabError } = await supabase
      .from('trip_collaborators')
      .insert({
        trip_id: invitation.trip_id,
        user_id: userId,
        role: invitation.role,
      });

    if (collabError) {
      return json({ error: collabError.message }, 500);
    }

    await supabase
      .from('trip_invitations')
      .update({ status: 'accepted', invited_email: null })
      .eq('token', token);

    return json({ success: true, trip_id: invitation.trip_id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});
