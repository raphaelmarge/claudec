/* ============================================================
   ACADEMIA — camada de nuvem (Supabase)
   Auth + CRUD das tabelas acad_*. Protegido por RLS no banco.
   Usa a mesma config pública do projeto (window.TORQUE_SUPABASE).
   ============================================================ */
window.AcadCloud = (function () {
  'use strict';
  let sb = null;
  let user = null;

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
    user = data && data.session ? data.session.user : null;
    return data ? data.session : null;
  }
  function onAuthChange(cb) { if (sb) sb.auth.onAuthStateChange((_e, s) => { user = s ? s.user : null; cb(s); }); }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email: (email || '').trim(), password });
    if (error) throw error;
    user = data.user; return data;
  }
  async function signUp(email, password, nome) {
    const { data, error } = await sb.auth.signUp({
      email: (email || '').trim(), password, options: { data: { nome: (nome || '').trim() } }
    });
    if (error) throw error;
    return data;
  }
  async function signOut() { user = null; if (sb) await sb.auth.signOut(); }

  // ---------- leitura em bloco ----------
  async function loadAll() {
    const out = { planos: [], alunos: [], pagamentos: [], acessos: [], config: null };
    const [pl, al, pg, ac, cf] = await Promise.all([
      sb.from('acad_planos').select('*').order('nome'),
      sb.from('acad_alunos').select('*').order('nome'),
      sb.from('acad_pagamentos').select('*').order('criado_em', { ascending: false }),
      sb.from('acad_acessos').select('*').order('ts', { ascending: false }).limit(500),
      sb.from('acad_config').select('data').eq('id', 1).maybeSingle()
    ]);
    for (const r of [pl, al, pg, ac]) if (r.error) throw r.error;
    out.planos = pl.data || [];
    out.alunos = al.data || [];
    out.pagamentos = pg.data || [];
    out.acessos = ac.data || [];
    out.config = cf && cf.data ? cf.data.data : null;
    return out;
  }

  // ---------- upsert / delete genérico ----------
  async function upsert(table, row) {
    const { data, error } = await sb.from(table).upsert(row).select().single();
    if (error) throw error;
    return data;
  }
  async function remove(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  }
  async function insert(table, row) {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  }
  async function saveConfig(obj) {
    const { error } = await sb.from('acad_config')
      .upsert({ id: 1, data: obj, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  return {
    configured, ready, init, getSession, onAuthChange,
    signIn, signUp, signOut, loadAll, upsert, insert, remove, saveConfig,
    get user() { return user; }
  };
})();
