const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IAS = Deno.env.get('INTERNAL_API_SECRET') || '';
const GCI = Deno.env.get('GMAIL_CLIENT_ID') || '';
const GCS = Deno.env.get('GMAIL_CLIENT_SECRET') || '';
const GRT = Deno.env.get('GMAIL_REFRESH_TOKEN') || '';
const GSE = Deno.env.get('GMAIL_SENDER_EMAIL') || '';
const SITE = Deno.env.get('SITE_URL') || 'https://wayfable.ch';
function auth(r:Request){const t=(r.headers.get('Authorization')||'').replace('Bearer ','');return t===SRK||t===IAS;}
let cat:string|null=null,te=0;
async function gat(){
  if(cat&&Date.now()<te)return cat;
  console.log('send-email: refreshing Gmail access token...');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:GCI,client_secret:GCS,refresh_token:GRT,grant_type:'refresh_token'})});
  if(!r.ok){
    const errText = await r.text();
    console.error('send-email: Gmail token refresh failed:', r.status, errText);
    throw new Error(`Gmail token refresh failed (${r.status}): ${errText}`);
  }
  const d=await r.json();
  cat=d.access_token;
  te=Date.now()+(d.expires_in-60)*1000;
  console.log('send-email: token refreshed successfully');
  return cat!;
}
/** Strip HTML to plain text for multipart/alternative */
function htmlToText(h:string):string{
  return h
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p>/gi,'\n\n')
    .replace(/<\/div>/gi,'\n')
    .replace(/<\/h[1-6]>/gi,'\n\n')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi,'$2 ($1)')
    .replace(/<[^>]+>/g,'')
    .replace(/&middot;/g,'\u00b7').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&auml;/g,'\u00e4').replace(/&ouml;/g,'\u00f6').replace(/&uuml;/g,'\u00fc')
    .replace(/&Auml;/g,'\u00c4').replace(/&Ouml;/g,'\u00d6').replace(/&Uuml;/g,'\u00dc')
    .replace(/\n{3,}/g,'\n\n').trim();
}

/** Wrap raw HTML body in proper DOCTYPE structure */
function wrapHtml(body:string):string{
  // If already has <!DOCTYPE or <html, return as-is
  if(/<!DOCTYPE/i.test(body)||/^<html/i.test(body.trim())) return body;
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="font-family:sans-serif;padding:20px;margin:0">${body}</body></html>`;
}

async function send(to:string,subj:string,html:string,unsub?:string):Promise<{sent:boolean,error?:string}>{
  const at=await gat();
  const boundary=`boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const fullHtml=wrapHtml(html);
  const plainText=htmlToText(html);
  const date=new Date().toUTCString();
  const msgId=`<${Date.now()}.${Math.random().toString(36).slice(2)}@wayfable.ch>`;

  const headers=[
    `From: "WayFable" <${GSE}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subj)))}?=`,
    `Date: ${date}`,
    `Message-ID: ${msgId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if(unsub){headers.push(`List-Unsubscribe: <${unsub}>`);headers.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');}

  const textPart=[
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(plainText))),
  ].join('\r\n');

  const htmlPart=[
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(fullHtml))),
  ].join('\r\n');

  const mime=[...headers,'',textPart,htmlPart,`--${boundary}--`].join('\r\n');
  const raw=btoa(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  console.log(`send-email: sending to ${to}, subject: ${subj}`);
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{'Authorization':`Bearer ${at}`,'Content-Type':'application/json'},body:JSON.stringify({raw})});
  if(!r.ok){
    const errText = await r.text();
    console.error(`send-email: Gmail API error ${r.status} for ${to}:`, errText);
    return {sent:false, error:`Gmail API ${r.status}: ${errText}`};
  }
  console.log(`send-email: sent successfully to ${to}`);
  return {sent:true};
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok');
  try{
    if(!auth(req))return new Response('{"error":"Unauthorized"}',{status:401});
    const{to,subject,html_body,unsubscribe_url}=await req.json();
    if(!to||!subject||!html_body)return new Response('{"error":"Missing fields"}',{status:400});
    if(!GCI||!GCS||!GRT){
      console.error('send-email: Gmail not configured (missing GCI/GCS/GRT)');
      return new Response(JSON.stringify({sent:false,reason:'not_configured'}));
    }
    if(!GSE){
      console.error('send-email: GMAIL_SENDER_EMAIL not set');
      return new Response(JSON.stringify({sent:false,reason:'no_sender_email'}));
    }
    const result=await send(to,subject,html_body,unsubscribe_url||undefined);
    return new Response(JSON.stringify(result));
  }catch(e){
    console.error('send-email: unhandled error:', e);
    return new Response(JSON.stringify({error:(e as Error).message,sent:false}),{status:500});
  }
});
