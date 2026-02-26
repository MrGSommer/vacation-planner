// Admin-only Edge Function: sends test emails via send-email function
// Pattern: JWT + is_admin check (same as admin-stripe)

const ALLOWED_ORIGINS = ['https://wayfable.ch', 'http://localhost:8081', 'http://localhost:19006'];

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
  console.log('[getUser] Fetching user from auth API...');
  console.log('[getUser] SUPABASE_URL:', SUPABASE_URL);
  console.log('[getUser] Token (first 20 chars):', token?.substring(0, 20) + '...');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_ROLE_KEY },
  });
  console.log('[getUser] Auth response status:', res.status, res.statusText);
  if (!res.ok) {
    const errorText = await res.text();
    console.log('[getUser] Auth failed, response body:', errorText);
    return null;
  }
  const userData = await res.json();
  console.log('[getUser] User found, id:', userData?.id, 'email:', userData?.email);
  return userData;
}

async function isAdmin(userId: string): Promise<boolean> {
  console.log('[isAdmin] Checking admin status for user:', userId);
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`;
  console.log('[isAdmin] Query URL:', url);
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
  });
  console.log('[isAdmin] Profiles response status:', res.status, res.statusText);
  const rows = await res.json();
  console.log('[isAdmin] Profiles query result:', JSON.stringify(rows));
  const result = rows?.[0]?.is_admin === true;
  console.log('[isAdmin] Is admin:', result);
  return result;
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
  console.log('=== admin-email-test: Request received ===');
  console.log('[req] Method:', req.method);
  console.log('[req] Origin:', origin);
  console.log('[req] URL:', req.url);

  if (req.method === 'OPTIONS') {
    console.log('[req] Handling CORS preflight');
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    // Step 1: Auth check
    const authHeader = req.headers.get('Authorization');
    console.log('[auth] Authorization header present:', !!authHeader);
    if (!authHeader) {
      console.log('[auth] REJECTED: No authorization header');
      return json({ error: 'Nicht authentifiziert' }, origin, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('[auth] Token extracted, length:', token.length);

    // Step 2: Get user
    console.log('[auth] Fetching user from token...');
    const user = await getUser(token);
    console.log('[auth] User result:', user ? `id=${user.id}, email=${user.email}` : 'null');
    if (!user?.id) {
      console.log('[auth] REJECTED: Invalid token / no user');
      return json({ error: 'Ungültiges Token' }, origin, 401);
    }

    // Step 3: Admin check
    console.log('[auth] Checking admin status...');
    const admin = await isAdmin(user.id);
    console.log('[auth] Admin check result:', admin);
    if (!admin) {
      console.log('[auth] REJECTED: User is not admin');
      return json({ error: 'Keine Admin-Berechtigung' }, origin, 403);
    }

    // Step 4: Parse request body
    console.log('[body] Parsing request body...');
    const body = await req.json();
    console.log('[body] Request body:', JSON.stringify(body));
    const { to } = body;
    console.log('[body] Recipient (to):', to);
    if (!to) {
      console.log('[body] REJECTED: No "to" address provided');
      return json({ error: 'E-Mail-Adresse erforderlich' }, origin, 400);
    }

    // Step 5: Build email
    const subject = `WayFable E-Mail-Test (${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })})`;
    const html_body = buildTestEmailHtml();
    console.log('[email] Subject:', subject);
    console.log('[email] HTML body length:', html_body.length, 'chars');

    // Step 6: Call send-email edge function
    const sendEmailUrl = `${SUPABASE_URL}/functions/v1/send-email`;
    const sendPayload = { to, subject, html_body };
    console.log('[send-email] Calling send-email function at:', sendEmailUrl);
    console.log('[send-email] Payload (without html_body):', JSON.stringify({ to, subject, html_body_length: html_body.length }));

    const sendRes = await fetch(sendEmailUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendPayload),
    });

    console.log('[send-email] Response status:', sendRes.status, sendRes.statusText);
    console.log('[send-email] Response headers:', JSON.stringify(Object.fromEntries(sendRes.headers.entries())));

    const sendResultText = await sendRes.text();
    console.log('[send-email] Raw response body:', sendResultText);

    let sendResult: Record<string, unknown>;
    try {
      sendResult = JSON.parse(sendResultText);
      console.log('[send-email] Parsed response:', JSON.stringify(sendResult));
    } catch (parseErr) {
      console.error('[send-email] Failed to parse response as JSON:', parseErr);
      console.error('[send-email] Raw text was:', sendResultText);
      return json({ error: 'send-email returned non-JSON response', raw: sendResultText, sent: false }, origin, 502);
    }

    // Step 7: Return result
    const responseData = {
      sent: sendResult.sent === true,
      error: sendResult.error || sendResult.reason || null,
      timestamp: new Date().toISOString(),
    };
    console.log('[response] Returning result:', JSON.stringify(responseData));
    console.log('=== admin-email-test: Request complete ===');

    return json(responseData, origin);
  } catch (e) {
    console.error('=== admin-email-test: UNHANDLED ERROR ===');
    console.error('[error] Type:', (e as Error)?.constructor?.name);
    console.error('[error] Message:', (e as Error)?.message);
    console.error('[error] Stack:', (e as Error)?.stack);
    console.error('[error] Full error:', JSON.stringify(e, Object.getOwnPropertyNames(e as object)));
    return json({ error: (e as Error).message, sent: false }, origin, 500);
  }
});
