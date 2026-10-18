/* Interface compartilhada do Supabase — sem credenciais privadas no navegador. */
(function () {
  'use strict';
  const cfg = window.OLI_SUPABASE_CONFIG || {};
  const configured = !!(cfg.enabled && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url) && cfg.publishableKey);
  let client = null;
  function getClient() {
    if (!configured) return null;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') throw new Error('A biblioteca de conexão não carregou. Recarregue a página.');
    if (!client) client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 1 } }
    });
    return client;
  }
  function friendlyError(error) {
    if (!error) return 'Falha inesperada.';
    if (error.message && /Failed to fetch|NetworkError/i.test(error.message)) return 'Sem conexão com o serviço de presentes. Tente novamente.';
    return (error.message || 'Falha inesperada.');
  }
  async function rpc(name, args={}) {
    const db=getClient();
    if (!db) throw new Error('Controle de cotas ainda não foi ativado.');
    const {data,error}=await db.rpc(name,args);
    if (error) throw new Error(friendlyError(error));
    return data;
  }
  window.OliBackend={configured,getClient,rpc,friendlyError};
})();