/* ============================================================
   TORQUE FITNESS — Orçamentos · app.js
   App de página única, sem build. Estado em localStorage.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'torque_orc_v1';
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => 'p' + Math.random().toString(36).slice(2, 9);

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = n => BRL.format(Number.isFinite(n) ? n : 0);
  const num = v => {
    if (v == null) return NaN;
    let s = String(v).trim().replace(/[R$\s]/g, '');
    // "1.234,56" (pt-BR) -> remove milhar, troca decimal; "5.3" (input) -> mantém
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };

  /* ------------------------------------------------------------
     ESTADO
     ------------------------------------------------------------ */
  const UNLOCK_KEY = 'torque_unlocked';
  // Campos sigilosos que só existem em memória durante a sessão destrancada.
  const FISCAL_KEYS = ['cambio', 'margem', 'ii', 'ipi', 'pisCofins', 'icms', 'iof', 'seguroPct', 'freteIntlUSD', 'freteNacionalBRL', 'descontoPct'];
  let unlocked = sessionStorage.getItem(UNLOCK_KEY) === '1';
  // DATA_VERSION precisa existir ANTES de load() ser chamado (evita ReferenceError/TDZ
  // que, capturado, resetava o estado salvo e apagava vendedores/clientes ao recarregar).
  const DATA_VERSION = (window.TORQUE_PUBLIC && window.TORQUE_PUBLIC.products && window.TORQUE_PUBLIC.products.length) || 0;
  let state = load();
  let editingOrcamentoId = null;   // id do orçamento sendo editado (null = novo)
  let editingNumero = '';          // número do orçamento em edição (preserva o original)
  let editingObs = '';             // observação do orçamento em edição (vai pro PDF)

  function freshFromSeed() {
    const data = window.TORQUE_PUBLIC || window.TORQUE_DATA || window.TORQUE_SEED;
    return {
      mode: 'vendedor',
      params: { ...data.params },                 // só parâmetros públicos (parcelas, juros, validade)
      products: data.products.map(p => ({
        id: uid(), codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral',
        imagem: p.imagem || '', dims: p.dims || '',
        preco: Number(p.preco != null ? p.preco : p.custo) || 0,  // preço de venda (público)
        margem: null, travado: false, oculto: false
        // fob (custo) NÃO entra aqui — só após destravar com senha
      })),
      cart: {},
      filters: { serie: 'all', query: '' },
      vendedores: [],
      clientes: [],
      orcamentos: [],
      currentVendedorId: null,
      quote: { clienteId: null, descMode: 'pct', descValue: 0, sinal: 0 }
    };
  }

  // Remove qualquer dado sigiloso do estado (custos + parâmetros fiscais).
  function stripSecret(s) {
    if (s.products) s.products.forEach(p => { delete p.fob; });
    if (s.params) FISCAL_KEYS.forEach(k => { delete s.params[k]; });
  }

  function load() {
    let s = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        s = JSON.parse(raw);
        if (!s._imported && DATA_VERSION && (!s.products || s.products.length < DATA_VERSION)) s = null;
      }
    } catch (e) { s = null; }
    if (!s) s = freshFromSeed();
    s.filters = s.filters || { serie: 'all', query: '' };
    s.cart = s.cart || {};
    // backfill de cadastros / orçamento (compatibilidade com versões anteriores)
    s.vendedores = s.vendedores || [];
    s.clientes = s.clientes || [];
    s.orcamentos = s.orcamentos || [];
    if (!('currentVendedorId' in s)) s.currentVendedorId = null;
    s.quote = s.quote || { clienteId: null, descMode: 'pct', descValue: 0, sinal: 0 };
    // Se a sessão não está destrancada, garante que nenhum custo fique em disco.
    if (!unlocked) { stripSecret(s); s.mode = 'vendedor'; }
    return s;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ------------------------------------------------------------
     SYNC DE PARÂMETROS PÚBLICOS (Supabase tabela `settings`)
     Admin escreve; todos leem. Só parâmetros NÃO sensíveis — os
     fiscais (custo/margem) nunca saem daqui. Degrada para
     localStorage se a tabela não existir.
     ------------------------------------------------------------ */
  const SHARED_PARAM_KEYS = ['parcelasMax', 'juros', 'validade', 'stages', 'metas'];
  const SETTINGS_SQL =
    "create table if not exists public.settings (\n" +
    "  id int primary key default 1,\n" +
    "  data jsonb not null default '{}'::jsonb,\n" +
    "  updated_at timestamptz not null default now(),\n" +
    "  constraint settings_singleton check (id = 1)\n" +
    ");\n" +
    "alter table public.settings enable row level security;\n" +
    "create policy settings_read on public.settings for select to authenticated using (true);\n" +
    "create policy settings_write on public.settings for all to authenticated\n" +
    "  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))\n" +
    "  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));";
  let settingsSync = null;   // null = desconhecido, true = ativo, false = tabela ausente
  function isMissingTable(err) {
    const m = ((err && (err.message || '')) + ' ' + (err && err.code || '')).toLowerCase();
    return m.includes('settings') && (m.includes('exist') || m.includes('relation') || m.includes('schema cache'))
      || (err && err.code === '42p01') || m.includes('pgrst205') || m.includes('pgrst204');
  }
  // catálogo público compartilhado (sem custo/margem; imagens locais "data:" não sobem — só URLs)
  function publicCatalog() {
    return state.products.map(p => ({
      id: p.id, codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral',
      imagem: (p.imagem && !String(p.imagem).startsWith('data:')) ? p.imagem : '',
      dims: p.dims || '', preco: Number(p.preco) || 0, oculto: !!p.oculto, travado: !!p.travado
    }));
  }
  function applyCatalog(remote) {
    if (!Array.isArray(remote) || !remote.length) return;   // catálogo vazio não apaga o do vendedor
    state.products = remote.map(p => ({
      id: p.id || uid(), codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral',
      imagem: p.imagem || '', dims: p.dims || '', preco: Number(p.preco) || 0,
      margem: null, travado: !!p.travado, oculto: !!p.oculto
    }));
    save();
  }
  async function pullSettings() {
    if (!(Cloud.ready && Cloud.ready())) return;
    try {
      const data = await Cloud.loadSettings();
      settingsSync = true;
      if (data && typeof data === 'object') {
        SHARED_PARAM_KEYS.forEach(k => { if (data[k] !== undefined) state.params[k] = data[k]; });
        if (!(Cloud.isAdmin && Cloud.isAdmin())) applyCatalog(data.catalog);   // vendedor recebe o catálogo do admin
        save();
      }
    } catch (err) { if (isMissingTable(err)) settingsSync = false; else console.error(err); }
  }
  let _pushTimer = null;
  function schedulePushSettings() {
    if (settingsSync === false) return;                 // tabela não existe → fica local
    if (!(Cloud.isAdmin && Cloud.isAdmin())) return;    // só admin publica
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(async () => {
      const payload = {};
      SHARED_PARAM_KEYS.forEach(k => { if (state.params[k] !== undefined) payload[k] = state.params[k]; });
      payload.catalog = publicCatalog();                  // publica o catálogo junto (produtos + imagens hospedadas)
      try { await Cloud.saveSettings(payload); settingsSync = true; renderSyncStatus(); }
      catch (err) { if (isMissingTable(err)) { settingsSync = false; renderSyncStatus(); } else console.error(err); }
    }, 800);
  }
  function renderSyncStatus() {
    const el = $('#syncStatus'); if (!el) return;
    if (!(Cloud.isAdmin && Cloud.isAdmin())) { el.hidden = true; return; }
    el.hidden = false;
    if (settingsSync === false) {
      el.className = 'sync-status off';
      el.innerHTML = 'Sincronização desativada — etapas e metas ficam só neste aparelho. <button type="button" id="syncHelp" class="atv__help">Como ativar</button>';
    } else {
      el.className = 'sync-status on';
      el.textContent = '☁️ Etapas, metas e condições sincronizadas com a equipe.';
    }
  }

  /* ------------------------------------------------------------
     SENHA / DESTRAVAR (AES-256-GCM via Web Crypto)
     ------------------------------------------------------------ */
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decryptSecure(password) {
    const blob = window.TORQUE_SECURE;
    if (!blob) throw new Error('sem dados');
    const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64d(blob.salt), iterations: blob.iter || 150000, hash: 'SHA-256' },
      baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(blob.iv) }, key, b64d(blob.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  let secretCache = null;   // segredo descriptografado, só em memória
  function mergeSecret() {
    if (!secretCache) return;
    FISCAL_KEYS.forEach(k => { if (state.params[k] == null) state.params[k] = secretCache.params[k]; });
    const byCode = {};
    secretCache.items.forEach(it => { byCode[it.codigo] = it.fob; });
    state.products.forEach(p => { if (byCode[p.codigo] != null) p.fob = byCode[p.codigo]; });
  }
  async function unlock(password) {
    secretCache = await decryptSecure(password);   // lança se a senha estiver errada
    mergeSecret();
    unlocked = true;
    sessionStorage.setItem(UNLOCK_KEY, '1');
    save();
  }
  function lock() {
    unlocked = false;
    sessionStorage.removeItem(UNLOCK_KEY);
    stripSecret(state);
    state.mode = 'vendedor';
    save(); render();
  }

  /* ------------------------------------------------------------
     PRECIFICAÇÃO
     ------------------------------------------------------------ */
  /* Preço de venda público fica em p.preco. No modo admin (destravado),
     o preço é recalculado a partir do custo FOB com o modelo da planilha:
     CIF(US$)  = FOB + Frete intl + FOB×Seguro%
     Custo(R$) = CIF × (1+IOF+II+IPI+PIS/COFINS)/(1−ICMS) × Câmbio + Frete nacional
     Preço(R$) = Custo × (1+Margem) × (1−Desconto)                                   */
  const P = () => state.params;
  const fobDe = p => Number(p.fob) || 0;
  const temCusto = p => p.fob != null && p.fob !== '';
  function cifUSD(p) { const fob = fobDe(p); return fob + (P().freteIntlUSD || 0) + fob * (P().seguroPct || 0) / 100; }
  function fatorImposto() {
    const a = ((P().iof || 0) + (P().ii || 0) + (P().ipi || 0) + (P().pisCofins || 0)) / 100;
    const icms = (P().icms || 0) / 100;
    return (1 + a) / (1 - icms);
  }
  function custoBRL(p) { return cifUSD(p) * fatorImposto() * (P().cambio || 1) + (P().freteNacionalBRL || 0); }
  function margemDe(p) { return (p.margem != null && p.margem !== '') ? Number(p.margem) : Number(P().margem || 0); }
  function precoCalculado(p) { return custoBRL(p) * (1 + margemDe(p) / 100) * (1 - (P().descontoPct || 0) / 100); }
  const r2 = n => Math.round(n * 100) / 100;
  // Preço efetivo (o que todos veem) = preço de venda armazenado.
  function precoEfetivo(p) { return Number(p.preco) || 0; }
  function margemEfetivaPct(p) {
    if (!temCusto(p)) return 0;
    const c = custoBRL(p); const v = precoEfetivo(p);
    if (!c) return 0; return ((v - c) / c) * 100;
  }
  // Recalcula os preços de venda a partir dos custos (só destravado).
  function recalcAll() {
    if (!unlocked) return;
    state.products.forEach(p => { if (temCusto(p) && !p.travado) p.preco = r2(precoCalculado(p)); });
    save();
  }

  /* ------------------------------------------------------------
     PARCELAMENTO
     ------------------------------------------------------------ */
  function parcelaValor(total, n) {
    const i = (P().juros || 0) / 100;
    if (i <= 0) return total / n;
    return total * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  }

  /* ------------------------------------------------------------
     CARRINHO
     ------------------------------------------------------------ */
  const qtyOf = id => Number(state.cart[id]) || 0;
  function setQty(id, q) {
    q = Math.max(0, Math.floor(q || 0));
    if (q <= 0) delete state.cart[id]; else state.cart[id] = q;
    save();
  }
  function cartLines() {
    return Object.keys(state.cart).map(id => {
      const p = state.products.find(x => x.id === id);
      if (!p) return null;
      const q = qtyOf(id); const unit = precoEfetivo(p);
      return { p, q, unit, total: unit * q };
    }).filter(Boolean).filter(l => l.q > 0);
  }
  const cartTotal = () => cartLines().reduce((s, l) => s + l.total, 0);
  const cartCount = () => cartLines().reduce((s, l) => s + l.q, 0);

  /* ------------------------------------------------------------
     ORÇAMENTO — desconto (vendedor), sinal/entrada, saldo
     ------------------------------------------------------------ */
  const Q = () => state.quote;
  function descontoReais(subtotal) {
    const q = Q();
    const v = Number(q.descValue) || 0;
    if (q.descMode === 'brl') return Math.min(Math.max(v, 0), subtotal);
    return subtotal * Math.min(Math.max(v, 0), 100) / 100;   // %
  }
  function totalComDesconto() { const sub = cartTotal(); return Math.max(0, sub - descontoReais(sub)); }
  function sinalReais() { return Math.min(Math.max(Number(Q().sinal) || 0, 0), totalComDesconto()); }
  function saldoFinanciar() { return Math.max(0, totalComDesconto() - sinalReais()); }

  /* ------------------------------------------------------------
     CADASTROS — vendedores e clientes
     ------------------------------------------------------------ */
  const clienteById = id => state.clientes.find(c => c.id === id) || null;
  function currentVendedor() { return state.currentVendedor || null; }

  /* ------------------------------------------------------------
     FILTROS
     ------------------------------------------------------------ */
  function series() {
    const set = new Set(state.products.map(p => p.serie || 'Geral'));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  function visibleProducts() {
    const isAdmin = state.mode === 'admin';
    const q = (state.filters.query || '').trim().toLowerCase();
    const serie = state.filters.serie;
    return state.products.filter(p => {
      if (!isAdmin && p.oculto) return false;
      if (serie !== 'all' && (p.serie || 'Geral') !== serie) return false;
      if (q) {
        const hay = (p.nome + ' ' + p.codigo + ' ' + p.serie).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /* ------------------------------------------------------------
     RENDER
     ------------------------------------------------------------ */
  const plateSVG = `<svg class="card__plate" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="none" stroke="#3A3A48" stroke-width="3"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="#8B5CF6" stroke-width="2" opacity=".5"/>
    <circle cx="50" cy="50" r="13" fill="#1D1D27" stroke="#8B5CF6" stroke-width="3"/>
    <g stroke="#3A3A48" stroke-width="3">
      <line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/>
      <line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/>
    </g></svg>`;

  function render() {
    document.body.dataset.mode = state.mode;
    renderModeToggle();
    renderConfig();
    renderChips();
    renderGrid();
    renderSummary();
    renderSerieDatalist();
  }

  function renderModeToggle() { /* CSS handles via data-mode */ }

  function renderConfig() {
    const p = P();
    setVal('#cfgCambio', p.cambio); setVal('#cfgMargem', p.margem);
    setVal('#cfgDesconto', p.descontoPct);
    setVal('#cfgII', p.ii); setVal('#cfgIPI', p.ipi); setVal('#cfgPis', p.pisCofins);
    setVal('#cfgICMS', p.icms); setVal('#cfgIOF', p.iof); setVal('#cfgSeguro', p.seguroPct);
    setVal('#cfgFreteIntl', p.freteIntlUSD); setVal('#cfgFreteNac', p.freteNacionalBRL);
    setVal('#cfgParcelas', p.parcelasMax); setVal('#cfgJuros', p.juros);
    setVal('#cfgValidade', p.validade);
    renderStagesEditor();
    renderSyncStatus();
    $('#configPanel').hidden = state.mode !== 'admin';
  }
  // ajuda do sync (botão recriado dinamicamente → delegação)
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'syncHelp') {
      alert('Para sincronizar etapas, metas e condições com toda a equipe, abra o Supabase → SQL Editor e rode:\n\n' + SETTINGS_SQL + '\n\nDepois recarregue a página.');
    }
  });
  function setVal(sel, v) { const el = $(sel); if (el && document.activeElement !== el) el.value = v; }

  // editor das etapas do funil (nome + probabilidade) — admin
  function renderStagesEditor() {
    const box = $('#stagesEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;   // não recria enquanto digita
    box.innerHTML = STAGES.map(s => `
      <div class="stagerow">
        <span class="stagerow__dot st-${s.key}"></span>
        <input class="stagerow__name" data-stage-name="${s.key}" type="text" value="${esc(stageName(s.key))}" aria-label="Nome da etapa" />
        <span class="stagerow__prob"><input data-stage-prob="${s.key}" type="number" min="0" max="100" step="5" value="${stageProb(s.key)}" aria-label="Probabilidade" />%</span>
      </div>`).join('');
  }
  (function wireStagesEditor() {
    const box = $('#stagesEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const nameEl = e.target.closest('[data-stage-name]');
      const probEl = e.target.closest('[data-stage-prob]');
      if (!nameEl && !probEl) return;
      if (!P().stages) P().stages = {};
      const k = (nameEl || probEl).dataset.stageName || (nameEl || probEl).dataset.stageProb;
      const cur = P().stages[k] || {};
      if (nameEl) cur.nome = nameEl.value;
      if (probEl) cur.prob = Math.max(0, Math.min(100, parseInt(probEl.value, 10) || 0));
      P().stages[k] = cur; save(); schedulePushSettings();
      if (dashView === 'metrics' && !$('#dashScreen').hidden) renderDashboard();   // atualiza a previsão ao vivo
    });
  })();

  // edição ao vivo das metas mensais (atualiza a barra sem recriar o input)
  (function wireMetas() {
    const box = $('#dashMetrics'); if (!box) return;
    box.addEventListener('input', e => {
      const inp = e.target.closest('[data-meta]'); if (!inp) return;
      const nome = inp.dataset.meta;
      const target = Math.max(0, Number(inp.value) || 0);
      if (!P().metas) P().metas = {};
      P().metas[nome] = target; save(); schedulePushSettings();
      const row = inp.closest('.metarow'); if (!row) return;
      const done = Number(row.dataset.done) || 0;
      const pct = target ? Math.min(100, Math.round(done / target * 100)) : 0;
      const fill = row.querySelector('.mbar__fill'); if (fill) { fill.style.width = pct + '%'; fill.classList.toggle('ok', pct >= 100); }
      const v = row.querySelector('.metarow__v'); if (v) v.innerHTML = `<b>${moneyK(done)}</b>${target ? ` / ${moneyK(target)} · ${pct}%` : ''}`;
    });
  })();

  function renderChips() {
    const wrap = $('#serieChips');
    const all = ['all', ...series()];
    wrap.innerHTML = all.map(s => {
      const label = s === 'all' ? 'Todos' : s;
      const sel = state.filters.serie === s;
      return `<button class="chip" role="tab" data-serie="${esc(s)}" aria-selected="${sel}">${esc(label)}</button>`;
    }).join('');
  }

  const PAGE = 60;            // cards renderizados por lote
  let gridList = [];          // lista filtrada atual
  let gridShown = 0;          // quantos já estão no DOM
  let gridObserver = null;

  function cardHTML(p, isAdmin) {
      const price = precoEfetivo(p);
      const q = qtyOf(p.id);
      const media = p.imagem
        ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__PLATE))"/>`
        : plateSVG;

      const adminCost = (isAdmin && temCusto(p)) ? `
        <div class="card__cost">
          <span>FOB <b>US$ ${fobDe(p).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</b></span>
          <span>Custo <b>${money(custoBRL(p))}</b></span>
          <span class="tag-margin">Mrg ${margemEfetivaPct(p).toFixed(0)}%</span>
          ${p.travado ? '<span class="tag-manual">travado</span>' : ''}
        </div>` : '';

      const control = isAdmin ? '' : `
        <div class="stepper ${q > 0 ? 'has-qty' : ''}" data-id="${p.id}">
          <button type="button" data-act="dec" aria-label="Diminuir">−</button>
          <input type="number" inputmode="numeric" min="0" value="${q}" data-act="qty" aria-label="Quantidade"/>
          <button type="button" data-act="inc" aria-label="Aumentar">+</button>
        </div>`;

      return `<article class="card ${q > 0 ? 'is-incart' : ''} ${p.oculto ? 'is-hidden-prod' : ''}" data-id="${p.id}">
        <div class="card__media">
          ${media}
          ${p.codigo ? `<span class="card__badge">${esc(p.codigo)}</span>` : ''}
          ${isAdmin ? `<button class="card__edit" data-act="edit" aria-label="Editar">✎</button>` : ''}
          ${isAdmin && p.oculto ? `<span class="card__hideflag">oculto</span>` : ''}
        </div>
        <div class="card__body">
          <span class="card__serie">${esc(p.serie || 'Geral')}</span>
          <span class="card__name">${esc(p.nome)}</span>
          <div class="card__spacer"></div>
          <span class="card__price">${money(price)}</span>
          ${adminCost}
          ${control}
        </div>
      </article>`;
  }

  function renderGrid() {
    const grid = $('#productGrid');
    gridList = visibleProducts();
    $('#emptyState').hidden = gridList.length !== 0;
    grid.innerHTML = '';
    gridShown = 0;
    appendGridChunk();
  }

  function appendGridChunk() {
    const grid = $('#productGrid');
    const isAdmin = state.mode === 'admin';
    const next = gridList.slice(gridShown, gridShown + PAGE);
    if (next.length) {
      grid.insertAdjacentHTML('beforeend', next.map(p => cardHTML(p, isAdmin)).join(''));
      gridShown += next.length;
    }
    // (re)posiciona a sentinela de scroll infinito
    let sentinel = $('#gridSentinel');
    if (gridShown < gridList.length) {
      if (!sentinel) { sentinel = document.createElement('div'); sentinel.id = 'gridSentinel'; }
      grid.after(sentinel);
      if (!gridObserver) {
        gridObserver = new IntersectionObserver(es => { if (es[0].isIntersecting) appendGridChunk(); }, { rootMargin: '600px' });
      }
      gridObserver.observe(sentinel);
    } else if (sentinel) {
      gridObserver && gridObserver.unobserve(sentinel); sentinel.remove();
    }
  }

  function renderSerieDatalist() {
    $('#serieList').innerHTML = series().map(s => `<option value="${esc(s)}">`).join('');
  }

  function renderPeople() {
    const v = currentVendedor();
    $('#qpVendedor').textContent = v ? v.nome : '—';
    const cSel = $('#selCliente');
    cSel.innerHTML = '<option value="">— selecione —</option>' +
      state.clientes.map(c => `<option value="${c.id}" ${c.id === Q().clienteId ? 'selected' : ''}>${esc(c.nome)}${c.empresa ? ' · ' + esc(c.empresa) : ''}</option>`).join('');
    $('#btnEditCliente').disabled = !Q().clienteId;
  }

  function renderSummary() {
    const lines = cartLines();
    const subtotal = cartTotal();
    const desc = descontoReais(subtotal);
    const total = totalComDesconto();
    const sinal = sinalReais();
    const saldo = saldoFinanciar();

    $('#cartCount').textContent = cartCount();
    $('#cartTotalMini').textContent = money(total);
    $('#sumSubtotal').textContent = money(subtotal);
    $('#sumDescAplicado').textContent = '− ' + money(desc);
    $('#sumTotal').textContent = money(total);
    $('#sumSaldo').textContent = money(saldo);

    $('#discToggle').textContent = Q().descMode === 'brl' ? 'R$' : '%';
    if (document.activeElement !== $('#inpDesconto')) $('#inpDesconto').value = Q().descValue || 0;
    if (document.activeElement !== $('#inpSinal')) $('#inpSinal').value = Q().sinal || 0;

    const editing = !!editingOrcamentoId;
    $('#editBanner').hidden = !editing;
    if (editing) $('#editBannerText').textContent = '✎ Editando orçamento — “Gerar” salva por cima';
    $('#btnExport').textContent = editing ? 'Salvar alterações' : 'Gerar orçamento';

    renderPeople();

    $('#summaryItems').innerHTML = lines.length ? lines.map(l => `
      <div class="sitem" data-id="${l.p.id}">
        <span class="sitem__name">${esc(l.p.nome)}</span>
        <button class="btn btn--ghost sitem__rm" data-act="rm" aria-label="Remover" style="padding:6px 10px">✕</button>
        <span class="sitem__meta">${l.q} × ${money(l.unit)}</span>
        <span class="sitem__total">${money(l.total)}</span>
      </div>`).join('')
      : `<p class="empty" style="padding:18px 0">Escolha produtos para montar o orçamento.</p>`;

    renderInstallSelect(saldo);
  }

  function renderInstallSelect(saldo) {
    const sel = $('#installSelect');
    const maxN = Math.max(1, Math.floor(P().parcelasMax || 12));
    const opts = [];
    [1, 3, 6, 10, 12, 18, 24, 36, 48, 60, 72, 96].forEach(n => { if (n <= maxN) opts.push(n); });
    if (!opts.includes(maxN)) opts.push(maxN);
    const current = Number(sel.value) || maxN;
    sel.innerHTML = opts.map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}x</option>`).join('');
    updateInstallValue(saldo);
  }
  function updateInstallValue(saldo) {
    const n = Number($('#installSelect').value) || 1;
    const v = saldo > 0 ? parcelaValor(saldo, n) : 0;
    $('#installValue').textContent = saldo > 0 ? `${n}× de ${money(v)}` : '—';
    const juros = P().juros || 0;
    $('#installNote').textContent = saldo > 0
      ? (juros > 0 ? `Sobre o saldo · juros ${juros}% a.m. · total ${money(v * n)}` : 'Sobre o saldo · sem juros')
      : '';
  }

  /* ------------------------------------------------------------
     EVENTOS — globais
     ------------------------------------------------------------ */
  window.__PLATE = plateSVG;

  function toggleAdminMode() {
    closeUserMenu();
    if (state.mode === 'admin') { state.mode = 'vendedor'; save(); render(); return; }
    if (unlocked) { state.mode = 'admin'; save(); render(); }
    else openPasswordModal();
  }
  $('#umAdmin').addEventListener('click', toggleAdminMode);

  $('#configCollapse').addEventListener('click', e => {
    const panel = $('#configPanel'); panel.classList.toggle('collapsed');
    e.target.textContent = panel.classList.contains('collapsed') ? 'Expandir' : 'Recolher';
  });

  // search
  $('#searchInput').addEventListener('input', e => { state.filters.query = e.target.value; renderGrid(); });

  // chips (filter)
  $('#serieChips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.filters.serie = b.dataset.serie; save(); renderChips(); renderGrid();
  });

  // config inputs -> recalcula (espelha a aba Configuracoes)
  const CFG_MAP = {
    '#cfgCambio': 'cambio', '#cfgMargem': 'margem', '#cfgDesconto': 'descontoPct',
    '#cfgII': 'ii', '#cfgIPI': 'ipi', '#cfgPis': 'pisCofins', '#cfgICMS': 'icms',
    '#cfgIOF': 'iof', '#cfgSeguro': 'seguroPct', '#cfgFreteIntl': 'freteIntlUSD',
    '#cfgFreteNac': 'freteNacionalBRL', '#cfgJuros': 'juros'
  };
  Object.keys(CFG_MAP).forEach(sel => {
    $(sel).addEventListener('input', () => {
      P()[CFG_MAP[sel]] = num($(sel).value) || 0;
      if (sel !== '#cfgJuros') recalcAll();   // juros não altera preço, só parcela
      save(); renderGrid(); renderSummary();
      if (sel === '#cfgJuros') schedulePushSettings();   // juros é parâmetro compartilhado
    });
  });
  $('#cfgParcelas').addEventListener('input', () => { P().parcelasMax = Math.max(1, parseInt($('#cfgParcelas').value, 10) || 1); save(); renderSummary(); schedulePushSettings(); });
  $('#cfgValidade').addEventListener('input', () => { P().validade = Math.max(1, parseInt($('#cfgValidade').value, 10) || 1); save(); schedulePushSettings(); });

  // grid interactions (delegation)
  $('#productGrid').addEventListener('click', e => {
    const card = e.target.closest('.card'); if (!card) return;
    const id = card.dataset.id;
    const act = e.target.dataset.act;
    if (act === 'edit') return openEdit(id);
    if (act === 'inc') { setQty(id, qtyOf(id) + 1); refreshCard(id); renderSummary(); }
    if (act === 'dec') { setQty(id, qtyOf(id) - 1); refreshCard(id); renderSummary(); }
  });
  $('#productGrid').addEventListener('change', e => {
    if (e.target.dataset.act === 'qty') {
      const id = e.target.closest('.card').dataset.id;
      setQty(id, parseInt(e.target.value, 10) || 0); refreshCard(id); renderSummary();
    }
  });

  function refreshCard(id) {
    // Re-render single card to reflect qty/incart state without losing scroll.
    const card = $(`.card[data-id="${id}"]`); if (!card) return renderGrid();
    const q = qtyOf(id);
    card.classList.toggle('is-incart', q > 0);
    const stepper = card.querySelector('.stepper');
    if (stepper) { stepper.classList.toggle('has-qty', q > 0); const inp = stepper.querySelector('input'); if (inp) inp.value = q; }
  }

  /* ------------------------------------------------------------
     SUMMARY (vendor) — abrir/fechar, itens, parcelas, ações
     ------------------------------------------------------------ */
  $('#summaryHandle').addEventListener('click', () => $('#summaryBar').classList.toggle('open'));
  $('#installSelect').addEventListener('change', () => updateInstallValue(saldoFinanciar()));
  $('#summaryItems').addEventListener('click', e => {
    if (e.target.dataset.act === 'rm') {
      const id = e.target.closest('.sitem').dataset.id; setQty(id, 0); refreshCard(id); renderSummary();
    }
  });
  function novoOrcamento() {
    state.cart = {}; state.quote.descValue = 0; state.quote.sinal = 0;
    state.quote.clienteId = null; editingOrcamentoId = null; editingNumero = ''; editingObs = '';
    save(); render();
  }
  $('#btnClearCart').addEventListener('click', () => {
    if (!cartCount() && !editingOrcamentoId) return;
    if (confirm('Limpar e começar um novo orçamento?')) novoOrcamento();
  });
  $('#btnNovoOrc').addEventListener('click', () => {
    if (!cartCount() || confirm('Descartar edições e começar um novo orçamento?')) novoOrcamento();
  });

  // desconto / sinal (vendedor)
  $('#inpDesconto').addEventListener('input', e => { state.quote.descValue = num(e.target.value) || 0; save(); renderSummary(); });
  $('#inpSinal').addEventListener('input', e => { state.quote.sinal = num(e.target.value) || 0; save(); renderSummary(); });
  $('#discToggle').addEventListener('click', () => {
    state.quote.descMode = state.quote.descMode === 'brl' ? 'pct' : 'brl';
    save(); renderSummary();
  });

  // seleção de cliente
  $('#selCliente').addEventListener('change', e => { state.quote.clienteId = e.target.value || null; save(); renderSummary(); });
  $('#btnNovoCliente').addEventListener('click', () => openCliente(null));
  $('#btnEditCliente').addEventListener('click', () => Q().clienteId && openCliente(Q().clienteId));

  /* ------------------------------------------------------------
     CADASTRO — clientes (na nuvem, por vendedor)
     ------------------------------------------------------------ */
  let editClienteId = null;
  function openCliente(id) {
    const c = id ? clienteById(id) : null;
    editClienteId = id || null;
    $('#clienteTitle').textContent = c ? 'Editar cliente' : 'Novo cliente';
    $('#clNome').value = c ? c.nome : '';
    $('#clEmpresa').value = c ? (c.empresa || '') : '';
    $('#clTelefone').value = c ? (c.telefone || '') : '';
    $('#clEmail').value = c ? (c.email || '') : '';
    $('#clDoc').value = c ? (c.doc || '') : '';
    $('#clCidade').value = c ? (c.cidade || '') : '';
    $('#clObs').value = c ? (c.obs || '') : '';
    $('#btnDeleteCliente').style.display = c ? '' : 'none';
    ['#clTelefone', '#clEmail', '#clDoc'].forEach(s => markField(s, true));
    openModal('#clienteModal');
  }
  $('#btnSaveCliente').addEventListener('click', async () => {
    const nome = $('#clNome').value.trim();
    if (!nome) { toast('Informe o nome do cliente.'); return; }
    const tel = $('#clTelefone').value.trim(), email = $('#clEmail').value.trim(), doc = $('#clDoc').value.trim();
    const okTel = validaTel(tel), okEmail = validaEmail(email), okDoc = validaDoc(doc);
    markField('#clTelefone', okTel); markField('#clEmail', okEmail); markField('#clDoc', okDoc);
    if (!okTel) { toast('Telefone inválido — use DDD + número.'); return; }
    if (!okEmail) { toast('E-mail inválido.'); return; }
    if (!okDoc) { toast('CNPJ/CPF inválido.'); return; }
    const dados = {
      id: editClienteId || undefined,
      nome, empresa: $('#clEmpresa').value.trim(), telefone: $('#clTelefone').value.trim(),
      email: $('#clEmail').value.trim(), doc: $('#clDoc').value.trim(),
      cidade: $('#clCidade').value.trim(), obs: $('#clObs').value.trim()
    };
    try {
      const saved = await Cloud.saveCliente(dados);
      await reloadClientes();
      if (!editClienteId && saved) state.quote.clienteId = saved.id;
      save(); closeModal('#clienteModal'); renderSummary(); toast('Cliente salvo.');
    } catch (e) { console.error(e); toast('Erro ao salvar cliente.'); }
  });
  $('#btnDeleteCliente').addEventListener('click', async () => {
    if (!editClienteId) return;
    if (!confirm('Remover este cliente?')) return;
    try {
      await Cloud.deleteCliente(editClienteId);
      if (state.quote.clienteId === editClienteId) state.quote.clienteId = null;
      await reloadClientes();
      save(); closeModal('#clienteModal'); renderSummary(); toast('Cliente removido.');
    } catch (e) { console.error(e); toast('Erro ao remover cliente.'); }
  });

  // máscara ao digitar nos campos de contato
  bindMask('#clTelefone', maskTel); bindMask('#clDoc', maskDoc);
  bindMask('#pfCelular', maskTel); bindMask('#pfCpf', maskDoc); bindMask('#pfCep', maskCEP);

  async function reloadClientes() {
    try { state.clientes = await Cloud.listClientes(); } catch (e) { console.error(e); }
  }

  /* ------------------------------------------------------------
     EDIT / ADD PRODUCT (admin)
     ------------------------------------------------------------ */
  let editingId = null;
  function openEdit(id) {
    const p = id ? state.products.find(x => x.id === id) : null;
    editingId = id || null;
    $('#editTitle').textContent = p ? 'Editar produto' : 'Novo produto';
    $('#edId').value = id || '';
    $('#edCodigo').value = p ? p.codigo : '';
    $('#edSerie').value = p ? p.serie : (state.filters.serie !== 'all' ? state.filters.serie : '');
    $('#edNome').value = p ? p.nome : '';
    $('#edImagem').value = p ? p.imagem : '';
    setImgPreview(p ? p.imagem : '');
    $('#edCusto').value = (p && temCusto(p)) ? fobDe(p) : '';
    $('#edDims').value = p ? (p.dims || '') : '';
    $('#edMargem').value = (p && p.margem != null) ? p.margem : '';
    $('#edPreco').value = (p && p.travado) ? p.preco : '';
    $('#edOculto').checked = p ? !!p.oculto : false;
    $('#btnDeleteProduct').style.display = p ? '' : 'none';
    updateEditPreview();
    openModal('#editModal');
  }
  function readEditForm() {
    return {
      codigo: $('#edCodigo').value.trim(),
      serie: $('#edSerie').value.trim() || 'Geral',
      nome: $('#edNome').value.trim(),
      imagem: $('#edImagem').value.trim(),
      dims: $('#edDims').value.trim(),
      fob: num($('#edCusto').value) || 0,
      margem: $('#edMargem').value === '' ? null : (num($('#edMargem').value) || 0),
      precoInput: $('#edPreco').value === '' ? null : (num($('#edPreco').value) || 0),
      oculto: $('#edOculto').checked
    };
  }
  function updateEditPreview() {
    const f = readEditForm();
    const c = custoBRL(f);
    const v = f.precoInput != null ? f.precoInput : precoCalculado(f);
    const mrg = c ? ((v - c) / c * 100) : 0;
    $('#pricePreview').innerHTML =
      `CIF: <b>US$ ${cifUSD(f).toFixed(2)}</b> · custo final: <b>${money(c)}</b><br>` +
      `Preço de venda: <b>${money(v)}</b> · margem efetiva: <b>${mrg.toFixed(0)}%</b>` +
      (f.precoInput != null ? ' (preço travado)' : ' (automático)');
  }
  ['#edCusto', '#edMargem', '#edPreco'].forEach(s => $(s).addEventListener('input', updateEditPreview));

  // ---- imagem do produto: escolher/tirar foto, redimensionar e enviar (Storage com fallback local) ----
  function setImgPreview(url) {
    const img = $('#edImgPreview'), ph = $('#edImgPh'), clr = $('#btnClearImg');
    if (!img) return;
    if (url) { img.src = url; img.hidden = false; if (ph) ph.hidden = true; if (clr) clr.hidden = false; }
    else { img.removeAttribute('src'); img.hidden = true; if (ph) ph.hidden = false; if (clr) clr.hidden = true; }
  }
  function resizeImage(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);          // fundo branco p/ PNG transparente
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('encode')); return; }
          const fr = new FileReader();
          fr.onload = () => resolve({ blob, dataUrl: fr.result });
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('imagem inválida'));
      img.src = URL.createObjectURL(file);
    });
  }
  if ($('#btnPickImg')) $('#btnPickImg').addEventListener('click', () => $('#edImgFile').click());
  if ($('#btnClearImg')) $('#btnClearImg').addEventListener('click', () => { $('#edImagem').value = ''; setImgPreview(''); });
  if ($('#edImagem')) $('#edImagem').addEventListener('input', () => setImgPreview($('#edImagem').value.trim()));
  if ($('#edImgFile')) $('#edImgFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const btn = $('#btnPickImg'), old = btn.textContent; btn.disabled = true; btn.textContent = 'Processando…';
    try {
      const { blob, dataUrl } = await resizeImage(file, 1000, 0.72);
      let url = dataUrl, naNuvem = false;
      try { url = await Cloud.uploadProductImage(blob, 'jpg'); naNuvem = true; }
      catch (err) { console.warn('Storage indisponível, usando imagem local:', err); }
      $('#edImagem').value = url; setImgPreview(url);
      toast(naNuvem ? 'Imagem enviada.' : 'Imagem adicionada (local — ative o Storage para compartilhar com a equipe).');
    } catch (err) { console.error(err); toast('Não foi possível ler a imagem.'); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  $('#btnSaveProduct').addEventListener('click', () => {
    const f = readEditForm();
    if (!f.nome) { toast('Informe o nome do produto.'); return; }
    const p = editingId ? state.products.find(x => x.id === editingId) : { id: uid() };
    p.codigo = f.codigo; p.serie = f.serie; p.nome = f.nome; p.imagem = f.imagem;
    p.dims = f.dims; p.fob = f.fob; p.margem = f.margem; p.oculto = f.oculto;
    if (f.precoInput != null) { p.preco = f.precoInput; p.travado = true; }   // preço travado manual
    else { p.travado = false; p.preco = r2(precoCalculado(p)); }              // volta ao automático
    if (!editingId) state.products.push(p);
    save(); schedulePushSettings(); closeModal('#editModal'); render(); toast('Produto salvo.');
  });
  $('#btnDeleteProduct').addEventListener('click', () => {
    if (!editingId) return;
    if (confirm('Remover este produto definitivamente?')) {
      state.products = state.products.filter(x => x.id !== editingId);
      delete state.cart[editingId];
      save(); schedulePushSettings(); closeModal('#editModal'); render(); toast('Produto removido.');
    }
  });
  $('#btnAddProduct').addEventListener('click', () => openEdit(null));

  $('#btnResetData').addEventListener('click', () => {
    if (confirm('Restaurar o catálogo original? Isso desfaz suas edições.')) {
      state = freshFromSeed(); state.mode = 'admin';
      mergeSecret();            // recupera custos do segredo já destravado
      save(); schedulePushSettings(); render(); toast('Catálogo original restaurado.');
    }
  });

  /* ------------------------------------------------------------
     IMPORT (XLSX/CSV) com mapeamento de colunas
     ------------------------------------------------------------ */
  let importRows = [];   // array de objetos {header: value}
  let importHeaders = [];

  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'csv') parseCSVText(await file.text());
      else await parseXLSX(file);
      if (!importHeaders.length) { toast('Não foi possível ler colunas da planilha.'); return; }
      buildMapUI();
      openModal('#importModal');
    } catch (err) {
      console.error(err); toast('Erro ao ler a planilha.');
    } finally { e.target.value = ''; }
  });

  function parseCSVText(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = (text.split(/\r?\n/)[0] || '');
    const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
    const rows = csvToRows(text, delim).filter(r => r.some(c => String(c).trim() !== ''));
    if (!rows.length) { importHeaders = []; importRows = []; return; }
    importHeaders = rows[0].map(h => String(h).trim());
    importRows = rows.slice(1).map(r => {
      const o = {}; importHeaders.forEach((h, i) => o[h] = r[i] != null ? r[i] : ''); return o;
    });
  }
  function csvToRows(text, delim) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === delim) { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  async function parseXLSX(file) {
    toast('Lendo planilha…');
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const rows = arr.filter(r => r.some(c => String(c).trim() !== ''));
    if (!rows.length) { importHeaders = []; importRows = []; return; }
    // pula linhas de título: usa a primeira linha com >=2 células preenchidas como cabeçalho
    let hIdx = rows.findIndex(r => r.filter(c => String(c).trim() !== '').length >= 2);
    if (hIdx < 0) hIdx = 0;
    importHeaders = rows[hIdx].map((h, i) => String(h).trim() || ('Coluna ' + (i + 1)));
    importRows = rows.slice(hIdx + 1).map(r => {
      const o = {}; importHeaders.forEach((h, i) => o[h] = r[i] != null ? r[i] : ''); return o;
    });
  }

  const FIELD_DEFS = [
    { key: 'codigo', label: 'Código', rx: /(c[oó]d|sku|ref|item)/i },
    { key: 'nome',   label: 'Nome / Descrição', rx: /(nome|descri|produto|model)/i },
    { key: 'serie',  label: 'Série / Categoria', rx: /(s[eé]rie|categor|linha|grupo|tipo)/i },
    { key: 'custo',  label: 'Custo FOB (US$)', rx: /(fob|custo|cost|compra)/i },
    { key: 'preco',  label: 'Preço de venda (R$)', rx: /(venda|pre[cç]o|price|valor|varejo)/i },
    { key: 'dims',   label: 'Dimensões', rx: /(dimens|medida|tamanho|l.?.?p.?.?a)/i },
    { key: 'imagem', label: 'Imagem (URL)', rx: /(imagem|image|foto|url|link|img)/i }
  ];
  function guessColumn(field) {
    const h = importHeaders.find(x => field.rx.test(x));
    return h || '';
  }
  function buildMapUI() {
    const grid = $('#mapGrid');
    grid.innerHTML = FIELD_DEFS.map(f => {
      const guess = guessColumn(f);
      const opts = ['<option value="">— ignorar —</option>']
        .concat(importHeaders.map(h => `<option value="${esc(h)}" ${h === guess ? 'selected' : ''}>${esc(h)}</option>`));
      return `<label class="field"><span>${f.label}</span><select data-map="${f.key}">${opts.join('')}</select></label>`;
    }).join('');
    renderImportPreview();
    grid.querySelectorAll('select').forEach(s => s.addEventListener('change', renderImportPreview));
  }
  function currentMap() {
    const m = {}; $$('#mapGrid select').forEach(s => m[s.dataset.map] = s.value); return m;
  }
  function renderImportPreview() {
    const m = currentMap();
    const sample = importRows.slice(0, 5);
    const cols = FIELD_DEFS.filter(f => m[f.key]);
    $('#importPreview').innerHTML =
      `<div style="margin-bottom:6px;color:var(--violet)">${importRows.length} linha(s) detectada(s)</div>` +
      `<table><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>` +
      sample.map(r => `<tr>${cols.map(c => `<td>${esc(String(r[m[c.key]] ?? ''))}</td>`).join('')}</tr>`).join('') +
      `</tbody></table>`;
  }
  $('#btnDoImport').addEventListener('click', () => {
    const m = currentMap();
    if (!m.nome) { toast('Selecione ao menos a coluna de Nome.'); return; }
    const imported = importRows.map(r => {
      const nome = String(r[m.nome] ?? '').trim();
      if (!nome) return null;
      const fob = m.custo ? (num(r[m.custo]) || 0) : 0;
      const precoCol = m.preco ? num(r[m.preco]) : NaN;
      const p = {
        id: uid(),
        codigo: m.codigo ? String(r[m.codigo] ?? '').trim() : '',
        nome,
        serie: (m.serie ? String(r[m.serie] ?? '').trim() : '') || 'Geral',
        imagem: m.imagem ? String(r[m.imagem] ?? '').trim() : '',
        dims: m.dims ? String(r[m.dims] ?? '').trim() : '',
        fob, margem: null, travado: false, oculto: false, preco: 0
      };
      // se a planilha trouxe preço de venda, trava nele; senão calcula do custo
      if (Number.isFinite(precoCol)) { p.preco = precoCol; p.travado = true; }
      else p.preco = r2(precoCalculado(p));
      return p;
    }).filter(Boolean);
    if (!imported.length) { toast('Nenhuma linha válida encontrada.'); return; }
    if ($('#impReplace').checked) { state.products = imported; state.cart = {}; }
    else state.products = state.products.concat(imported);
    state._imported = true; // não sobrescrever import do usuário com catálogo embutido
    save(); schedulePushSettings(); closeModal('#importModal'); render();
    toast(`${imported.length} produto(s) importado(s).`);
  });

  /* ------------------------------------------------------------
     QUOTE / EXPORT
     ------------------------------------------------------------ */
  $('#btnExport').addEventListener('click', () => {
    if (!cartCount()) { toast('Adicione produtos ao orçamento primeiro.'); return; }
    if (!Q().clienteId) { toast('Selecione (ou cadastre) o cliente antes de gerar.'); return; }
    buildQuoteDoc(); openModal('#quoteModal'); registrarOrcamento();
  });

  function todayStr() {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function validadeStr() {
    const d = new Date(); d.setDate(d.getDate() + (P().validade || 7));
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  let lastQuoteNumero = '';
  function buildQuoteDoc() {
    const lines = cartLines();
    const subtotal = cartTotal();
    const desc = descontoReais(subtotal);
    const total = totalComDesconto();
    const sinal = sinalReais();
    const saldo = saldoFinanciar();
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const parc = parcelaValor(saldo, n);
    const cli = clienteById(Q().clienteId);
    const vend = currentVendedor();
    const numero = editingOrcamentoId && editingNumero
      ? editingNumero
      : 'ORC-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Date.now().toString(36).slice(-4).toUpperCase();
    lastQuoteNumero = numero;

    const logo = `<svg class="qd__logo" viewBox="0 0 227 271" fill="#8B5CF6"><g transform="translate(0,271) scale(0.1,-0.1)"><path d="M130 2617 c-50 -26 -50 -19 -50 -685 0 -686 -2 -669 61 -691 34 -12 367 -14 406 -3 12 4 105 84 205 178 533 498 494 463 524 455 38 -10 70 -54 58 -81 -5 -11 -268 -262 -584 -558 -586 -547 -620 -584 -652 -682 -6 -19 -13 -125 -15 -236 -6 -224 -3 -234 62 -234 30 0 96 59 706 630 601 563 677 630 703 628 18 -2 37 -14 50 -31 19 -26 19 -30 5 -55 -8 -15 -289 -283 -624 -597 l-609 -570 887 -3 c609 -1 894 1 908 8 19 11 20 24 17 973 -3 944 -4 963 -24 1023 -88 255 -268 427 -539 511 l-90 27 -690 3 c-546 3 -695 1 -715 -10z"/></g></svg>`;
    const thumb = p => p.imagem
      ? `<img class="qd__thumb" src="${esc(p.imagem)}" alt="" onerror="this.style.visibility='hidden'"/>`
      : `<span class="qd__thumb qd__thumb--ph"></span>`;

    const rows = lines.map(l => `
      <tr>
        <td class="qd__imgcell">${thumb(l.p)}</td>
        <td><div class="qd__pname">${esc(l.p.nome)}</div>${l.p.codigo ? `<div class="qd__pcode">${esc(l.p.codigo)}</div>` : ''}${l.p.dims ? `<div class="qd__dims">${esc(l.p.dims)} mm</div>` : ''}</td>
        <td class="num">${l.q}</td>
        <td class="num">${money(l.unit)}</td>
        <td class="num">${money(l.total)}</td>
      </tr>`).join('');

    const jurosTxt = (P().juros || 0) > 0 ? `${n}× com juros de ${P().juros}% a.m.` : `em até ${n}× sem juros`;
    const prof = Cloud.profile || {};
    const cliLinhas = cli ? [
      `<b>${esc(cli.nome)}</b>${cli.empresa ? ' — ' + esc(cli.empresa) : ''}`,
      cli.telefone ? esc(cli.telefone) : '', cli.email ? esc(cli.email) : '',
      [cli.cidade, cli.doc].filter(Boolean).map(esc).join(' · ')
    ].filter(Boolean).join('<br>') : '—';
    const vendLinhas = vend ? [
      `<b>${esc(vend.nome)}</b>`,
      prof.celular ? esc(prof.celular) : '', vend.email ? esc(vend.email) : ''
    ].filter(Boolean).join('<br>') : '—';

    const extraTotais = [];
    if (desc > 0) extraTotais.push(`<div class="qrow"><span>Desconto</span><b>− ${money(desc)}</b></div>`);
    const totalRow = `<div class="qrow ${sinal > 0 ? '' : 'qd__grand'}"><span>${sinal > 0 ? 'Total' : 'Total geral'}</span><b>${money(total)}</b></div>`;
    if (sinal > 0) {
      extraTotais.push(totalRow);
      extraTotais.push(`<div class="qrow"><span>Sinal / entrada</span><b>− ${money(sinal)}</b></div>`);
      extraTotais.push(`<div class="qrow qd__grand"><span>Saldo a financiar</span><b>${money(saldo)}</b></div>`);
    } else {
      extraTotais.push(totalRow);
    }
    const obs = (editingOrcamentoId && editingObs) ? editingObs : '';

    $('#quoteDoc').innerHTML = `
      <div class="qd__head">
        ${logo}
        <div class="qd__brand"><strong>TORQUE FITNESS</strong><span>EQUIPAMENTOS</span></div>
        <div class="qd__meta">
          <div><b style="color:#fff">${numero}</b></div>
          <div>Emissão: ${todayStr()}</div>
          <div>Validade: ${validadeStr()}</div>
        </div>
      </div>
      <div class="qd__parties">
        <div class="qd__party"><h4>Cliente</h4>${cliLinhas}</div>
        <div class="qd__party"><h4>Vendedor</h4>${vendLinhas}</div>
      </div>
      <table class="qd__table">
        <thead><tr><th colspan="2">Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="qd__totals">
        <div class="qrow"><span>Subtotal</span><b>${money(subtotal)}</b></div>
        ${extraTotais.join('')}
      </div>
      <div class="qd__install">
        <div class="big">${n}× de ${money(parc)}</div>
        <small>${sinal > 0 ? 'Saldo parcelado ' : 'Parcelamento '}${jurosTxt}${(P().juros||0)>0 ? ` · total ${money(parc*n)}` : ''}.</small>
      </div>
      <div class="qd__cond">
        <h4>Condições</h4>
        Pagamento: ${sinal > 0 ? `entrada de ${money(sinal)} + ` : ''}${jurosTxt}.<br>
        Validade da proposta: <b>${validadeStr()}</b> (${P().validade || 7} dias).<br>
        Frete e instalação a combinar. Prazo de entrega sujeito à disponibilidade de estoque.
        ${obs ? `<br><br><b>Observações:</b> ${esc(obs)}` : ''}
      </div>
      <div class="qd__foot">
        ${esc(P().empresa || 'Torque Fitness')} · Orçamento gerado em ${todayStr()}${vend ? ' por ' + esc(vend.nome) : ''} · Valores sujeitos a alteração sem aviso prévio.
      </div>`;
  }

  // Salva o orçamento na nuvem (no nome do cliente + vendedor logado).
  async function registrarOrcamento() {
    const lines = cartLines();
    const subtotal = cartTotal();
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const saldo = saldoFinanciar();
    const cli = clienteById(Q().clienteId);
    const vend = currentVendedor();
    const row = {
      numero: lastQuoteNumero,
      cliente_id: Q().clienteId || null,
      cliente_nome: cli ? cli.nome : '',
      vendedor_nome: vend ? vend.nome : '',
      itens: lines.map(l => ({ codigo: l.p.codigo, nome: l.p.nome, qtd: l.q, unitario: l.unit, total: l.total })),
      subtotal,
      desconto: descontoReais(subtotal),
      total: totalComDesconto(),
      sinal: sinalReais(),
      saldo,
      parcelas: n,
      valor_parcela: saldo > 0 ? parcelaValor(saldo, n) : 0
    };
    try {
      if (editingOrcamentoId) {
        await Cloud.updateOrcamento(editingOrcamentoId, row);   // preserva a fase do funil
        toast('Orçamento atualizado.');
      } else {
        row.status = 'novo';                                    // entra no topo do funil
        const saved = await Cloud.saveOrcamento(row);
        if (saved && saved.id) { editingOrcamentoId = saved.id; editingNumero = saved.numero || lastQuoteNumero; }
        toast('Orçamento salvo na nuvem.');
      }
      renderSummary();   // atualiza o aviso de edição / rótulo do botão
    } catch (e) { console.error(e); toast('Falhou salvar na nuvem (verifique conexão).'); }
  }

  // Gera um PDF A4 de verdade a partir do documento (#quoteDoc), paginado.
  // Cai no diálogo de impressão se as libs (CDN) não carregarem (ex.: offline).
  async function gerarPDF() {
    const el = $('#quoteDoc');
    if (!el) return;
    toast('Gerando PDF…');
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      if (!jsPDFCtor) throw new Error('jsPDF indisponível');
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const pdf = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = canvas.height * pw / canvas.width;   // altura proporcional à largura A4
      const data = canvas.toDataURL('image/jpeg', 0.92);
      let heightLeft = imgH, position = 0;
      pdf.addImage(data, 'JPEG', 0, position, pw, imgH);
      heightLeft -= ph;
      while (heightLeft > 0) {                            // fatia em páginas A4
        position -= ph;
        pdf.addPage();
        pdf.addImage(data, 'JPEG', 0, position, pw, imgH);
        heightLeft -= ph;
      }
      pdf.save(`orcamento-${lastQuoteNumero || 'torque'}.pdf`);
      toast('PDF gerado.');
    } catch (e) {
      console.error(e);
      toast('Abrindo impressão para salvar em PDF…');
      window.print();                                    // fallback robusto (offline / CORS)
    }
  }
  $('#btnPdfQuote').addEventListener('click', gerarPDF);

  $('#btnImageQuote').addEventListener('click', async () => {
    try {
      toast('Gerando imagem…');
      await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      const canvas = await html2canvas($('#quoteDoc'), { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = 'orcamento-torque.png'; a.click();
      toast('Imagem salva.');
    } catch (e) { console.error(e); toast('Não foi possível gerar a imagem.'); }
  });

  // Texto-resumo do orçamento (WhatsApp / compartilhar)
  function resumoTexto() {
    const lines = cartLines();
    const total = totalComDesconto();
    const sinal = sinalReais();
    const saldo = saldoFinanciar();
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const cli = clienteById(Q().clienteId);
    const vend = currentVendedor();
    let txt = `*Orçamento Torque Fitness*\n`;
    if (cli) txt += `Cliente: ${cli.nome}\n`;
    if (vend) txt += `Vendedor: ${vend.nome}\n`;
    txt += `\n` + lines.map(l => `• ${l.q}× ${l.p.nome} — ${money(l.total)}`).join('\n') +
      `\n\n*Total: ${money(total)}*`;
    if (sinal > 0) txt += `\nSinal: ${money(sinal)} · Saldo: ${money(saldo)}`;
    txt += `\n${n}× de ${money(parcelaValor(saldo, n))}`;
    return txt;
  }

  // Telefone -> formato internacional do WhatsApp (Brasil = 55).
  function whatsNumero(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (!d.startsWith('55')) d = '55' + d;
    return d;
  }
  $('#btnWppQuote').addEventListener('click', () => {
    const cli = clienteById(Q().clienteId);
    const num = whatsNumero(cli && cli.telefone);
    const txt = encodeURIComponent(resumoTexto());
    if (!num) {
      toast('Cliente sem telefone. Edite o cliente e adicione o WhatsApp.');
      window.open(`https://wa.me/?text=${txt}`, '_blank');   // abre o WhatsApp para escolher contato
      return;
    }
    window.open(`https://wa.me/${num}?text=${txt}`, '_blank');
  });

  $('#btnShareQuote').addEventListener('click', async () => {
    const txt = resumoTexto();
    try {
      // tenta compartilhar imagem como arquivo, se suportado
      if (navigator.share) {
        try {
          await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
          const canvas = await html2canvas($('#quoteDoc'), { scale: 2, backgroundColor: '#fff', useCORS: true });
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          const file = new File([blob], 'orcamento-torque.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: txt, title: 'Orçamento Torque Fitness' });
            return;
          }
        } catch (e) { /* fallback abaixo */ }
        await navigator.share({ text: txt, title: 'Orçamento Torque Fitness' });
      } else {
        await navigator.clipboard.writeText(txt); toast('Resumo copiado para a área de transferência.');
      }
    } catch (e) { /* cancelado */ }
  });

  /* ------------------------------------------------------------
     MODAIS — utilidades
     ------------------------------------------------------------ */
  function openModal(sel) { $(sel).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(sel) { $(sel).hidden = true; document.body.style.overflow = ''; }
  document.addEventListener('click', e => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal'); if (modal) closeModal('#' + modal.id);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal:not([hidden])').forEach(m => closeModal('#' + m.id));
  });

  /* ------------------------------------------------------------
     SENHA — modal de acesso ao Admin
     ------------------------------------------------------------ */
  function openPasswordModal() {
    $('#pwInput').value = '';
    $('#pwError').hidden = true;
    openModal('#pwModal');
    setTimeout(() => $('#pwInput').focus(), 80);
  }
  async function tryUnlock() {
    const pw = $('#pwInput').value;
    if (!pw) return;
    const btn = $('#btnPwOk'); btn.disabled = true; btn.textContent = 'Verificando…';
    try {
      await unlock(pw);
      closeModal('#pwModal');
      state.mode = 'admin'; save(); render();
      toast('Acesso liberado.');
    } catch (e) {
      $('#pwError').hidden = false;
      $('#pwInput').select();
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
  $('#btnPwOk').addEventListener('click', tryUnlock);
  $('#pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  $('#btnLock') && $('#btnLock').addEventListener('click', lock);

  /* ------------------------------------------------------------
     TOAST
     ------------------------------------------------------------ */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2400);
  }

  /* ------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------ */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ------------------------------------------------------------
     VALIDAÇÃO + MÁSCARA (telefone, e-mail, CPF/CNPJ, CEP)
     Funções puras — campos vazios são válidos (são opcionais).
     ------------------------------------------------------------ */
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');

  function validaCPF(v) {
    const c = digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
    let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0; if (d1 !== +c[9]) return false;
    s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
    let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0; return d2 === +c[10];
  }
  function validaCNPJ(v) {
    const c = digits(v);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const dig = len => { let s = 0, pos = len - 7; for (let i = len; i >= 1; i--) { s += +c[len - i] * pos--; if (pos < 2) pos = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dig(12) === +c[12] && dig(13) === +c[13];
  }
  // CPF (11) ou CNPJ (14); vazio = válido
  function validaDoc(v) { const c = digits(v); if (!c) return true; if (c.length === 11) return validaCPF(c); if (c.length === 14) return validaCNPJ(c); return false; }
  function validaEmail(v) { v = String(v || '').trim(); return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function validaTel(v) { let d = digits(v); if (!d) return true; if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d.length === 10 || d.length === 11; }

  function maskTel(v) {
    let d = digits(v); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); d = d.slice(0, 11);
    if (d.length <= 2) return d;
    const rest = d.slice(2);
    if (rest.length <= 4) return `(${d.slice(0, 2)}) ${rest}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${d.slice(0, 2)}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  function maskDoc(v) {
    const d = digits(v).slice(0, 14);
    if (d.length <= 11) { // CPF 000.000.000-00
      let r = d.slice(0, 3);
      if (d.length > 3) r += '.' + d.slice(3, 6);
      if (d.length > 6) r += '.' + d.slice(6, 9);
      if (d.length > 9) r += '-' + d.slice(9, 11);
      return r;
    } // CNPJ 00.000.000/0000-00
    let r = d.slice(0, 2);
    if (d.length > 2) r += '.' + d.slice(2, 5);
    if (d.length > 5) r += '.' + d.slice(5, 8);
    if (d.length > 8) r += '/' + d.slice(8, 12);
    if (d.length > 12) r += '-' + d.slice(12, 14);
    return r;
  }
  function maskCEP(v) { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }

  // marca/limpa estado de erro no campo (label.field pai do input)
  function markField(sel, ok) { const el = $(sel); if (el && el.parentElement) el.parentElement.classList.toggle('field--err', !ok); }
  // máscara ao digitar; limpa o vermelho enquanto o usuário corrige
  function bindMask(sel, fn) {
    const el = $(sel); if (!el) return;
    el.addEventListener('input', () => { el.value = fn(el.value); markField(sel, true); });
  }

  /* ------------------------------------------------------------
     AUTENTICAÇÃO (Supabase) + MENU DO USUÁRIO
     ------------------------------------------------------------ */
  function toggleUserMenu() { const m = $('#userMenu'); m.hidden = !m.hidden; }
  function closeUserMenu() { $('#userMenu').hidden = true; }
  $('#userBtn').addEventListener('click', e => { e.stopPropagation(); toggleUserMenu(); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#userMenu') && !e.target.closest('#userBtn')) closeUserMenu();
  });
  $('#umLogout').addEventListener('click', async () => {
    closeUserMenu();
    try { await Cloud.signOut(); } catch (e) {}
    resetToLogin();
  });

  // ---- Meu cadastro (perfil do vendedor) ----
  $('#umPerfil').addEventListener('click', () => {
    closeUserMenu();
    const p = Cloud.profile || {};
    const cv = state.currentVendedor || {};
    $('#pfNome').value = p.nome || cv.nome || '';
    $('#pfCpf').value = p.cpf || '';
    $('#pfCelular').value = p.celular || p.telefone || '';
    $('#pfEndereco').value = p.endereco || '';
    $('#pfCidade').value = p.cidade || '';
    $('#pfCep').value = p.cep || '';
    $('#pfEmail').value = cv.email || '';
    ['#pfCpf', '#pfCelular'].forEach(s => markField(s, true));
    openModal('#perfilModal');
  });
  $('#btnSavePerfil').addEventListener('click', async () => {
    const nome = $('#pfNome').value.trim();
    if (!nome) { toast('Informe seu nome.'); return; }
    const celular = $('#pfCelular').value.trim();
    const cpf = $('#pfCpf').value.trim();
    const okCpf = !cpf || validaCPF(cpf), okCel = validaTel(celular);
    markField('#pfCpf', okCpf); markField('#pfCelular', okCel);
    if (!okCpf) { toast('CPF inválido.'); return; }
    if (!okCel) { toast('Celular inválido — use DDD + número.'); return; }
    try {
      await Cloud.updateMyProfile({
        nome, cpf, celular, telefone: celular,
        endereco: $('#pfEndereco').value.trim(), cidade: $('#pfCidade').value.trim(), cep: $('#pfCep').value.trim()
      });
      if (state.currentVendedor) state.currentVendedor.nome = nome;
      setRoleUI(nome); save(); renderSummary();
      closeModal('#perfilModal'); toast('Cadastro salvo.');
    } catch (e) { console.error(e); toast('Erro ao salvar cadastro.'); }
  });

  function setRoleUI(nome) {
    const admin = Cloud.isAdmin();
    document.body.classList.toggle('role-admin', admin);
    $('#userInitial').textContent = (String(nome || '?').trim().charAt(0) || '·').toUpperCase();
    $('#umName').textContent = nome || '—';
    $('#umRole').textContent = admin ? 'Administrador' : 'Vendedor';
  }

  async function afterAuth(session) {
    let prof = null;
    try { prof = await Cloud.loadProfile(session.user.id); } catch (e) { console.error(e); }
    const nome = (prof && prof.nome) || session.user.email || 'Vendedor';
    state.currentVendedor = { id: session.user.id, nome, email: session.user.email };
    if (!Cloud.isAdmin()) { state.mode = 'vendedor'; }
    setRoleUI(nome);
    await reloadClientes();
    await pullSettings();          // puxa etapas/metas/condições compartilhadas
    save();
    document.body.dataset.auth = 'in';
    render();
  }

  function resetToLogin() {
    state.currentVendedor = null; state.clientes = []; state.cart = {};
    state.quote = { clienteId: null, descMode: 'pct', descValue: 0, sinal: 0 };
    document.body.classList.remove('role-admin');
    $('#dashScreen').hidden = true; document.body.style.overflow = '';
    document.body.dataset.auth = 'out';
    $('#loginSenha').value = '';
    signupMode = false; updateLoginMode();
  }

  /* ---------- LOGIN ---------- */
  let signupMode = false;
  function updateLoginMode() {
    $('#signupExtra').hidden = !signupMode;
    $('#loginTitle').textContent = signupMode ? 'Criar conta de vendedor' : 'Entrar';
    $('#btnLoginSubmit').textContent = signupMode ? 'Criar conta' : 'Entrar';
    $('#btnLoginSwitch').innerHTML = signupMode ? 'Já tenho conta. <b>Entrar</b>' : 'Não tem conta? <b>Criar conta</b>';
    $('#loginError').hidden = true;
  }
  function loginError(msg) { const e = $('#loginError'); e.textContent = msg; e.hidden = false; }
  function traduzErro(e) {
    const m = (e && e.message) || '';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/already registered|already exists/i.test(m)) return 'Esse e-mail já tem conta. Faça login.';
    if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado.';
    if (/fetch|network|Failed/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
    return m || 'Não foi possível entrar.';
  }
  async function doLogin() {
    const email = $('#loginEmail').value.trim();
    const senha = $('#loginSenha').value;
    const nome = $('#loginNome').value.trim();
    if (!email || !senha) { loginError('Preencha e-mail e senha.'); return; }
    if (signupMode && !nome) { loginError('Informe seu nome completo.'); return; }
    const btn = $('#btnLoginSubmit'); btn.disabled = true; btn.textContent = '…';
    try {
      if (signupMode) {
        await Cloud.signUp(email, senha, nome);
        try { await Cloud.signIn(email, senha); } catch (e) {}
        const session = await Cloud.getSession();
        if (!session) { loginError('Conta criada. Confirme o e-mail e faça login.'); return; }
        // grava o cadastro completo do vendedor
        const celular = $('#loginCelular').value.trim();
        try {
          await Cloud.updateMyProfile({
            nome, cpf: $('#loginCpf').value.trim(), celular, telefone: celular,
            endereco: $('#loginEndereco').value.trim(), cidade: $('#loginCidade').value.trim(), cep: $('#loginCep').value.trim()
          });
        } catch (e) { console.error('perfil:', e); }
        await afterAuth(session);
      } else {
        await Cloud.signIn(email, senha);
        const session = await Cloud.getSession();
        if (session) await afterAuth(session);
        else loginError('Não foi possível entrar.');
      }
    } catch (e) { console.error(e); loginError(traduzErro(e)); }
    finally { btn.disabled = false; btn.textContent = signupMode ? 'Criar conta' : 'Entrar'; }
  }
  $('#btnLoginSwitch').addEventListener('click', () => { signupMode = !signupMode; updateLoginMode(); });
  $('#btnLoginSubmit').addEventListener('click', doLogin);
  $('#loginSenha').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  /* ---------- DASHBOARD + FUNIL DE VENDAS ---------- */
  // Fases do funil (boas práticas: do topo até ganho/perdido).
  const STAGES = [
    { key: 'novo',        label: 'Aguardando contato', short: 'Aguardando',  prob: 20 },
    { key: 'negociacao',  label: 'Em negociação',      short: 'Negociação',  prob: 50 },
    { key: 'sem_retorno', label: 'Sem retorno',        short: 'Sem retorno', prob: 10 },
    { key: 'ganho',       label: 'Fechado ✅',          short: 'Fechado',     prob: 100 },
    { key: 'perdido',     label: 'Não fechou ❌',       short: 'Perdido',     prob: 0 }
  ];
  const STAGE_LABEL = STAGES.reduce((m, s) => (m[s.key] = s.label, m), {});
  const STAGE_DEF = STAGES.reduce((m, s) => (m[s.key] = s, m), {});
  const OPEN_STAGES = ['novo', 'negociacao', 'sem_retorno'];
  // overrides do admin (nome + probabilidade de fechamento), guardados nos params
  function stageCfg(key) { return (P().stages && P().stages[key]) || {}; }
  function stageName(key) { const n = stageCfg(key).nome; return (n && String(n).trim()) || (STAGE_DEF[key] && STAGE_DEF[key].short) || key; }
  function stageProb(key) { const p = stageCfg(key).prob; return (p == null || isNaN(p)) ? (STAGE_DEF[key] ? STAGE_DEF[key].prob : 0) : Math.max(0, Math.min(100, Number(p))); }
  function stageOf(r) { const s = r.status || 'novo'; return (s === 'enviado' || !STAGE_LABEL[s]) ? 'novo' : s; }
  const DAY = 86400000;
  function diasDesde(iso) { if (!iso) return 0; return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)); }
  function emAberto(r) { const k = stageOf(r); return k === 'novo' || k === 'negociacao' || k === 'sem_retorno'; }
  function retornoInfo(r) {
    if (!r.retorno_em) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const dt = new Date(r.retorno_em + 'T00:00:00');
    const diff = Math.round((dt - t) / DAY);
    return { dt, diff, atrasado: diff < 0 && emAberto(r) };
  }
  /* ===== Atividades agendadas (estilo Pipedrive) — guardadas no JSONB `atividades` =====
     Uma TAREFA é uma atividade com `due` (data/hora) e `done`=false.
     A "próxima atividade" de um negócio é a tarefa pendente mais próxima. */
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const taskKey = a => a.id || a.at;
  const atividadesDe = o => Array.isArray(o.atividades) ? o.atividades : [];
  function dueInfo(due) {
    const now = new Date();
    const d = new Date(due);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dDay = new Date(d); dDay.setHours(0, 0, 0, 0);
    return { d, diffDays: Math.round((dDay - today) / DAY), overdue: d < now, isToday: dDay.getTime() === today.getTime() };
  }
  function fmtDue(due, semHora) {
    const { d, diffDays } = dueInfo(due);
    const hora = semHora ? '' : ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return 'hoje' + hora;
    if (diffDays === 1) return 'amanhã' + hora;
    if (diffDays === -1) return 'ontem' + hora;
    if (diffDays < 0) return `há ${-diffDays}d`;
    if (diffDays <= 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') + hora;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + hora;
  }
  // tarefas pendentes do negócio (ordenadas por data); inclui o retorno_em legado como ponte
  function tarefasPendentes(o) {
    const tasks = atividadesDe(o).filter(a => a.due && !a.done).map(a => ({ ...a, _due: new Date(a.due), _orc: o }));
    if (!tasks.length && o.retorno_em) {
      const due = o.retorno_em + 'T09:00:00';
      tasks.push({ t: 'retorno', x: '', due, _due: new Date(due), _orc: o, _legacy: true });
    }
    return tasks.sort((a, b) => a._due - b._due);
  }
  function proximaAtividade(o) { return emAberto(o) ? (tarefasPendentes(o)[0] || null) : null; }
  // selo de próxima atividade / nudge "sem próxima atividade" (o coração do Pipedrive)
  function proximaBadge(r) {
    if (!emAberto(r)) return '';
    const nx = proximaAtividade(r);
    if (!nx) return '<span class="dflag none">⚠️ sem próxima atividade</span>';
    const di = dueInfo(nx.due);
    const cls = di.overdue ? 'late' : (di.isToday ? 'warn' : 'next');
    const ic = ATV_ICON[nx.t] || '📌';
    return `<span class="dflag ${cls}">${ic} ${esc(ATV_LABEL[nx.t] || 'Atividade')} · ${fmtDue(nx.due, nx._legacy)}</span>`;
  }

  // prioridade no funil (maior = mais urgente): tarefa atrasada > sem próxima atividade > futura
  function prioridade(r) {
    if (!emAberto(r)) return 0;
    const nx = proximaAtividade(r);
    if (nx) {
      const di = dueInfo(nx.due);
      if (di.overdue) return 1000 + Math.min(500, Math.max(0, -di.diffDays));
      if (di.isToday) return 900;
      return Math.max(1, 200 - di.diffDays);
    }
    return 500 + Math.min(300, diasDesde(r.criado_em));   // sem próxima atividade: cobra o agendamento
  }

  // "negócio parado" (rotting): aberto, sem atividade futura agendada e sem toque há ROT dias
  const ROT_DIAS = 10;
  function ultimoToque(o) {
    const ts = atividadesDe(o).map(a => new Date(a.doneAt || a.at).getTime()).filter(n => !isNaN(n));
    return ts.length ? Math.max(...ts) : (o.criado_em ? new Date(o.criado_em).getTime() : 0);
  }
  function rottingInfo(o) {
    if (!emAberto(o)) return null;
    const nx = proximaAtividade(o);
    if (nx && !dueInfo(nx.due).overdue) return null;        // tem próxima atividade futura → não está frio
    const base = ultimoToque(o); if (!base) return null;
    const dias = Math.floor((Date.now() - base) / DAY);
    return dias >= ROT_DIAS ? { dias } : null;
  }

  // validade da proposta: criado_em + dias (snapshot no orçamento, ou parâmetro atual)
  function validadeInfo(r) {
    if (!r.criado_em) return null;
    const dias = Number(r.validade) || Number(P().validade) || 7;
    const base = new Date(r.criado_em); if (isNaN(base.getTime())) return null;
    base.setHours(0, 0, 0, 0);
    const exp = new Date(base.getTime() + dias * DAY);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return { exp, diff: Math.round((exp - t) / DAY), dias };   // diff < 0 = expirado
  }
  // selo de validade — só p/ orçamentos em aberto e quando relevante (expirando/expirado)
  function validadeBadge(r, longo) {
    if (!emAberto(r)) return '';
    const vi = validadeInfo(r); if (!vi) return '';
    if (vi.diff < 0) return `<span class="dflag exp">⌛ ${longo ? 'proposta expirada' : 'expirado'}</span>`;
    if (vi.diff === 0) return '<span class="dflag exp">⌛ expira hoje</span>';
    if (vi.diff <= 3) return `<span class="dflag soon">⌛ expira em ${vi.diff}d</span>`;
    return '';
  }

  let dashData = [];
  let dashStage = 'all';
  let dashView = 'list';        // list | kanban | agenda | metrics
  let ativColumn = null;        // null = desconhecido, true/false = coluna 'atividades' existe?
  $('#umDashboard').addEventListener('click', openDashboard);

  // troca de visão (abas do CRM)
  $('#dashTabs').addEventListener('click', e => {
    const b = e.target.closest('.dtab'); if (!b) return;
    dashView = b.dataset.view;
    $$('#dashTabs .dtab').forEach(t => t.classList.toggle('active', t === b));
    $('#viewList').hidden = dashView !== 'list';
    $('#viewKanban').hidden = dashView !== 'kanban';
    $('#viewAgenda').hidden = dashView !== 'agenda';
    $('#viewMetrics').hidden = dashView !== 'metrics';
    renderDashboard();
  });
  $('#dashClose').addEventListener('click', () => { $('#dashScreen').hidden = true; document.body.style.overflow = ''; });
  $('#dashSearch').addEventListener('input', renderDashboard);
  $('#dashVendedorFilter').addEventListener('change', renderDashboard);
  $('#dashFunnel').addEventListener('click', e => {
    const b = e.target.closest('.fchip'); if (!b) return;
    dashStage = b.dataset.stage; renderDashboard();
  });
  // mudar a fase de um orçamento direto no card
  $('#dashList').addEventListener('change', e => {
    if (e.target.dataset.act !== 'stage') return;
    changeStage(e.target.closest('.dcard').dataset.id, e.target.value);
  });

  // troca de fase unificada (lista + kanban). "Não fechou" pede o motivo antes.
  async function changeStage(id, status) {
    const r = dashData.find(x => x.id === id); if (!r) return;
    if (stageOf(r) === status) { renderDashboard(); return; }
    if (status === 'perdido') { openLossModal(r); return; }
    const prev = r.status;
    r.status = status; renderDashboard();                 // otimista
    try {
      await Cloud.updateOrcamento(id, { status });
      logActivityAuto(r, 'fase', `Movido para "${stageName(status)}"`);
      toast('Fase atualizada.');
    } catch (err) { r.status = prev; renderDashboard(); reportUpdErr(err, 'Erro ao mudar a fase.'); }
  }

  // ---- motivo da perda ----
  let lossPending = null, lossMotivo = '';
  function openLossModal(r) {
    lossPending = { id: r.id, prev: r.status }; lossMotivo = '';
    $('#lossCliente').textContent = (r.cliente_nome || 'Cliente') + (r.numero ? ' · ' + r.numero : '');
    $('#lossDetail').value = '';
    $('#lossChips').innerHTML = Object.entries(LOSS)
      .map(([k, label]) => `<button class="loss__chip" type="button" data-motivo="${k}">${label}</button>`).join('');
    openModal('#lossModal');
  }
  $('#lossChips').addEventListener('click', e => {
    const b = e.target.closest('.loss__chip'); if (!b) return;
    lossMotivo = b.dataset.motivo;
    $$('#lossChips .loss__chip').forEach(c => c.classList.toggle('sel', c === b));
  });
  // cancelar/fechar (X, backdrop, Cancelar) volta o card pra fase anterior na tela
  $('#lossModal').addEventListener('click', e => { if (e.target.matches('[data-close]')) { lossPending = null; renderDashboard(); } });
  $('#btnLossConfirm').addEventListener('click', async () => {
    if (!lossPending) return;
    if (!lossMotivo) { toast('Escolha o motivo.'); return; }
    const o = dashData.find(x => x.id === lossPending.id); if (!o) return;
    const prev = lossPending.prev;
    const detalhe = ($('#lossDetail').value || '').trim();
    const txt = LOSS[lossMotivo] + (detalhe ? ` — ${detalhe}` : '');
    const entry = { t: 'perda', x: txt, motivo: lossMotivo, by: (Cloud.profile && Cloud.profile.nome) || '', at: new Date().toISOString() };
    o.status = 'perdido'; closeModal('#lossModal'); lossPending = null;
    try {
      if (ativColumn !== false) {
        const arr = atvOf(o).concat(entry);
        await Cloud.updateOrcamento(o.id, { status: 'perdido', atividades: arr });
        o.atividades = arr; ativColumn = true;
      } else {
        const obs = (o.obs ? o.obs + ' · ' : '') + 'Motivo da perda: ' + txt;
        await Cloud.updateOrcamento(o.id, { status: 'perdido', obs }); o.obs = obs;
      }
      renderDashboard(); toast('Marcado como não fechou.');
    } catch (err) {
      if (ativColumn !== false && isMissingCol(err)) {           // sem coluna de atividades → guarda no obs
        ativColumn = false;
        const obs = (o.obs ? o.obs + ' · ' : '') + 'Motivo da perda: ' + txt;
        try { await Cloud.updateOrcamento(o.id, { status: 'perdido', obs }); o.obs = obs; renderDashboard(); toast('Marcado como não fechou.'); return; }
        catch (e2) { err = e2; }
      }
      console.error(err); o.status = prev; renderDashboard(); toast('Erro ao salvar.');
    }
  });

  async function openDashboard() {
    closeUserMenu();
    $('#dashTitle').textContent = Cloud.isAdmin() ? 'Todos os orçamentos' : 'Meus orçamentos';
    $('#dashScreen').hidden = false; document.body.style.overflow = 'hidden';
    $('#dashList').innerHTML = '<p class="dash__empty">Carregando…</p>';
    $('#dashStats').innerHTML = '';
    try {
      dashData = await Cloud.listOrcamentos();
      if (dashData.length) ativColumn = dashData.some(r => 'atividades' in r);
      if (Cloud.isAdmin()) {
        const names = Array.from(new Set(dashData.map(r => r.vendedor_nome).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        $('#dashVendedorFilter').innerHTML = '<option value="">Todos vendedores</option>' + names.map(n => `<option>${esc(n)}</option>`).join('');
      } else {
        await pullSettings();        // vendedor recebe etapas/metas/condições mais recentes do admin
      }
      renderDashboard();
      maybeNotify(dashData);
    } catch (e) { console.error(e); $('#dashList').innerHTML = '<p class="dash__empty">Erro ao carregar os orçamentos.</p>'; }
  }
  function baseRows() {
    const q = ($('#dashSearch').value || '').toLowerCase().trim();
    const vf = $('#dashVendedorFilter').value;
    return dashData.filter(r => {
      if (vf && r.vendedor_nome !== vf) return false;
      if (q && !String(r.cliente_nome || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderDashboard() {
    const base = baseRows();
    updateDashChrome(base);
    if (dashView === 'kanban') return renderKanban(base);
    if (dashView === 'agenda') return renderAgenda(base);
    if (dashView === 'metrics') return renderMetrics(base);
    renderListView(base);
  }
  function renderListView(base) {
    // ---- funil: contagem + valor por fase ----
    const cnt = { all: base.length }, val = { all: 0 };
    STAGES.forEach(s => { cnt[s.key] = 0; val[s.key] = 0; });
    base.forEach(r => { const k = stageOf(r); cnt[k]++; const v = Number(r.total) || 0; val[k] += v; val.all += v; });
    const fchip = (key, label, c, v) =>
      `<button class="fchip st-${key} ${dashStage === key ? 'active' : ''}" data-stage="${key}">
        <span class="fchip__n">${c}</span><span class="fchip__l">${label}</span><span class="fchip__v">${money(v)}</span></button>`;
    $('#dashFunnel').innerHTML =
      fchip('all', 'Todos', cnt.all, val.all) +
      STAGES.map(s => fchip(s.key, stageName(s.key), cnt[s.key], val[s.key])).join('');

    // ---- métricas (boas práticas: pipeline aberto, fechado, conversão) ----
    const emAbertoVal = val.novo + val.negociacao + val.sem_retorno;
    const fechados = cnt.ganho + cnt.perdido;
    const conv = fechados ? Math.round(cnt.ganho / fechados * 100) : 0;
    $('#dashStats').innerHTML =
      `<div class="dash__stat"><b>${money(emAbertoVal)}</b><span>em aberto</span></div>` +
      `<div class="dash__stat"><b>${money(val.ganho)}</b><span>fechadas</span></div>` +
      `<div class="dash__stat"><b>${conv}%</b><span>conversão</span></div>`;

    // ---- lista (aplica a fase + ordena por prioridade/follow-up) ----
    const shown = (dashStage === 'all' ? base : base.filter(r => stageOf(r) === dashStage))
      .slice().sort((a, b) => (prioridade(b) - prioridade(a)) || (new Date(b.criado_em) - new Date(a.criado_em)));
    $('#dashList').innerHTML = shown.length ? shown.map(dcard).join('')
      : '<p class="dash__empty">Nenhum orçamento nesta fase.</p>';
  }
  const dmy = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  /* ====================== KANBAN (arrastar entre fases) ====================== */
  // valor compacto p/ rótulos de gráfico: 1234 -> "R$ 1k", 1.2e6 -> "R$ 1,2M"
  const moneyK = n => { n = Number(n) || 0; const a = Math.abs(n);
    if (a >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (a >= 1e3) return 'R$ ' + Math.round(n / 1e3) + 'k';
    return money(n); };
  // donut SVG (gauge de %) — a cor vem do CSS
  function donut(pct) {
    const R = 32, C = 2 * Math.PI * R, p = Math.max(0, Math.min(100, pct)), off = C * (1 - p / 100);
    return `<svg class="donut" viewBox="0 0 80 80" aria-hidden="true"><circle class="donut__bg" cx="40" cy="40" r="${R}"></circle><circle class="donut__fg" cx="40" cy="40" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 40 40)"></circle><text x="40" y="45" class="donut__t">${pct}%</text></svg>`;
  }
  // cabeçalho do painel: contador de negócios + valor; selo de pendências na aba Agenda
  function updateDashChrome(base) {
    const sub = $('#dashSub');
    if (sub) {
      const val = base.reduce((t, r) => t + (Number(r.total) || 0), 0);
      sub.textContent = base.length ? `${base.length} negócio(s) · ${money(val)} em pipeline` : 'Nenhum negócio ainda';
    }
    const badge = $('#agendaBadge');
    if (badge) {
      const pend = pendentesRetorno(base).length;
      badge.textContent = pend; badge.hidden = pend === 0;
    }
  }
  function kcardHTML(r) {
    const flags = [];
    if (r.origem === 'site') flags.push('<span class="dflag site">🌐 Lead</span>');
    const pb = proximaBadge(r); if (pb) flags.push(pb);
    const vb = validadeBadge(r); if (vb) flags.push(vb);
    const nItens = (r.itens || []).length;
    return `<div class="kcard" draggable="true" data-id="${r.id}">
      <div class="kcard__top"><span class="kcard__cli">${esc(r.cliente_nome || '—')}</span><span class="kcard__val">${money(r.total)}</span></div>
      <div class="kcard__meta">${r.vendedor_nome ? `<span>${esc(r.vendedor_nome)}</span>` : ''}<span>${nItens} item(ns)</span></div>
      ${flags.length ? `<div class="kcard__flags">${flags.join('')}</div>` : ''}
    </div>`;
  }
  function renderKanban(base) {
    const byStage = {}; STAGES.forEach(s => byStage[s.key] = []);
    base.forEach(r => byStage[stageOf(r)].push(r));
    const sorter = (a, b) => (prioridade(b) - prioridade(a)) || (new Date(b.criado_em) - new Date(a.criado_em));
    const col = s => {
      const rows = byStage[s.key].slice().sort(sorter);
      const val = rows.reduce((t, r) => t + (Number(r.total) || 0), 0);
      return `<div class="kcol st-${s.key}" data-stage="${s.key}">
        <div class="kcol__head"><span class="kcol__t">${stageName(s.key)}</span><span class="kcol__n">${rows.length}</span><span class="kcol__v">${money(val)}</span></div>
        <div class="kcol__body">${rows.length ? rows.map(kcardHTML).join('') : '<p class="kempty">—</p>'}</div>
      </div>`;
    };
    $('#dashKanban').innerHTML = STAGES.map(col).join('');
  }
  let dragId = null;
  const kb = $('#dashKanban');
  if (kb) {
    kb.addEventListener('dragstart', e => {
      const c = e.target.closest('.kcard'); if (!c) return;
      dragId = c.dataset.id; c.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    kb.addEventListener('dragend', e => {
      const c = e.target.closest('.kcard'); if (c) c.classList.remove('dragging');
      $$('.kcol').forEach(k => k.classList.remove('drop'));
    });
    kb.addEventListener('dragover', e => { const col = e.target.closest('.kcol'); if (!col) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; });
    kb.addEventListener('dragenter', e => { const col = e.target.closest('.kcol'); if (col) col.classList.add('drop'); });
    kb.addEventListener('dragleave', e => { const col = e.target.closest('.kcol'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('drop'); });
    kb.addEventListener('drop', async e => {
      const col = e.target.closest('.kcol'); if (!col || !dragId) return;
      e.preventDefault();
      const id = dragId; dragId = null;
      changeStage(id, col.dataset.stage);
    });
    // toque (celular): abrir o card para acompanhar / trocar fase
    kb.addEventListener('click', e => {
      const c = e.target.closest('.kcard'); if (!c) return;
      const o = dashData.find(x => x.id === c.dataset.id); if (o) openOrc(o);
    });
  }

  /* ====================== AGENDA (follow-ups) ====================== */
  function arow(r) {
    const ri = retornoInfo(r);
    const cls = (ri && ri.atrasado) ? 'late' : (ri && ri.diff === 0 ? 'today' : '');
    let dbox = '<div class="arow__date"><b>—</b><span>s/ data</span></div>';
    if (r.retorno_em) {
      const dt = new Date(r.retorno_em + 'T00:00:00');
      dbox = `<div class="arow__date"><b>${dt.getDate()}</b><span>${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div>`;
    }
    const wpp = `<button class="a-wpp" data-act="ag-wpp" data-id="${r.id}" title="Enviar follow-up no WhatsApp">📱</button>`;
    return `<div class="arow ${cls}" data-id="${r.id}">
      ${dbox}
      <div class="arow__main">
        <div class="arow__cli">${esc(r.cliente_nome || '—')}</div>
        <div class="arow__sub">${stageName(stageOf(r))}${r.vendedor_nome ? ` · <span class="vend">${esc(r.vendedor_nome)}</span>` : ''}${r.obs ? ` · ${esc(r.obs)}` : ''}</div>
      </div>
      <div class="arow__val">${money(r.total)}</div>
      <div class="arow__act">${wpp}<button data-act="ag-open" data-id="${r.id}" title="Abrir">✎</button></div>
    </div>`;
  }
  // linha de TAREFA na agenda (com botão de concluir)
  function trow(t) {
    const o = t._orc;
    const di = dueInfo(t.due);
    const cls = di.overdue ? 'late' : (di.isToday ? 'today' : '');
    const d = t._due;
    const dbox = `<div class="arow__date"><b>${d.getDate()}</b><span>${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></div>`;
    const titulo = `${ATV_ICON[t.t] || '📌'} ${esc(ATV_LABEL[t.t] || 'Atividade')}${t.x ? ' · ' + esc(t.x) : ''}`;
    const done = t._legacy ? '' : `<button class="a-done" data-act="tk-done" data-id="${o.id}" data-key="${esc(taskKey(t))}" title="Concluir atividade">✓</button>`;
    return `<div class="arow ${cls}" data-id="${o.id}">
      ${dbox}
      <div class="arow__main">
        <div class="arow__cli">${esc(o.cliente_nome || '—')}</div>
        <div class="arow__sub">${titulo} · ${fmtDue(t.due, t._legacy)}${o.vendedor_nome ? ` · <span class="vend">${esc(o.vendedor_nome)}</span>` : ''}</div>
      </div>
      <div class="arow__val">${money(o.total)}</div>
      <div class="arow__act">${done}<button class="a-wpp" data-act="ag-wpp" data-id="${o.id}" title="Enviar follow-up no WhatsApp">📱</button><button data-act="ag-open" data-id="${o.id}" title="Abrir negócio">✎</button></div>
    </div>`;
  }
  function renderAgenda(base) {
    const open = base.filter(emAberto);
    const tasks = [], semAtv = [];
    open.forEach(o => {
      const pend = tarefasPendentes(o);
      if (!pend.length) semAtv.push(o); else pend.forEach(t => tasks.push(t));
    });
    const g = { late: [], today: [], soon: [], later: [] };
    tasks.forEach(t => {
      const di = dueInfo(t.due);
      if (di.overdue) g.late.push(t);
      else if (di.isToday) g.today.push(t);
      else if (di.diffDays <= 7) g.soon.push(t);
      else g.later.push(t);
    });
    const byDue = (a, b) => a._due - b._due;
    [g.late, g.today, g.soon, g.later].forEach(x => x.sort(byDue));
    semAtv.sort((a, b) => prioridade(b) - prioridade(a));
    const grpT = (cls, icon, title, arr) => arr.length
      ? `<div class="agenda__grp"><h3 class="agenda__gh ${cls}">${icon} ${title} <b>${arr.length}</b></h3>${arr.map(trow).join('')}</div>` : '';
    const grpO = (icon, title, arr) => arr.length
      ? `<div class="agenda__grp"><h3 class="agenda__gh attn">${icon} ${title} <b>${arr.length}</b></h3>${arr.map(arow).join('')}</div>` : '';
    const html =
      grpT('late', '⏰', 'Atrasadas', g.late) +
      grpT('today', '📞', 'Para hoje', g.today) +
      grpT('', '📅', 'Próximos 7 dias', g.soon) +
      grpT('', '🗓', 'Mais tarde', g.later) +
      grpO('⚠️', 'Sem próxima atividade', semAtv);
    $('#dashAgenda').innerHTML = notifBarHTML() + (html || '<p class="dash__empty">Tudo em dia. 🎉</p>');
  }
  const dagenda = $('#dashAgenda');
  if (dagenda) dagenda.addEventListener('click', e => {
    if (e.target.closest('[data-act="notif-enable"]')) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') { notifShown = false; maybeNotify(dashData); toast('Lembretes ativados.'); }
        renderDashboard();
      });
      return;
    }
    const dk = e.target.closest('[data-act="tk-done"]');
    if (dk) { concluirTarefa(dk.dataset.id, dk.dataset.key, true); return; }
    const el = e.target.closest('[data-id]'); if (!el) return;
    const o = dashData.find(x => x.id === el.dataset.id); if (!o) return;
    if (e.target.closest('[data-act="ag-wpp"]')) { openWppFor(o); return; }
    openOrc(o);
  });
  // telefone do orçamento: contato do lead OU telefone do cliente vinculado
  function quotePhone(o) {
    if (o.contato_telefone) return o.contato_telefone;
    const c = o.cliente_id ? clienteById(o.cliente_id) : null;
    return (c && c.telefone) || '';
  }
  // mensagem pronta de retomada (follow-up)
  function followupTexto(o) {
    const nome = String(o.cliente_nome || '').trim().split(' ')[0] || '';
    const vend = (Cloud.profile && Cloud.profile.nome) ? Cloud.profile.nome.split(' ')[0] : '';
    const ref = o.numero ? ` ${o.numero}` : '';
    const valor = o.total ? ` (${money(o.total)})` : '';
    return `Olá ${nome}, tudo bem? Aqui é ${vend ? vend + ' da' : 'da'} Torque Fitness 💪 ` +
      `Passando para saber se você conseguiu avaliar o orçamento${ref}${valor}. ` +
      `Posso esclarecer qualquer dúvida ou ajustar as condições. Podemos seguir?`;
  }
  function openWppFor(o) {
    const num = whatsNumero(quotePhone(o));
    const txt = encodeURIComponent(followupTexto(o));
    window.open(num ? `https://wa.me/${num}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank');
    logActivityAuto(o, 'whatsapp', 'Follow-up enviado pelo WhatsApp');
  }

  /* ============ LEMBRETES DE RETORNO (notificações PWA) ============ */
  let notifShown = false;   // dispara no máx. 1× por sessão de uso
  function notifSupported() { return 'Notification' in window; }
  function pendentesRetorno(rows) {
    return rows.filter(emAberto).filter(o => tarefasPendentes(o).some(t => { const di = dueInfo(t.due); return di.overdue || di.isToday; }));
  }
  function maybeNotify(rows) {
    if (!notifSupported() || Notification.permission !== 'granted' || notifShown) return;
    const pend = pendentesRetorno(rows);
    if (!pend.length) return;
    notifShown = true;
    try {
      new Notification('Torque CRM · retornos', {
        body: `Você tem ${pend.length} retorno(s) atrasado(s) ou para hoje.`,
        icon: 'icons/icon-192.png', tag: 'torque-retornos'
      });
    } catch (e) { /* alguns navegadores exigem SW para notificar */ }
  }
  function notifBarHTML() {
    if (!notifSupported()) return '';
    return Notification.permission === 'granted'
      ? '<div class="agenda__notif on">🔔 Lembretes de retorno ativos</div>'
      : '<button class="agenda__notif" type="button" data-act="notif-enable">🔔 Ativar lembretes de retorno</button>';
  }

  /* ====================== MÉTRICAS (gráficos) ====================== */
  function lastMonths(n) {
    const arr = [], d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      arr.push({ key: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`, label: x.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') });
    }
    return arr;
  }
  function renderMetrics(base) {
    const cnt = {}, val = {}; STAGES.forEach(s => { cnt[s.key] = 0; val[s.key] = 0; });
    base.forEach(r => { const k = stageOf(r); cnt[k]++; val[k] += Number(r.total) || 0; });
    const abertoC = cnt.novo + cnt.negociacao + cnt.sem_retorno;
    const abertoV = val.novo + val.negociacao + val.sem_retorno;
    const fechados = cnt.ganho + cnt.perdido;
    const conv = fechados ? Math.round(cnt.ganho / fechados * 100) : 0;
    const ticket = cnt.ganho ? val.ganho / cnt.ganho : 0;

    // ---- previsão ponderada: valor em aberto × probabilidade da etapa ----
    const fcRows = OPEN_STAGES.map(k => ({ key: k, nome: stageName(k), prob: stageProb(k), bruto: val[k] || 0, pond: (val[k] || 0) * stageProb(k) / 100 }));
    const fcTotal = fcRows.reduce((t, r) => t + r.pond, 0);

    const kpis = `<div class="mkpis">
      <div class="mkpi"><b>${money(abertoV)}</b><span>Pipeline aberto (${abertoC})</span></div>
      <div class="mkpi"><b>${money(fcTotal)}</b><span>Previsão ponderada</span></div>
      <div class="mkpi"><b>${money(val.ganho)}</b><span>Fechado (${cnt.ganho})</span></div>
      <div class="mkpi"><b>${money(ticket)}</b><span>Ticket médio</span></div>
    </div>`;

    // ---- card de previsão ponderada (contribuição por etapa) ----
    const maxFc = Math.max(1, ...fcRows.map(r => r.bruto));
    const fcBars = fcRows.map(r =>
      `<div class="mbar"><span class="mbar__lab">${esc(r.nome)} <small class="mbar__prob">${r.prob}%</small></span><div class="mbar__track"><div class="mbar__fill" style="width:${Math.round(r.bruto / maxFc * 100)}%"></div></div><span class="mbar__val">${moneyK(r.pond)}</span></div>`).join('');
    const fcCard = `<div class="mcard"><h3 class="mcard__t">Previsão ponderada · <b style="color:var(--violet)">${money(fcTotal)}</b></h3>${fcBars}<p class="mcard__hint">Receita esperada do pipeline aberto (valor × probabilidade de cada etapa).</p></div>`;

    // ---- metas do mês por vendedor (fechado no mês × meta) ----
    const _now = new Date();
    const mesAtual = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0');
    const mesNome = _now.toLocaleDateString('pt-BR', { month: 'long' });
    const ganhoMes = {};
    base.forEach(r => {
      if (stageOf(r) !== 'ganho') return;
      if (String(r.criado_em || '').slice(0, 7) !== mesAtual) return;
      const n = r.vendedor_nome || '—';
      ganhoMes[n] = (ganhoMes[n] || 0) + (Number(r.total) || 0);
    });
    const metas = P().metas || {};
    const ehAdmin = Cloud.isAdmin();
    const vendNomes = Array.from(new Set([...Object.keys(metas), ...Object.keys(ganhoMes)]))
      .filter(n => n && n !== '—').sort((a, b) => a.localeCompare(b, 'pt-BR'));
    let metasCard = '';
    if (vendNomes.length || ehAdmin) {
      const linha = (n, done, target, tot) => {
        const pct = target ? Math.min(100, Math.round(done / target * 100)) : 0;
        const inp = (ehAdmin && !tot) ? `<input class="metarow__in" data-meta="${esc(n)}" type="number" min="0" step="1000" value="${target || ''}" placeholder="meta" aria-label="Meta de ${esc(n)}" />` : '';
        return `<div class="metarow ${tot ? 'metarow--tot' : ''}" data-done="${done}">
          <span class="metarow__n">${esc(n)}</span>
          <div class="mbar__track"><div class="mbar__fill ${pct >= 100 ? 'ok' : ''}" style="width:${pct}%"></div></div>
          <span class="metarow__v"><b>${moneyK(done)}</b>${target ? ` / ${moneyK(target)} · ${pct}%` : ''}</span>${inp}</div>`;
      };
      const rows = vendNomes.map(n => linha(n, ganhoMes[n] || 0, Number(metas[n]) || 0, false)).join('');
      const totT = vendNomes.reduce((t, n) => t + (Number(metas[n]) || 0), 0);
      const totD = vendNomes.reduce((t, n) => t + (ganhoMes[n] || 0), 0);
      const teamRow = totT ? linha('Equipe', totD, totT, true) : '';
      const corpo = rows || '<p class="atv__empty">Defina a meta mensal de cada vendedor nos campos à direita.</p>';
      metasCard = `<div class="mcard"><h3 class="mcard__t">Metas de ${mesNome}</h3>${corpo}${teamRow}<p class="mcard__hint">Valor fechado no mês × meta.</p></div>`;
    }

    // ---- card de conversão com donut ----
    const convCard = `<div class="mcard mcard--conv">
      <div class="conv__gauge">${donut(conv)}</div>
      <div class="conv__leg">
        <h3 class="mcard__t">Taxa de conversão</h3>
        <span class="conv__row"><i class="ok"></i>${cnt.ganho} fechada(s)</span>
        <span class="conv__row"><i class="bad"></i>${cnt.perdido} perdida(s)</span>
        <span class="conv__sub">${fechados} oportunidade(s) concluída(s)</span>
      </div>
    </div>`;

    // ---- distribuição do funil (barras + % do total) ----
    const totalCount = STAGES.reduce((t, s) => t + cnt[s.key], 0) || 1;
    const maxStage = Math.max(1, ...STAGES.map(s => cnt[s.key]));
    const funil = STAGES.map(s => {
      const w = Math.round(cnt[s.key] / maxStage * 100);
      const pct = Math.round(cnt[s.key] / totalCount * 100);
      const cls = s.key === 'ganho' ? 'ok' : s.key === 'perdido' ? 'bad' : s.key === 'sem_retorno' ? 'warn' : '';
      return `<div class="mbar"><span class="mbar__lab">${stageName(s.key)}</span><div class="mbar__track"><div class="mbar__fill ${cls}" style="width:${w}%"></div></div><span class="mbar__val">${cnt[s.key]} · ${pct}%</span></div>`;
    }).join('');

    // ---- fechado × perdido por mês (com eixo, linhas-guia e rótulos) ----
    const months = lastMonths(6), mg = {}, mp = {};
    months.forEach(m => { mg[m.key] = 0; mp[m.key] = 0; });
    base.forEach(r => {
      const k = stageOf(r); if (k !== 'ganho' && k !== 'perdido') return;
      const mk = String(r.criado_em || '').slice(0, 7); if (!(mk in mg)) return;
      if (k === 'ganho') mg[mk] += Number(r.total) || 0; else mp[mk] += Number(r.total) || 0;
    });
    const maxM = Math.max(1, ...months.map(m => Math.max(mg[m.key], mp[m.key])));
    const cols = months.map(m => {
      const hg = Math.round(mg[m.key] / maxM * 100), hp = Math.round(mp[m.key] / maxM * 100);
      return `<div class="mcol"><div class="mcol__bars">
        <div class="mcol__bar" style="height:${hg}%" title="Fechado ${money(mg[m.key])}"></div>
        <div class="mcol__bar bad" style="height:${hp}%" title="Perdido ${money(mp[m.key])}"></div>
      </div><span class="mcol__x">${m.label}</span><span class="mcol__v">${mg[m.key] ? moneyK(mg[m.key]) : '—'}</span></div>`;
    }).join('');
    const chart6 = `<div class="mchart">
      <div class="mchart__y"><span>${moneyK(maxM)}</span><span>${moneyK(maxM / 2)}</span><span>0</span></div>
      <div class="mchart__plot"><div class="mchart__grid"><i></i><i></i><i></i><i></i></div><div class="mcol-chart">${cols}</div></div>
    </div>`;

    // ---- valor fechado por vendedor ----
    const vend = {};
    base.forEach(r => { if (stageOf(r) === 'ganho') { const n = r.vendedor_nome || '—'; vend[n] = (vend[n] || 0) + (Number(r.total) || 0); } });
    const vArr = Object.entries(vend).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxV = Math.max(1, ...vArr.map(v => v[1]));
    const vendBars = vArr.length
      ? vArr.map(([n, v]) => `<div class="mbar"><span class="mbar__lab">${esc(n)}</span><div class="mbar__track"><div class="mbar__fill ok" style="width:${Math.round(v / maxV * 100)}%"></div></div><span class="mbar__val">${moneyK(v)}</span></div>`).join('')
      : '<p class="atv__empty">Nenhuma venda fechada ainda.</p>';

    // ---- motivos de perda (do log de atividades; fallback p/ obs) ----
    const lossAgg = {};
    base.forEach(r => {
      if (stageOf(r) !== 'perdido') return;
      const pe = atvOf(r).filter(a => a.t === 'perda').slice(-1)[0];
      let label = pe ? (LOSS[pe.motivo] || 'Outro') : null;
      if (!label && r.obs) { const m = /Motivo da perda:\s*([^—·]+)/.exec(r.obs); if (m) label = m[1].trim(); }
      label = label || 'Não informado';
      lossAgg[label] = (lossAgg[label] || 0) + 1;
    });
    const lossArr = Object.entries(lossAgg).sort((a, b) => b[1] - a[1]);
    const maxL = Math.max(1, ...lossArr.map(l => l[1]));
    const lossBars = lossArr.map(([n, c]) =>
      `<div class="mbar"><span class="mbar__lab">${esc(n)}</span><div class="mbar__track"><div class="mbar__fill bad" style="width:${Math.round(c / maxL * 100)}%"></div></div><span class="mbar__val">${c}</span></div>`).join('');
    const lossCard = cnt.perdido ? `<div class="mcard"><h3 class="mcard__t">Motivos de perda (${cnt.perdido})</h3>${lossBars}</div>` : '';

    $('#dashMetrics').innerHTML = kpis + convCard + fcCard + metasCard +
      `<div class="mcard"><h3 class="mcard__t">Distribuição do funil</h3>${funil}</div>` +
      lossCard +
      `<div class="mcard"><h3 class="mcard__t">Fechado × Perdido · últimos 6 meses</h3>${chart6}<div class="mlegend"><span><i style="background:var(--ok)"></i>Fechado</span><span><i style="background:var(--danger)"></i>Perdido</span></div></div>` +
      `<div class="mcard"><h3 class="mcard__t">Valor fechado por vendedor</h3>${vendBars}</div>`;
  }

  /* ====================== HISTÓRICO DE ATIVIDADES ====================== */
  const ATV_ICON = { nota: '🗒', ligacao: '📞', whatsapp: '📱', email: '✉️', reuniao: '🤝', proposta: '📄', tarefa: '📌', retorno: '🔔', fase: '↗️', perda: '❌', sistema: '⚙️' };
  const ATV_LABEL = { nota: 'Nota', ligacao: 'Ligar', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', proposta: 'Proposta', tarefa: 'Tarefa', retorno: 'Retorno', fase: 'Mudança de fase', perda: 'Motivo da perda', sistema: 'Sistema' };
  // motivos de perda (rótulos centralizados; usados no modal e nas métricas)
  const LOSS = { preco: 'Preço', prazo: 'Prazo de entrega', concorrente: 'Concorrente', verba: 'Sem verba', timing: 'Adiou a compra', sumiu: 'Sem resposta', outro: 'Outro' };
  const ATV_SQL = "alter table public.orcamentos add column if not exists atividades jsonb not null default '[]'::jsonb;";
  const atvOf = o => Array.isArray(o.atividades) ? o.atividades : [];
  function fmtAtv(iso) { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function isMissingCol(err) { const m = ((err && (err.message || '')) + ' ' + (err && err.code || '')).toLowerCase(); return m.includes('atividades') || m.includes('column') || m.includes('schema') || (err && err.code === '42703') || m.includes('pgrst204'); }
  function renderAtv(o) {
    if (!$('#orcAtv')) return;
    const supported = ativColumn !== false;
    $('#atvOff').hidden = supported;
    $('#atvTipo').disabled = $('#atvTexto').disabled = $('#btnAtvAdd').disabled = !supported;
    const list = atvOf(o).filter(a => !(a.due && !a.done)).slice().sort((a, b) => new Date(b.doneAt || b.at) - new Date(a.doneAt || a.at));
    $('#atvList').innerHTML = list.length
      ? list.map(a => `<li class="atv__it t-${a.t}"><div class="atv__meta">${a.done ? '✅ ' : ''}${ATV_ICON[a.t] || '•'} <b>${ATV_LABEL[a.t] || a.t}</b> · ${fmtAtv(a.doneAt || a.at)}${a.by ? ` · ${esc(a.by)}` : ''}</div><div class="atv__txt">${esc(a.x || '')}</div></li>`).join('')
      : (supported ? '<li class="atv__empty">Nenhuma atividade no histórico ainda.</li>' : '');
  }
  async function logActivityAuto(o, t, x) {
    if (ativColumn === false) return;
    const entry = { t, x, by: (Cloud.profile && Cloud.profile.nome) || '', at: new Date().toISOString() };
    const arr = atvOf(o).concat(entry);
    try { await Cloud.updateOrcamento(o.id, { atividades: arr }); o.atividades = arr; ativColumn = true; }
    catch (err) { if (isMissingCol(err)) ativColumn = false; }
  }
  $('#btnAtvAdd').addEventListener('click', async () => {
    if (!orcEditId) return;
    const o = dashData.find(x => x.id === orcEditId); if (!o) return;
    const x = ($('#atvTexto').value || '').trim();
    if (!x) { toast('Escreva o que aconteceu.'); return; }
    const entry = { t: $('#atvTipo').value, x, by: (Cloud.profile && Cloud.profile.nome) || '', at: new Date().toISOString() };
    const arr = atvOf(o).concat(entry);
    const btn = $('#btnAtvAdd'); btn.disabled = true;
    try {
      await Cloud.updateOrcamento(orcEditId, { atividades: arr });
      o.atividades = arr; ativColumn = true;
      $('#atvTexto').value = ''; renderAtv(o); toast('Atividade registrada.');
    } catch (err) {
      console.error(err);
      if (isMissingCol(err)) { ativColumn = false; renderAtv(o); }
      else toast('Erro ao registrar.');
    } finally { btn.disabled = false; }
  });
  $('#atvHelp').addEventListener('click', () => {
    alert('Para ativar o histórico de atividades, abra o painel do Supabase → SQL Editor e rode:\n\n' + ATV_SQL + '\n\nDepois recarregue esta página.');
  });

  function dcard(r) {
    const d = r.criado_em ? dmy(r.criado_em) : '';
    const dias = diasDesde(r.criado_em);
    const itens = (r.itens || []).map(i => `${i.qtd}× ${esc(i.nome)}`).join(' · ');
    const ativo = emAberto(r);
    const nx = proximaAtividade(r);

    const lead = r.origem === 'site';
    const flags = [];
    if (lead) flags.push(`<span class="dflag site">🌐 Lead do site</span>`);
    const pb = proximaBadge(r); if (pb) flags.push(pb);
    const rot = rottingInfo(r);
    if (rot) flags.push(`<span class="dflag cold">🥶 parado há ${rot.dias}d</span>`);
    const vb = validadeBadge(r, true); if (vb) flags.push(vb);
    if (stageOf(r) === 'ganho') flags.push(`<span class="dflag ok">✅ venda fechada</span>`);
    const contato = lead ? [r.contato_telefone, r.contato_email].filter(Boolean).map(esc).join(' · ') : '';

    const nxOverdue = nx && dueInfo(nx.due).overdue;
    const cardCls = nxOverdue ? 'overdue' : ((ativo && (!nx || rot)) ? 'attn' : '');
    return `<div class="dcard ${cardCls}" data-id="${r.id}">
      <div class="dcard__top"><span class="dcard__cli">${esc(r.cliente_nome || '—')}</span><span class="dcard__val">${money(r.total)}</span></div>
      <div class="dcard__meta">
        ${r.numero ? `<span>${esc(r.numero)}</span>` : ''}<span>${d}${dias > 0 ? ` · há ${dias}d` : ''}</span>
        <span class="vend">${esc(r.vendedor_nome || '')}</span>
        ${r.sinal > 0 ? `<span>sinal ${money(r.sinal)}</span>` : ''}
        <span>${r.parcelas}× ${money(r.valor_parcela)}</span>
      </div>
      ${flags.length ? `<div class="dcard__flags">${flags.join('')}</div>` : ''}
      ${contato ? `<div class="dcard__contato">📞 ${contato}</div>` : ''}
      ${itens ? `<div class="dcard__items">${itens}</div>` : ''}
      ${r.obs ? `<div class="dcard__note"><b>Nota:</b> ${esc(r.obs)}</div>` : ''}
      <select class="dcard__stage st-${stageOf(r)}" data-act="stage" aria-label="Fase da venda">
        ${STAGES.map(s => `<option value="${s.key}" ${stageOf(r) === s.key ? 'selected' : ''}>${stageName(s.key)}</option>`).join('')}
      </select>
      <div class="dcard__actions">
        ${lead && r.contato_telefone ? `<button class="dc-wpp" data-act="wpp-lead" type="button">📱 WhatsApp</button>` : ''}
        <button class="dc-note" data-act="note-orc" type="button">🗒 Nota</button>
        <button class="dc-edit" data-act="edit-orc" type="button">✎ Editar</button>
        <button class="dc-del" data-act="del-orc" type="button">🗑 Excluir</button>
      </div>
    </div>`;
  }
  $('#dashList').addEventListener('click', async e => {
    const card = e.target.closest('.dcard'); if (!card) return;
    const id = card.dataset.id;
    const o = dashData.find(x => x.id === id); if (!o) return;
    if (e.target.dataset.act === 'edit-orc') editOrcamento(o);
    if (e.target.dataset.act === 'note-orc') openOrc(o);
    if (e.target.dataset.act === 'wpp-lead') {
      const num = whatsNumero(o.contato_telefone);
      const itens = (o.itens || []).map(i => `• ${i.qtd}× ${i.nome}`).join('\n');
      const txt = encodeURIComponent(`Olá ${o.cliente_nome || ''}! Sou consultor da Torque Fitness. Recebi seu pedido de orçamento:\n\n${itens}\n\nVamos conversar?`);
      window.open(num ? `https://wa.me/${num}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank');
    }
    if (e.target.dataset.act === 'del-orc') {
      if (!confirm(`Excluir o orçamento de ${o.cliente_nome || 'cliente'}?`)) return;
      try { await Cloud.deleteOrcamento(id); dashData = dashData.filter(x => x.id !== id); renderDashboard(); toast('Orçamento excluído.'); }
      catch (err) {
        console.error(err);
        if (err && err.code === 'NO_DELETE') {
          toast('O banco bloqueou a exclusão (RLS).');
          if (Cloud.isAdmin && Cloud.isAdmin()) alert(DELETE_RLS_HELP);
        } else { toast('Erro ao excluir.'); }
      }
    }
  });
  const DELETE_RLS_HELP =
    'A exclusão foi bloqueada pela segurança do banco (RLS): falta uma política de DELETE em "orcamentos" — por isso o orçamento some da tela mas volta ao recarregar.\n\n' +
    'No Supabase → SQL Editor, crie a política (ajuste o nome da coluna de dono, ex.: user_id / vendedor_id, conforme sua tabela):\n\n' +
    'create policy orcamentos_delete on public.orcamentos\n' +
    '  for delete to authenticated using (\n' +
    "    user_id = auth.uid()\n" +
    "    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')\n" +
    '  );';
  const UPDATE_RLS_HELP =
    'O banco bloqueou a alteração (RLS): falta uma política de UPDATE em "orcamentos" — por isso agendar uma data ou mudar de fase não salva (some ao recarregar).\n\n' +
    'No Supabase → SQL Editor, crie a política (ajuste a coluna de dono, ex.: user_id / vendedor_id):\n\n' +
    'create policy orcamentos_update on public.orcamentos\n' +
    '  for update to authenticated using (\n' +
    "    user_id = auth.uid()\n" +
    "    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')\n" +
    '  );';
  // reporta erro de update: distingue bloqueio de RLS (NO_UPDATE) de erro genérico
  function reportUpdErr(err, fallback) {
    console.error(err);
    if (err && err.code === 'NO_UPDATE') {
      toast('Sem permissão para salvar no banco (RLS).');
      if (Cloud.isAdmin && Cloud.isAdmin()) alert(UPDATE_RLS_HELP);
    } else { toast(fallback); }
  }

  // ---- acompanhamento (nota + próxima atividade) ----
  let orcEditId = null;
  // ---- cabeçalho rico do negócio (valor, etapas clicáveis, contatos, produtos) ----
  function renderDealHead(o) {
    const head = $('#orcHead'); if (!head) return;
    const cli = o.cliente_id ? clienteById(o.cliente_id) : null;
    const fone = quotePhone(o);
    const email = (cli && cli.email) || o.contato_email || '';
    const dias = diasDesde(o.criado_em);
    const rot = rottingInfo(o);
    const fechado = !emAberto(o);
    const stageBar = STAGES.map(s => `<button class="dstage st-${s.key} ${stageOf(o) === s.key ? 'on' : ''}" data-stage="${s.key}" type="button">${stageName(s.key)}${OPEN_STAGES.includes(s.key) ? `<i>${stageProb(s.key)}%</i>` : ''}</button>`).join('');
    const itens = (o.itens || []).map(i => `<li><span>${i.qtd}× ${esc(i.nome)}</span><b>${money(i.total)}</b></li>`).join('');
    const facts = [
      o.vendedor_nome ? `<span>👤 ${esc(o.vendedor_nome)}</span>` : '',
      `<span>🗓 ${dias === 0 ? 'criado hoje' : 'há ' + dias + 'd'}</span>`,
      rot ? `<span class="rot">🥶 parado há ${rot.dias}d</span>` : '',
      fone ? `<a href="https://wa.me/${whatsNumero(fone)}" target="_blank" rel="noopener">📱 ${esc(fone)}</a>` : '',
      email ? `<span>✉️ ${esc(email)}</span>` : ''
    ].filter(Boolean).join('');
    head.innerHTML = `
      <div class="orc__title"><span>${esc(o.cliente_nome || 'Cliente')}${o.numero ? ` · ${esc(o.numero)}` : ''}</span><b>${money(o.total)}</b></div>
      <div class="orc__stages">${stageBar}</div>
      <div class="orc__facts">${facts}</div>
      ${itens ? `<ul class="orc__items">${itens}</ul>` : ''}
      <div class="orc__act">
        <button class="btn btn--ghost" data-act="orc-wpp" type="button">📱 Follow-up</button>
        ${fechado ? '' : '<button class="btn btn--ghost" data-act="orc-suggest" type="button">✨ Sugerir resposta</button>'}
        ${fechado ? '' : '<button class="btn btn--ghost" data-act="orc-edit" type="button">✎ Editar orçamento</button>'}
      </div>`;
  }
  // mover etapa direto no painel (funciona no celular, ao contrário do arrastar)
  function panelSetStage(status) {
    const o = dashData.find(x => x.id === orcEditId); if (!o) return;
    if (stageOf(o) === status) return;
    if (status === 'perdido') { closeModal('#orcModal'); changeStage(o.id, status); return; }
    changeStage(o.id, status);     // otimista: changeStage já ajusta o.status
    renderDealHead(o);
  }
  $('#orcHead').addEventListener('click', e => {
    const o = dashData.find(x => x.id === orcEditId); if (!o) return;
    const st = e.target.closest('.dstage'); if (st) { panelSetStage(st.dataset.stage); return; }
    if (e.target.closest('[data-act="orc-wpp"]')) { openWppFor(o); return; }
    if (e.target.closest('[data-act="orc-suggest"]')) { openSuggest(o); return; }
    if (e.target.closest('[data-act="orc-edit"]')) { closeModal('#orcModal'); editOrcamento(o); return; }
  });

  // ---- IA: sugestão de follow-up (revisada pelo vendedor antes de enviar) ----
  let suggestOrcId = null;
  function buildSuggestContext(o) {
    const hist = atividadesDe(o).filter(a => !(a.due && !a.done));
    const last = hist[hist.length - 1];
    return {
      cliente: o.cliente_nome || '',
      vendedor: o.vendedor_nome || (Cloud.profile && Cloud.profile.nome) || '',
      numero: o.numero || '',
      total: o.total ? money(o.total) : '',
      etapa: stageName(stageOf(o)),
      itens: (o.itens || []).map(i => ({ qtd: i.qtd, nome: i.nome })),
      nota: o.obs || '',
      ultima: last ? `${ATV_LABEL[last.t] || ''}: ${last.x || ''}`.trim() : '',
      instrucao: (($('#suggestHint') && $('#suggestHint').value) || '').trim()
    };
  }
  async function runSuggest(o) {
    const txt = $('#suggestText'), err = $('#suggestErr');
    err.hidden = true; txt.value = ''; txt.placeholder = 'Gerando sugestão…';
    $('#btnSuggestSend').disabled = $('#btnSuggestRegen').disabled = true;
    try {
      const res = await Cloud.suggestReply(buildSuggestContext(o));
      if (res && res.error) throw new Error(res.error);
      txt.value = (res && res.text) || '';
      if (!txt.value) throw new Error('resposta vazia');
    } catch (e) {
      console.error(e);
      err.hidden = false;
      err.innerHTML = 'Não foi possível gerar agora. Verifique se a IA está ativa. <button type="button" id="suggestHelp" class="atv__help">Como ativar</button>';
      txt.placeholder = 'Escreva a mensagem manualmente ou tente regenerar.';
    } finally {
      $('#btnSuggestSend').disabled = $('#btnSuggestRegen').disabled = false;
    }
  }
  function openSuggest(o) {
    suggestOrcId = o.id;
    $('#suggestCliente').textContent = (o.cliente_nome || 'Cliente') + (o.numero ? ' · ' + o.numero : '');
    $('#suggestHint').value = '';
    openModal('#suggestModal');
    runSuggest(o);
  }
  $('#btnSuggestRegen').addEventListener('click', () => { const o = dashData.find(x => x.id === suggestOrcId); if (o) runSuggest(o); });
  $('#btnSuggestCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#suggestText').value || ''); toast('Copiado.'); }
    catch (e) { toast('Não foi possível copiar.'); }
  });
  $('#btnSuggestSend').addEventListener('click', () => {
    const o = dashData.find(x => x.id === suggestOrcId); if (!o) return;
    const msg = ($('#suggestText').value || '').trim();
    if (!msg) { toast('Sem mensagem para enviar.'); return; }
    const num = whatsNumero(quotePhone(o));
    window.open(num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    logActivityAuto(o, 'whatsapp', 'Follow-up (IA) enviado pelo WhatsApp');
    closeModal('#suggestModal');
  });
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'suggestHelp') {
      alert('Para ativar a sugestão por IA (uma vez):\n\n' +
        '1) Crie o segredo com sua chave da Anthropic:\n   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...\n\n' +
        '2) Faça o deploy da função:\n   supabase functions deploy suggest-reply\n\n' +
        '(Opcional) escolha o modelo:\n   supabase secrets set CLAUDE_MODEL=claude-sonnet-4-6');
    }
  });

  function openOrc(o) {
    orcEditId = o.id;
    renderDealHead(o);
    $('#orcObs').value = o.obs || '';
    if ($('#taskData')) {
      $('#taskData').value = new Date(Date.now() + DAY).toISOString().slice(0, 10);   // padrão: amanhã
      $('#taskHora').value = '09:00'; $('#taskTexto').value = '';
    }
    renderTaskbox(o);
    renderAtv(o);
    openModal('#orcModal');
  }
  $('#btnSaveOrc').addEventListener('click', async () => {
    if (!orcEditId) return;
    const fields = { obs: $('#orcObs').value.trim() };
    try {
      await Cloud.updateOrcamento(orcEditId, fields);
      const r = dashData.find(x => x.id === orcEditId); if (r) Object.assign(r, fields);
      if (editingOrcamentoId === orcEditId) editingObs = fields.obs;
      closeModal('#orcModal'); renderDashboard(); toast('Acompanhamento salvo.');
    } catch (e) { console.error(e); toast('Erro ao salvar.'); }
  });

  // lista de tarefas pendentes dentro do painel do negócio
  function renderTaskbox(o) {
    if (!$('#taskPend')) return;
    // tipo/hora/detalhe só valem no modo rico (coluna atividades); a DATA sempre funciona (cai no retorno_em)
    const rico = ativColumn !== false;
    $('#taskTipo').disabled = $('#taskHora').disabled = $('#taskTexto').disabled = !rico;
    $('#taskData').disabled = $('#btnTaskAdd').disabled = false;
    const pend = tarefasPendentes(o);
    $('#taskPend').innerHTML = pend.length
      ? pend.map(t => {
          const di = dueInfo(t.due);
          const cls = di.overdue ? 'late' : (di.isToday ? 'today' : '');
          const x = t.x && ATV_LABEL[t.t] ? ' — ' + esc(t.x) : '';
          const done = t._legacy ? '' : `<button class="tk-x" data-act="tk-done-modal" data-key="${esc(taskKey(t))}" title="Concluir">✓</button>`;
          return `<div class="taskpend ${cls}">${ATV_ICON[t.t] || '📌'} <b>${esc(ATV_LABEL[t.t] || 'Atividade')}</b> · ${fmtDue(t.due, t._legacy)}${x}${done}</div>`;
        }).join('')
      : '<div class="taskpend none">⚠️ Sem próxima atividade agendada</div>';
  }
  // agendar nova atividade
  $('#btnTaskAdd').addEventListener('click', async () => {
    if (!orcEditId) return;
    const o = dashData.find(x => x.id === orcEditId); if (!o) return;
    const data = $('#taskData').value;
    if (!data) { toast('Escolha a data.'); return; }
    const hora = $('#taskHora').value || '09:00';
    const btn = $('#btnTaskAdd'); btn.disabled = true;
    try {
      if (ativColumn === false) { await scheduleViaRetorno(o, data); return; }   // sem coluna atividades → data simples
      const entry = { id: newId(), t: $('#taskTipo').value, x: ($('#taskTexto').value || '').trim(), by: (Cloud.profile && Cloud.profile.nome) || '', at: new Date().toISOString(), due: `${data}T${hora}:00`, done: false };
      const arr = atividadesDe(o).concat(entry);
      try {
        await Cloud.updateOrcamento(orcEditId, { atividades: arr });
        o.atividades = arr; ativColumn = true;
        $('#taskTexto').value = '';
        renderTaskbox(o); renderDashboard(); toast('Atividade agendada.');
      } catch (err) {
        if (isMissingCol(err)) { ativColumn = false; await scheduleViaRetorno(o, data); }   // coluna ausente → cai pro retorno_em
        else { reportUpdErr(err, 'Erro ao agendar.'); }
      }
    } finally { btn.disabled = false; }
  });
  // agendamento simples por DATA quando a coluna `atividades` não existe — grava no campo retorno_em
  async function scheduleViaRetorno(o, data) {
    try {
      await Cloud.updateOrcamento(o.id, { retorno_em: data });
      o.retorno_em = data;
      renderTaskbox(o); renderDashboard(); toast('Retorno agendado para ' + dmy(data + 'T00:00:00') + '.');
    } catch (e) { reportUpdErr(e, 'Erro ao agendar.'); }
  }
  // concluir tarefa pelo painel
  $('#taskPend').addEventListener('click', e => {
    const b = e.target.closest('[data-act="tk-done-modal"]'); if (!b || !orcEditId) return;
    concluirTarefa(orcEditId, b.dataset.key, false);
  });
  // marca uma tarefa como concluída (vai pro histórico). reabrir=abre o painel p/ agendar a próxima
  async function concluirTarefa(orcId, key, reabrir) {
    const o = dashData.find(x => x.id === orcId); if (!o) return;
    const arr = atividadesDe(o).map(a => (taskKey(a) === key && a.due && !a.done) ? { ...a, done: true, doneAt: new Date().toISOString() } : a);
    try {
      await Cloud.updateOrcamento(orcId, { atividades: arr });
      o.atividades = arr; ativColumn = true; renderDashboard();
      if (reabrir) { toast('Concluída! Agende a próxima 👇'); openOrc(o); }
      else { renderTaskbox(o); renderAtv(o); toast('Atividade concluída.'); }
    } catch (err) { console.error(err); toast('Erro ao concluir.'); }
  }

  // Carrega um orçamento salvo de volta no montador para editar.
  function editOrcamento(o) {
    state.cart = {};
    let faltando = 0;
    (o.itens || []).forEach(it => {
      const p = state.products.find(x => x.codigo && x.codigo === it.codigo);
      if (p) state.cart[p.id] = (state.cart[p.id] || 0) + (Number(it.qtd) || 0);
      else faltando++;
    });
    state.quote.clienteId = o.cliente_id || null;
    state.quote.descMode = 'brl';
    state.quote.descValue = Number(o.desconto) || 0;
    state.quote.sinal = Number(o.sinal) || 0;
    editingOrcamentoId = o.id;
    editingNumero = o.numero || '';
    editingObs = o.obs || '';
    $('#dashScreen').hidden = true; document.body.style.overflow = '';
    save(); render();
    if (o.parcelas) { $('#installSelect').value = String(o.parcelas); updateInstallValue(saldoFinanciar()); }
    $('#summaryBar').classList.add('open');
    if (faltando) toast(`${faltando} item(ns) não estão mais no catálogo e foram ignorados.`);
  }

  /* ------------------------------------------------------------
     INIT
     ------------------------------------------------------------ */
  updateLoginMode();
  render();                       // monta o app (fica oculto até autenticar)

  (async function bootstrapAuth() {
    const sb = Cloud.init();
    if (!sb) {
      document.body.dataset.auth = 'out';
      loginError('Não foi possível conectar ao servidor. Recarregue a página.');
      return;
    }
    Cloud.onAuthChange(session => { if (!session) resetToLogin(); });
    let session = null;
    try { session = await Cloud.getSession(); } catch (e) { console.error(e); }
    if (session) await afterAuth(session);
    else document.body.dataset.auth = 'out';
  })();
})();
