const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: CORS });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    // Find latest non-expired code for this email
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/email_verification_codes?email=eq.${encodeURIComponent(cleanEmail)}&verified=eq.false&expires_at=gte.${new Date().toISOString()}&order=created_at.desc&limit=1&select=id,code,attempts`,
      { headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK } },
    );
    const rows = await res.json();

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ verified: false, error: 'expired' }), { headers: CORS });
    }

    const row = rows[0];

    // Check max attempts
    if (row.attempts >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ verified: false, error: 'too_many_attempts' }), { headers: CORS });
    }

    // Check code match
    if (row.code !== cleanCode) {
      // Increment attempts
      await fetch(`${SUPABASE_URL}/rest/v1/email_verification_codes?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SRK}`,
          'apikey': SRK,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ attempts: row.attempts + 1 }),
      });

      // If this was the last attempt, return too_many_attempts
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        return new Response(JSON.stringify({ verified: false, error: 'too_many_attempts' }), { headers: CORS });
      }

      return new Response(JSON.stringify({ verified: false }), { headers: CORS });
    }

    // Code matches — mark as verified
    await fetch(`${SUPABASE_URL}/rest/v1/email_verification_codes?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SRK}`,
        'apikey': SRK,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ verified: true }),
    });

    console.log(`waitlist-verify-code: verified ${cleanEmail}`);
    return new Response(JSON.stringify({ verified: true }), { headers: CORS });
  } catch (e) {
    console.error('waitlist-verify-code: error', e);
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: CORS });
  }
});
