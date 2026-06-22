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
    const { data, error } = await sb.from('profiles').update(fields).eq('id', profile.id).select().single();
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
    const { data, error } = await sb.from('orcamentos').update(fields).eq('id', id).select().single();
    if (error) throw error; return data;
  }
  async function deleteOrcamento(id) {
    const { error } = await sb.from('orcamentos').delete().eq('id', id);
    if (error) throw error;
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

  return {
    configured, ready, init, getSession, onAuthChange,
    signIn, signUp, signOut, loadProfile, updateMyProfile,
    listClientes, saveCliente, deleteCliente,
    saveOrcamento, updateOrcamento, deleteOrcamento, listOrcamentos, listVendedores,
    get profile() { return profile; },
    isAdmin() { return !!profile && profile.role === 'admin'; }
  };
})();
