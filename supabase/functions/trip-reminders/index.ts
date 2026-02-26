const SU = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IAS = Deno.env.get('INTERNAL_API_SECRET') || '';
const SITE = Deno.env.get('SITE_URL') || 'https://wayfable.ch';

function isAuth(r: Request) {
  const t = (r.headers.get('Authorization') || '').replace('Bearer ', '');
  return t === SRK || t === IAS;
}

async function sq(p: string) {
  return (await fetch(`${SU}/rest/v1/${p}`, {
    headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK },
  })).json();
}

async function callFn(n: string, b: object): Promise<{ sent?: boolean; error?: string }> {
  try {
    const r = await fetch(`${SU}/functions/v1/${n}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error(`callFn(${n}): HTTP ${r.status} — ${text}`);
      return { sent: false, error: `HTTP ${r.status}` };
    }
    const data = await r.json();
    return data;
  } catch (e) {
    console.error(`callFn(${n}): exception —`, e);
    return { sent: false, error: String(e) };
  }
}

async function wasN(u: string, t: string, ty: string) {
  const s = new Date();
  s.setHours(s.getHours() - 20);
  const r = await sq(`notification_logs?user_id=eq.${u}&trip_id=eq.${t}&notification_type=eq.${ty}&created_at=gte.${s.toISOString()}&select=id&limit=1`);
  return Array.isArray(r) && r.length > 0;
}

async function logN(u: string, t: string, ty: string, c: string) {
  await fetch(`${SU}/rest/v1/notification_logs`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ user_id: u, trip_id: t, notification_type: ty, channel: c }),
  });
}

const UNSUB = `${SITE}/notifications`;

const footer = `<hr style="border:none;border-top:1px solid #eee;margin:24px 0 16px"/><p style="font-size:12px;color:#999;text-align:center"><a href="${UNSUB}" style="color:#999">Benachrichtigungseinstellungen \u00e4ndern</a></p>`;

function completionEmailHtml(p: any, t: any, stats: { activities: number; stops: number; photos: number; days: number }) {
  const g = p.first_name ? `Hallo ${p.first_name}` : 'Hallo';
  return `<html><body style="font-family:sans-serif;padding:20px"><div style="max-width:500px;margin:0 auto;background:#FFF;border-radius:16px;padding:32px">
    <h2>${g},</h2>
    <p>Deine Reise <b>${t.name}</b> nach <b>${t.destination}</b> ist vorbei — willkommen zur\u00fcck! \u{1F389}</p>
    <div style="background:#F8F9FA;border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:4px 0"><b>${stats.days}</b> Tage &middot; <b>${stats.activities}</b> Aktivit\u00e4ten &middot; <b>${stats.stops}</b> Stops &middot; <b>${stats.photos}</b> Fotos</p>
    </div>
    <a href="${SITE}/trip/${t.id}" style="display:inline-block;background:#4ECDC4;color:#FFF;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:12px;font-weight:600">R\u00fcckblick ansehen</a>
    <p style="margin-top:16px;color:#636E72;font-size:14px">Lass dir von Fable einen pers\u00f6nlichen R\u00fcckblick erstellen!</p>
    ${footer}
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    if (!isAuth(req)) return new Response('{"error":"Unauthorized"}', { status: 401 });

    const now = new Date();
    const d1 = new Date(now);
    const d3 = new Date(now);
    d1.setDate(d1.getDate() + 1);
    d3.setDate(d3.getDate() + 3);
    const f = (d: Date) => d.toISOString().split('T')[0];
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // 1) Upcoming trip reminders
    const trips = await sq(`trips?start_date=in.(${f(d1)},${f(d3)})&select=id,name,destination,start_date,end_date`);
    let sent = 0;

    if (trips?.length) {
      for (const t of trips) {
        const days = t.start_date === f(d1) ? 1 : 3;
        const ty = `trip_starts_${days}d`;
        const title = days === 1 ? `${t.name} startet morgen!` : `${t.name} startet in 3 Tagen!`;

        const cs = await sq(`trip_collaborators?trip_id=eq.${t.id}&select=user_id`);
        if (!cs?.length) continue;

        const ps = await sq(`profiles?id=in.(${cs.map((c: any) => c.user_id).join(',')})&notifications_enabled=eq.true&select=id,email,first_name,notification_email_enabled,notification_push_reminders,notification_email_reminders`);
        for (const p of ps) {
          if (await wasN(p.id, t.id, ty)) continue;

          const wantsPush = p.notification_push_reminders !== false;
          const wantsEmail = (p.notification_email_enabled !== false) && (p.notification_email_reminders !== false);

          if (wantsPush) {
            const pushResult = await callFn('send-push', { user_id: p.id, title, body: t.destination, url: `${SITE}/trip/${t.id}` });
            if (pushResult.sent !== false) {
              await logN(p.id, t.id, ty, 'push');
            } else {
              console.error(`trip-reminders: push failed for ${p.id}/${t.id}: ${pushResult.error}`);
            }
          }

          if (wantsEmail) {
            const g = p.first_name ? `Hallo ${p.first_name}` : 'Hallo';
            const dt = days === 1 ? 'morgen' : `in ${days} Tagen`;
            const html = `<html><body style="font-family:sans-serif;padding:20px"><div style="max-width:500px;margin:0 auto;background:#FFF;border-radius:16px;padding:32px"><h2>${g},</h2><p>Deine Reise <b>${t.name}</b> nach <b>${t.destination}</b> startet ${dt}!</p><a href="${SITE}/trip/${t.id}" style="display:inline-block;background:#4F7CFF;color:#FFF;padding:10px 20px;border-radius:8px;text-decoration:none;margin-top:12px">Reise \u00f6ffnen</a>${footer}</div></body></html>`;
            const emailResult = await callFn('send-email', { to: p.email, subject: title, html_body: html, unsubscribe_url: UNSUB });
            if (emailResult.sent === true) {
              await logN(p.id, t.id, ty, 'email');
            } else {
              console.error(`trip-reminders: email failed for ${p.email}/${t.id}: ${emailResult.error || 'sent=false'}`);
            }
          }

          if (wantsPush || wantsEmail) sent++;
        }
      }
    }

    // 2) Trip completion emails — trips that ended yesterday
    let completionSent = 0;
    const completedTrips = await sq(`trips?end_date=eq.${f(yesterday)}&select=id,name,destination,start_date,end_date`);

    if (completedTrips?.length) {
      for (const t of completedTrips) {
        const ty = 'trip_completed';
        const cs = await sq(`trip_collaborators?trip_id=eq.${t.id}&select=user_id`);
        if (!cs?.length) continue;

        // Gather stats
        const [activities, stops, photos] = await Promise.all([
          sq(`activities?trip_id=eq.${t.id}&select=id`),
          sq(`trip_stops?trip_id=eq.${t.id}&select=id`),
          sq(`photos?trip_id=eq.${t.id}&select=id`),
        ]);
        const startD = new Date(t.start_date);
        const endD = new Date(t.end_date);
        const dayCount = Math.floor((endD.getTime() - startD.getTime()) / 86400000) + 1;
        const stats = {
          days: dayCount,
          activities: Array.isArray(activities) ? activities.length : 0,
          stops: Array.isArray(stops) ? stops.length : 0,
          photos: Array.isArray(photos) ? photos.length : 0,
        };

        const ps = await sq(`profiles?id=in.(${cs.map((c: any) => c.user_id).join(',')})&notifications_enabled=eq.true&select=id,email,first_name,notification_email_enabled,notification_email_reminders`);
        for (const p of ps) {
          if (await wasN(p.id, t.id, ty)) continue;
          const wantsEmail = (p.notification_email_enabled !== false) && (p.notification_email_reminders !== false);
          if (!wantsEmail) continue;

          const html = completionEmailHtml(p, t, stats);
          const emailResult = await callFn('send-email', {
            to: p.email,
            subject: `Willkommen zur\u00fcck von ${t.name}!`,
            html_body: html,
            unsubscribe_url: UNSUB,
          });
          if (emailResult.sent === true) {
            await logN(p.id, t.id, ty, 'email');
            completionSent++;
          } else {
            console.error(`trip-reminders: completion email failed for ${p.email}/${t.id}: ${emailResult.error || 'sent=false'}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ processed: (trips?.length || 0) + (completedTrips?.length || 0), sent, completionSent }));
  } catch (e) {
    console.error('trip-reminders: unhandled error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
