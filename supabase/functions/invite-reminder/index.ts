const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IAS = Deno.env.get('INTERNAL_API_SECRET') || '';
const GCI = Deno.env.get('GMAIL_CLIENT_ID') || '';
const GCS = Deno.env.get('GMAIL_CLIENT_SECRET') || '';
const GRT = Deno.env.get('GMAIL_REFRESH_TOKEN') || '';
const GSE = Deno.env.get('GMAIL_SENDER_EMAIL') || '';
const SITE = Deno.env.get('SITE_URL') || 'https://wayfable.ch';

function isAuth(r: Request) {
  const t = (r.headers.get('Authorization') || '').replace('Bearer ', '');
  return t === SRK || (IAS !== '' && t === IAS);
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getGmailToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GCI, client_secret: GCS, refresh_token: GRT, grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error(`Gmail token refresh failed: ${r.status}`);
  const d = await r.json();
  cachedToken = d.access_token;
  tokenExpiry = Date.now() + (d.expires_in - 60) * 1000;
  return cachedToken!;
}

function htmlToText(h: string): string {
  return h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n').replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const token = await getGmailToken();
  const boundary = `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const plainText = htmlToText(html);

  const textPart = `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(unescape(encodeURIComponent(plainText)))}`;
  const htmlPart = `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(unescape(encodeURIComponent(html)))}`;

  const mime = [
    `From: "WayFable" <${GSE}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@wayfable.ch>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    textPart,
    htmlPart,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = btoa(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) {
    console.error('invite-reminder: Gmail API error', r.status);
    return false;
  }
  return true;
}

async function dbQuery(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${SRK}`,
      'apikey': SRK,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return null;
}

function unsubscribeUrl(userId: string): string {
  return `${SUPABASE_URL}/functions/v1/invite-reminder?unsubscribe=${userId}`;
}

function reminderEmailHtml(userId: string, email: string, name: string, tier: string, credits: number): string {
  const tierLabel = tier === 'premium' ? 'Premium' : 'Free';
  const tierColor = tier === 'premium' ? '#0EA5E9' : '#64748b';
  const creditsLine = tier !== 'premium' && credits > 0
    ? `<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px">Du hast <strong>${credits} Inspirationen</strong> bereit, um Fable — deinen KI-Reisebegleiter — zu nutzen.</p>`
    : '';
  const unsub = unsubscribeUrl(userId);

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#0EA5E9,#6366F1);padding:40px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700">WayFable</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px">Dein Reisebegleiter</p>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px">Hallo ${name}!</h2>
    <p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 16px">
      Dein WayFable-Konto wartet noch auf dich! Du wurdest eingeladen, aber hast dich noch nicht angemeldet.</p>

    <div style="background:#f0f9ff;border-radius:12px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 4px;font-size:13px;color:#64748b">Dein Abo-Status</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:${tierColor}">${tierLabel}</p>
    </div>
    ${creditsLine}

    <p style="color:#475569;font-size:16px;line-height:1.6;margin:16px 0 8px;font-weight:600">
      So aktivierst du dein Konto:</p>
    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:0 0 24px">
      <p style="color:#475569;font-size:15px;line-height:2;margin:0">
        1. Öffne <a href="${SITE}" style="color:#0EA5E9;text-decoration:none;font-weight:600">wayfable.ch</a><br>
        2. Klicke auf <strong>«Anmelden»</strong><br>
        3. Klicke auf <strong>«Passwort vergessen»</strong><br>
        4. Gib deine E-Mail-Adresse ein: <strong>${email}</strong><br>
        5. Du erhältst einen Link, um dein Passwort zu setzen<br>
        6. Melde dich an und vervollständige dein Profil</p>
    </div>

    <div style="text-align:center;margin:24px 0">
      <a href="${SITE}/login" style="display:inline-block;background:linear-gradient(135deg,#0EA5E9,#6366F1);color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-size:16px;font-weight:600">Jetzt loslegen</a>
    </div>

    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:24px 0 0">
      Bei Fragen antworte einfach auf diese E-Mail — wir helfen gerne!</p>
  </div>
  <div style="padding:20px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0">
    <p style="color:#94a3b8;font-size:12px;margin:0">© 2026 WayFable · wayfable.ch</p>
    <p style="margin:8px 0 0"><a href="${unsub}" style="color:#B2BEC3;font-size:11px;text-decoration:underline">Keine weiteren Erinnerungen erhalten</a></p>
  </div>
</div>
</body></html>`;
}

function unsubscribeHtml(success: boolean): string {
  const icon = success ? '✓' : '✗';
  const bg = success ? '#0EA5E9' : '#EF4444';
  const title = success ? 'Abgemeldet' : 'Fehler';
  const msg = success
    ? 'Du erhältst keine weiteren Erinnerungs-E-Mails von WayFable.'
    : 'Etwas ist schiefgelaufen. Bitte versuche es später nochmal.';

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.card{max-width:440px;width:90%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center}
.header{background:${bg};padding:36px 32px}.icon{font-size:48px;color:#fff;margin-bottom:12px}
.header h1{color:#fff;margin:0;font-size:24px}.body{padding:32px}
.body p{color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px}
.btn{display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:12px 32px;border-radius:50px;font-size:15px;font-weight:600}
.footer{padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0}
.footer p{color:#94a3b8;font-size:12px;margin:0}</style></head><body>
<div class="card">
  <div class="header"><div class="icon">${icon}</div><h1>${title}</h1></div>
  <div class="body"><p>${msg}</p><a href="${SITE}" class="btn">Zu WayFable</a></div>
  <div class="footer"><p>© 2026 WayFable · wayfable.ch</p></div>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  // GET with ?unsubscribe=<user_id> — no auth required (token = user UUID)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const userId = url.searchParams.get('unsubscribe');
    if (!userId) {
      return new Response(unsubscribeHtml(false), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return new Response(unsubscribeHtml(false), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SRK}`,
        'apikey': SRK,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ invite_reminder_optout: true }),
    });

    console.log(`invite-reminder: unsubscribe ${userId} -> ${res.status}`);
    return new Response(unsubscribeHtml(res.ok), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // POST — send reminders (requires auth)
  try {
    if (!isAuth(req)) return new Response('{"error":"Unauthorized"}', { status: 401 });
    if (!GCI || !GCS || !GRT || !GSE) {
      return new Response(JSON.stringify({ error: 'Gmail not configured' }), { status: 500 });
    }

    let mode = 'cron';
    let testEmail: string | null = null;
    try {
      const body = await req.json();
      if (body?.mode === 'all') mode = 'all';
      if (body?.test_email) testEmail = body.test_email;
    } catch { /* no body = cron mode */ }

    // Test mode: send a preview to a specific email
    if (testEmail) {
      const sent = await sendEmail(
        testEmail,
        'Dein WayFable-Konto wartet auf dich!',
        reminderEmailHtml('00000000-0000-0000-0000-000000000000', testEmail, 'dort', 'premium', 100),
      );
      return new Response(JSON.stringify({ mode: 'test', email: testEmail, sent }));
    }

    // Find unconfirmed invited users
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_unconfirmed_invited_users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SRK}`,
        'apikey': SRK,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_min_days: mode === 'all' ? 0 : 7 }),
    });
    const users = await rpcRes.json();

    if (!rpcRes.ok || !Array.isArray(users)) {
      console.error('invite-reminder: RPC error', users);
      return new Response(JSON.stringify({ error: 'RPC failed' }), { status: 500 });
    }

    let sent = 0;
    let skipped = 0;

    for (const u of users) {
      // Check opt-out
      const profile = await dbQuery(`profiles?id=eq.${u.id}&select=invite_reminder_optout`);
      if (profile?.[0]?.invite_reminder_optout === true) {
        skipped++;
        continue;
      }

      // Check if reminder was already sent (one-time only)
      const existing = await dbQuery(
        `notification_logs?user_id=eq.${u.id}&notification_type=eq.invite_reminder&select=id&limit=1`
      );
      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'dort';
      const emailSent = await sendEmail(
        u.email,
        'Dein WayFable-Konto wartet auf dich!',
        reminderEmailHtml(u.id, u.email, name, u.subscription_tier || 'free', u.ai_credits_balance || 0),
      );

      if (emailSent) {
        await fetch(`${SUPABASE_URL}/rest/v1/notification_logs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SRK}`,
            'apikey': SRK,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            user_id: u.id,
            trip_id: null,
            notification_type: 'invite_reminder',
            channel: 'email',
          }),
        });
        sent++;
        console.log(`invite-reminder: sent to ${u.email}`);
      }
    }

    return new Response(JSON.stringify({ mode, total: users.length, sent, skipped }));
  } catch (e) {
    console.error('invite-reminder: error', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
