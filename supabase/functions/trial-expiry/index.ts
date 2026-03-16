/**
 * trial-expiry — Daily cron (08:00 UTC)
 *
 * 1. Auto-downgrade expired trials
 * 2. Trial reminder emails (3 days + 1 day before)
 * 3. Free-user trip cleanup (soft-delete 14d after end, hard-delete after 1 year)
 * 4. Trip deletion warning emails (3 days before)
 */

const SU = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IAS = Deno.env.get('INTERNAL_API_SECRET') || '';
const SITE = Deno.env.get('SITE_URL') || 'https://wayfable.ch';

const FREE_TRIP_RETENTION_DAYS = 14;

function isAuth(r: Request) {
  const t = (r.headers.get('Authorization') || '').replace('Bearer ', '');
  return t === SRK || t === IAS;
}

async function sq(p: string) {
  return (await fetch(`${SU}/rest/v1/${p}`, {
    headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK },
  })).json();
}

async function sqPatch(table: string, filter: string, body: object) {
  return fetch(`${SU}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SRK}`,
      'apikey': SRK,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
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
    return await r.json();
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

function wrap(inner: string) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="font-family:sans-serif;padding:20px;margin:0;background:#f5f5f5"><div style="max-width:500px;margin:0 auto;background:#FFF;border-radius:16px;padding:32px">${inner}${footer}</div></body></html>`;
}

function trialReminderHtml(name: string | null, daysLeft: number) {
  const g = name ? `Hallo ${name}` : 'Hallo';
  const urgency = daysLeft === 1
    ? '<b>Morgen</b> endet dein Premium-Test!'
    : `Dein Premium-Test endet in <b>${daysLeft} Tagen</b>.`;
  return wrap(`
    <h2>${g},</h2>
    <p>${urgency}</p>
    <p>Mit Premium hast du Zugriff auf:</p>
    <ul>
      <li>Unbegrenzte Reisen</li>
      <li>Foto-Galerie</li>
      <li>Budget & Ausgaben</li>
      <li>Routen & Stops</li>
      <li>Fable, dein Reisebegleiter (20 Inspirationen/Monat)</li>
    </ul>
    <p>Sichere dir jetzt Premium, bevor dein Test endet:</p>
    <a href="${SITE}/subscription" style="display:inline-block;background:linear-gradient(135deg,#4ECDC4,#6C5CE7);color:#FFF;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:8px">Jetzt Premium sichern</a>
    <p style="margin-top:16px;color:#636E72;font-size:14px">Ab CHF 9.90/Monat \u2022 Jederzeit k\u00fcndbar</p>
  `);
}

function trialExpiredHtml(name: string | null) {
  const g = name ? `Hallo ${name}` : 'Hallo';
  return wrap(`
    <h2>${g},</h2>
    <p>Dein <b>14-Tage Premium-Test</b> ist abgelaufen.</p>
    <p>Das hast du verpasst:</p>
    <ul>
      <li>\u2718 Unbegrenzte Reisen \u2192 nur noch 1 aktive Reise</li>
      <li>\u2718 Foto-Galerie \u2192 gesperrt</li>
      <li>\u2718 Budget & Ausgaben \u2192 gesperrt</li>
      <li>\u2718 Routen & Stops \u2192 gesperrt</li>
      <li>\u2718 20 Inspirationen/Monat \u2192 entfallen</li>
    </ul>
    <p>Hole dir jetzt Premium zur\u00fcck:</p>
    <a href="${SITE}/subscription" style="display:inline-block;background:linear-gradient(135deg,#FF6B6B,#FF8B94);color:#FFF;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:8px">Jetzt Premium sichern \u2014 ab CHF 9.90/Mt.</a>
  `);
}

function tripDeletionWarningHtml(name: string | null, tripName: string, tripId: string, daysLeft: number) {
  const g = name ? `Hallo ${name}` : 'Hallo';
  return wrap(`
    <h2>${g},</h2>
    <p>Deine Reise <b>${tripName}</b> wird in <b>${daysLeft} Tagen</b> gel\u00f6scht.</p>
    <p>Im Free-Tier werden vergangene Reisen ${FREE_TRIP_RETENTION_DAYS} Tage nach Ende automatisch archiviert.</p>
    <p>Mit Premium bleiben alle deine Reisen f\u00fcr immer erhalten:</p>
    <a href="${SITE}/subscription" style="display:inline-block;background:#4ECDC4;color:#FFF;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">Upgrade auf Premium</a>
    <p style="margin-top:12px"><a href="${SITE}/trip/${tripId}" style="color:#636E72">Reise ansehen</a></p>
  `);
}

function tripDeletedHtml(name: string | null, tripName: string) {
  const g = name ? `Hallo ${name}` : 'Hallo';
  return wrap(`
    <h2>${g},</h2>
    <p>Deine Reise <b>${tripName}</b> wurde archiviert, da dein Free-Konto vergangene Reisen nur ${FREE_TRIP_RETENTION_DAYS} Tage aufbewahrt.</p>
    <p>Mit Premium bleiben alle Reisen f\u00fcr immer erhalten. Kontaktiere uns innerhalb von 30 Tagen, falls du die Daten zur\u00fcck m\u00f6chtest.</p>
    <a href="${SITE}/subscription" style="display:inline-block;background:#4ECDC4;color:#FFF;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px">Upgrade auf Premium</a>
  `);
}

const f = (d: Date) => d.toISOString().split('T')[0];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    if (!isAuth(req)) return new Response('{"error":"Unauthorized"}', { status: 401 });

    const now = new Date();
    let trialDowngraded = 0;
    let trialReminders = 0;
    let tripsArchived = 0;
    let tripsHardDeleted = 0;
    let tripWarnings = 0;

    // ========================================================================
    // 1. AUTO-DOWNGRADE EXPIRED TRIALS
    // ========================================================================
    const expiredTrials = await sq(
      `profiles?subscription_status=eq.trialing&subscription_period_end=lt.${now.toISOString()}&select=id,email,first_name,ai_credits_purchased`
    );

    if (Array.isArray(expiredTrials)) {
      for (const p of expiredTrials) {
        await sqPatch('profiles', `id=eq.${p.id}`, {
          subscription_tier: 'free',
          subscription_status: 'canceled',
          ai_credits_balance: p.ai_credits_purchased || 0,
          ai_credits_monthly_quota: 0,
        });

        // Send expiry email (deduplicated — cron may retry)
        const ty = 'trial_expired';
        if (!(await wasN(p.id, 'trial', ty))) {
          const html = trialExpiredHtml(p.first_name);
          const result = await callFn('send-email', {
            to: p.email,
            subject: 'Dein Premium-Test ist abgelaufen',
            html_body: html,
            unsubscribe_url: UNSUB,
          });
          if (result.sent === true) {
            await logN(p.id, 'trial', ty, 'email');
          }
        }

        trialDowngraded++;
      }
    }

    // ========================================================================
    // 2. TRIAL REMINDER EMAILS (3 days + 1 day before expiry)
    // ========================================================================
    const d1 = new Date(now);
    d1.setDate(d1.getDate() + 1);
    const d3 = new Date(now);
    d3.setDate(d3.getDate() + 3);

    for (const daysLeft of [1, 3]) {
      const targetDate = daysLeft === 1 ? f(d1) : f(d3);
      // Find profiles whose trial ends on targetDate
      const profiles = await sq(
        `profiles?subscription_status=eq.trialing&subscription_period_end=gte.${targetDate}T00:00:00Z&subscription_period_end=lt.${targetDate}T23:59:59Z&select=id,email,first_name,notification_email_enabled`
      );

      if (!Array.isArray(profiles)) continue;

      for (const p of profiles) {
        const ty = `trial_reminder_${daysLeft}d`;
        if (await wasN(p.id, 'trial', ty)) continue;
        if (p.notification_email_enabled === false) continue;

        const html = trialReminderHtml(p.first_name, daysLeft);
        const subject = daysLeft === 1
          ? 'Morgen endet dein Premium-Test'
          : 'Dein Premium-Test endet in 3 Tagen';

        const result = await callFn('send-email', {
          to: p.email,
          subject,
          html_body: html,
          unsubscribe_url: UNSUB,
        });

        if (result.sent === true) {
          await logN(p.id, 'trial', ty, 'email');
          trialReminders++;
        }
      }
    }

    // ========================================================================
    // 3. FREE-USER TRIP CLEANUP (optimized: single queries, no N+1)
    // ========================================================================
    const archiveDate = new Date(now);
    archiveDate.setDate(archiveDate.getDate() - FREE_TRIP_RETENTION_DAYS);

    // 3a. Find trips to archive: past end_date + retention, owned by free users
    // Single query: join trips with free-tier profiles via owner_id
    const tripsToArchive = await sq(
      `trips?status=neq.archived&end_date=lt.${f(archiveDate)}&select=id,name,owner_id,profiles!owner_id(id,email,first_name,notification_email_enabled,subscription_tier)&profiles.subscription_tier=eq.free`
    );

    // Fallback: if the join syntax isn't supported by PostgREST, use two simple queries
    let archivableTrips: any[] = [];
    if (Array.isArray(tripsToArchive) && tripsToArchive.length > 0) {
      archivableTrips = tripsToArchive.filter((t: any) => t.profiles?.subscription_tier === 'free');
    }
    if (archivableTrips.length === 0) {
      // Fallback: fetch free user IDs in one query, then all their expired trips in one query
      const freeUserIds = await sq(`profiles?subscription_tier=eq.free&select=id,email,first_name,notification_email_enabled`);
      if (Array.isArray(freeUserIds) && freeUserIds.length > 0) {
        const ids = freeUserIds.map((u: any) => u.id);
        const freeUserMap = new Map(freeUserIds.map((u: any) => [u.id, u]));

        // Single query for all expired trips of all free users
        const expiredTrips = await sq(
          `trips?status=neq.archived&end_date=lt.${f(archiveDate)}&owner_id=in.(${ids.join(',')})&select=id,name,owner_id`
        );

        if (Array.isArray(expiredTrips)) {
          for (const trip of expiredTrips) {
            await sqPatch('trips', `id=eq.${trip.id}`, { status: 'archived' });
            const userProfile = freeUserMap.get(trip.owner_id);
            if (userProfile && userProfile.notification_email_enabled !== false) {
              await callFn('send-email', {
                to: userProfile.email,
                subject: `Deine Reise "${trip.name}" wurde archiviert`,
                html_body: tripDeletedHtml(userProfile.first_name, trip.name),
                unsubscribe_url: UNSUB,
              });
            }
            tripsArchived++;
          }
        }

        // 3b. Trip deletion warnings (3 days before archive) — also single query
        const warningDate = new Date(now);
        warningDate.setDate(warningDate.getDate() - FREE_TRIP_RETENTION_DAYS + 3);

        const warningTrips = await sq(
          `trips?status=neq.archived&end_date=gte.${f(warningDate)}&end_date=lt.${f(new Date(warningDate.getTime() + 86400000))}&owner_id=in.(${ids.join(',')})&select=id,name,owner_id`
        );

        if (Array.isArray(warningTrips)) {
          for (const trip of warningTrips) {
            const ty = 'trip_deletion_3d';
            if (await wasN(trip.owner_id, trip.id, ty)) continue;
            const userProfile = freeUserMap.get(trip.owner_id);
            if (!userProfile || userProfile.notification_email_enabled === false) continue;

            const result = await callFn('send-email', {
              to: userProfile.email,
              subject: `"${trip.name}" wird in 3 Tagen archiviert`,
              html_body: tripDeletionWarningHtml(userProfile.first_name, trip.name, trip.id, 3),
              unsubscribe_url: UNSUB,
            });
            if (result.sent === true) {
              await logN(trip.owner_id, trip.id, ty, 'email');
              tripWarnings++;
            }
          }
        }
      }
    }

    // ========================================================================
    // 4. HARD-DELETE archived trips older than 1 year
    // ========================================================================
    const hardDeleteDate = new Date(now);
    hardDeleteDate.setFullYear(hardDeleteDate.getFullYear() - 1);

    const oldArchived = await sq(
      `trips?status=eq.archived&end_date=lt.${f(hardDeleteDate)}&select=id,name,owner_id`
    );

    if (Array.isArray(oldArchived)) {
      for (const trip of oldArchived) {
        await fetch(`${SU}/rest/v1/trips?id=eq.${trip.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK, 'Prefer': 'return=minimal' },
        });
        tripsHardDeleted++;
      }
    }

    return new Response(JSON.stringify({
      trialDowngraded,
      trialReminders,
      tripsArchived,
      tripsHardDeleted,
      tripWarnings,
    }));
  } catch (e) {
    console.error('trial-expiry: unhandled error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
