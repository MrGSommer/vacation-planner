// Admin-only Edge Function: sends test emails via send-email function
// Pattern: JWT + is_admin check (same as admin-stripe)

const ALLOWED_ORIGINS = ['https://wayfable.ch'];

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (data: unknown, origin: string, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function getUser(token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  if (!res.ok) {
    return null;
  }
  const userData = await res.json();
  return userData;
}

async function isAdmin(userId: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  });
  const rows = await res.json();
  return rows?.[0]?.is_admin === true;
}

function buildTestEmailHtml(): string {
  const now = new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' });
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#FF6B6B,#FF8B94,#FFD93D);padding:32px;text-align:center;">
      <h1 style="color:#FFFFFF;margin:0;font-size:24px;">WayFable</h1>
      <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">E-Mail-Systemtest</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#2D3436;margin:0 0 16px;font-size:20px;">Test erfolgreich!</h2>
      <p style="color:#636E72;line-height:1.6;margin:0 0 16px;">
        Diese Test-E-Mail wurde vom WayFable Admin-System gesendet.
        Wenn du diese Nachricht liest, funktioniert der E-Mail-Versand korrekt.
      </p>
      <div style="background:#F8F9FA;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="color:#636E72;margin:0;font-size:14px;"><strong>Gesendet:</strong> ${now}</p>
      </div>
      <p style="color:#B2BEC3;font-size:12px;margin:24px 0 0;text-align:center;">
        Dies ist eine automatische Test-Nachricht von WayFable.
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    // Step 1: Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Nicht authentifiziert' }, origin, 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Step 2: Get user
    const user = await getUser(token);
    if (!user?.id) {
      return json({ error: 'Ungültiges Token' }, origin, 401);
    }

    // Step 3: Admin check
    const admin = await isAdmin(user.id);
    if (!admin) {
      return json({ error: 'Keine Admin-Berechtigung' }, origin, 403);
    }

    // Step 4: Parse request body
    const body = await req.json();
    const { to } = body;
    if (!to) {
      return json({ error: 'E-Mail-Adresse erforderlich' }, origin, 400);
    }

    // Step 5: Build email
    const subject = `WayFable E-Mail-Test (${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })})`;
    const html_body = buildTestEmailHtml();

    // Step 6: Call send-email edge function
    const sendEmailUrl = `${SUPABASE_URL}/functions/v1/send-email`;
    const sendPayload = { to, subject, html_body };

    const sendRes = await fetch(sendEmailUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendPayload),
    });

    const sendResultText = await sendRes.text();

    let sendResult: Record<string, unknown>;
    try {
      sendResult = JSON.parse(sendResultText);
    } catch (_parseErr) {
      return json({ error: 'send-email returned non-JSON response', raw: sendResultText, sent: false }, origin, 502);
    }

    // Step 7: Return result
    const responseData = {
      sent: sendResult.sent === true,
      error: sendResult.error || sendResult.reason || null,
      timestamp: new Date().toISOString(),
    };

    return json(responseData, origin);
  } catch (e) {
    console.error('admin-email-test: unhandled error:', (e as Error)?.message);
    return json({ error: (e as Error).message, sent: false }, origin, 500);
  }
});
