import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  }

  try {
    const { token } = await req.json();
    if (!token) return json({ error: 'Token fehlt' }, origin, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fetch slideshow share by token
    const shareRes = await fetch(
      `${SUPABASE_URL}/rest/v1/slideshow_shares?token=eq.${token}&select=*`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const shares = await shareRes.json();
    if (!shares || shares.length === 0) {
      return json({ error: 'Diashow nicht gefunden' }, origin, 404);
    }

    const share = shares[0];

    // Check expiry
    if (new Date(share.expires_at) < new Date()) {
      return json({ error: 'Dieser Diashow-Link ist abgelaufen' }, origin, 410);
    }

    // Fetch photo URLs from trip_photos table
    const photoIds = share.photo_ids as string[];
    if (photoIds.length === 0) {
      return json({ error: 'Keine Fotos in dieser Diashow' }, origin, 404);
    }

    // Fetch photos in order
    const photosRes = await fetch(
      `${SUPABASE_URL}/rest/v1/trip_photos?id=in.(${photoIds.map((id: string) => `"${id}"`).join(',')})&select=id,url`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }
    );
    const photos = await photosRes.json();

    // Sort photos in the order specified by photo_ids
    const photoMap = new Map(photos.map((p: any) => [p.id, p]));
    const orderedPhotos = photoIds
      .map((id: string) => photoMap.get(id))
      .filter(Boolean)
      .map((p: any) => ({ url: p.url }));

    // Build music URL
    const musicUrl = `${SUPABASE_URL}/storage/v1/object/public/music/${share.music_track}.mp3`;

    return json({
      music_track: share.music_track,
      interval_ms: share.interval_ms,
      trip_name: share.trip_name,
      photos: orderedPhotos,
      music_url: musicUrl,
      expires_at: share.expires_at,
    }, origin);
  } catch (_e) {
    return json({ error: 'Interner Fehler' }, origin, 500);
  }
});
