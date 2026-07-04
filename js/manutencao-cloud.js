/* ============================================================
   TORQUE FITNESS — Manutenções: sincronização na nuvem (Supabase)
   Usado pelo app (manutencao.html) e pela TV (manutencao-tv.html).

   Como funciona: cada item (chamado, preventiva, rotina de limpeza,
   ativo, execução de limpeza) vira uma linha na tabela
   manutencao_itens. A mesclagem é POR ITEM — em conflito, vale a
   edição mais recente daquele item, sem sobrescrever o resto.
   Exclusões viram tombstones (deleted = true). Sem internet ou sem
   login, o app segue 100% funcional só neste aparelho.
   ============================================================ */
window.ManutCloud = (function () {
  'use strict';

  var TABLE = 'manutencao_itens';
  var LISTS = { ativo: 'ativos', os: 'os', plano: 'planos', limpeza: 'limpeza', log: 'limpezaLog' };
  var DEL = '__del__';

  var sb = null, opts = null, chan = null;
  var pushTimer = null, pollTimer = null;
  var connecting = false;
  var status = 'local';         // 'local' | 'sync' | 'ok' | 'err'
  var lastErr = '';
  /* shadow: o que (acreditamos que) a nuvem tem, por id → { k, tipo } */
  var shadow = {};

  /* ---------------- infra ---------------- */
  function available() {
    return !!(window.TORQUE_SUPABASE && window.TORQUE_SUPABASE.url &&
      window.supabase && window.supabase.createClient);
  }
  function init() {
    if (sb) return sb;
    if (!available()) return null;
    sb = window.supabase.createClient(window.TORQUE_SUPABASE.url, window.TORQUE_SUPABASE.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return sb;
  }
  function setStatus(s, err) {
    status = s; lastErr = err || '';
    if (opts && opts.onStatus) try { opts.onStatus(s, lastErr); } catch (e) { /* UI opcional */ }
  }
  function ts(x) { if (!x) return 0; var n = Date.parse(x); return isNaN(n) ? 0 : n; }
  function keyOf(ent) { return JSON.stringify(ent); }

  function collect(state) {
    var out = [];
    Object.keys(LISTS).forEach(function (tipo) {
      (state[LISTS[tipo]] || []).forEach(function (ent) {
        if (ent && ent.id) out.push({ tipo: tipo, ent: ent });
      });
    });
    return out;
  }
  function fixSeq(state) {
    var max = Number(state.seqOS) || 0;
    (state.os || []).forEach(function (o) { if (Number(o.num) > max) max = Number(o.num); });
    state.seqOS = max;
  }

  /* ---------------- mesclagem ---------------- */
  /* Aplica linhas vindas da nuvem no estado local. Devolve true se algo mudou. */
  function applyRows(rows, state) {
    var changed = false;
    rows.forEach(function (row) {
      var listName = LISTS[row.tipo];
      if (!listName || !row.id) return;
      var list = state[listName];
      if (!list) return;
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === row.id) { idx = i; break; }

      if (row.deleted) {
        shadow[row.id] = { k: DEL, tipo: row.tipo };
        if (idx >= 0) {
          /* só remove se a exclusão for mais nova que a edição local */
          if (ts(list[idx].up) <= ts(row.updated_at)) { list.splice(idx, 1); changed = true; }
        }
        return;
      }

      var ent = row.data || {};
      shadow[row.id] = { k: keyOf(ent), tipo: row.tipo };
      if (idx < 0) { list.push(ent); changed = true; return; }
      var local = list[idx];
      if (keyOf(local) === keyOf(ent)) return;
      if (ts(ent.up) >= ts(local.up)) { list[idx] = ent; changed = true; }
      /* senão: o local é mais novo — o próximo push reenvia */
    });
    return changed;
  }

  async function pullMerge() {
    var res = await sb.from(TABLE).select('*');
    if (res.error) throw res.error;
    var state = opts.getState();
    var changed = applyRows(res.data || [], state);
    fixSeq(state);
    if (changed) { opts.persist(); opts.rerender(); }
    return res.data || [];
  }

  /* ---------------- envio ---------------- */
  function localChanged() { schedulePush(900); }
  function schedulePush(delay) {
    if (!sb || status === 'local') return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { doPush(); }, delay);
  }

  async function doPush() {
    if (!sb || status === 'local') return;
    try {
      var state = opts.getState();
      var now = new Date().toISOString();
      var ups = [], novoShadow = [];
      var vivos = {};

      collect(state).forEach(function (it) {
        vivos[it.ent.id] = true;
        var sh = shadow[it.ent.id];
        var k = keyOf(it.ent);
        if (sh && sh.k === k) return;                     // igual à nuvem
        if (!it.ent.up || (sh && sh.k !== DEL)) {         // item novo sem carimbo, ou editado
          it.ent.up = now; k = keyOf(it.ent);
        }
        ups.push({ id: it.ent.id, tipo: it.tipo, data: it.ent, deleted: false, updated_at: it.ent.up });
        novoShadow.push([it.ent.id, { k: k, tipo: it.tipo }]);
      });

      /* o que sumiu localmente vira tombstone */
      Object.keys(shadow).forEach(function (id) {
        if (vivos[id] || shadow[id].k === DEL) return;
        ups.push({ id: id, tipo: shadow[id].tipo, data: {}, deleted: true, updated_at: now });
        novoShadow.push([id, { k: DEL, tipo: shadow[id].tipo }]);
      });

      if (!ups.length) { setStatus('ok'); return; }
      setStatus('sync');
      /* em lotes (chamados com fotos podem ser grandes) */
      for (var i = 0; i < ups.length; i += 50) {
        var r = await sb.from(TABLE).upsert(ups.slice(i, i + 50));
        if (r.error) throw r.error;
      }
      novoShadow.forEach(function (p) { shadow[p[0]] = p[1]; });
      opts.persist();   // guarda os carimbos "up" novos
      setStatus('ok');
    } catch (e) {
      setStatus('err', e.message || String(e));
      schedulePush(15000);   // tenta de novo depois
    }
  }

  /* ---------------- tempo real ---------------- */
  function subscribeRealtime() {
    if (chan) return;
    chan = sb.channel('manut-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function (payload) {
        var row = payload.new && payload.new.id ? payload.new : null;
        if (!row) return;
        var state = opts.getState();
        var changed = applyRows([row], state);
        if (changed) { fixSeq(state); opts.persist(); opts.rerender(); }
      })
      .subscribe();
  }

  /* ---------------- conexão ---------------- */
  async function connect() {
    if (connecting || !sb) return;
    connecting = true;
    try {
      setStatus('sync');
      var res = await sb.from(TABLE).select('*');
      if (res.error) throw res.error;
      var rows = res.data || [];
      var state = opts.getState();

      /* 1º acesso com dados de exemplo: se a nuvem já tem dados reais,
         descarta o exemplo local em vez de misturar */
      if (state.exemplo && rows.length) {
        Object.keys(LISTS).forEach(function (t) {
          var l = state[LISTS[t]]; if (l) l.length = 0;
        });
      }
      state.exemplo = false;

      shadow = {};
      applyRows(rows, state);
      fixSeq(state);
      opts.persist();
      opts.rerender();

      schedulePush(0);          // sobe o que só existe neste aparelho
      subscribeRealtime();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        pullMerge().catch(function () { /* tenta na próxima */ });
      }, 60000);
      setStatus('ok');
    } catch (e) {
      setStatus('err', e.message || String(e));
    } finally {
      connecting = false;
    }
  }

  async function start(o) {
    opts = o;
    if (!init()) { setStatus('local'); return; }
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'SIGNED_IN' && status === 'local') connect();
    });
    var data = (await sb.auth.getSession()).data;
    if (data && data.session) await connect();
    else setStatus('local');
  }

  /* ---------------- conta ---------------- */
  async function signIn(email, senha) {
    if (!init()) throw new Error('Sem conexão com a nuvem.');
    var r = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (r.error) throw r.error;
    await connect();
  }
  async function signUp(email, senha, nome) {
    if (!init()) throw new Error('Sem conexão com a nuvem.');
    var r = await sb.auth.signUp({ email: email.trim(), password: senha, options: { data: { nome: nome || '' } } });
    if (r.error) throw r.error;
    if (r.data && r.data.session) await connect();
    return !!(r.data && r.data.session);   // false = precisa confirmar e-mail
  }
  async function signOut() {
    clearTimeout(pushTimer); if (pollTimer) clearInterval(pollTimer);
    if (chan) { try { sb.removeChannel(chan); } catch (e) { } chan = null; }
    shadow = {};
    if (sb) await sb.auth.signOut();
    setStatus('local');
  }
  async function email() {
    if (!sb) return '';
    var data = (await sb.auth.getSession()).data;
    return data && data.session && data.session.user ? (data.session.user.email || '') : '';
  }

  return {
    available: available, start: start, localChanged: localChanged,
    signIn: signIn, signUp: signUp, signOut: signOut, email: email,
    isOn: function () { return status === 'ok' || status === 'sync'; },
    getStatus: function () { return { status: status, err: lastErr }; }
  };
})();
