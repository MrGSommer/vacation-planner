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
async function send(to:string,subj:string,html:string,unsub?:string){
  const at=await gat();
  const lines=[`From: "WayFable" <${GSE}>`,`To: ${to}`,`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subj)))}?=`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64'];
  if(unsub){lines.push(`List-Unsubscribe: <${unsub}>`);lines.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');}
  lines.push('',btoa(unescape(encodeURIComponent(html))));
  const mime=lines.join('\r\n');
  const raw=btoa(mime).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  console.log(`send-email: sending to ${to}, subject: ${subj}`);
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{'Authorization':`Bearer ${at}`,'Content-Type':'application/json'},body:JSON.stringify({raw})});
  if(!r.ok){
    const errText = await r.text();
    console.error(`send-email: Gmail API error ${r.status} for ${to}:`, errText);
    return false;
  }
  console.log(`send-email: sent successfully to ${to}`);
  return true;
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
    const s=await send(to,subject,html_body,unsubscribe_url||undefined);
    return new Response(JSON.stringify({sent:s}));
  }catch(e){
    console.error('send-email: unhandled error:', e);
    return new Response(JSON.stringify({error:(e as Error).message,sent:false}),{status:500});
  }
});
