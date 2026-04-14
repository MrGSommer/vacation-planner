const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function isAdmin(jwt: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${extractUserId(jwt)}&select=is_admin`, {
    headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK },
  });
  const rows = await res.json();
  return rows?.[0]?.is_admin === true;
}

function extractUserId(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    return payload.sub;
  } catch {
    return '';
  }
}

async function sendInviteEmail(
  to: string,
  name: string,
  tier: string,
  credits: number
): Promise<boolean> {
  const tierLabel = tier === 'premium' ? 'Premium' : 'Free';
  const creditsLine = credits > 0 ? `<p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 8px">Du hast <strong>${credits} Inspirationen</strong> erhalten, um Fable \u2014 deinen KI-Reisebegleiter \u2014 zu nutzen.</p>` : '';
  const tierBadgeColor = tier === 'premium' ? '#0EA5E9' : '#64748b';

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
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px">Willkommen bei WayFable, ${name}!</h2>
    <p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 16px">
    Du wurdest zu WayFable eingeladen \u2014 der App, die deine Reiseplanung einfach und inspirierend macht.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background-color:#f0f9ff;border-radius:8px;width:100%"><tr><td style="padding:16px">
      <p style="margin:0 0 4px;font-size:14px;color:#64748b">Dein Abo-Status</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:${tierBadgeColor}">${tierLabel}</p>
    </td></tr></table>
    ${creditsLine}
    <p style="color:#475569;font-size:16px;line-height:1.6;margin:16px 0 8px;font-weight:600">
    So startest du:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="padding:0">
      <p style="color:#475569;font-size:15px;line-height:1.8;margin:0">
      1. \u00d6ffne <a href="https://wayfable.ch" style="color:#0EA5E9;text-decoration:none;font-weight:600">wayfable.ch</a><br>
      2. Klicke auf <strong>\u00abAnmelden\u00bb</strong><br>
      3. Klicke auf <strong>\u00abPasswort vergessen\u00bb</strong><br>
      4. Gib diese E-Mail-Adresse ein<br>
      5. Setze dein Passwort und vervollst\u00e4ndige dein Profil</p>
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td align="center" style="background-color:#0EA5E9;border-radius:50px">
      <a href="https://wayfable.ch" style="display:inline-block;padding:14px 40px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">Zu WayFable</a>
    </td></tr></table>
    <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0">
    Bei Fragen antworte einfach auf diese E-Mail.</p>
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
      headers: { 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject: 'Du wurdest zu WayFable eingeladen!', html_body: html }),
    });
    const data = await res.json();
    return data.sent === true;
  } catch (e) {
    console.error('invite-user: send-email error', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) return json({ error: 'Unauthorized' }, 401);
    if (!(await isAdmin(jwt))) return json({ error: 'Forbidden' }, 403);

    const { email, first_name, last_name, subscription_tier, ai_credits_balance, admin_note } = await req.json();
    if (!email) return json({ error: 'E-Mail ist erforderlich' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const tier = subscription_tier || 'free';
    const credits = parseInt(ai_credits_balance) || 0;

    // 1. Create auth user (email_confirm: true so no verification email)
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        email_confirm: true,
        user_metadata: {
          first_name: first_name?.trim() || null,
          last_name: last_name?.trim() || null,
        },
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      const msg = createData?.msg || createData?.message || createData?.error_description || 'User creation failed';
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        return json({ error: 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.' }, 409);
      }
      console.error('invite-user: create failed', createRes.status, createData);
      return json({ error: msg }, 400);
    }

    const userId = createData.id;
    console.log('invite-user: created user', userId, cleanEmail);

    // 2. Wait for the profile trigger to create the profile row
    await new Promise(r => setTimeout(r, 1000));

    // 3. Update profile with tier, credits, and name
    const updates: Record<string, unknown> = {
      subscription_tier: tier,
      subscription_status: 'active',
      ai_credits_balance: credits,
    };
    if (first_name?.trim()) updates.first_name = first_name.trim();
    if (last_name?.trim()) updates.last_name = last_name.trim();
    if (admin_note?.trim()) updates.admin_note = admin_note.trim();

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SRK}`,
          'apikey': SRK,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updates),
      }
    );

    if (!updateRes.ok) {
      console.error('invite-user: profile update failed', updateRes.status);
    }

    // 4. Send invitation email
    const displayName = [first_name?.trim(), last_name?.trim()].filter(Boolean).join(' ') || 'dort';
    const emailSent = await sendInviteEmail(cleanEmail, displayName, tier, credits);

    return json({
      success: true,
      user_id: userId,
      email: cleanEmail,
      email_sent: emailSent,
    });
  } catch (e) {
    console.error('invite-user: error', e);
    return json({ error: 'Interner Fehler' }, 500);
  }
});
