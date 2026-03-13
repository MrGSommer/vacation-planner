const SU = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IAS = Deno.env.get('INTERNAL_API_SECRET') || '';
const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIV = Deno.env.get('VAPID_PRIVATE_KEY') || '';

function auth(r: Request) {
  const t = (r.headers.get('Authorization') || '').replace('Bearer ', '');
  return t === SRK || (IAS !== '' && t === IAS);
}

// --- Base64url helpers ---
function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (p.length % 4)) % 4);
  const raw = atob(p + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function b64Decode(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// --- VAPID JWT ---
async function createVapidJwt(audience: string): Promise<string> {
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 86400,
    sub: 'mailto:support@wayfable.ch',
  })));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);

  // Import VAPID private key (base64url-encoded raw 32-byte key)
  const rawKey = b64urlDecode(VAPID_PRIV);
  // Build PKCS8 from raw 32-byte private key for ES256
  // For Web Crypto, we need to import as JWK
  const pubBytes = b64urlDecode(VAPID_PUB);
  // Extract x and y from uncompressed public key (65 bytes: 0x04 || x || y)
  const x = b64urlEncode(pubBytes.slice(1, 33).buffer);
  const y = b64urlEncode(pubBytes.slice(33, 65).buffer);
  const d = b64urlEncode(rawKey.buffer);

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput);
  // Convert DER signature to raw r||s (64 bytes) if needed
  const sigBytes = new Uint8Array(sig);
  let rawSig: Uint8Array;
  if (sigBytes.length === 64) {
    rawSig = sigBytes;
  } else {
    // Web Crypto on some platforms returns IEEE P1363 (64 bytes), others DER
    // Parse DER: 0x30 <len> 0x02 <rlen> <r> 0x02 <slen> <s>
    rawSig = derToRaw(sigBytes);
  }

  return `${header}.${payload}.${b64urlEncode(rawSig.buffer)}`;
}

function derToRaw(der: Uint8Array): Uint8Array {
  const raw = new Uint8Array(64);
  let offset = 2; // skip 0x30 <len>
  // r
  if (der[offset] !== 0x02) return der.slice(0, 64);
  offset++;
  const rLen = der[offset++];
  const rStart = offset + (rLen - 32);
  raw.set(der.slice(rStart, rStart + 32), 0);
  offset += rLen;
  // s
  if (der[offset] !== 0x02) return raw;
  offset++;
  const sLen = der[offset++];
  const sStart = offset + (sLen - 32);
  raw.set(der.slice(sStart, sStart + 32), 32);
  return raw;
}

// --- aes128gcm encryption (RFC 8291) ---
async function encryptPayload(
  payload: string,
  p256dhKey: string,  // base64 standard
  authSecret: string  // base64 standard
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  const uaPublicBytes = b64Decode(p256dhKey);
  const authBytes = b64Decode(authSecret);
  const payloadBytes = new TextEncoder().encode(payload);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  // Export local public key (uncompressed)
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  // Import UA public key
  const uaPublicKey = await crypto.subtle.importKey(
    'raw', uaPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      localKeyPair.privateKey,
      256
    )
  );

  // Generate 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF: auth_info = "WebPush: info\0" || ua_public || local_public
  const authInfo = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...uaPublicBytes,
    ...localPubRaw,
  ]);

  // IKM = HKDF(auth_secret, ecdh_secret, auth_info, 32)
  const authHkdfKey = await crypto.subtle.importKey('raw', authBytes, 'HKDF', false, ['deriveBits']);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: sharedSecret, info: authInfo },
      authHkdfKey,
      256
    )
  );

  // PRK = HKDF-Extract(salt, IKM)
  // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  const prkKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: aes128gcm\0') },
    prkKey, 128
  );
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);

  // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const nonceBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: nonce\0') },
      prkKey, 96
    )
  );

  // Pad payload: add delimiter 0x02 (final record)
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded.set(payloadBytes);
  padded[payloadBytes.length] = 0x02; // final record delimiter

  // Encrypt
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceBits }, cek, padded)
  );

  // Build aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(65) || ciphertext
  const rs = payloadBytes.length + 1 + 16 + 1; // padded + tag overhead + padding delimiter
  const header = new Uint8Array(16 + 4 + 1 + localPubRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // record size
  header[20] = localPubRaw.length;
  header.set(localPubRaw, 21);

  const body = new Uint8Array(header.length + encrypted.length);
  body.set(header);
  body.set(encrypted, header.length);

  return { ciphertext: body, salt, localPublicKey: localPubRaw };
}

// --- Supabase REST query ---
async function sq(path: string) {
  return (await fetch(`${SU}/rest/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK },
  })).json();
}

async function sqDelete(path: string) {
  await fetch(`${SU}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SRK}`, 'apikey': SRK },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  try {
    if (!auth(req)) return new Response('{"error":"Unauthorized"}', { status: 401 });
    if (!VAPID_PUB || !VAPID_PRIV) {
      console.error('send-push: VAPID keys not configured');
      return new Response(JSON.stringify({ sent: false, error: 'VAPID not configured' }));
    }

    const { user_id, title, body, url, tag } = await req.json();
    if (!user_id || !title) {
      return new Response(JSON.stringify({ sent: false, error: 'Missing user_id or title' }), { status: 400 });
    }

    // Get user's push subscriptions
    const subs = await sq(`push_subscriptions?user_id=eq.${user_id}&select=id,endpoint,p256dh,auth`);
    if (!Array.isArray(subs) || subs.length === 0) {
      return new Response(JSON.stringify({ sent: false, error: 'No push subscriptions' }));
    }

    const payload = JSON.stringify({ title, body: body || '', url: url || '/', tag: tag || undefined });
    let sentCount = 0;

    for (const sub of subs) {
      try {
        const endpointUrl = new URL(sub.endpoint);
        const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
        const jwt = await createVapidJwt(audience);

        const { ciphertext } = await encryptPayload(payload, sub.p256dh, sub.auth);

        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `vapid t=${jwt}, k=${VAPID_PUB}`,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
            'Urgency': 'normal',
          },
          body: ciphertext,
          signal: AbortSignal.timeout(10000),
        });

        if (res.status === 201 || res.status === 200) {
          sentCount++;
        } else if (res.status === 404 || res.status === 410) {
          // Subscription expired/invalid — clean up
          console.log(`send-push: removing expired subscription ${sub.id}`);
          await sqDelete(`push_subscriptions?id=eq.${sub.id}`);
        } else {
          const errText = await res.text();
          console.error(`send-push: endpoint returned ${res.status} for sub ${sub.id}: ${errText}`);
        }
      } catch (e) {
        console.error(`send-push: error sending to sub ${sub.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ sent: sentCount > 0, count: sentCount }));
  } catch (e) {
    console.error('send-push: unhandled error:', e);
    return new Response(JSON.stringify({ sent: false, error: 'Internal server error' }), { status: 500 });
  }
});
