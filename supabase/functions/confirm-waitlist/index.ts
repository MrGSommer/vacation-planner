const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function confirmHtml(success: boolean, message: string): Response {
  const bgColor = success ? '#0EA5E9' : '#EF4444';
  const icon = success ? '\u2713' : '\u2717';
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WayFable Warteliste</title>
<style>
  body{margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .card{max-width:480px;width:90%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center}
  .header{background:${bgColor};padding:40px 32px}
  .icon{font-size:48px;color:#fff;margin-bottom:12px}
  .header h1{color:#fff;margin:0;font-size:28px;font-weight:700}
  .header p{color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px}
  .body{padding:32px}
  .body h2{color:#1e293b;margin:0 0 12px;font-size:22px}
  .body p{color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px}
  .btn{display:inline-block;background-color:${bgColor};color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-size:16px;font-weight:600}
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

async function sendConfirmationEmail(to: string, name: string, token: string): Promise<boolean> {
  const confirmUrl = `https://wayfable.ch/waitlist/confirm?token=${token}`;
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f7fa">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="background-color:#0EA5E9;padding:40px 32px;text-align:center">
    <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700">WayFable</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:16px">Dein Reisebegleiter</p>
  </td></tr>
  <tr><td style="padding:32px">
    <h2 style="color:#1e293b;margin:0 0 12px;font-size:22px">Hallo ${name}!</h2>
    <p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px">
    Vielen Dank f\u00fcr dein Interesse an WayFable! Bitte best\u00e4tige deine E-Mail-Adresse, damit wir dich benachrichtigen k\u00f6nnen, sobald WayFable f\u00fcr dich bereit ist.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px auto"><tr><td align="center" style="background-color:#0EA5E9;border-radius:50px">
      <a href="${confirmUrl}" style="display:inline-block;padding:14px 40px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">E-Mail best\u00e4tigen</a>
    </td></tr></table>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:24px 0 0">
    Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
    <a href="${confirmUrl}" style="color:#0EA5E9;word-break:break-all">${confirmUrl}</a></p>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:16px 0 0">
    Falls du dich nicht f\u00fcr die Warteliste angemeldet hast, kannst du diese E-Mail ignorieren.</p>
  </td></tr>
  <tr><td style="padding:20px 32px;background-color:#f8fafc;text-align:center;border-top:1px solid #e2e8f0">
    <p style="color:#94a3b8;font-size:12px;margin:0">\u00a9 2026 WayFable \u00b7 wayfable.ch</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SRK}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject: 'Best\u00e4tige deine WayFable Wartelisten-Anmeldung',
        html_body: html,
      }),
    });
    const data = await res.json();
    console.log('confirm-waitlist: send-email result', res.status, data);
    return data.sent === true;
  } catch (e) {
    console.error('confirm-waitlist: send-email error', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    if (req.method === 'POST') {
      const { to, name, token } = await req.json();
      if (!to || !token) {
        return new Response(JSON.stringify({ error: 'Missing to/token' }), { status: 400 });
      }
      const sent = await sendConfirmationEmail(to, name || 'dort', token);
      return new Response(JSON.stringify({ sent }));
    }

    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return confirmHtml(false, 'Kein Best\u00e4tigungs-Token gefunden. Bitte \u00fcberpr\u00fcfe den Link in deiner E-Mail.');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return confirmHtml(false, 'Ung\u00fcltiges Token-Format.');
    }

    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/waitlist?confirmation_token=eq.${token}&select=id,confirmed,email`,
      { headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK } }
    );
    const rows = await checkRes.json();

    if (!rows || rows.length === 0) {
      return confirmHtml(false, 'Dieser Best\u00e4tigungslink ist ung\u00fcltig oder abgelaufen.');
    }

    if (rows[0].confirmed) {
      return confirmHtml(true, 'Deine E-Mail-Adresse wurde bereits best\u00e4tigt. Wir melden uns, sobald WayFable f\u00fcr dich bereit ist!');
    }

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
        body: JSON.stringify({ confirmed: true, confirmed_at: new Date().toISOString() }),
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
