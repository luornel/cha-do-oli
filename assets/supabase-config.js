/* CONFIGURAÇÃO PÚBLICA — nunca use sb_secret_ / service_role aqui.
   Ative somente após executar a migration SQL e criar um administrador.
   Estes valores são públicos por definição e não concedem acesso administrativo. */
window.OLI_SUPABASE_CONFIG = Object.freeze({
  enabled: true,
  url: 'https://dszxortvohiizpxkypyh.supabase.co',                     // Ex.: https://SEU-PROJETO.supabase.co
  publishableKey: 'sb_publishable_LoYgiBa53Wlz_PZrM778pQ_sTgtcv6Q'           // Ex.: sb_publishable_... (ou anon legacy)
});
