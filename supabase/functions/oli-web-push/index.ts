import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(PROJECT_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
const ALLOWED_ORIGIN = "https://luornel.github.io";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Vary": "Origin",
};
const response = (data: unknown, code = 200) => Response.json(data, { status: code, headers: cors });
const onlyText = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;

async function config() {
  const { data: existing, error: e } = await db.rpc("oli_push_vapid_get");
  if (e) throw new Error(`VAPID indisponível: ${e.message}`);
  if (existing) return existing;
  // Gerado com WebCrypto no servidor. A chave privada nunca chega ao navegador ou ao GitHub.
  const pair = await webpush.generateVapidKeys({ extractable: true });
  const exported = await webpush.exportVapidKeys(pair);
  const publicKey = await webpush.exportApplicationServerKey(pair);
  const { error: saveError } = await db.rpc("oli_push_vapid_init", {
    p_keys: { ...exported, appServerKey: publicKey },
  });
  if (saveError) throw new Error(`Falha ao inicializar VAPID: ${saveError.message}`);
  const { data, error } = await db.rpc("oli_push_vapid_get");
  if (error || !data) throw new Error("Chaves VAPID não disponíveis.");
  return data;
}

async function authorize(req: Request) {
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: admin, error: adminError } = await db.from("oli_admins")
    .select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (adminError || !admin) return null;
  return data.user.id;
}

function validSubscription(sub: unknown): sub is {endpoint:string,keys:{auth:string,p256dh:string}} {
  if (!sub || typeof sub !== "object") return false;
  const x = sub as {endpoint?:unknown,keys?:{auth?:unknown,p256dh?:unknown}};
  if (!onlyText(x.endpoint, 2048) || !x.keys || !onlyText(x.keys.auth, 128) || !onlyText(x.keys.p256dh, 256)) return false;
  try {
    const url = new URL(x.endpoint);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch { return false; }
}

async function send(subs: Array<{endpoint:string,p256dh:string,auth_secret:string}>, payload: unknown) {
  if (!subs.length) return {sent:0,failed:0};
  const cfg = await config();
  const vapid = await webpush.importVapidKeys({ publicKey: cfg.publicKey, privateKey: cfg.privateKey });
  const app = await webpush.ApplicationServer.new({contactInformation:"mailto:luaornelas@gmail.com",vapidKeys:vapid});
  const data = JSON.stringify(payload);
  let sent=0, failed=0;
  await Promise.all(subs.slice(0,50).map(async s=>{
    try {
      await app.subscribe({endpoint:s.endpoint, keys:{auth:s.auth_secret,p256dh:s.p256dh}})
        .pushTextMessage(data,{ttl:3600,urgency:webpush.Urgency.High});
      sent++;
    } catch(e) {
      failed++;
      if(e instanceof webpush.PushMessageError && [404,410].includes(e.response.status)) {
        await db.from("oli_push_subscriptions").delete().eq("endpoint",s.endpoint);
      }
      console.error("Oli Push: falha de entrega ao serviço Web Push",e instanceof Error?e.message:String(e));
    }
  }));
  return {sent,failed};
}

async function dispatch(body: Record<string,unknown>) {
  if (typeof body.id !== "string" || typeof body.epoch !== "number" || typeof body.signature !== "string")
    return response({error:"Chamada inválida."},403);
  const {data:valid,error} = await db.rpc("oli_push_verify_hook", {
    p_id:body.id, p_epoch:body.epoch, p_signature:body.signature,
  });
  if(error || !valid) return response({error:"Assinatura inválida."},403);
  const {data:contribution,error:readError} = await db.from("oli_contributions")
    .select("gift_id,amount_cents,status").eq("id",body.id).maybeSingle();
  if(readError || !contribution || contribution.status!=="pending") return response({skipped:true});
  const [{data:gift},{data:subs,error:subErr}] = await Promise.all([
    db.from("oli_gifts").select("name").eq("id",contribution.gift_id).maybeSingle(),
    db.from("oli_push_subscriptions").select("endpoint,p256dh,auth_secret"),
  ]);
  if(subErr)throw subErr;
  const result = await send(subs||[],{
    title:"Nova contribuição — Chá do Oli",
    body:`${gift?.name||"Novo presente"} · ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(contribution.amount_cents/100)}`,
    tag:`oli-${body.id}`,
  });
  return response({ok:true,...result});
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.headers.get("Origin") && req.headers.get("Origin")!==ALLOWED_ORIGIN)return response({error:"Origem não permitida."},403);
  try {
    const url = new URL(req.url);
    if(req.method==="GET" && url.searchParams.get("action")==="key") {
      const keys=await config();return response({publicKey:keys.appServerKey});
    }
    if(req.method!=="POST")return response({error:"Método não permitido."},405);
    const body=await req.json();
    if(!body || typeof body!=="object")return response({error:"Requisição inválida."},400);
    if(body.action==="dispatch")return await dispatch(body);
    const userId=await authorize(req);
    if(!userId)return response({error:"Acesso administrativo necessário."},403);
    if(body.action==="subscribe") {
      if(!validSubscription(body.subscription))return response({error:"Assinatura inválida."},400);
      const sub=body.subscription;
      const {error}=await db.from("oli_push_subscriptions").upsert({
        user_id:userId,endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth_secret:sub.keys.auth,updated_at:new Date().toISOString(),
      },{onConflict:"endpoint"});
      if(error)throw error;
      return response({ok:true});
    }
    if(body.action==="unsubscribe") {
      if(!onlyText(body.endpoint,2048))return response({error:"Assinatura inválida."},400);
      const {error}=await db.from("oli_push_subscriptions").delete().eq("endpoint",body.endpoint).eq("user_id",userId);
      if(error)throw error;
      return response({ok:true});
    }
    if(body.action==="test") {
      const {data:subs,error}=await db.from("oli_push_subscriptions")
        .select("endpoint,p256dh,auth_secret").eq("user_id",userId);
      if(error)throw error;
      const results=await send(subs||[],{title:"Teste de Web Push — Chá do Oli",body:"Aviso recebido do Supabase com o aplicativo em segundo plano.",tag:"oli-web-push-test"});
      return response({ok:true,...results});
    }
    return response({error:"Operação inválida."},400);
  }catch(error) {
    console.error("Oli Push:",error instanceof Error?error.message:String(error));
    return response({error:"Não foi possível processar o Web Push."},500);
  }
});