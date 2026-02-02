import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'Token fehlt' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: invitation, error: invError } = await supabase
        .from('trip_invitations')
        .select('*')
        .eq('token', token)
        .single();

      if (invError || !invitation) {
        return new Response(JSON.stringify({ error: 'Einladung nicht gefunden' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: trip } = await supabase
        .from('trips')
        .select('id, name, destination, start_date, end_date')
        .eq('id', invitation.trip_id)
        .single();

      return new Response(JSON.stringify({ invitation, trip }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const { token, userId } = await req.json();

      if (!token || !userId) {
        return new Response(JSON.stringify({ error: 'Token und userId erforderlich' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: invitation, error: invError } = await supabase
        .from('trip_invitations')
        .select('*')
        .eq('token', token)
        .single();

      if (invError || !invitation) {
        return new Response(JSON.stringify({ error: 'Einladung nicht gefunden' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (invitation.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Einladung wurde bereits verwendet' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: collabError } = await supabase
        .from('trip_collaborators')
        .insert({
          trip_id: invitation.trip_id,
          user_id: userId,
          role: invitation.role,
        });

      if (collabError) {
        return new Response(JSON.stringify({ error: collabError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('trip_invitations')
        .update({ status: 'accepted', invited_email: null })
        .eq('token', token);

      return new Response(JSON.stringify({ success: true, trip_id: invitation.trip_id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
