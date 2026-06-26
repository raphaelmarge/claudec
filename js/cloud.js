/* ============================================================
   TORQUE FITNESS — camada de nuvem (Supabase)
   Auth + clientes + orçamentos. Tudo protegido por RLS no banco.
   ============================================================ */
window.Cloud = (function () {
  'use strict';
  let sb = null;
  let profile = null;   // { id, nome, role, telefone }

  function configured() { return !!(window.TORQUE_SUPABASE && window.TORQUE_SUPABASE.url); }
  function ready() { return !!sb; }

  function init() {
    if (sb) return sb;
    if (!configured() || !window.supabase || !window.supabase.createClient) return null;
    sb = window.supabase.createClient(window.TORQUE_SUPABASE.url, window.TORQUE_SUPABASE.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return sb;
  }

  async function getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data ? data.session : null;
  }
  function onAuthChange(cb) { if (sb) sb.auth.onAuthStateChange((_e, s) => cb(s)); }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return data;
  }
  async function signUp(email, password, nome) {
    const { data, error } = await sb.auth.signUp({
      email: email.trim(), password, options: { data: { nome: nome.trim() } }
    });
    if (error) throw error;
    return data;
  }
  async function signOut() { profile = null; if (sb) await sb.auth.signOut(); }

  async function loadProfile(uid) {
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    profile = data || null;
    return profile;
  }
  async function updateMyProfile(fields) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Sessão expirada.');
    const { data, error } = await sb.from('profiles').update(fields).eq('id', user.id).select().single();
    if (error) throw error;
    profile = data; return data;
  }

  // ---------- CLIENTES ----------
  async function listClientes() {
    const { data, error } = await sb.from('clientes').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
  }
  async function saveCliente(c) {
    const row = {
      nome: c.nome, empresa: c.empresa || '', telefone: c.telefone || '', email: c.email || '',
      doc: c.doc || '', cidade: c.cidade || '', obs: c.obs || ''
    };
    if (c.id) {
      const { data, error } = await sb.from('clientes').update(row).eq('id', c.id).select().single();
      if (error) throw error; return data;
    }
    const { data, error } = await sb.from('clientes').insert(row).select().single();
    if (error) throw error; return data;
  }
  async function deleteCliente(id) {
    const { error } = await sb.from('clientes').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- ORÇAMENTOS ----------
  async function saveOrcamento(o) {
    const { data, error } = await sb.from('orcamentos').insert(o).select().single();
    if (error) throw error; return data;
  }
  async function updateOrcamento(id, fields) {
    // .select() (sem .single) devolve as linhas alteradas: vazio = RLS bloqueou (0 linhas, sem erro)
    const { data, error } = await sb.from('orcamentos').update(fields).eq('id', id).select();
    if (error) throw error;
    if (!data || data.length === 0) { const e = new Error('Atualização bloqueada pela segurança do banco (RLS).'); e.code = 'NO_UPDATE'; throw e; }
    return data[0];
  }
  async function deleteOrcamento(id) {
    // .select() devolve as linhas excluídas: se vier vazio, o RLS bloqueou (apagou 0 linhas, sem erro)
    const { data, error } = await sb.from('orcamentos').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) { const e = new Error('Exclusão bloqueada pela segurança do banco (RLS).'); e.code = 'NO_DELETE'; throw e; }
  }
  async function listOrcamentos() {
    // RLS: vendedor recebe os seus; admin recebe todos.
    const { data, error } = await sb.from('orcamentos').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function listVendedores() {
    const { data, error } = await sb.from('profiles').select('id,nome,telefone,role').order('nome');
    if (error) throw error;
    return data || [];
  }

  // ---------- CONFIGURAÇÕES COMPARTILHADAS (settings) ----------
  // Linha única (id=1) com um JSON de parâmetros públicos. RLS: todos leem, só admin escreve.
  async function loadSettings() {
    if (!sb) return null;
    const { data, error } = await sb.from('settings').select('data').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  }
  async function saveSettings(obj) {
    if (!sb) return;
    const { error } = await sb.from('settings').upsert({ id: 1, data: obj, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  // ---------- IMAGENS DE PRODUTO (Storage) ----------
  // Envia para o bucket público "produtos" e devolve a URL pública.
  async function uploadProductImage(blob, ext) {
    if (!sb) throw new Error('Sem conexão.');
    const path = 'p/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + (ext || 'jpg');
    const { error } = await sb.storage.from('produtos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = sb.storage.from('produtos').getPublicUrl(path);
    return data.publicUrl;
  }

  // ---------- IA: sugestão de follow-up (Edge Function) ----------
  async function suggestReply(context) {
    if (!sb) throw new Error('Sem conexão.');
    const { data, error } = await sb.functions.invoke('suggest-reply', { body: context });
    if (error) throw error;
    return data;   // { text } ou { error }
  }

  return {
    configured, ready, init, getSession, onAuthChange,
    signIn, signUp, signOut, loadProfile, updateMyProfile,
    listClientes, saveCliente, deleteCliente,
    saveOrcamento, updateOrcamento, deleteOrcamento, listOrcamentos, listVendedores,
    loadSettings, saveSettings, suggestReply, uploadProductImage,
    get profile() { return profile; },
    isAdmin() { return !!profile && profile.role === 'admin'; }
  };
})();
