const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GCI = Deno.env.get('GMAIL_CLIENT_ID') || '';
const GCS = Deno.env.get('GMAIL_CLIENT_SECRET') || '';
const GRT = Deno.env.get('GMAIL_REFRESH_TOKEN') || '';
const GSE = Deno.env.get('GMAIL_SENDER_EMAIL') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const MAX_CODES_PER_EMAIL_PER_HOUR = 3;

function generateCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(10000000 + (arr[0] % 90000000)).padStart(8, '0');
}

// Gmail token cache (survives across warm invocations)
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
    console.error('waitlist-send-code: Gmail API error', r.status);
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
  if (!res.ok) {
    console.error('dbQuery error:', res.status, await res.text());
    return null;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) return res.json();
  return null;
}

function codeEmailHtml(name: string, code: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#0EA5E9,#6366F1);padding:40px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700">WayFable</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px">Dein Reisebegleiter</p>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1e293b;margin:0 0 12px;font-size:22px">Hallo ${name}!</h2>
    <p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px">
      Dein Bestätigungscode für die WayFable Warteliste:</p>
    <div style="text-align:center;margin:32px 0">
      <div style="display:inline-block;background:#f1f5f9;border:2px solid #e2e8f0;border-radius:12px;padding:20px 40px;letter-spacing:8px;font-size:32px;font-weight:700;color:#1e293b;font-family:monospace">${code}</div>
    </div>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0;text-align:center">
      Dieser Code ist <strong>10 Minuten</strong> gültig.</p>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:16px 0 0">
      Falls du keinen Code angefordert hast, kannst du diese E-Mail ignorieren.</p>
  </div>
  <div style="padding:20px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0">
    <p style="color:#94a3b8;font-size:12px;margin:0">© 2026 WayFable · wayfable.ch</p>
  </div>
</div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    if (!GCI || !GCS || !GRT || !GSE) {
      console.error('waitlist-send-code: Gmail not configured');
      return new Response(JSON.stringify({ error: 'email_failed' }), { status: 500, headers: CORS });
    }

    const { email, first_name } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'missing_email' }), { status: 400, headers: CORS });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Rate limit: max codes per email per hour
    const recentForEmail = await dbQuery(
      `email_verification_codes?email=eq.${encodeURIComponent(cleanEmail)}&created_at=gte.${new Date(Date.now() - 3600000).toISOString()}&select=id`,
    );
    if (recentForEmail && recentForEmail.length >= MAX_CODES_PER_EMAIL_PER_HOUR) {
      return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429, headers: CORS });
    }

    // Delete old unverified codes for this email
    await fetch(`${SUPABASE_URL}/rest/v1/email_verification_codes?email=eq.${encodeURIComponent(cleanEmail)}&verified=eq.false`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK, 'Content-Type': 'application/json' },
    });

    // Generate and store new code
    const code = generateCode();
    const inserted = await dbQuery('email_verification_codes', {
      method: 'POST',
      body: JSON.stringify({ email: cleanEmail, code }),
    });

    if (!inserted) {
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: CORS });
    }

    // Send email directly via Gmail API (no second edge function hop)
    const name = (first_name || '').trim() || 'dort';
    const sent = await sendEmail(cleanEmail, 'Dein WayFable Bestätigungscode', codeEmailHtml(name, code));

    if (!sent) {
      return new Response(JSON.stringify({ error: 'email_failed' }), { status: 500, headers: CORS });
    }

    console.log(`waitlist-send-code: sent to ${cleanEmail}`);
    return new Response(JSON.stringify({ sent: true }), { headers: CORS });
  } catch (e) {
    console.error('waitlist-send-code: error', e);
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: CORS });
  }
});
