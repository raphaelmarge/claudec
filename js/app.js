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
  let state = load();

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

  const DATA_VERSION = (window.TORQUE_PUBLIC && window.TORQUE_PUBLIC.products && window.TORQUE_PUBLIC.products.length) || 0;

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
  const vendedorById = id => state.vendedores.find(v => v.id === id) || null;
  const clienteById = id => state.clientes.find(c => c.id === id) || null;
  function currentVendedor() { return vendedorById(state.currentVendedorId); }

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
    $('#configPanel').hidden = state.mode !== 'admin';
  }
  function setVal(sel, v) { const el = $(sel); if (el && document.activeElement !== el) el.value = v; }

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
    const vSel = $('#selVendedor');
    vSel.innerHTML = '<option value="">— selecione —</option>' +
      state.vendedores.map(v => `<option value="${v.id}" ${v.id === state.currentVendedorId ? 'selected' : ''}>${esc(v.nome)}</option>`).join('');
    const cSel = $('#selCliente');
    cSel.innerHTML = '<option value="">— selecione —</option>' +
      state.clientes.map(c => `<option value="${c.id}" ${c.id === Q().clienteId ? 'selected' : ''}>${esc(c.nome)}${c.empresa ? ' · ' + esc(c.empresa) : ''}</option>`).join('');
    $('#btnEditVendedor').disabled = !state.currentVendedorId;
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

  $('#modeToggle').addEventListener('click', () => {
    if (state.mode === 'admin') { state.mode = 'vendedor'; save(); render(); return; }
    // ir para Admin exige destravar com senha
    if (unlocked) { state.mode = 'admin'; save(); render(); }
    else openPasswordModal();
  });

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
    });
  });
  $('#cfgParcelas').addEventListener('input', () => { P().parcelasMax = Math.max(1, parseInt($('#cfgParcelas').value, 10) || 1); save(); renderSummary(); });
  $('#cfgValidade').addEventListener('input', () => { P().validade = Math.max(1, parseInt($('#cfgValidade').value, 10) || 1); save(); });

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
  $('#btnClearCart').addEventListener('click', () => {
    if (!cartCount() || confirm('Limpar todos os itens do orçamento?')) {
      state.cart = {}; state.quote.descValue = 0; state.quote.sinal = 0; save(); render();
    }
  });

  // desconto / sinal (vendedor)
  $('#inpDesconto').addEventListener('input', e => { state.quote.descValue = num(e.target.value) || 0; save(); renderSummary(); });
  $('#inpSinal').addEventListener('input', e => { state.quote.sinal = num(e.target.value) || 0; save(); renderSummary(); });
  $('#discToggle').addEventListener('click', () => {
    state.quote.descMode = state.quote.descMode === 'brl' ? 'pct' : 'brl';
    save(); renderSummary();
  });

  // seleção de vendedor / cliente
  $('#selVendedor').addEventListener('change', e => { state.currentVendedorId = e.target.value || null; save(); renderSummary(); });
  $('#selCliente').addEventListener('change', e => { state.quote.clienteId = e.target.value || null; save(); renderSummary(); });
  $('#btnNovoVendedor').addEventListener('click', () => openVendedor(null));
  $('#btnEditVendedor').addEventListener('click', () => state.currentVendedorId && openVendedor(state.currentVendedorId));
  $('#btnNovoCliente').addEventListener('click', () => openCliente(null));
  $('#btnEditCliente').addEventListener('click', () => Q().clienteId && openCliente(Q().clienteId));

  /* ------------------------------------------------------------
     CADASTRO — vendedores e clientes (modais)
     ------------------------------------------------------------ */
  let editVendedorId = null;
  function openVendedor(id) {
    const v = id ? vendedorById(id) : null;
    editVendedorId = id || null;
    $('#vendedorTitle').textContent = v ? 'Editar vendedor' : 'Novo vendedor';
    $('#vdNome').value = v ? v.nome : '';
    $('#vdTelefone').value = v ? (v.telefone || '') : '';
    $('#vdEmail').value = v ? (v.email || '') : '';
    $('#btnDeleteVendedor').style.display = v ? '' : 'none';
    openModal('#vendedorModal');
  }
  $('#btnSaveVendedor').addEventListener('click', () => {
    const nome = $('#vdNome').value.trim();
    if (!nome) { toast('Informe o nome do vendedor.'); return; }
    const dados = { nome, telefone: $('#vdTelefone').value.trim(), email: $('#vdEmail').value.trim() };
    if (editVendedorId) Object.assign(vendedorById(editVendedorId), dados);
    else { const v = { id: uid(), ...dados, criadoEm: Date.now() }; state.vendedores.push(v); state.currentVendedorId = v.id; }
    save(); closeModal('#vendedorModal'); renderSummary(); toast('Vendedor salvo.');
  });
  $('#btnDeleteVendedor').addEventListener('click', () => {
    if (!editVendedorId) return;
    if (confirm('Remover este vendedor?')) {
      state.vendedores = state.vendedores.filter(v => v.id !== editVendedorId);
      if (state.currentVendedorId === editVendedorId) state.currentVendedorId = null;
      save(); closeModal('#vendedorModal'); renderSummary(); toast('Vendedor removido.');
    }
  });

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
    openModal('#clienteModal');
  }
  $('#btnSaveCliente').addEventListener('click', () => {
    const nome = $('#clNome').value.trim();
    if (!nome) { toast('Informe o nome do cliente.'); return; }
    const dados = {
      nome, empresa: $('#clEmpresa').value.trim(), telefone: $('#clTelefone').value.trim(),
      email: $('#clEmail').value.trim(), doc: $('#clDoc').value.trim(),
      cidade: $('#clCidade').value.trim(), obs: $('#clObs').value.trim()
    };
    if (editClienteId) Object.assign(clienteById(editClienteId), dados);
    else { const c = { id: uid(), ...dados, criadoEm: Date.now() }; state.clientes.push(c); state.quote.clienteId = c.id; }
    save(); closeModal('#clienteModal'); renderSummary(); toast('Cliente salvo.');
  });
  $('#btnDeleteCliente').addEventListener('click', () => {
    if (!editClienteId) return;
    if (confirm('Remover este cliente?')) {
      state.clientes = state.clientes.filter(c => c.id !== editClienteId);
      if (state.quote.clienteId === editClienteId) state.quote.clienteId = null;
      save(); closeModal('#clienteModal'); renderSummary(); toast('Cliente removido.');
    }
  });

  // exportar base (admin) — ponte para um futuro banco de dados
  $('#btnExportBase').addEventListener('click', () => {
    const base = {
      exportadoEm: new Date().toISOString(),
      empresa: P().empresa || 'Torque Fitness',
      vendedores: state.vendedores,
      clientes: state.clientes,
      orcamentos: state.orcamentos
    };
    const blob = new Blob([JSON.stringify(base, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'torque-base-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(a.href);
    toast(`Base exportada: ${state.clientes.length} clientes, ${state.vendedores.length} vendedores, ${state.orcamentos.length} orçamentos.`);
  });

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

  $('#btnSaveProduct').addEventListener('click', () => {
    const f = readEditForm();
    if (!f.nome) { toast('Informe o nome do produto.'); return; }
    const p = editingId ? state.products.find(x => x.id === editingId) : { id: uid() };
    p.codigo = f.codigo; p.serie = f.serie; p.nome = f.nome; p.imagem = f.imagem;
    p.dims = f.dims; p.fob = f.fob; p.margem = f.margem; p.oculto = f.oculto;
    if (f.precoInput != null) { p.preco = f.precoInput; p.travado = true; }   // preço travado manual
    else { p.travado = false; p.preco = r2(precoCalculado(p)); }              // volta ao automático
    if (!editingId) state.products.push(p);
    save(); closeModal('#editModal'); render(); toast('Produto salvo.');
  });
  $('#btnDeleteProduct').addEventListener('click', () => {
    if (!editingId) return;
    if (confirm('Remover este produto definitivamente?')) {
      state.products = state.products.filter(x => x.id !== editingId);
      delete state.cart[editingId];
      save(); closeModal('#editModal'); render(); toast('Produto removido.');
    }
  });
  $('#btnAddProduct').addEventListener('click', () => openEdit(null));

  $('#btnResetData').addEventListener('click', () => {
    if (confirm('Restaurar o catálogo original? Isso desfaz suas edições.')) {
      state = freshFromSeed(); state.mode = 'admin';
      mergeSecret();            // recupera custos do segredo já destravado
      save(); render(); toast('Catálogo original restaurado.');
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
    save(); closeModal('#importModal'); render();
    toast(`${imported.length} produto(s) importado(s).`);
  });

  /* ------------------------------------------------------------
     QUOTE / EXPORT
     ------------------------------------------------------------ */
  $('#btnExport').addEventListener('click', () => {
    if (!cartCount()) { toast('Adicione produtos ao orçamento primeiro.'); return; }
    buildQuoteDoc(); registrarOrcamento(); openModal('#quoteModal');
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
    const numero = 'ORC-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + (state.orcamentos.length + 1);
    lastQuoteNumero = numero;

    const logo = `<svg class="qd__logo" viewBox="0 0 227 271" fill="#8B5CF6"><g transform="translate(0,271) scale(0.1,-0.1)"><path d="M130 2617 c-50 -26 -50 -19 -50 -685 0 -686 -2 -669 61 -691 34 -12 367 -14 406 -3 12 4 105 84 205 178 533 498 494 463 524 455 38 -10 70 -54 58 -81 -5 -11 -268 -262 -584 -558 -586 -547 -620 -584 -652 -682 -6 -19 -13 -125 -15 -236 -6 -224 -3 -234 62 -234 30 0 96 59 706 630 601 563 677 630 703 628 18 -2 37 -14 50 -31 19 -26 19 -30 5 -55 -8 -15 -289 -283 -624 -597 l-609 -570 887 -3 c609 -1 894 1 908 8 19 11 20 24 17 973 -3 944 -4 963 -24 1023 -88 255 -268 427 -539 511 l-90 27 -690 3 c-546 3 -695 1 -715 -10z"/></g></svg>`;
    const thumb = p => p.imagem
      ? `<img class="qd__thumb" src="${esc(p.imagem)}" alt="" onerror="this.style.visibility='hidden'"/>`
      : `<span class="qd__thumb qd__thumb--ph"></span>`;

    const rows = lines.map(l => `
      <tr>
        <td class="qd__imgcell">${thumb(l.p)}</td>
        <td><div class="qd__pname">${esc(l.p.nome)}</div>${l.p.codigo ? `<div class="qd__pcode">${esc(l.p.codigo)}</div>` : ''}</td>
        <td class="num">${l.q}</td>
        <td class="num">${money(l.unit)}</td>
        <td class="num">${money(l.total)}</td>
      </tr>`).join('');

    const jurosTxt = (P().juros || 0) > 0 ? `${n}× com juros de ${P().juros}% a.m.` : `em até ${n}× sem juros`;

    const clienteLinhas = cli ? [
      `<b>${esc(cli.nome)}</b>${cli.empresa ? ' · ' + esc(cli.empresa) : ''}`,
      [cli.telefone, cli.email].filter(Boolean).map(esc).join(' · '),
      [cli.cidade, cli.doc].filter(Boolean).map(esc).join(' · ')
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
      <div class="qd__client">
        <span class="qd__cli">Cliente:<br>${clienteLinhas}</span>
        <span class="qd__vend">Vendedor:<br><b>${vend ? esc(vend.nome) : '—'}</b>${vend && vend.telefone ? '<br>' + esc(vend.telefone) : ''}</span>
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
      <div class="qd__foot">
        Orçamento gerado em ${todayStr()} · ${P().empresa || 'Torque Fitness'} · Valores sujeitos a alteração sem aviso prévio.
      </div>`;
  }

  // Salva o orçamento no histórico (base para um futuro banco de dados).
  function registrarOrcamento() {
    const lines = cartLines();
    const subtotal = cartTotal();
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const saldo = saldoFinanciar();
    state.orcamentos.push({
      id: uid(),
      numero: lastQuoteNumero,
      criadoEm: Date.now(),
      vendedorId: state.currentVendedorId || null,
      vendedorNome: currentVendedor() ? currentVendedor().nome : '',
      clienteId: Q().clienteId || null,
      clienteNome: clienteById(Q().clienteId) ? clienteById(Q().clienteId).nome : '',
      itens: lines.map(l => ({ codigo: l.p.codigo, nome: l.p.nome, qtd: l.q, unitario: l.unit, total: l.total })),
      subtotal,
      descMode: Q().descMode, descValue: Q().descValue,
      desconto: descontoReais(subtotal),
      total: totalComDesconto(),
      sinal: sinalReais(),
      saldo,
      parcelas: n,
      valorParcela: saldo > 0 ? parcelaValor(saldo, n) : 0
    });
    save();
  }

  $('#btnPdfQuote').addEventListener('click', () => window.print());

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

  $('#btnShareQuote').addEventListener('click', async () => {
    const lines = cartLines();
    const total = totalComDesconto();
    const sinal = sinalReais();
    const saldo = saldoFinanciar();
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const cli = clienteById(Q().clienteId);
    let txt = `*Orçamento Torque Fitness*\n`;
    if (cli) txt += `Cliente: ${cli.nome}\n`;
    txt += `\n` + lines.map(l => `• ${l.q}× ${l.p.nome} — ${money(l.total)}`).join('\n') +
      `\n\n*Total: ${money(total)}*`;
    if (sinal > 0) txt += `\nSinal: ${money(sinal)} · Saldo: ${money(saldo)}`;
    txt += `\n${n}× de ${money(parcelaValor(saldo, n))}`;
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
     INIT
     ------------------------------------------------------------ */
  render();
})();
