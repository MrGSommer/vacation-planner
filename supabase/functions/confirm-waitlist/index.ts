const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function confirmHtml(success: boolean, message: string): Response {
  const gradient = success
    ? 'linear-gradient(135deg, #0EA5E9, #6366F1)'
    : 'linear-gradient(135deg, #EF4444, #F97316)';
  const icon = success ? '\u2713' : '\u2717';
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WayFable Warteliste</title>
<style>
  body{margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .card{max-width:480px;width:90%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center}
  .header{background:${gradient};padding:40px 32px}
  .icon{font-size:48px;color:#fff;margin-bottom:12px}
  .header h1{color:#fff;margin:0;font-size:28px;font-weight:700}
  .header p{color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px}
  .body{padding:32px}
  .body h2{color:#1e293b;margin:0 0 12px;font-size:22px}
  .body p{color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px}
  .btn{display:inline-block;background:${gradient};color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-size:16px;font-weight:600}
  .footer{padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0}
  .footer p{color:#94a3b8;font-size:12px;margin:0}
</style></head><body>
<div class="card">
  <div class="header">
    <div class="icon">${icon}</div>
    <h1>WayFable</h1>
    <p>Dein Reisebegleiter</p>
  </div>
  <div class="body">
    <h2>${success ? 'E-Mail best\u00e4tigt!' : 'Ung\u00fcltiger Link'}</h2>
    <p>${message}</p>
    <a href="https://wayfable.ch" class="btn">${success ? 'Zu WayFable' : 'Zur Startseite'}</a>
  </div>
  <div class="footer"><p>\u00a9 2026 WayFable \u00b7 wayfable.ch</p></div>
</div>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return confirmHtml(false, 'Kein Best\u00e4tigungs-Token gefunden. Bitte \u00fcberpr\u00fcfe den Link in deiner E-Mail.');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return confirmHtml(false, 'Ung\u00fcltiges Token-Format.');
    }

    // Check if entry exists and current state
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/waitlist?confirmation_token=eq.${token}&select=id,confirmed,email`,
      {
        headers: {
          'Authorization': `Bearer ${SRK}`,
          'apikey': SRK,
        },
      }
    );
    const rows = await checkRes.json();

    if (!rows || rows.length === 0) {
      return confirmHtml(false, 'Dieser Best\u00e4tigungslink ist ung\u00fcltig oder abgelaufen.');
    }

    if (rows[0].confirmed) {
      return confirmHtml(true, 'Deine E-Mail-Adresse wurde bereits best\u00e4tigt. Wir melden uns, sobald WayFable f\u00fcr dich bereit ist!');
    }

    // Confirm the entry
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/waitlist?confirmation_token=eq.${token}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SRK}`,
          'apikey': SRK,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          confirmed: true,
          confirmed_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateRes.ok) {
      console.error('confirm-waitlist: update failed', updateRes.status);
      return confirmHtml(false, 'Etwas ist schiefgelaufen. Bitte versuche es sp\u00e4ter nochmal.');
    }

    return confirmHtml(true, 'Vielen Dank! Deine E-Mail-Adresse wurde best\u00e4tigt. Wir benachrichtigen dich, sobald WayFable f\u00fcr dich bereit ist.');
  } catch (e) {
    console.error('confirm-waitlist: error', e);
    return confirmHtml(false, 'Ein unerwarteter Fehler ist aufgetreten.');
  }
});
