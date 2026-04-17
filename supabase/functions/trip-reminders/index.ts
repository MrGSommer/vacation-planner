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
      console.error(`callFn(${n}): HTTP ${r.status} \u2014 ${text}`);
      return { sent: false, error: `HTTP ${r.status}` };
    }
    const data = await r.json();
    return data;
  } catch (e) {
    console.error(`callFn(${n}): exception \u2014`, e);
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

function uniqueUserIds(ownerIds: string[], collaborators: {user_id: string}[]): string[] {
  const set = new Set([...ownerIds, ...collaborators.map(c => c.user_id)]);
  return [...set];
}

const UNSUB = `${SITE}/notifications`;

// ─── Shared email helpers ──────────────────────────────────────────────

const BRAND = { primary: '#FF6B6B', secondary: '#4ECDC4', accent: '#6C5CE7', text: '#2D3436', textLight: '#636E72', bg: '#F8F9FA', border: '#DFE6E9', card: '#FFFFFF' };

function emailShell(content: string) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>
    @media only screen and (max-width:600px){.outer{padding:12px!important}.inner{padding:24px 20px!important}}
  </style></head><body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="outer" style="padding:32px 16px" align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
      ${content}
      <tr><td style="padding:24px 0 0;text-align:center">
        <p style="font-size:12px;color:#B2BEC3;margin:0 0 8px">
          <a href="${SITE}" style="color:#B2BEC3;text-decoration:none;font-weight:600">WayFable</a> \u2014 Dein Reisebegleiter
        </p>
        <p style="font-size:11px;color:#B2BEC3;margin:0">
          <a href="${UNSUB}" style="color:#B2BEC3;text-decoration:underline">Benachrichtigungen anpassen</a>
        </p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function heroBlock(emoji: string, headline: string, gradient: string[]) {
  return `<tr><td style="background:linear-gradient(135deg,${gradient[0]},${gradient[1]});border-radius:16px 16px 0 0;padding:36px 32px 28px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">${emoji}</div>
    <h1 style="margin:0;font-size:24px;font-weight:700;color:#FFF;line-height:1.3">${headline}</h1>
  </td></tr>`;
}

function bodyBlock(content: string) {
  return `<tr><td class="inner" style="background:${BRAND.card};padding:32px;border-radius:0 0 16px 16px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    ${content}
  </td></tr>`;
}

function ctaButton(href: string, label: string, color: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0"><tr><td style="background:${color};border-radius:12px;padding:14px 32px">
    <a href="${href}" style="color:#FFF;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">${label}</a>
  </td></tr></table>`;
}

function infoCard(items: { label: string; value: string; emoji: string }[]) {
  const cells = items.map(i => `<td style="text-align:center;padding:12px 8px">
    <div style="font-size:24px;margin-bottom:4px">${i.emoji}</div>
    <div style="font-size:20px;font-weight:700;color:${BRAND.text}">${i.value}</div>
    <div style="font-size:12px;color:${BRAND.textLight};margin-top:2px">${i.label}</div>
  </td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};border-radius:12px;margin:20px 0"><tr>${cells}</tr></table>`;
}

function formatDateDE(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['Jan.', 'Feb.', 'M\u00e4r.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function tripDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const months = ['Jan.', 'Feb.', 'M\u00e4r.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}.\u2013${e.getDate()}. ${months[s.getMonth()]} ${s.getFullYear()}`;
  }
  return `${s.getDate()}. ${months[s.getMonth()]} \u2013 ${e.getDate()}. ${months[e.getMonth()]} ${e.getFullYear()}`;
}

function tripDuration(start: string, end: string): number {
  return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

function destinationEmoji(dest: string): string {
  const d = (dest || '').toLowerCase();
  const map: Record<string, string> = {
    japan: '\ud83c\uddef\ud83c\uddf5', thailand: '\ud83c\uddf9\ud83c\udded', italien: '\ud83c\uddee\ud83c\uddf9', italy: '\ud83c\uddee\ud83c\uddf9',
    frankreich: '\ud83c\uddeb\ud83c\uddf7', france: '\ud83c\uddeb\ud83c\uddf7', spanien: '\ud83c\uddea\ud83c\uddf8', spain: '\ud83c\uddea\ud83c\uddf8',
    portugal: '\ud83c\uddf5\ud83c\uddf9', griechenland: '\ud83c\uddec\ud83c\uddf7', greece: '\ud83c\uddec\ud83c\uddf7',
    usa: '\ud83c\uddfa\ud83c\uddf8', amerika: '\ud83c\uddfa\ud83c\uddf8', kroatien: '\ud83c\udded\ud83c\uddf7', croatia: '\ud83c\udded\ud83c\uddf7',
    norwegen: '\ud83c\uddf3\ud83c\uddf4', norway: '\ud83c\uddf3\ud83c\uddf4', schweden: '\ud83c\uddf8\ud83c\uddea', island: '\ud83c\uddee\ud83c\uddf8',
    mexiko: '\ud83c\uddf2\ud83c\uddfd', bali: '\ud83c\uddee\ud83c\udde9', indonesien: '\ud83c\uddee\ud83c\udde9',
    \u00f6sterreich: '\ud83c\udde6\ud83c\uddf9', schweiz: '\ud83c\udde8\ud83c\udded', deutschland: '\ud83c\udde9\ud83c\uddea',
    t\u00fcrkei: '\ud83c\uddf9\ud83c\uddf7', \u00e4gypten: '\ud83c\uddea\ud83c\uddec', marokko: '\ud83c\uddf2\ud83c\udde6',
    australien: '\ud83c\udde6\ud83c\uddfa', neuseeland: '\ud83c\uddf3\ud83c\uddff', kanada: '\ud83c\udde8\ud83c\udde6',
    england: '\ud83c\uddec\ud83c\udde7', london: '\ud83c\uddec\ud83c\udde7', paris: '\ud83c\uddeb\ud83c\uddf7', rom: '\ud83c\uddee\ud83c\uddf9',
    barcelona: '\ud83c\uddea\ud83c\uddf8', amsterdam: '\ud83c\uddf3\ud83c\uddf1', lissabon: '\ud83c\uddf5\ud83c\uddf9',
  };
  for (const [key, flag] of Object.entries(map)) {
    if (d.includes(key)) return flag;
  }
  // Generic travel emojis based on keywords
  if (d.includes('strand') || d.includes('beach') || d.includes('meer')) return '\ud83c\udfd6\ufe0f';
  if (d.includes('berg') || d.includes('alpen') || d.includes('mountain')) return '\ud83c\udfd4\ufe0f';
  if (d.includes('roadtrip') || d.includes('road')) return '\ud83d\ude97';
  if (d.includes('safari')) return '\ud83e\udd81';
  if (d.includes('kreuzfahrt') || d.includes('cruise')) return '\ud83d\udea2';
  return '\u2708\ufe0f';
}

// ─── Email templates ───────────────────────────────────────────────────

function reminderEmailHtml(p: any, t: any, days: number) {
  const name = p.first_name || 'Reisende/r';
  const emoji = destinationEmoji(t.destination);
  const dur = tripDuration(t.start_date, t.end_date);
  const dateRange = tripDateRange(t.start_date, t.end_date);

  const headline = days === 1
    ? `Morgen geht\u2019s los, ${name}!`
    : `Noch ${days} Tage, ${name}!`;

  const subtext = days === 1
    ? `Dein Abenteuer nach <b>${t.destination}</b> beginnt morgen \u2014 bist du bereit?`
    : `Dein Trip nach <b>${t.destination}</b> r\u00fcckt n\u00e4her. Zeit f\u00fcr die letzten Vorbereitungen!`;

  const tipText = days === 1
    ? '\ud83d\udcdd Letzte Checkliste: Reisepass, Ladeger\u00e4te, Zahnb\u00fcrste \u2014 alles dabei?'
    : '\ud83d\udca1 Tipp: Schau dir deine Packliste und den Reiseplan nochmal an.';

  return emailShell(
    heroBlock(emoji, headline, [BRAND.primary, '#FF8B94']) +
    bodyBlock(`
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:${BRAND.text}">${subtext}</p>
      ${infoCard([
        { emoji: '\ud83d\udcc5', value: dateRange, label: 'Reisedaten' },
        { emoji: '\u23f3', value: `${dur} Tage`, label: 'Dauer' },
      ])}
      <div style="background:${BRAND.bg};border-radius:12px;padding:14px 18px;margin:16px 0;border-left:4px solid ${BRAND.secondary}">
        <p style="margin:0;font-size:14px;color:${BRAND.textLight};line-height:1.5">${tipText}</p>
      </div>
      ${ctaButton(`${SITE}/trip/${t.id}`, `${t.name} \u00f6ffnen \u2192`, BRAND.primary)}
    `)
  );
}

function completionEmailHtml(p: any, t: any, stats: { activities: number; stops: number; photos: number; days: number }) {
  const name = p.first_name || 'Reisende/r';
  const emoji = destinationEmoji(t.destination);

  return emailShell(
    heroBlock('\ud83c\udfe0', `Willkommen zur\u00fcck, ${name}!`, [BRAND.secondary, '#74B9FF']) +
    bodyBlock(`
      <p style="font-size:16px;line-height:1.6;margin:0 0 8px;color:${BRAND.text}">
        Dein Trip <b>${t.name}</b> ${emoji} nach <b>${t.destination}</b> ist vorbei \u2014 was f\u00fcr eine Reise!
      </p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:${BRAND.textLight}">
        Hier ist dein Reise-R\u00fcckblick auf einen Blick:
      </p>
      ${infoCard([
        { emoji: '\ud83d\udcc6', value: String(stats.days), label: 'Tage' },
        { emoji: '\ud83c\udfaf', value: String(stats.activities), label: 'Aktivit\u00e4ten' },
        { emoji: '\ud83d\udccd', value: String(stats.stops), label: 'Stops' },
        { emoji: '\ud83d\udcf8', value: String(stats.photos), label: 'Fotos' },
      ])}
      <div style="background:${BRAND.bg};border-radius:12px;padding:14px 18px;margin:16px 0;border-left:4px solid ${BRAND.accent}">
        <p style="margin:0;font-size:14px;color:${BRAND.textLight};line-height:1.5">
          \u2728 <b>Tipp:</b> Lass Fable einen pers\u00f6nlichen R\u00fcckblick f\u00fcr dich erstellen \u2014 mit Highlights und Erinnerungen aus deinem Trip!
        </p>
      </div>
      ${ctaButton(`${SITE}/trip/${t.id}`, 'R\u00fcckblick ansehen \u2192', BRAND.secondary)}
    `)
  );
}

function digestEmailHtml(p: any, trip: any, acts: any[]) {
  const name = p.first_name || 'Reisende/r';
  const count = acts.length;
  const emoji = destinationEmoji(trip.destination);

  const actList = acts.slice(0, 8).map((a: any) => {
    const catEmoji: Record<string, string> = {
      activity: '\ud83c\udfaf', restaurant: '\ud83c\udf7d\ufe0f', transport: '\ud83d\ude8c', hotel: '\ud83c\udfe8',
      sightseeing: '\ud83d\uddfc', shopping: '\ud83d\udecd\ufe0f', nightlife: '\ud83c\udf1f', nature: '\ud83c\udf3f',
      beach: '\ud83c\udfd6\ufe0f', culture: '\ud83c\udfad', sport: '\u26bd', wellness: '\ud83d\udec1',
    };
    const icon = catEmoji[a.category] || '\ud83d\udccc';
    return `<tr><td style="padding:6px 0;font-size:14px;color:${BRAND.text}"><span style="margin-right:8px">${icon}</span>${a.title}</td></tr>`;
  }).join('');
  const moreText = count > 8 ? `<p style="font-size:13px;color:${BRAND.textLight};margin:8px 0 0">+ ${count - 8} weitere</p>` : '';

  return emailShell(
    heroBlock(emoji, `Neues bei ${trip.name}!`, [BRAND.accent, '#A29BFE']) +
    bodyBlock(`
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:${BRAND.text}">
        Hey ${name}, es gibt <b>${count} neue Aktivit\u00e4t${count === 1 ? '' : 'en'}</b> bei deinem Trip nach <b>${trip.destination}</b>:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};border-radius:12px;padding:12px 16px">
        ${actList}
      </table>
      ${moreText}
      ${ctaButton(`${SITE}/trip/${trip.id}/itinerary`, 'Reiseplan ansehen \u2192', BRAND.accent)}
    `)
  );
}

// ─── Main handler ──────────────────────────────────────────────────────

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
    const trips = await sq(`trips?start_date=in.(${f(d1)},${f(d3)})&select=id,name,destination,start_date,end_date,owner_id`);
    let sent = 0;

    if (trips?.length) {
      for (const t of trips) {
        const days = t.start_date === f(d1) ? 1 : 3;
        const ty = `trip_starts_${days}d`;
        const title = days === 1 ? `${t.name} startet morgen! \u2708\ufe0f` : `${t.name} startet in 3 Tagen! \ud83d\udcc5`;

        const cs = await sq(`trip_collaborators?trip_id=eq.${t.id}&select=user_id`);
        const userIds = uniqueUserIds([t.owner_id], cs || []);
        if (!userIds.length) continue;

        const ps = await sq(`profiles?id=in.(${userIds.join(',')})&notifications_enabled=eq.true&select=id,email,first_name,notification_email_enabled,notification_push_reminders,notification_email_reminders`);
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
            const html = reminderEmailHtml(p, t, days);
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
    const completedTrips = await sq(`trips?end_date=eq.${f(yesterday)}&select=id,name,destination,start_date,end_date,owner_id`);

    if (completedTrips?.length) {
      for (const t of completedTrips) {
        const ty = 'trip_completed';
        const cs = await sq(`trip_collaborators?trip_id=eq.${t.id}&select=user_id`);
        const userIds = uniqueUserIds([t.owner_id], cs || []);
        if (!userIds.length) continue;

        // Gather stats
        const [activities, stops, photos] = await Promise.all([
          sq(`activities?trip_id=eq.${t.id}&select=id`),
          sq(`activities?trip_id=eq.${t.id}&category=in.(hotel,stop)&select=id`),
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

        const ps = await sq(`profiles?id=in.(${userIds.join(',')})&notifications_enabled=eq.true&select=id,email,first_name,notification_email_enabled,notification_email_reminders`);
        for (const p of ps) {
          if (await wasN(p.id, t.id, ty)) continue;
          const wantsEmail = (p.notification_email_enabled !== false) && (p.notification_email_reminders !== false);
          if (!wantsEmail) continue;

          const html = completionEmailHtml(p, t, stats);
          const emailResult = await callFn('send-email', {
            to: p.email,
            subject: `Willkommen zur\u00fcck von ${t.name}! \ud83c\udfe0`,
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

    // 3) Activity digest — new activities in the last 12 hours
    let digestSent = 0;
    const since = new Date(now);
    since.setHours(since.getHours() - 12);

    const recentActivities = await sq(
      `activities?created_at=gte.${since.toISOString()}&select=id,title,trip_id,day_id,created_at,category`
    );

    if (Array.isArray(recentActivities) && recentActivities.length > 0) {
      // Group by trip_id
      const byTrip = new Map<string, typeof recentActivities>();
      for (const a of recentActivities) {
        if (!byTrip.has(a.trip_id)) byTrip.set(a.trip_id, []);
        byTrip.get(a.trip_id)!.push(a);
      }

      for (const [tid, acts] of byTrip) {
        const ty = 'activity_digest';

        const tripInfo = await sq(`trips?id=eq.${tid}&select=id,name,destination,start_date,end_date,owner_id`);
        if (!Array.isArray(tripInfo) || tripInfo.length === 0) continue;
        const trip = tripInfo[0];

        // Only active trips (not completed)
        const tripEnd = new Date(trip.end_date);
        if (tripEnd < yesterday) continue;

        const cs = await sq(`trip_collaborators?trip_id=eq.${tid}&select=user_id`);
        const userIds = uniqueUserIds([trip.owner_id], Array.isArray(cs) ? cs : []);
        if (userIds.length === 0) continue;

        const ps = await sq(
          `profiles?id=in.(${userIds.join(',')})&notifications_enabled=eq.true&select=id,email,first_name,notification_email_enabled,notification_email_reminders,notification_push_collaborators`
        );
        if (!Array.isArray(ps)) continue;

        for (const p of ps) {
          if (await wasN(p.id, tid, ty)) continue;

          const wantsPush = p.notification_push_collaborators !== false;
          const wantsEmail = (p.notification_email_enabled !== false) && (p.notification_email_reminders !== false);

          if (!wantsPush && !wantsEmail) continue;

          const count = acts.length;
          const pushTitle = `${trip.name}: ${count} neue Aktivit\u00e4t${count === 1 ? '' : 'en'}`;
          const pushBody = count === 1 ? acts[0].title : `${acts[0].title} und ${count - 1} weitere`;

          if (wantsPush) {
            const pushResult = await callFn('send-push', {
              user_id: p.id,
              title: pushTitle,
              body: pushBody,
              url: `${SITE}/trip/${tid}/itinerary`,
              tag: `digest-${tid}`,
            });
            if (pushResult.sent !== false) {
              await logN(p.id, tid, ty, 'push');
            }
          }

          if (wantsEmail) {
            const html = digestEmailHtml(p, trip, acts);
            const emailResult = await callFn('send-email', {
              to: p.email,
              subject: pushTitle,
              html_body: html,
              unsubscribe_url: UNSUB,
            });
            if (emailResult.sent === true) {
              await logN(p.id, tid, ty, 'email');
            }
          }

          digestSent++;
        }
      }
    }

    return new Response(JSON.stringify({ processed: (trips?.length || 0) + (completedTrips?.length || 0), sent, completionSent, digestSent }));
  } catch (e) {
    console.error('trip-reminders: unhandled error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
