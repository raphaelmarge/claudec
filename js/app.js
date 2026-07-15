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
  const SHARED_PARAM_KEYS = ['parcelasMax', 'juros', 'validade', 'stages', 'metas', 'linhas', 'linhaBanners', 'contato', 'carousel', 'comissao', 'kits', 'descontoMaxVendedor', 'faq', 'depoimentos', 'obras', 'ctFotos', 'blog', 'cupons', 'contrato'];
  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
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
      id: p.id, codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral', tipo: p.tipo || 'maquina',
      imagem: (p.imagem && !String(p.imagem).startsWith('data:')) ? p.imagem : '',
      imagens: Array.isArray(p.imagens) ? p.imagens.filter(u => u && !String(u).startsWith('data:')) : [],
      video: p.video || '',
      dims: p.dims || '', disp: p.disp || '', selo: p.selo || '', grupo: p.grupo || '', preco: Number(p.preco) || 0, oculto: !!p.oculto, travado: !!p.travado
    }));
  }
  // banners de categoria publicáveis (só URLs hospedadas; data: local não vai pro site)
  function publicBanners() {
    const out = {}, b = P().linhaBanners || {};
    Object.keys(b).forEach(k => { if (b[k] && !String(b[k]).startsWith('data:')) out[k] = b[k]; });
    return out;
  }
  // imagens do carrossel publicáveis (só URLs hospedadas; data: local não vai pro site)
  function publicCarousel() {
    const out = {}, c = P().carousel || {};
    Object.keys(c).forEach(k => { if (c[k] && !String(c[k]).startsWith('data:')) out[k] = c[k]; });
    return out;
  }
  // dados de contato/localização para o site comercial (endereço, mapa, telefone, horário)
  function publicSite() {
    const c = P().contato || {};
    return {
      endereco: c.endereco || '', mapsUrl: c.mapsUrl || '', telefone: c.telefone || '',
      whatsapp: c.whatsapp || '', email: c.email || '', horario: c.horario || '',
      gaId: c.gaId || '', metaPixel: c.metaPixel || '',
      faq: (Array.isArray(P().faq) ? P().faq : []).filter(x => x && (x.q || '').trim()).map(x => ({ q: x.q || '', a: x.a || '' })),
      depoimentos: (Array.isArray(P().depoimentos) ? P().depoimentos : []).filter(x => x && (x.texto || '').trim()).map(x => ({ nome: x.nome || '', local: x.local || '', texto: x.texto || '' })),
      // fotos de instalações entregues (só URLs hospedadas; data: local não vai pro site)
      obras: (Array.isArray(P().obras) ? P().obras : []).filter(x => x && (x.img || '').trim() && !String(x.img).startsWith('data:')).map(x => ({ img: x.img || '', titulo: x.titulo || '', local: x.local || '' })),
      // fotos do Centro de Treinamento (página ct.html)
      ctFotos: (Array.isArray(P().ctFotos) ? P().ctFotos : []).filter(x => x && (x.img || '').trim() && !String(x.img).startsWith('data:')).map(x => ({ img: x.img || '', titulo: x.titulo || '' })),
      blog: (Array.isArray(P().blog) ? P().blog : []).filter(x => x && x.publicado && (x.titulo || '').trim()).map(x => ({
        slug: slugify(x.slug || x.titulo), titulo: x.titulo || '', resumo: x.resumo || '',
        capa: (x.capa && !String(x.capa).startsWith('data:')) ? x.capa : '', conteudo: x.conteudo || '',
        autor: x.autor || 'Torque Fitness', data: x.data || ''
      })),
      cupons: (Array.isArray(P().cupons) ? P().cupons : []).filter(x => x && (x.codigo || '').trim()).map(x => ({
        codigo: String(x.codigo || '').trim().toUpperCase(), desconto: Number(x.desconto) || 0,
        quem: x.quem || '', ativo: x.ativo !== false, popup: !!x.popup
      }))
    };
  }
  // Correção pontual (jul/2026): a 1ª leva da A5 entrou com preço estimado;
  // aplica a fórmula oficial APENAS se o preço ainda for o estimado e não
  // houver FOB cadastrado (ajustes manuais do usuário ficam intocados).
  const A5_PRECO_FIX = { 'A501': [6975, 15761.35], 'A502': [6975, 15761.35], 'A503': [6975, 15761.35], 'A504': [6975, 15761.35], 'A505': [6975, 15761.35], 'A506': [6975, 15761.35], 'A507': [8680, 19103.40], 'A508': [6975, 15761.35], 'A509': [6975, 15761.35], 'A510': [6975, 15761.35], 'A511': [6975, 15761.35], 'A512': [5425, 12723.12], 'A513': [12710, 27002.79], 'A514': [10075, 21837.80], 'A515': [12865, 27306.61], 'A516': [12865, 27306.61], 'A517': [12865, 27306.61], 'A518': [10230, 22141.62], 'A519': [12865, 27306.61], 'A520': [12865, 27306.61], 'A521': [12865, 27306.61], 'A522': [12865, 27306.61], 'A523': [12865, 27306.61], 'A524': [12865, 27306.61], 'A525': [15470, 32410.83], 'A526': [10075, 21837.80], 'A527': [12865, 27306.61], 'A528': [12865, 27306.61], 'A529': [12865, 27306.61] };
  function fixPrecosA5(s) {
    ((s && s.products) || []).forEach(p => {
      const f = A5_PRECO_FIX[p.codigo];
      if (f && (p.fob == null || p.fob === '') && Math.abs((Number(p.preco) || 0) - f[0]) < 1) { p.preco = f[1]; p.travado = false; }
    });
  }
  fixPrecosA5(state); save();
  function applyCatalog(remote) {
    if (!Array.isArray(remote) || !remote.length) return;   // catálogo vazio não apaga o do vendedor
    const byId = {}, byCode = {};
    (state.products || []).forEach(p => { byId[p.id] = p; if (p.codigo) byCode[p.codigo] = p; });
    state.products = remote.map(p => {
      const old = byId[p.id] || (p.codigo && byCode[p.codigo]) || {};
      return {
        id: p.id || old.id || uid(), codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral', tipo: p.tipo || 'maquina',
        imagem: p.imagem || old.imagem || '',   // imagem vazia do servidor NÃO apaga a foto local existente
        imagens: (Array.isArray(p.imagens) && p.imagens.length) ? p.imagens : (old.imagens || []),
        video: p.video || old.video || '',
        dims: p.dims || '', disp: p.disp || old.disp || '', selo: p.selo || old.selo || '', grupo: p.grupo || old.grupo || '', preco: Number(p.preco) || 0,
        margem: null, travado: !!p.travado, oculto: !!p.oculto
      };
    });
    // produtos novos do app (ex.: série recém-lançada) que ainda não estão no
    // catálogo publicado entram por cima — o próximo publicar os leva pro site
    const codigos = new Set(state.products.map(p => p.codigo).filter(Boolean));
    const seed = (window.TORQUE_PUBLIC && window.TORQUE_PUBLIC.products) || [];
    seed.forEach(p => {
      if (!p.codigo || codigos.has(p.codigo)) return;
      state.products.push({
        id: uid(), codigo: p.codigo, nome: p.nome || '', serie: p.serie || 'Geral', tipo: p.tipo || 'maquina',
        imagem: p.imagem || '', imagens: [], video: '', dims: p.dims || '', disp: '', selo: p.selo || '', grupo: '',
        preco: Number(p.preco) || 0, margem: null, travado: false, oculto: false
      });
    });
    fixPrecosA5(state);   // catálogo publicado com o preço estimado antigo também é corrigido
    save();
  }
  async function pullSettings() {
    if (!(Cloud.ready && Cloud.ready())) return;
    try {
      const data = await Cloud.loadSettings();
      settingsSync = true;
      if (data && typeof data === 'object') {
        SHARED_PARAM_KEYS.forEach(k => { if (data[k] !== undefined) state.params[k] = data[k]; });
        applyCatalog(data.catalog);   // todos recebem o catálogo publicado (inclui admin em outro aparelho)
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
      try {
        await Cloud.saveSettings(payload); settingsSync = true; renderSyncStatus();
        try { await Cloud.publishCatalogJson(payload.catalog, publicBanners(), publicSite(), publicCarousel()); } catch (e) { console.warn('catalog.json:', e); }   // espelha pro site público
      }
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
    const icms = Math.min((P().icms || 0) / 100, 0.95);   // ICMS ≥100% geraria preço infinito
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
  // Devolve um resumo do que aconteceu para dar retorno ao usuário.
  function recalcAll() {
    let updated = 0, locked = 0, noCost = 0;
    if (!unlocked) return { updated, locked, noCost, total: state.products.length, costsLoaded: false };
    state.products.forEach(p => {
      if (!temCusto(p)) { noCost++; return; }       // sem custo (FOB) → câmbio/margem não tem base
      if (p.travado) { locked++; return; }          // preço manual travado → não mexe
      const novo = r2(precoCalculado(p));
      if (!isFinite(novo) || novo <= 0) { noCost++; return; }   // parâmetro inválido não zera o catálogo
      p.preco = novo; updated++;
    });
    save();
    return { updated, locked, noCost, total: state.products.length, costsLoaded: state.products.some(temCusto) };
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
  // linhas definidas pelo admin (P().linhas) + as que vêm dos produtos — usadas no editor e no seletor
  function linhasDefinidas() {
    const set = new Set([...(Array.isArray(P().linhas) ? P().linhas : []), ...series()]);
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
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
    setVal('#cfgValidade', p.validade); setVal('#cfgComissao', p.comissao);
    setVal('#cfgDescMaxVend', p.descontoMaxVendedor);
    const emp = p.contrato || {};
    Object.keys(EMP_FIELDS).forEach(id => { const el = $('#' + id); if (el) el.value = emp[EMP_FIELDS[id]] || ''; });
    renderStagesEditor();
    renderLinhasEditor();
    renderCarouselEditor();
    renderContatoEditor();
    renderFaqEditor();
    renderDepoEditor();
    renderObrasEditor();
    renderCtFotosEditor();
    renderBlogEditor();
    renderCuponsEditor();
    renderVendEditor();
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
    box.innerHTML = STAGES.map(s => {
      const cad = OPEN_STAGES.includes(s.key)
        ? `<span class="stagerow__dias" title="Cadência: dias até o próximo retorno (0 = não agenda)">↻<input data-stage-dias="${s.key}" type="number" min="0" step="1" value="${cadenciaDias(s.key)}" aria-label="Cadência em dias" />d</span>`
        : '';
      return `<div class="stagerow">
        <span class="stagerow__dot st-${s.key}"></span>
        <input class="stagerow__name" data-stage-name="${s.key}" type="text" value="${esc(stageName(s.key))}" aria-label="Nome da etapa" />
        <span class="stagerow__prob"><input data-stage-prob="${s.key}" type="number" min="0" max="100" step="5" value="${stageProb(s.key)}" aria-label="Probabilidade" />%</span>
        ${cad}
      </div>`;
    }).join('');
  }
  (function wireStagesEditor() {
    const box = $('#stagesEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const nameEl = e.target.closest('[data-stage-name]');
      const probEl = e.target.closest('[data-stage-prob]');
      const diasEl = e.target.closest('[data-stage-dias]');
      if (!nameEl && !probEl && !diasEl) return;
      if (!P().stages) P().stages = {};
      const src = nameEl || probEl || diasEl;
      const k = src.dataset.stageName || src.dataset.stageProb || src.dataset.stageDias;
      const cur = P().stages[k] || {};
      if (nameEl) cur.nome = nameEl.value;
      if (probEl) cur.prob = Math.max(0, Math.min(100, parseInt(probEl.value, 10) || 0));
      if (diasEl) cur.dias = Math.max(0, parseInt(diasEl.value, 10) || 0);
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
    $('#serieList').innerHTML = linhasDefinidas().map(s => `<option value="${esc(s)}">`).join('');
  }
  // ---- gerenciador de LINHAS (séries): adicionar e renomear ----
  function renderLinhasEditor() {
    const box = $('#linhasEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;       // não recria enquanto digita
    const linhas = linhasDefinidas();
    const banners = P().linhaBanners || {};
    box.innerHTML = linhas.length ? linhas.map(nome => {
      const n = state.products.filter(p => (p.serie || 'Geral') === nome).length;
      const temBanner = !!banners[nome];
      const bannerCtrl = temBanner
        ? `<button class="linharow__banner on" type="button" data-banner-linha="${esc(nome)}" title="Trocar imagem do banner">🖼 ✓</button><button class="linharow__x" type="button" data-banner-rm="${esc(nome)}" title="Remover banner">✕</button>`
        : `<button class="linharow__banner" type="button" data-banner-linha="${esc(nome)}" title="Definir imagem de banner">🖼 Banner</button>`;
      return `<div class="linharow">
        <input class="linharow__name" data-linha="${esc(nome)}" type="text" value="${esc(nome)}" aria-label="Nome da linha" />
        <span class="linharow__n">${n} item(ns)</span>
        ${bannerCtrl}
        ${n === 0 ? `<button class="linharow__x" type="button" data-del-linha="${esc(nome)}" title="Remover linha vazia">✕</button>` : ''}
      </div>`;
    }).join('') : '<p class="atv__empty">Nenhuma linha ainda. Use “+ Nova linha”.</p>';
  }
  function renameLinha(antigo, novo) {
    novo = (novo || '').trim();
    if (!novo || novo === antigo) { renderLinhasEditor(); return; }
    state.products.forEach(p => { if ((p.serie || 'Geral') === antigo) p.serie = novo; });   // cascata nos produtos
    const set = new Set((Array.isArray(P().linhas) ? P().linhas : []).filter(x => x !== antigo));
    set.add(novo);
    P().linhas = Array.from(set).filter(Boolean);
    if (state.filters.serie === antigo) state.filters.serie = novo;
    save(); schedulePushSettings();      // sincroniza p/ equipe e publica catalog.json (vitrine pega o novo nome)
    render(); toast('Linha renomeada.');
  }
  // envia a imagem de banner de uma linha (vai pro Storage; aparece no site comercial)
  function pickBanner(lineName) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      toast('Enviando banner…');
      try {
        const { blob, dataUrl } = await resizeImage(file, 1600, 0.78);
        let url = dataUrl, naNuvem = false;
        try { url = await Cloud.uploadProductImage(blob, 'jpg'); naNuvem = true; }
        catch (err) { console.warn('banner storage:', err); }
        if (!P().linhaBanners) P().linhaBanners = {};
        P().linhaBanners[lineName] = url; save(); schedulePushSettings(); renderLinhasEditor();
        toast(naNuvem ? ('Banner de "' + lineName + '" salvo.') : 'Banner local — ative o Storage para aparecer no site.');
      } catch (err) { console.error(err); toast('Não foi possível ler a imagem.'); }
    };
    inp.click();
  }
  (function wireLinhasEditor() {
    const box = $('#linhasEditor'); if (!box) return;
    box.addEventListener('change', e => { const inp = e.target.closest('[data-linha]'); if (inp) renameLinha(inp.dataset.linha, inp.value); });
    box.addEventListener('click', e => {
      const del = e.target.closest('[data-del-linha]');
      if (del) { P().linhas = (Array.isArray(P().linhas) ? P().linhas : []).filter(x => x !== del.dataset.delLinha); save(); schedulePushSettings(); renderLinhasEditor(); toast('Linha removida.'); return; }
      const bn = e.target.closest('[data-banner-linha]');
      if (bn) { pickBanner(bn.dataset.bannerLinha); return; }
      const brm = e.target.closest('[data-banner-rm]');
      if (brm) { const b = P().linhaBanners || {}; delete b[brm.dataset.bannerRm]; P().linhaBanners = b; save(); schedulePushSettings(); renderLinhasEditor(); toast('Banner removido.'); return; }
    });
    const add = $('#btnAddLinha');
    if (add) add.addEventListener('click', () => {
      const nome = (prompt('Nome da nova linha:') || '').trim();
      if (!nome) return;
      const arr = (Array.isArray(P().linhas) ? P().linhas : []).slice();
      if (!arr.includes(nome)) arr.push(nome);
      P().linhas = arr; save(); schedulePushSettings(); renderLinhasEditor(); renderSerieDatalist();
      toast('Linha criada. Atribua produtos a ela ao editar/criar um produto.');
    });
  })();

  // ---- editor de LOCALIZAÇÃO / CONTATO (sincroniza p/ o site comercial) ----
  const CONTATO_FIELDS = { '#ctEndereco': 'endereco', '#ctMaps': 'mapsUrl', '#ctTelefone': 'telefone', '#ctWhats': 'whatsapp', '#ctEmail': 'email', '#ctHorario': 'horario', '#ctGa': 'gaId', '#ctPixel': 'metaPixel' };
  function renderContatoEditor() {
    const c = P().contato || {};
    Object.keys(CONTATO_FIELDS).forEach(sel => { const el = $(sel); if (el && el !== document.activeElement) el.value = c[CONTATO_FIELDS[sel]] || ''; });
  }
  (function wireContatoEditor() {
    Object.keys(CONTATO_FIELDS).forEach(sel => {
      const el = $(sel); if (!el) return;
      el.addEventListener('input', () => {
        if (!P().contato) P().contato = {};
        let v = el.value.trim();
        if (CONTATO_FIELDS[sel] === 'whatsapp') v = v.replace(/\D/g, '');
        P().contato[CONTATO_FIELDS[sel]] = v;
        save(); schedulePushSettings();
      });
    });
  })();

  // ---- editor do CARROSSEL da vitrine (imagem de fundo por slide) ----
  const CAROUSEL_SLIDES = [
    { id: 'home', label: 'Slide 1 · Institucional' },
    { id: 'hm', label: 'Slide 2 · Linha HM' },
    { id: 'cardio', label: 'Slide 3 · Linha Cardio' },
    { id: 'contato', label: 'Slide 4 · Contato' }
  ];
  function renderCarouselEditor() {
    const box = $('#carouselEditor'); if (!box) return;
    const imgs = P().carousel || {};
    box.innerHTML = CAROUSEL_SLIDES.map(s => {
      const tem = !!imgs[s.id];
      const ctrl = tem
        ? `<button class="linharow__banner on" type="button" data-car-img="${s.id}" title="Trocar imagem">🖼 ✓</button><button class="linharow__x" type="button" data-car-rm="${s.id}" title="Remover imagem">✕</button>`
        : `<button class="linharow__banner" type="button" data-car-img="${s.id}" title="Definir imagem">🖼 Imagem</button>`;
      return `<div class="linharow"><span class="linharow__n" style="flex:1;text-align:left">${esc(s.label)}</span>${ctrl}</div>`;
    }).join('');
  }
  // envia a imagem de um slide do carrossel (vai pro Storage; aparece no site)
  function pickCarousel(slideId) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      toast('Enviando imagem…');
      try {
        const { blob, dataUrl } = await resizeImage(file, 1600, 0.78);
        let url = dataUrl, naNuvem = false;
        try { url = await Cloud.uploadProductImage(blob, 'jpg'); naNuvem = true; }
        catch (err) { console.warn('carousel storage:', err); }
        if (!P().carousel) P().carousel = {};
        P().carousel[slideId] = url; save(); schedulePushSettings(); renderCarouselEditor();
        toast(naNuvem ? 'Imagem do slide salva.' : 'Imagem local — ative o Storage para aparecer no site.');
      } catch (err) { console.error(err); toast('Não foi possível ler a imagem.'); }
    };
    inp.click();
  }
  (function wireCarouselEditor() {
    const box = $('#carouselEditor'); if (!box) return;
    box.addEventListener('click', e => {
      const img = e.target.closest('[data-car-img]');
      if (img) { pickCarousel(img.dataset.carImg); return; }
      const rm = e.target.closest('[data-car-rm]');
      if (rm) { const c = P().carousel || {}; delete c[rm.dataset.carRm]; P().carousel = c; save(); schedulePushSettings(); renderCarouselEditor(); toast('Imagem removida.'); return; }
    });
  })();

  // ---- editor de FAQ (perguntas frequentes) ----
  // Perguntas frequentes sugeridas (dúvidas mais comuns em sites de equipamentos
  // de academia). Enquanto o admin não publica as suas, estas aparecem no site.
  const FAQ_SUG = [
    { q: 'A Torque Fitness atende todo o Brasil?', a: 'Sim, atendemos todo o Brasil — de capitais a cidades do interior. O frete entra no orçamento de acordo com a cidade de entrega.' },
    { q: 'Qual é o prazo de entrega dos equipamentos?', a: 'Os equipamentos são fabricados sob encomenda, com prazo médio de 100 a 120 dias após a confirmação do pedido. O prazo exato vai detalhado na sua proposta.' },
    { q: 'Os equipamentos têm garantia?', a: 'Sim. Todos os equipamentos têm 1 ano de garantia contra defeitos de fabricação.' },
    { q: 'Como funciona o parcelamento e quais as formas de pagamento?', a: 'Trabalhamos com diversas formas de pagamento e parcelamento, definidas conforme a análise e validação de crédito. Fale com o nosso time para encontrar a melhor condição para o seu caso.' },
    { q: 'Vocês ajudam a montar a academia (mix de equipamentos e layout)?', a: 'Sim. Temos parcerias com escritórios de arquitetura e empreiteiras para ajudar no layout, na obra e na montagem da academia — do projeto à instalação dos equipamentos.' },
    { q: 'Qual o investimento para montar uma academia?', a: 'O investimento depende principalmente da metragem (m²) da academia, do público e do mix de equipamentos. Monte um orçamento no site ou fale conosco para uma estimativa sob medida.' },
    { q: 'Os equipamentos são para uso profissional e intenso?', a: 'Sim. Todos os nossos equipamentos são desenvolvidos para uso profissional e intenso, prontos para a alta rotatividade de uma academia comercial.' },
    { q: 'Vocês oferecem assistência técnica e reposição de peças?', a: 'Sim, oferecemos assistência técnica e reposição de peças das nossas linhas. Em caso de necessidade, fale com o nosso atendimento com o código do equipamento em mãos.' },
    { q: 'Vendem para pessoa física ou apenas para empresas (CNPJ)?', a: 'Atendemos tanto CNPJ quanto CPF — academias, empresas, personal trainers e pessoa física.' },
    { q: 'Como faço um orçamento?', a: 'É só entrar em contato pelo WhatsApp ou montar o seu orçamento aqui mesmo no site, escolhendo os equipamentos no catálogo. Nosso time retorna com valores, prazos e condições.' }
  ];
  const faqArr = () => Array.isArray(P().faq) ? P().faq : (P().faq = []);
  function renderFaqEditor() {
    const box = $('#faqEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;
    const arr = faqArr();
    box.innerHTML = arr.length ? arr.map((f, i) => `
      <div class="qarow" data-i="${i}">
        <input class="qarow__q" data-faq-q="${i}" type="text" value="${esc(f.q || '')}" placeholder="Pergunta" />
        <textarea class="qarow__a" data-faq-a="${i}" rows="2" placeholder="Resposta">${esc(f.a || '')}</textarea>
        <button class="qarow__x" type="button" data-faq-rm="${i}" title="Remover">✕</button>
      </div>`).join('') : '<p class="atv__empty">Nenhuma pergunta publicada — o site está mostrando as 10 perguntas sugeridas. Clique em “Carregar perguntas sugeridas” para editá-las.</p>';
  }
  (function wireFaqEditor() {
    const box = $('#faqEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const q = e.target.closest('[data-faq-q]'), a = e.target.closest('[data-faq-a]');
      if (!q && !a) return;
      const i = parseInt((q || a).dataset.faqQ || (q || a).dataset.faqA, 10);
      if (!faqArr()[i]) faqArr()[i] = { q: '', a: '' };
      if (q) faqArr()[i].q = q.value;
      if (a) faqArr()[i].a = a.value;
      save(); schedulePushSettings();
    });
    box.addEventListener('click', e => {
      const rm = e.target.closest('[data-faq-rm]'); if (!rm) return;
      faqArr().splice(parseInt(rm.dataset.faqRm, 10), 1); save(); schedulePushSettings(); renderFaqEditor();
    });
    const add = $('#btnAddFaq');
    if (add) add.addEventListener('click', () => { faqArr().push({ q: '', a: '' }); save(); renderFaqEditor(); });
    const sug = $('#btnFaqSug');
    if (sug) sug.addEventListener('click', () => {
      const arr = faqArr();
      if (arr.some(f => (f.q || '').trim()) && !confirm('Isto vai adicionar as perguntas sugeridas à sua lista atual. Continuar?')) return;
      FAQ_SUG.forEach(f => arr.push({ q: f.q, a: f.a }));
      save(); schedulePushSettings(); renderFaqEditor();
    });
  })();

  // ---- editor de CUPONS de desconto (boas-vindas e influenciadores) ----
  const cuponsArr = () => Array.isArray(P().cupons) ? P().cupons : (P().cupons = []);
  function renderCuponsEditor() {
    const box = $('#cuponsEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;
    const arr = cuponsArr();
    box.innerHTML = arr.length ? arr.map((c, i) => `
      <div class="cuprow" data-i="${i}">
        <input class="cuprow__cod" data-cup-cod="${i}" type="text" value="${esc(c.codigo || '')}" placeholder="CÓDIGO" />
        <input class="cuprow__pct" data-cup-pct="${i}" type="number" min="0" max="100" step="1" value="${c.desconto != null ? c.desconto : ''}" placeholder="%" />
        <input class="cuprow__quem" data-cup-quem="${i}" type="text" value="${esc(c.quem || '')}" placeholder="Influenciador / campanha" />
        <label class="cuprow__chk" title="Ativo"><input type="checkbox" data-cup-ativo="${i}" ${c.ativo !== false ? 'checked' : ''} /> ativo</label>
        <label class="cuprow__chk" title="Mostrar no pop-up de boas-vindas"><input type="checkbox" data-cup-popup="${i}" ${c.popup ? 'checked' : ''} /> pop-up</label>
        <button class="qarow__x" type="button" data-cup-rm="${i}" title="Remover">✕</button>
      </div>`).join('') : '<p class="atv__empty">Nenhum cupom ainda. Crie um código de desconto (ex.: BEMVINDO10) e marque “pop-up” para aparecer ao entrar no site.</p>';
  }
  (function wireCuponsEditor() {
    const box = $('#cuponsEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const t = e.target;
      const cod = t.closest('[data-cup-cod]'), pct = t.closest('[data-cup-pct]'), quem = t.closest('[data-cup-quem]');
      if (!cod && !pct && !quem) return;
      const i = parseInt((cod || pct || quem).dataset.cupCod || (cod || pct || quem).dataset.cupPct || (cod || pct || quem).dataset.cupQuem, 10);
      const arr = cuponsArr(); if (!arr[i]) arr[i] = { codigo: '', desconto: 0, quem: '', ativo: true, popup: false };
      if (cod) arr[i].codigo = cod.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (pct) arr[i].desconto = Math.max(0, Math.min(100, num(pct.value) || 0));
      if (quem) arr[i].quem = quem.value;
      if (cod) cod.value = arr[i].codigo;   // reflete a normalização
      save(); schedulePushSettings();
    });
    box.addEventListener('change', e => {
      const at = e.target.closest('[data-cup-ativo]'), pp = e.target.closest('[data-cup-popup]');
      if (!at && !pp) return;
      const arr = cuponsArr();
      if (at) { const i = parseInt(at.dataset.cupAtivo, 10); if (arr[i]) arr[i].ativo = at.checked; }
      if (pp) {
        const i = parseInt(pp.dataset.cupPopup, 10);
        if (arr[i]) { arr[i].popup = pp.checked; if (pp.checked) arr.forEach((c, j) => { if (j !== i) c.popup = false; }); }   // só 1 cupom no pop-up
        renderCuponsEditor();
      }
      save(); schedulePushSettings();
    });
    box.addEventListener('click', e => {
      const rm = e.target.closest('[data-cup-rm]'); if (!rm) return;
      cuponsArr().splice(parseInt(rm.dataset.cupRm, 10), 1); save(); schedulePushSettings(); renderCuponsEditor();
    });
    const add = $('#btnAddCupom');
    if (add) add.addEventListener('click', () => { cuponsArr().push({ codigo: '', desconto: 10, quem: '', ativo: true, popup: false }); save(); renderCuponsEditor(); });
  })();

  // ---- editor de DEPOIMENTOS ----
  const depoArr = () => Array.isArray(P().depoimentos) ? P().depoimentos : (P().depoimentos = []);
  function renderDepoEditor() {
    const box = $('#depoEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;
    const arr = depoArr();
    box.innerHTML = arr.length ? arr.map((d, i) => `
      <div class="qarow" data-i="${i}">
        <textarea class="qarow__a" data-depo-texto="${i}" rows="2" placeholder="Depoimento do cliente">${esc(d.texto || '')}</textarea>
        <input class="qarow__q" data-depo-nome="${i}" type="text" value="${esc(d.nome || '')}" placeholder="Nome" />
        <input class="qarow__q" data-depo-local="${i}" type="text" value="${esc(d.local || '')}" placeholder="Academia / cidade" />
        <button class="qarow__x" type="button" data-depo-rm="${i}" title="Remover">✕</button>
      </div>`).join('') : '<p class="atv__empty">Nenhum depoimento ainda.</p>';
  }
  (function wireDepoEditor() {
    const box = $('#depoEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const t = e.target.closest('[data-depo-texto]'), n = e.target.closest('[data-depo-nome]'), l = e.target.closest('[data-depo-local]');
      const el = t || n || l; if (!el) return;
      const i = parseInt(el.dataset.depoTexto || el.dataset.depoNome || el.dataset.depoLocal, 10);
      if (!depoArr()[i]) depoArr()[i] = { nome: '', local: '', texto: '' };
      if (t) depoArr()[i].texto = t.value;
      if (n) depoArr()[i].nome = n.value;
      if (l) depoArr()[i].local = l.value;
      save(); schedulePushSettings();
    });
    box.addEventListener('click', e => {
      const rm = e.target.closest('[data-depo-rm]'); if (!rm) return;
      depoArr().splice(parseInt(rm.dataset.depoRm, 10), 1); save(); schedulePushSettings(); renderDepoEditor();
    });
    const add = $('#btnAddDepo');
    if (add) add.addEventListener('click', () => { depoArr().push({ nome: '', local: '', texto: '' }); save(); renderDepoEditor(); });
  })();

  // ---- editor de OBRAS ENTREGUES (fotos de instalações) ----
  const obrasArr = () => Array.isArray(P().obras) ? P().obras : (P().obras = []);
  function renderObrasEditor() {
    const box = $('#obrasEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;
    const arr = obrasArr();
    box.innerHTML = arr.length ? arr.map((o, i) => `
      <div class="qarow" data-i="${i}">
        <input class="qarow__q" data-obra-img="${i}" type="url" value="${esc(o.img || '')}" placeholder="URL da foto (hospedada — ex.: link do Storage)" />
        <input class="qarow__q" data-obra-titulo="${i}" type="text" value="${esc(o.titulo || '')}" placeholder="Título (ex.: Academia Alpha)" />
        <input class="qarow__q" data-obra-local="${i}" type="text" value="${esc(o.local || '')}" placeholder="Cidade/UF" />
        <button class="qarow__x" type="button" data-obra-rm="${i}" title="Remover">✕</button>
      </div>`).join('') : '<p class="atv__empty">Nenhuma obra ainda. Adicione fotos de academias montadas — é a prova social mais forte do site.</p>';
  }
  (function wireObrasEditor() {
    const box = $('#obrasEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const im = e.target.closest('[data-obra-img]'), t = e.target.closest('[data-obra-titulo]'), l = e.target.closest('[data-obra-local]');
      const el = im || t || l; if (!el) return;
      const i = parseInt(el.dataset.obraImg || el.dataset.obraTitulo || el.dataset.obraLocal, 10);
      if (!obrasArr()[i]) obrasArr()[i] = { img: '', titulo: '', local: '' };
      if (im) obrasArr()[i].img = im.value.trim();
      if (t) obrasArr()[i].titulo = t.value;
      if (l) obrasArr()[i].local = l.value;
      save(); schedulePushSettings();
    });
    box.addEventListener('click', e => {
      const rm = e.target.closest('[data-obra-rm]'); if (!rm) return;
      obrasArr().splice(parseInt(rm.dataset.obraRm, 10), 1); save(); schedulePushSettings(); renderObrasEditor();
    });
    const add = $('#btnAddObra');
    if (add) add.addEventListener('click', () => { obrasArr().push({ img: '', titulo: '', local: '' }); save(); renderObrasEditor(); });
  })();

  // ---- editor de FOTOS DO CT (página ct.html) ----
  const ctFotosArr = () => Array.isArray(P().ctFotos) ? P().ctFotos : (P().ctFotos = []);
  function renderCtFotosEditor() {
    const box = $('#ctFotosEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;
    const arr = ctFotosArr();
    box.innerHTML = arr.length ? arr.map((o, i) => `
      <div class="qarow" data-i="${i}">
        <input class="qarow__q" data-ctf-img="${i}" type="url" value="${esc(o.img || '')}" placeholder="URL da foto (hospedada — ex.: link do Storage)" />
        <input class="qarow__q" data-ctf-titulo="${i}" type="text" value="${esc(o.titulo || '')}" placeholder="Legenda (ex.: Área de força)" />
        <button class="qarow__x" type="button" data-ctf-rm="${i}" title="Remover">✕</button>
      </div>`).join('') : '<p class="atv__empty">Nenhuma foto ainda. As fotos aparecem na página do CT (ct.html).</p>';
  }
  (function wireCtFotosEditor() {
    const box = $('#ctFotosEditor'); if (!box) return;
    box.addEventListener('input', e => {
      const im = e.target.closest('[data-ctf-img]'), t = e.target.closest('[data-ctf-titulo]');
      const el = im || t; if (!el) return;
      const i = parseInt(el.dataset.ctfImg || el.dataset.ctfTitulo, 10);
      if (!ctFotosArr()[i]) ctFotosArr()[i] = { img: '', titulo: '' };
      if (im) ctFotosArr()[i].img = im.value.trim();
      if (t) ctFotosArr()[i].titulo = t.value;
      save(); schedulePushSettings();
    });
    box.addEventListener('click', e => {
      const rm = e.target.closest('[data-ctf-rm]'); if (!rm) return;
      ctFotosArr().splice(parseInt(rm.dataset.ctfRm, 10), 1); save(); schedulePushSettings(); renderCtFotosEditor();
    });
    const add = $('#btnAddCtFoto');
    if (add) add.addEventListener('click', () => { ctFotosArr().push({ img: '', titulo: '' }); save(); renderCtFotosEditor(); });
  })();

  // ---- editor de BLOG (artigos) ----
  const blogArr = () => Array.isArray(P().blog) ? P().blog : (P().blog = []);
  let postCapaIdx = -1;
  function renderBlogEditor() {
    const box = $('#blogEditor'); if (!box) return;
    if (box.contains(document.activeElement)) return;
    const arr = blogArr();
    box.innerHTML = arr.length ? arr.map((p, i) => `
      <div class="postrow" data-i="${i}">
        <input class="postrow__t" data-post-titulo="${i}" type="text" value="${esc(p.titulo || '')}" placeholder="Título do artigo" />
        <input class="postrow__r" data-post-resumo="${i}" type="text" value="${esc(p.resumo || '')}" placeholder="Resumo (1 linha, aparece na lista)" />
        <textarea class="postrow__c" data-post-conteudo="${i}" rows="4" placeholder="Conteúdo. Deixe uma linha em branco entre parágrafos. Use ## para subtítulos e - para listas.">${esc(p.conteudo || '')}</textarea>
        <div class="postrow__meta">
          <input class="postrow__a" data-post-autor="${i}" type="text" value="${esc(p.autor || '')}" placeholder="Autor" />
          <input class="postrow__d" data-post-data="${i}" type="date" value="${esc(p.data || '')}" />
          <button class="postrow__capa ${p.capa ? 'on' : ''}" type="button" data-post-capa="${i}">${p.capa ? '🖼 ✓' : '🖼 Capa'}</button>
          <label class="postrow__pub"><input type="checkbox" data-post-pub="${i}" ${p.publicado ? 'checked' : ''} /> Publicado</label>
          <button class="postrow__x" type="button" data-post-rm="${i}" title="Remover">✕</button>
        </div>
      </div>`).join('') : '<p class="atv__empty">Nenhum artigo ainda.</p>';
  }
  (function wireBlogEditor() {
    const box = $('#blogEditor'); if (!box) return;
    const field = { 'postTitulo': 'titulo', 'postResumo': 'resumo', 'postConteudo': 'conteudo', 'postAutor': 'autor', 'postData': 'data' };
    box.addEventListener('input', e => {
      for (const key in field) {
        const el = e.target.closest(`[data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}]`);
        if (el) { const i = parseInt(el.dataset[key], 10); if (!blogArr()[i]) blogArr()[i] = {}; blogArr()[i][field[key]] = el.value; save(); schedulePushSettings(); return; }
      }
    });
    box.addEventListener('change', e => {
      const pub = e.target.closest('[data-post-pub]');
      if (pub) { const i = parseInt(pub.dataset.postPub, 10); if (!blogArr()[i]) blogArr()[i] = {}; blogArr()[i].publicado = pub.checked; if (pub.checked && !blogArr()[i].slug) blogArr()[i].slug = slugify(blogArr()[i].titulo); save(); schedulePushSettings(); }
    });
    box.addEventListener('click', e => {
      const rm = e.target.closest('[data-post-rm]');
      if (rm) { blogArr().splice(parseInt(rm.dataset.postRm, 10), 1); save(); schedulePushSettings(); renderBlogEditor(); return; }
      const capa = e.target.closest('[data-post-capa]');
      if (capa) { postCapaIdx = parseInt(capa.dataset.postCapa, 10); $('#postCapaFile').click(); return; }
    });
    const add = $('#btnAddPost');
    if (add) add.addEventListener('click', () => { blogArr().push({ titulo: '', resumo: '', conteudo: '', autor: (Cloud.profile && Cloud.profile.nome) || 'Torque Fitness', data: new Date().toISOString().slice(0, 10), capa: '', publicado: false }); save(); renderBlogEditor(); });
    const cf = $('#postCapaFile');
    if (cf) cf.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file || postCapaIdx < 0) return;
      toast('Enviando capa…');
      try {
        const { blob, dataUrl } = await resizeImage(file, 1200, 0.74);
        let url = dataUrl; try { url = await Cloud.uploadProductImage(blob, 'jpg'); } catch (err) { console.warn('capa:', err); }
        if (!blogArr()[postCapaIdx]) blogArr()[postCapaIdx] = {};
        blogArr()[postCapaIdx].capa = url; save(); schedulePushSettings(); renderBlogEditor();
        toast('Capa salva.');
      } catch (err) { console.error(err); toast('Não foi possível ler a imagem.'); }
    });
  })();

  // ---- gestão de EQUIPE (vendedores): promover/rebaixar e ativar/desativar ----
  const VEND_SQL_HELP =
    'Para ativar/desativar vendedores e mudar funções pelo painel, abra o Supabase → SQL Editor e rode:\n\n' +
    '-- 1) coluna de status\n' +
    'alter table public.profiles add column if not exists ativo boolean not null default true;\n\n' +
    '-- 2) deixar o admin gerenciar os perfis (usa a função is_admin já criada antes)\n' +
    'create policy profiles_admin_manage on public.profiles for update to authenticated\n' +
    '  using (public.is_admin()) with check (public.is_admin());\n\n' +
    'Depois recarregue a página.';
  let vendCache = null;
  function renderVendEditor() {
    const box = $('#vendEditor'); if (!box) return;
    if (!(Cloud.isAdmin && Cloud.isAdmin())) { box.innerHTML = ''; return; }
    if (!vendCache) {
      box.innerHTML = '<p class="atv__empty">Carregando equipe…</p>';
      Cloud.listVendedores().then(l => { vendCache = l; renderVendList(); })
        .catch(e => { console.error(e); box.innerHTML = '<p class="atv__empty">Não foi possível carregar a equipe.</p>'; });
      return;
    }
    renderVendList();
  }
  function renderVendList() {
    const box = $('#vendEditor'); if (!box) return;
    const me = Cloud.profile && Cloud.profile.id;
    box.innerHTML = (vendCache && vendCache.length) ? vendCache.map(v => {
      const admin = v.role === 'admin', ativo = v.ativo !== false, ehEu = v.id === me;
      const tags = `${admin ? '<i class="vtag vtag--admin">Admin</i>' : '<i class="vtag">Vendedor</i>'}` +
        `${ativo ? '' : '<i class="vtag vtag--off">Inativo</i>'}${ehEu ? '<i class="vtag">você</i>' : ''}`;
      const acts = ehEu ? '' :
        `<button class="vendrow__btn" data-act="role" data-role="${admin ? 'vendedor' : 'admin'}" type="button">${admin ? 'Rebaixar' : 'Promover'}</button>` +
        `<button class="vendrow__btn ${ativo ? 'off' : 'on'}" data-act="ativo" data-ativo="${ativo ? 'false' : 'true'}" type="button">${ativo ? 'Desativar' : 'Ativar'}</button>`;
      return `<div class="vendrow ${ativo ? '' : 'is-off'}" data-vid="${v.id}">
        <div class="vendrow__info"><b>${esc(v.nome || '—')}</b><span class="vendrow__tags">${tags}</span></div>
        <div class="vendrow__act">${acts}</div>
      </div>`;
    }).join('') : '<p class="atv__empty">Nenhum vendedor cadastrado ainda.</p>';
  }
  (function wireVendEditor() {
    const box = $('#vendEditor'); if (!box) return;
    box.addEventListener('click', async e => {
      const row = e.target.closest('[data-vid]'); if (!row) return;
      const id = row.dataset.vid;
      const roleBtn = e.target.closest('[data-act="role"]');
      const ativoBtn = e.target.closest('[data-act="ativo"]');
      try {
        if (roleBtn) {
          const novo = roleBtn.dataset.role;
          if (!confirm(novo === 'admin' ? 'Promover a ADMIN? A pessoa passará a ver custos e poderá editar tudo.' : 'Rebaixar este admin para vendedor?')) return;
          await Cloud.updateVendedor(id, { role: novo }); toast('Função atualizada.');
        } else if (ativoBtn) {
          const novo = ativoBtn.dataset.ativo === 'true';
          await Cloud.updateVendedor(id, { ativo: novo }); toast(novo ? 'Vendedor ativado.' : 'Vendedor desativado.');
        } else return;
        vendCache = null; renderVendEditor();
      } catch (err) {
        console.error(err);
        if (isMissingCol(err)) alert(VEND_SQL_HELP);
        else if (err && err.code === 'NO_UPDATE') alert(VEND_SQL_HELP);
        else toast('Não foi possível atualizar.');
      }
    });
  })();

  function renderPeople() {
    const v = currentVendedor();
    $('#qpVendedor').textContent = v ? v.nome : '—';
    const cSel = $('#selCliente');
    cSel.innerHTML = '<option value="">— selecione —</option>' +
      state.clientes.map(c => `<option value="${c.id}" ${c.id === Q().clienteId ? 'selected' : ''}>${esc(c.nome)}${c.empresa ? ' · ' + esc(c.empresa) : ''}</option>`).join('');
    $('#btnEditCliente').disabled = !Q().clienteId;
  }

  function renderSummary() {
    clampDescVendedor();          // garante a alçada do vendedor também ao carregar/editar
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
  let _repriceMsgT = null;
  function repriceFeedback(r) {
    clearTimeout(_repriceMsgT);
    _repriceMsgT = setTimeout(() => {
      if (r.updated > 0) toast(r.updated + ' máquina(s) reprecificada(s).');
      else if (!r.costsLoaded) toast('Custos não carregados — destrave com a senha para o câmbio/margem valer.');
      else if (r.locked > 0) toast('Preços travados — use “Recalcular preços pelo custo”.');
    }, 700);
  }
  Object.keys(CFG_MAP).forEach(sel => {
    $(sel).addEventListener('input', () => {
      P()[CFG_MAP[sel]] = num($(sel).value) || 0;
      if (sel !== '#cfgJuros') {
        const r = recalcAll();                 // juros não altera preço, só parcela
        if (r.updated > 0) schedulePushSettings();   // publica os preços novos p/ equipe e site
        repriceFeedback(r);
      }
      save(); renderGrid(); renderSummary();
      if (sel === '#cfgJuros') schedulePushSettings();   // juros é parâmetro compartilhado
    });
  });
  $('#cfgParcelas').addEventListener('input', () => { P().parcelasMax = Math.max(1, parseInt($('#cfgParcelas').value, 10) || 1); save(); renderSummary(); schedulePushSettings(); });
  $('#cfgValidade').addEventListener('input', () => { P().validade = Math.max(1, parseInt($('#cfgValidade').value, 10) || 1); save(); schedulePushSettings(); });
  // cadastro fixo da empresa vendedora (usado no contrato de compra e venda)
  const EMP_FIELDS = { empRazao: 'razao', empCnpj: 'cnpj', empEndereco: 'endereco', empRep: 'rep', empCargo: 'cargo', empCpf: 'cpf', empCidade: 'cidade' };
  Object.keys(EMP_FIELDS).forEach(id => {
    const el = $('#' + id); if (!el) return;
    el.addEventListener('input', () => {
      P().contrato = P().contrato || {};
      P().contrato[EMP_FIELDS[id]] = el.value.trim();
      save(); schedulePushSettings();
    });
  });
  $('#cfgComissao') && $('#cfgComissao').addEventListener('input', () => { P().comissao = Math.max(0, num($('#cfgComissao').value) || 0); save(); schedulePushSettings(); if (dashView === 'metrics' && !$('#dashScreen').hidden) renderDashboard(); });
  $('#cfgDescMaxVend') && $('#cfgDescMaxVend').addEventListener('input', () => { P().descontoMaxVendedor = Math.max(0, num($('#cfgDescMaxVend').value) || 0); save(); schedulePushSettings(); });

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

  // alçada de desconto: limita o desconto do vendedor (admin não tem limite)
  function clampDescVendedor() {
    const cap = Number(P().descontoMaxVendedor) || 0;
    if (cap <= 0 || (Cloud.isAdmin && Cloud.isAdmin())) return false;
    const q = Q(), subtotal = cartTotal();
    if (q.descMode === 'brl') {
      const capBRL = Math.round(subtotal * cap) / 100;
      if (q.descValue > capBRL) { q.descValue = capBRL; return true; }
    } else if (q.descValue > cap) { q.descValue = cap; return true; }
    return false;
  }
  // desconto / sinal (vendedor)
  $('#inpDesconto').addEventListener('input', e => {
    state.quote.descValue = num(e.target.value) || 0;
    const clamped = clampDescVendedor();
    save(); renderSummary();
    if (clamped) toast(`Desconto máximo de ${P().descontoMaxVendedor}% para vendedor — ajustado.`);
  });
  $('#inpSinal').addEventListener('input', e => { state.quote.sinal = num(e.target.value) || 0; save(); renderSummary(); });
  $('#discToggle').addEventListener('click', () => {
    state.quote.descMode = state.quote.descMode === 'brl' ? 'pct' : 'brl';
    clampDescVendedor(); save(); renderSummary();
  });

  /* ------------------------------------------------------------
     KITS / COMBOS — salvar o carrinho atual e reaplicar com 1 toque
     ------------------------------------------------------------ */
  const kitsArr = () => Array.isArray(P().kits) ? P().kits : [];
  function saveKitFromCart() {
    const lines = cartLines();
    if (!lines.length) { toast('Adicione produtos ao carrinho para salvar como kit.'); return; }
    const nome = (prompt('Nome do kit (ex.: Academia 100m²):') || '').trim();
    if (!nome) return;
    const itens = lines.map(l => ({ codigo: l.p.codigo, qtd: l.q })).filter(i => i.codigo);
    if (!itens.length) { toast('Os itens precisam ter código para virar kit.'); return; }
    const arr = kitsArr().slice(); arr.push({ id: uid(), nome, itens });
    P().kits = arr; save(); schedulePushSettings();
    toast(`Kit "${nome}" salvo (${itens.length} item(ns)).`);
  }
  function kitResumo(k) {
    return (k.itens || []).map(i => { const p = state.products.find(x => x.codigo === i.codigo); return `${i.qtd}× ${p ? p.nome : i.codigo}`; }).join(' · ');
  }
  function renderKitsList() {
    const box = $('#kitsList'); if (!box) return;
    const arr = kitsArr(), admin = Cloud.isAdmin && Cloud.isAdmin();
    box.innerHTML = arr.length ? arr.map(k => `
      <div class="kitrow" data-kit="${k.id}">
        <div class="kitrow__info"><b class="kitrow__name">${esc(k.nome)}</b><span class="kitrow__items">${esc(kitResumo(k))}</span></div>
        <div class="kitrow__act">
          <button class="btn btn--primary kitrow__add" data-act="kit-add" type="button">Adicionar</button>
          ${admin ? `<button class="kitrow__rm" data-act="kit-rm" type="button" title="Excluir kit">🗑</button>` : ''}
        </div>
      </div>`).join('')
      : `<p class="atv__empty">Nenhum kit salvo ainda.${(admin ? ' Monte um carrinho e use “💾 Salvar kit”.' : '')}</p>`;
  }
  function applyKit(k) {
    let faltando = 0;
    (k.itens || []).forEach(i => {
      const p = state.products.find(x => x.codigo === i.codigo);
      if (p) state.cart[p.id] = (state.cart[p.id] || 0) + (Number(i.qtd) || 0); else faltando++;
    });
    save(); render();
    $('#summaryBar').classList.add('open');
    toast(`Kit "${k.nome}" adicionado.${faltando ? ` (${faltando} item fora do catálogo)` : ''}`);
  }
  $('#btnKits') && $('#btnKits').addEventListener('click', () => { renderKitsList(); openModal('#kitsModal'); });
  $('#btnSaveKit') && $('#btnSaveKit').addEventListener('click', saveKitFromCart);
  $('#kitsList') && $('#kitsList').addEventListener('click', e => {
    const row = e.target.closest('[data-kit]'); if (!row) return;
    const k = kitsArr().find(x => x.id === row.dataset.kit); if (!k) return;
    if (e.target.closest('[data-act="kit-add"]')) { applyKit(k); closeModal('#kitsModal'); return; }
    if (e.target.closest('[data-act="kit-rm"]')) {
      if (!confirm(`Excluir o kit "${k.nome}"?`)) return;
      P().kits = kitsArr().filter(x => x.id !== k.id); save(); schedulePushSettings(); renderKitsList(); toast('Kit excluído.');
    }
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
    $('#clEndereco').value = c ? (c.endereco || '') : '';
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
      cidade: $('#clCidade').value.trim(), endereco: $('#clEndereco').value.trim(), obs: $('#clObs').value.trim()
    };
    try {
      let saved;
      try { saved = await Cloud.saveCliente(dados); }
      catch (err) {
        if (isMissingCol(err) && dados.endereco) {      // banco sem a coluna → guarda no obs
          dados.obs = ['Endereço: ' + dados.endereco, dados.obs].filter(Boolean).join(' | ');
          delete dados.endereco;
          saved = await Cloud.saveCliente(dados);
        } else throw err;
      }
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
    $('#edTipo').value = (p && p.tipo) || 'maquina';
    $('#edNome').value = p ? p.nome : '';
    $('#edImagem').value = p ? p.imagem : '';
    setImgPreview(p ? p.imagem : '');
    $('#edCusto').value = (p && temCusto(p)) ? fobDe(p) : '';
    $('#edDims').value = p ? (p.dims || '') : '';
    $('#edDisp') && ($('#edDisp').value = p ? (p.disp || '') : '');
    $('#edGrupo') && ($('#edGrupo').value = p ? (p.grupo || '') : '');
    $('#edSelo') && ($('#edSelo').value = p ? (p.selo || '') : '');
    edGaleria = (p && Array.isArray(p.imagens)) ? p.imagens.slice() : [];
    renderEdGaleria();
    $('#edVideo') && ($('#edVideo').value = p ? (p.video || '') : '');
    $('#edMargem').value = (p && p.margem != null) ? p.margem : '';
    // mostra o preço atual quando ele é travado OU quando não há custo para recalcular
    // (produtos do catálogo público têm preço direto, sem custo) — evita o campo vir vazio
    $('#edPreco').value = (p && (p.travado || !temCusto(p)) && p.preco != null) ? p.preco : '';
    $('#edOculto').checked = p ? !!p.oculto : false;
    $('#btnDeleteProduct').style.display = p ? '' : 'none';
    updateEditPreview();
    openModal('#editModal');
  }
  function readEditForm() {
    return {
      codigo: $('#edCodigo').value.trim(),
      serie: $('#edSerie').value.trim() || 'Geral',
      tipo: $('#edTipo').value || 'maquina',
      nome: $('#edNome').value.trim(),
      imagem: $('#edImagem').value.trim(),
      dims: $('#edDims').value.trim(),
      disp: ($('#edDisp') && $('#edDisp').value.trim()) || '',
      grupo: ($('#edGrupo') && $('#edGrupo').value) || '',
      selo: ($('#edSelo') && $('#edSelo').value) || '',
      imagens: edGaleria.slice(),
      video: ($('#edVideo') && $('#edVideo').value.trim()) || '',
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
      let url = dataUrl, naNuvem = false, motivo = '';
      try { url = await Cloud.uploadProductImage(blob, 'jpg'); naNuvem = true; }
      catch (err) { console.warn('Storage falhou:', err); motivo = (err && (err.message || err.error || err.name)) || 'erro'; }
      $('#edImagem').value = url; setImgPreview(url);
      toast(naNuvem ? 'Imagem enviada.' : ('Imagem local — Storage falhou: ' + motivo));
    } catch (err) { console.error(err); toast('Não foi possível ler a imagem.'); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  // ---- importação de fotos em massa via ZIP (arquivos nomeados pelo código do produto) ----
  const normCode = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '');
  function setFotosStatus(html, show) {
    const el = $('#fotosImportStatus'); if (!el) return;
    el.hidden = show === false; el.innerHTML = html || '';
  }
  async function importarFotosZip(file) {
    const sizeMB = Math.round((file.size || 0) / 1048576);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    if (mobile && sizeMB > 200) {
      setFotosStatus(`Este arquivo tem <b>${sizeMB} MB</b>. No celular o navegador trava ao abrir arquivos grandes. Faça a importação <b>no computador</b> (Chrome/Edge), ou divida o ZIP em partes menores (~150 MB cada) — pode importar várias vezes, uma parte por vez.`, true);
      return;
    }
    if (sizeMB > 400 && !confirm(`O arquivo tem ${sizeMB} MB. Abrir um ZIP tão grande exige bastante memória do navegador e pode travar.\n\nO ideal é dividir em partes de ~150 MB. Tentar mesmo assim?`)) { setFotosStatus('', false); return; }
    setFotosStatus(`Lendo o arquivo (${sizeMB} MB)… isso pode levar um tempo com arquivos grandes. Não feche a aba.`, true);
    let JSZipCtor = window.JSZip;
    if (!JSZipCtor) { try { await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'); } catch (e) {} JSZipCtor = window.JSZip; }
    if (!JSZipCtor) { setFotosStatus('Não consegui carregar o leitor de ZIP (sem internet?).'); return; }
    let zip;
    try { zip = await JSZipCtor.loadAsync(file); }
    catch (e) { setFotosStatus(`Não consegui abrir o ZIP (${sizeMB} MB) — provável falta de memória do navegador. Tente no computador ou divida em partes menores.`); return; }
    const byCode = {};
    state.products.forEach(p => { if (p.codigo) byCode[normCode(p.codigo)] = p; });
    const imgs = [];
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const base = path.split('/').pop();
      if (/(^|\/)__macosx/i.test(path) || base.startsWith('.')) return;
      if (!/\.(jpe?g|png|webp)$/i.test(base)) return;
      imgs.push({ entry, base });
    });
    if (!imgs.length) { setFotosStatus('Nenhuma imagem (.jpg/.png/.webp) encontrada no ZIP.'); return; }
    const matched = [], unmatched = [];
    imgs.forEach(it => {
      const stem = it.base.replace(/\.[^.]+$/, '');
      const tok = (stem.match(/[a-z0-9]+/i) || [''])[0];   // 1º bloco (código no padrão "CODIGO_nome")
      const p = byCode[normCode(stem)] || (tok.length >= 3 ? byCode[normCode(tok)] : null);
      if (p) matched.push({ entry: it.entry, base: it.base, p }); else unmatched.push(it.base);
    });
    if (!matched.length) {
      setFotosStatus(`Nenhuma foto casou com os códigos dos produtos (${imgs.length} imagens lidas). Confira se os arquivos estão nomeados pelo código, ex.: <b>A701.jpg</b>.`);
      return;
    }
    if (!confirm(`Encontrei ${matched.length} fotos que casam com produtos (de ${imgs.length} no ZIP).\n\nVou otimizar cada uma e enviar para o site. Pode levar alguns minutos — não feche esta aba. Continuar?`)) { setFotosStatus('', false); return; }
    let done = 0, ok = 0, fail = 0, firstErr = ''; const total = matched.length;
    const tick = () => setFotosStatus(`Enviando fotos… <b>${done}/${total}</b> (${ok} enviadas, ${fail} falhas)`, true);
    tick();
    let idx = 0;
    async function worker() {
      while (idx < matched.length) {
        const m = matched[idx++];
        try {
          const blob = await m.entry.async('blob');
          const { blob: rb } = await resizeImage(blob, 1500, 0.82);
          const url = await Cloud.uploadProductImage(rb, 'jpg');
          if (!url || String(url).startsWith('data:')) throw new Error('upload não retornou URL pública');
          m.p.imagem = url; ok++;
        } catch (e) {
          fail++; if (!firstErr) firstErr = (e && (e.message || e.error || e.name)) || 'erro';
          console.warn('falha na foto', m.base, e);
        }
        done++; tick();
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    const ehAdmin = !!(Cloud.isAdmin && Cloud.isAdmin());
    if (ok > 0) { save(); render(); if (ehAdmin) schedulePushSettings(); }   // publica só se for admin
    const semFoto = state.products.filter(p => p.codigo && !p.imagem).map(p => p.codigo);
    let resumo;
    if (ok === 0) {
      // tudo falhou — o motivo quase sempre é o Storage do Supabase (login/admin/bucket)
      resumo = `<b>Nenhuma foto foi enviada.</b> Motivo: ${esc(firstErr || 'desconhecido')}. ` +
        'Verifique se você está <b>logado como admin</b> e se o <b>Storage do Supabase</b> está ativo (mesmo upload usado ao trocar a foto de 1 produto).';
    } else {
      resumo = `<b>Concluído:</b> ${ok} foto(s) enviada(s)`;
      if (fail) resumo += ` · ${fail} falha(s)${firstErr ? ' (' + esc(firstErr) + ')' : ''}`;
      if (unmatched.length) resumo += ` · ${unmatched.length} foto(s) do ZIP sem produto correspondente`;
      if (semFoto.length) resumo += ` · ${semFoto.length} produto(s) ainda sem foto`;
      resumo += ehAdmin ? '. O catálogo está sendo publicado no site.' : '. <b>Atenção:</b> você não está como admin, então as fotos foram salvas mas <b>não</b> publicadas no site público.';
    }
    setFotosStatus(resumo, true);
    toast(ok > 0 ? 'Importação de fotos concluída.' : 'Importação falhou — veja a mensagem.');
    if (unmatched.length) console.log('Fotos do ZIP sem produto correspondente:', unmatched);
    if (semFoto.length) console.log('Produtos ainda sem foto (códigos):', semFoto);
  }
  if ($('#btnImportFotos')) $('#btnImportFotos').addEventListener('click', () => $('#fotosZipInput').click());
  if ($('#fotosZipInput')) $('#fotosZipInput').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const btn = $('#btnImportFotos'), old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
    try { await importarFotosZip(file); }
    catch (err) { console.error(err); setFotosStatus('Erro inesperado: ' + ((err && err.message) || err)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  });

  // ---- galeria de fotos extras do produto ----
  let edGaleria = [];
  function renderEdGaleria() {
    const box = $('#edGaleria'); if (!box) return;
    box.innerHTML = edGaleria.length
      ? edGaleria.map((u, i) => `<div class="galpick__item"><img src="${esc(u)}" alt="" /><button type="button" class="galpick__x" data-gal-rm="${i}" title="Remover">✕</button></div>`).join('')
      : '<span class="galpick__empty">Nenhuma foto extra.</span>';
  }
  if ($('#edGaleria')) $('#edGaleria').addEventListener('click', e => {
    const rm = e.target.closest('[data-gal-rm]'); if (!rm) return;
    edGaleria.splice(parseInt(rm.dataset.galRm, 10), 1); renderEdGaleria();
  });
  if ($('#btnAddFoto')) $('#btnAddFoto').addEventListener('click', () => $('#edFotoFile').click());
  if ($('#edFotoFile')) $('#edFotoFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const btn = $('#btnAddFoto'), old = btn.textContent; btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const { blob, dataUrl } = await resizeImage(file, 1000, 0.72);
      let url = dataUrl, naNuvem = false;
      try { url = await Cloud.uploadProductImage(blob, 'jpg'); naNuvem = true; } catch (err) { console.warn('Storage:', err); }
      edGaleria.push(url); renderEdGaleria();
      toast(naNuvem ? 'Foto adicionada.' : 'Foto local — ative o Storage para aparecer no site.');
    } catch (err) { console.error(err); toast('Não foi possível ler a imagem.'); }
    finally { btn.disabled = false; btn.textContent = old; }
  });

  $('#btnSaveProduct').addEventListener('click', () => {
    const f = readEditForm();
    if (!f.nome) { toast('Informe o nome do produto.'); return; }
    const p = editingId ? state.products.find(x => x.id === editingId) : { id: uid() };
    p.codigo = f.codigo; p.serie = f.serie; p.tipo = f.tipo; p.nome = f.nome; p.imagem = f.imagem;
    p.dims = f.dims; p.disp = f.disp; p.grupo = f.grupo; p.selo = f.selo; p.imagens = f.imagens; p.video = f.video; p.fob = f.fob; p.margem = f.margem; p.oculto = f.oculto;
    if (f.precoInput != null) { p.preco = f.precoInput; p.travado = true; }   // preço travado manual
    else if (custoBRL(f) > 0) { p.travado = false; p.preco = r2(precoCalculado(p)); }  // automático a partir do custo
    else { p.travado = false; if (p.preco == null) p.preco = 0; }             // sem custo nem preço digitado: preserva o preço atual
    if (!editingId) state.products.push(p);
    save(); schedulePushSettings(); closeModal('#editModal'); render(); toast('Produto salvo.');
  });
  // Custos FOB em lote: cola "CÓDIGO FOB" por linha, aplica, destrava e recalcula.
  $('#btnFobLote') && $('#btnFobLote').addEventListener('click', () => {
    if (!unlocked) { toast('Destrave com a senha para carregar custos.'); openPasswordModal(); return; }
    const byCode = {};
    state.products.forEach(p => { if (p.codigo) byCode[String(p.codigo).toUpperCase()] = p; });
    let ok = 0; const naoAchei = [];
    ($('#fobLote').value || '').split(/\n+/).forEach(l => {
      const m = l.trim().match(/^([A-Za-z0-9._-]+)[\s;,:\t]+\$?\s*(\d+(?:[.,]\d+)?)$/);
      if (!m) return;
      const p = byCode[m[1].toUpperCase()];
      const fob = parseFloat(m[2].replace(',', '.'));
      if (!p) { naoAchei.push(m[1].toUpperCase()); return; }
      if (isFinite(fob) && fob > 0) { p.fob = fob; p.travado = false; ok++; }
    });
    if (!ok && !naoAchei.length) { toast('Nada para aplicar — use uma linha por produto: CÓDIGO FOB (ex.: A501 450).'); return; }
    const r = recalcAll();
    save(); schedulePushSettings(); render();
    if (ok) $('#fobLote').value = '';
    toast(`FOB aplicado em ${ok} produto(s) · ${r.updated} preço(s) recalculado(s)` +
      (naoAchei.length ? ` · não encontrei: ${naoAchei.slice(0, 4).join(', ')}${naoAchei.length > 4 ? '…' : ''}` : ''));
  });
  // Recalcular preços pelo custo: destrava os itens COM custo e aplica câmbio × margem atuais.
  $('#btnRecalcPrices') && $('#btnRecalcPrices').addEventListener('click', () => {
    if (!unlocked) { toast('Destrave com a senha para carregar os custos.'); openPasswordModal(); return; }
    const comCusto = state.products.filter(temCusto).length;
    if (!comCusto) { toast('Nenhum produto tem custo carregado. Destrave com a senha.'); return; }
    const travados = state.products.filter(p => temCusto(p) && p.travado).length;
    if (!confirm(
      'Recalcular os preços de venda a partir do custo (câmbio × margem atuais)?\n\n' +
      'Recalcula ' + comCusto + ' máquina(s) com custo' + (travados ? ' e destrava ' + travados + ' preço(s) manual(is)' : '') + '.\n' +
      'Produtos sem custo não são alterados.'
    )) return;
    state.products.forEach(p => { if (temCusto(p)) p.travado = false; });
    const r = recalcAll();
    schedulePushSettings(); render();
    toast(r.updated + ' máquina(s) recalculada(s).');
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

  const scriptsPendentes = {};   // src → Promise (evita "tag existe mas ainda não carregou")
  function loadScript(src) {
    if (!scriptsPendentes[src]) {
      scriptsPendentes[src] = new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = src;
        const falha = () => { delete scriptsPendentes[src]; s.remove(); rej(new Error('falha ao carregar componente')); };
        const prazo = setTimeout(falha, 20000);   // rede pendurada vira erro visível
        s.onload = () => { clearTimeout(prazo); res(); };
        s.onerror = () => { clearTimeout(prazo); falha(); };   // some do mapa → próximo clique tenta de novo
        document.head.appendChild(s);
      });
    }
    return scriptsPendentes[src];
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
    if ($('#impReplace').checked) {
      const atuais = state.products.length;
      if (!confirm(
        '⚠️ SUBSTITUIR catálogo?\n\n' +
        'Isto APAGA os ' + atuais + ' produto(s) atuais (e suas linhas) e deixa só os ' +
        imported.length + ' da planilha.\n\n' +
        'Para apenas ADICIONAR os itens da planilha, cancele e DESMARQUE "Substituir catálogo".'
      )) return;
      state.products = imported; state.cart = {};
    }
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
    buildQuoteDoc(); openModal('#quoteModal'); registrarOrcamento(); prepararShareQuote();
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

  // Trava-segurança: converte qualquer etapa pendurada em erro visível
  // (sem isso, uma captura que não termina deixa o botão "mudo" no iPhone).
  function comPrazo(promise, ms, etapa) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(etapa + ' demorou demais — tente de novo')), ms))]);
  }
  // O iPhone limita o canvas a ~16,7 milhões de pixels: acima disso a captura
  // sai em branco ou nunca termina. Reduz a escala para caber com folga.
  function escalaSegura(el, desejada) {
    const w = Math.max(1, el.scrollWidth), h = Math.max(1, el.scrollHeight);
    const s = Math.min(desejada, Math.sqrt(12e6 / (w * h)));
    return Math.max(0.75, Math.round(s * 100) / 100);
  }
  function conferirCaptura(canvas) {
    if (!canvas || !canvas.width || !canvas.height) throw new Error('captura vazia');
    const data = canvas.toDataURL('image/jpeg', 0.92);
    if (!data || data.indexOf('data:image') !== 0 || data.length < 1000) throw new Error('captura vazia');
    return data;
  }
  // Paginação consciente: o corte de página acontece só em fronteiras seguras
  // (entre linhas da tabela e blocos) — nunca no meio de uma foto ou de um texto.
  function adicionarPaginado(pdf, canvas, el, seletor) {
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const rect = el.getBoundingClientRect();
    const razao = canvas.height / Math.max(1, rect.height);   // px do canvas por px do documento
    const cortes = new Set([canvas.height]);
    el.querySelectorAll(seletor).forEach(n => {
      const y = Math.round((n.getBoundingClientRect().top - rect.top) * razao);
      if (y > 0 && y < canvas.height) cortes.add(y);
    });
    const pontos = Array.from(cortes).sort((a, b) => a - b);
    const paginaPx = canvas.width * ph / pw;                  // altura de uma página A4 em px do canvas
    let inicio = 0, primeira = true;
    while (inicio < canvas.height - 2) {
      const alvo = inicio + paginaPx;
      let fim = -1;
      for (const p of pontos) { if (p > inicio + paginaPx * 0.25 && p <= alvo) fim = p; }
      if (fim < 0) fim = Math.min(alvo, canvas.height);       // bloco maior que a página: corte duro
      const fatia = document.createElement('canvas');
      fatia.width = canvas.width; fatia.height = Math.max(1, Math.round(fim - inicio));
      const cx = fatia.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, fatia.width, fatia.height);
      cx.drawImage(canvas, 0, inicio, canvas.width, fatia.height, 0, 0, canvas.width, fatia.height);
      if (!primeira) pdf.addPage();
      primeira = false;
      pdf.addImage(fatia.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, fatia.height * pw / canvas.width);
      inicio = fim;
    }
  }
  const SELETOR_QUOTE = '.qd__table tbody tr, .qd__parties, .qd__table, .qd__totals, .qd__install, .qd__cond, .qd__foot';
  // Monta o PDF A4 paginado a partir do documento (#quoteDoc).
  // Usado pelo botão PDF (salvar) e pelo Compartilhar (arquivo).
  async function montarPdfQuote(avisar = () => {}) {
    const el = $('#quoteDoc');
    if (!el) throw new Error('sem documento');
    avisar('Carregando componentes…');
    await comPrazo(Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')
    ]), 22000, 'o carregamento dos componentes');
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF indisponível');
    avisar('Capturando o documento…');
    const canvas = await comPrazo(
      html2canvas(el, { scale: escalaSegura(el, 2), backgroundColor: '#ffffff', useCORS: true, imageTimeout: 6000 }),
      25000, 'a captura do documento');
    avisar('Montando o PDF…');
    conferirCaptura(canvas);                            // detecta captura em branco
    const pdf = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    adicionarPaginado(pdf, canvas, el, SELETOR_QUOTE);  // quebra só entre linhas/blocos
    return pdf;
  }
  async function gerarPDF() {
    try {
      const nome = `orcamento-${lastQuoteNumero || 'torque'}.pdf`;
      // o PDF pré-gerado no abrir do modal serve aqui também (1º toque instantâneo no iPhone)
      if (ehMovel && shareQuoteFile && navigator.canShare && navigator.canShare({ files: [shareQuoteFile] })) {
        try { await navigator.share({ files: [shareQuoteFile], title: nome }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      toast('Gerando PDF…');
      await entregarPdf(() => montarPdfQuote(toast), nome, 'q-' + (lastQuoteNumero || ''));
    } catch (e) {
      console.error(e);
      toast('Abrindo impressão para salvar em PDF…');
      window.print();                                    // fallback robusto (offline / CORS)
    }
  }
  $('#btnPdfQuote').addEventListener('click', gerarPDF);

  // abre o planejador de layout já com os itens deste orçamento
  const btnProjetoQuote = $('#btnProjetoQuote');
  if (btnProjetoQuote) btnProjetoQuote.addEventListener('click', () => {
    const lines = cartLines();
    if (!lines.length) { toast('Adicione itens ao orçamento primeiro.'); return; }
    const itens = lines.map(l => `${l.p.codigo}:${l.q}`).join(',');
    window.open('projeto.html?itens=' + encodeURIComponent(itens), '_blank', 'noopener');
  });

  /* ====================== CONTRATO DE COMPRA E VENDA ====================== */
  // valor por extenso em reais (para a Cláusula 3)
  function extensoBRL(v) {
    v = Math.round((Number(v) || 0) * 100) / 100;
    const int = Math.floor(v), cent = Math.round((v - int) * 100);
    const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    const dezena = n => n < 20 ? U[n] : D[Math.floor(n / 10)] + (n % 10 ? ' e ' + U[n % 10] : '');
    const trio = n => {
      if (!n) return '';
      if (n === 100) return 'cem';
      const c = Math.floor(n / 100), r = n % 100;
      return (c ? C[c] : '') + (c && r ? ' e ' : '') + (r ? dezena(r) : '');
    };
    let resto = int; const partes = [];
    [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']].forEach(([b, sg, pl]) => {
      const q = Math.floor(resto / b);
      if (q) { partes.push(b === 1e3 && q === 1 ? 'mil' : trio(q) + ' ' + (q === 1 ? sg : pl)); resto %= b; }
    });
    if (resto) partes.push(trio(resto));
    let s = (partes.join(' e ') || 'zero') + (int === 1 ? ' real' : ' reais');
    if (cent) s += ' e ' + dezena(cent) + (cent === 1 ? ' centavo' : ' centavos');
    return s;
  }
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  // Entrega de PDF que funciona no iPhone: a.download é ignorado no iOS
  // (sobretudo com o app na tela de início) — usa a folha nativa de
  // compartilhar ("Salvar em Arquivos"); no computador, download normal.
  let pdfEntregaCache = null;   // { key, file } — 2º toque sai instantâneo (regra de gesto do iOS)
  const ehMovel = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.userAgent));   // iPadOS se apresenta como Mac
  function baixarArquivo(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  // Barra verde fixa com o link do PDF pronto: o toque nela é um gesto novo,
  // então abre/baixa sempre — imune a folha de compartilhar que não aparece,
  // popup bloqueado e regra de gesto do iOS.
  let pdfBarUrl = null;
  function mostrarLinkPdf(file) {
    let bar = document.getElementById('pdfBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pdfBar';
      bar.innerHTML = '<a id="pdfBarLink" target="_blank" rel="noopener"></a><button id="pdfBarClose" type="button" aria-label="Fechar">✕</button>';
      document.body.appendChild(bar);
      bar.querySelector('#pdfBarClose').addEventListener('click', ocultarLinkPdf);
    }
    if (pdfBarUrl) URL.revokeObjectURL(pdfBarUrl);
    pdfBarUrl = URL.createObjectURL(file);
    const a = bar.querySelector('#pdfBarLink');
    a.href = pdfBarUrl; a.download = file.name;
    a.textContent = '📄 PDF pronto — toque para abrir';
    bar.classList.add('on');
  }
  function ocultarLinkPdf() {
    const b = document.getElementById('pdfBar');
    if (b) b.classList.remove('on');
  }
  async function entregarPdf(fazerDoc, nome, key) {
    let file = (pdfEntregaCache && pdfEntregaCache.key === key) ? pdfEntregaCache.file : null;
    if (!file) {
      const doc = await fazerDoc();
      file = new File([doc.output('blob')], nome, { type: 'application/pdf' });
      pdfEntregaCache = { key, file };
    }
    if (!ehMovel) {              // computador: download direto, sem folha de compartilhar
      baixarArquivo(file);
      mostrarLinkPdf(file);      // garantia visível caso o navegador bloqueie o download
      return;
    }
    mostrarLinkPdf(file);        // aparece ANTES do share: se a folha não abrir, tem onde tocar
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); ocultarLinkPdf(); return; }
      catch (e) {
        if (e && e.name === 'AbortError') return;                     // usuário fechou a folha
        toast('PDF pronto! Toque na barra verde para abrir.');
      }
    }
  }
  let ctCtx = null;   // dados da venda em contrato
  let ctRev = 0;      // muda a cada re-render (chave do cache de entrega)
  const ctVal = id => ($('#' + id) ? $('#' + id).value : '').trim();
  const ctGap = (v, ph) => v ? `<b class="ctok">${esc(v)}</b>` : `<b class="ctmiss">(${esc(ph)})</b>`;
  function abrirContrato(d) {
    ctCtx = d;
    const emp = P().contrato || {};
    $('#cwNome').value = d.clienteNome || '';
    $('#cwDoc').value = d.clienteDoc || '';
    $('#cwEnd').value = d.clienteEndereco || '';
    $('#cwRep').value = ''; $('#cwCargo').value = ''; $('#cwCpf').value = '';
    $('#cwEndEntrega').value = d.clienteEndereco || '';
    const pct = d.total > 0 && d.sinal > 0 ? Math.round(d.sinal / d.total * 100) : 40;
    $('#cwPctSinal').value = Math.min(100, Math.max(0, pct));
    $('#cwFormaSinal').value = 'PIX / transferência bancária';
    const saldo = Math.max(0, (d.total || 0) - (d.sinal || 0));
    $('#cwFormaSaldo').value = d.parcelas > 1
      ? `${d.parcelas} parcelas de ${money(d.valorParcela || (saldo / d.parcelas))} via boleto bancário`
      : 'à vista, via PIX / transferência bancária';
    $('#cwCidadeAss').value = emp.cidade || '';
    openModal('#contractModal');
    renderContrato();
  }
  function renderContrato() {
    if (!ctCtx) return;
    ctRev++;                       // conteúdo mudou → invalida o PDF em cache
    const d = ctCtx, emp = P().contrato || {};
    const pct = Math.min(100, Math.max(0, parseInt(ctVal('cwPctSinal'), 10) || 0));
    const pctSaldo = 100 - pct;
    const hoje = new Date();
    const itensHTML = (d.itens && d.itens.length)
      ? d.itens.map(i => `<p class="ct__item">• ${i.qtd || 1}× <b>${esc(i.nome)}</b>${i.codigo ? ` (cód. ${esc(i.codigo)})` : ''} — ${money(i.unitario || 0)} cada — total ${money(i.total || 0)}</p>`).join('')
      : `<p class="ct__item"><b class="ctmiss">(DESCRIÇÃO COMPLETA DOS EQUIPAMENTOS)</b></p>`;
    $('#contractDoc').innerHTML = `
      <h3>CONTRATO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA</h3>
      <p><b>CONTRATANTE:</b> ${ctGap(ctVal('cwNome'), 'NOME / RAZÃO SOCIAL DO COMPRADOR')}, inscrito(a) no CPF/CNPJ sob o nº ${ctGap(ctVal('cwDoc'), 'CPF/CNPJ')}, com sede/residência em ${ctGap(ctVal('cwEnd'), 'ENDEREÇO COMPLETO')}, a seguir denominado(a) simplesmente “COMPRADORA”${ctVal('cwRep') ? `, neste ato representada por ${ctGap(ctVal('cwRep'), 'REPRESENTANTE')}, ${ctGap(ctVal('cwCargo'), 'CARGO')}, inscrito no CPF sob o nº ${ctGap(ctVal('cwCpf'), 'CPF DO REPRESENTANTE')}` : ''}.</p>
      <p><b>CONTRATADA:</b> ${ctGap(emp.razao, 'RAZÃO SOCIAL DA EMPRESA')}, inscrita no CNPJ sob o nº ${ctGap(emp.cnpj, 'CNPJ DA EMPRESA')}, com sede em ${ctGap(emp.endereco, 'ENDEREÇO COMPLETO DA SEDE')}, a seguir denominada simplesmente “VENDEDORA”, neste ato representada por ${ctGap(emp.rep, 'REPRESENTANTE LEGAL')}, ${ctGap(emp.cargo, 'CARGO')}, inscrito no CPF sob o nº ${ctGap(emp.cpf, 'CPF DO REPRESENTANTE')}.</p>
      <p>As partes acima qualificadas, por este contrato particular de compromisso de compra e venda de mercadorias importadas, nos termos dos artigos 481 a 504 do Código Civil, mediante cláusulas reciprocamente outorgadas e aceitas, se obrigam nos termos e condições seguintes:</p>
      <h4>CLÁUSULA 1 – DO OBJETO</h4>
      <p>1.1 – O objeto do presente contrato diz respeito à aquisição e importação de EQUIPAMENTOS pela ora VENDEDORA, mediante prévio e formal pedido realizado pela COMPRADORA.</p>
      <p>1.2 – Compõem o presente contrato os seguintes equipamentos:</p>
      ${itensHTML}
      <p>1.3 – Anteriormente à assinatura deste contrato, a COMPRADORA consigna através do presente instrumento que teve acesso a todos os eventuais documentos que porventura tenha solicitado à VENDEDORA, a fim de comprovar o fiel atendimento às especificações técnicas dos EQUIPAMENTOS acima relacionados, nada mais tendo a reclamar quanto a isso.</p>
      <h4>CLÁUSULA 2 – DA ENTREGA DOS EQUIPAMENTOS</h4>
      <p>2.1 – A VENDEDORA compromete-se a realizar a entrega dos EQUIPAMENTOS acima relacionados no endereço situado à ${ctGap(ctVal('cwEndEntrega'), 'ENDEREÇO COMPLETO DE ENTREGA')}.</p>
      <p>2.2 – A VENDEDORA compromete-se a realizar a entrega dos EQUIPAMENTOS no prazo de até ${ctGap(ctVal('cwPrazo') && ctVal('cwPrazo') + ' (' + extensoBRL(parseInt(ctVal('cwPrazo'), 10) || 0).replace(/ rea(l|is).*$/, '') + ') dias', 'XX DIAS')} da assinatura do presente contrato.</p>
      <h4>CLÁUSULA 3 – DO PREÇO E PAGAMENTO</h4>
      <p>3.1 – A COMPRADORA compromete-se a pagar à VENDEDORA a quantia aqui estipulada de <b class="ctok">${money(d.total || 0)}</b> (<b class="ctok">${esc(extensoBRL(d.total || 0))}</b>), sendo <b class="ctok">${pct}%</b> no ato da assinatura deste contrato, ou na forma que segue, e <b class="ctok">${pctSaldo}%</b> após a efetiva entrega dos EQUIPAMENTOS, ou na forma que segue.</p>
      <p>3.2 – O pagamento dos ${pct}% prévios (<b class="ctok">${money((d.total || 0) * pct / 100)}</b>) será realizado através de ${ctGap(ctVal('cwFormaSinal'), 'DISCRIMINAR FORMA DO PAGAMENTO')}.</p>
      <p>3.2.1 – Em caso de parcelamento dos ${pct}% ora previstos, a VENDEDORA apenas realizará a transação após a integralização do r. valor.</p>
      <p>3.3 – O pagamento dos ${pctSaldo}% após a efetiva entrega dos EQUIPAMENTOS (<b class="ctok">${money((d.total || 0) * pctSaldo / 100)}</b>) será realizado através de ${ctGap(ctVal('cwFormaSaldo'), 'DISCRIMINAR FORMA DO PAGAMENTO')}.</p>
      <p>3.3.1 – O valor ora estipulado de ${pctSaldo}% poderá sofrer reajustes em decorrência de eventuais custos ou despesas inesperadas, devendo a VENDEDORA, neste caso, comprová-los através de todos os documentos, informações e meios que se mostrem hábeis para esta finalidade.</p>
      <p>3.4 – Em caso de desistência por parte da COMPRADORA, esta se compromete a arcar perante a VENDEDORA com todos os custos e despesas a ela proporcionados, sem prejuízo de responder pelas perdas e danos daí decorrentes.</p>
      <h4>CLÁUSULA 4 – DAS OBRIGAÇÕES DA COMPRADORA</h4>
      <p>4.1 – Uma vez importados os EQUIPAMENTOS e efetuados os desembaraços aduaneiros, obriga-se a COMPRADORA a recebê-los da VENDEDORA, que por sua vez a ela se obriga entregá-los, sob as condições pactuadas neste instrumento previstas na CLÁUSULA 2.</p>
      <p>4.2 – Se compromete a COMPRADORA a receber os EQUIPAMENTOS nos termos pactuados na Cláusula 2 deste contrato.</p>
      <p>4.3 – A apresentar todos os documentos solicitados pela VENDEDORA, bem como garantia que comprove que seu capital social ou patrimônio líquido são compatíveis com o valor de aquisição dos EQUIPAMENTOS importados do exterior.</p>
      <h4>CLÁUSULA 5 – DAS OBRIGAÇÕES DA VENDEDORA</h4>
      <p>5.1 – Efetuar a operação dos EQUIPAMENTOS importados por encomenda nas condições estabelecidas entre a VENDEDORA e a COMPRADORA, em observância à Cláusula 1.</p>
      <p>5.2 – Emitir Nota Fiscal da venda dos EQUIPAMENTOS pelo preço pactuado, bem como dar quitação aos pagamentos efetuados nos termos da Cláusula 3.</p>
      <p>5.3 – Providenciar perante as pessoas jurídicas responsáveis, tempestivamente, o envio de todos os documentos pertinentes à importação dos EQUIPAMENTOS importados que lhes forem instruídos e encomendados pela COMPRADORA face às exigências normativas brasileiras.</p>
      <p>5.4 – Responder por eventuais irregularidades dos EQUIPAMENTOS a serem importados, bem como responsabilizar-se integralmente pela qualidade e quantidade dos EQUIPAMENTOS em conformidade com o estipulado na Cláusula 1 deste contrato.</p>
      <p>5.5 – Manter em boa guarda e ordem, e apresentar à fiscalização aduaneira, quando exigidos, os documentos e registros relativos às transações que promover, pelo prazo decadencial.</p>
      <h4>CLÁUSULA 6 – DA CLÁUSULA PENAL</h4>
      <p>6.1 – Em caso de atraso no pagamento previsto na Cláusula 3, fica ajustado que incidirá multa na ordem de ${ctGap(ctVal('cwMulta') && ctVal('cwMulta') + '%', 'XX%')} do r. valor, sem prejuízo de juros mensais, calculados pró-rata dia, à razão de 12% a.a., além de correção monetária pelo IGP-M, caso o atraso seja superior a um mês.</p>
      <p>6.2 – Em caso de atraso no prazo da entrega, previsto na Cláusula 2, haverá abatimento do saldo devedor na ordem de ${ctGap(ctVal('cwAbat') && ctVal('cwAbat') + '%', 'X%')} quando do primeiro dia de atraso e a reincidir a cada ${ctGap(ctVal('cwReinc') && ctVal('cwReinc') + ' dias', 'X DIAS')}.</p>
      <p>6.2.1 – Ficará a VENDEDORA isenta da referida multa desde que o fato gerador do atraso tenha ocorrido em decorrência de caso fortuito ou força maior.</p>
      <h4>CLÁUSULA 7 – DA GARANTIA</h4>
      <p>A VENDEDORA fornecerá garantia aos EQUIPAMENTOS elencados na Cláusula 1 pelo prazo de 1 ano, em todo eletrônico e pintura, e pelo prazo de 3 anos em estrutura, a iniciar da efetiva entrega dos EQUIPAMENTOS.</p>
      <h4>CLÁUSULA 8 – DAS DISPOSIÇÕES GERAIS</h4>
      <p>8.1 – Poderá o presente contrato ser aditado a qualquer momento, desde que as partes signatárias concordem mutuamente com as pretendidas alterações.</p>
      <p>8.2 – O presente contrato tem a qualidade de título executivo extrajudicial, nos termos do artigo 585, II do Código de Processo Civil.</p>
      <p>8.3 – A tolerância, por qualquer das partes, com relação ao descumprimento de qualquer obrigação ora ajustada, não será considerada novação, moratória ou renúncia a qualquer direito, constituindo mera liberalidade que não impedirá a parte tolerante de exigir da outra o fiel e cabal cumprimento deste Contrato, a qualquer tempo.</p>
      <p>8.4 – Elegem as partes o foro da comarca ${ctGap(emp.cidade && 'de ' + emp.cidade, 'CIDADE DO FORO')}, para dirimir eventuais dúvidas originárias da interpretação do presente contrato, renunciando a qualquer outra por mais privilegiada que seja.</p>
      <p>8.5 – Este Contrato não poderá ser cedido por qualquer uma das partes a quaisquer terceiros, ainda que pessoas ligadas, até o seu integral cumprimento, sem o prévio consentimento por escrito da outra parte.</p>
      <p>E por estarem nestes termos, justos e contratados, assinam as partes o presente contrato, em duas vias de igual teor e forma, para que, também assinado pelo fiador e duas testemunhas, produza seus jurídicos e legais efeitos.</p>
      <p class="ct__data">${ctGap(ctVal('cwCidadeAss'), 'CIDADE')}, ${hoje.getDate()} de ${MESES_PT[hoje.getMonth()]} de ${hoje.getFullYear()}.</p>
      <div class="ct__ass">
        <div><span>______________________________________</span><b>COMPRADORA</b><small>${esc(ctVal('cwNome') || '')}</small></div>
        <div><span>______________________________________</span><b>VENDEDORA</b><small>${esc(emp.razao || '')}</small></div>
        <div><span>______________________________________</span><b>FIADOR</b><small>&nbsp;</small></div>
        <div><span>______________________________________</span><b>TESTEMUNHA 1</b><small>&nbsp;</small></div>
        <div><span>______________________________________</span><b>TESTEMUNHA 2</b><small>&nbsp;</small></div>
      </div>`;
  }
  ['cwNome', 'cwDoc', 'cwEnd', 'cwRep', 'cwCargo', 'cwCpf', 'cwEndEntrega', 'cwPrazo', 'cwPctSinal', 'cwFormaSinal', 'cwFormaSaldo', 'cwMulta', 'cwAbat', 'cwReinc', 'cwCidadeAss'].forEach(id => {
    const el = $('#' + id); if (el) el.addEventListener('input', renderContrato);
  });
  // Plano B à prova de tudo: o contrato inteiro em PDF de texto puro (jsPDF),
  // sem captura de tela — nunca esbarra nos limites de canvas do iPhone.
  function montarPdfContratoTexto(Ctor) {
    const el = $('#contractDoc');
    const pdf = new Ctor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    const M = 18; let y = 22;
    const quebra = h => { if (y + h > H - 18) { pdf.addPage(); y = 22; } };
    const bloco = (txt, o) => {
      const { bold = false, size = 10, gap = 4.4, center = false } = o || {};
      pdf.setFont('times', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
      pdf.splitTextToSize(txt, W - 2 * M).forEach(l => {
        quebra(gap + 1);
        if (center) pdf.text(l, W / 2, y, { align: 'center' }); else pdf.text(l, M, y);
        y += gap;
      });
    };
    Array.from(el.children).forEach(node => {
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (node.tagName === 'H3') { bloco(t, { bold: true, size: 12.5, gap: 5.2, center: true }); y += 3; }
      else if (node.tagName === 'H4') { y += 2.5; quebra(10); bloco(t, { bold: true, size: 10.5, gap: 4.8 }); y += 1; }
      else if (node.classList && node.classList.contains('ct__ass')) {
        Array.from(node.children).forEach(d => {
          quebra(24); y += 13;
          pdf.setDrawColor(60); pdf.line(W / 2 - 45, y, W / 2 + 45, y); y += 4.5;
          const b = d.querySelector('b'), s = d.querySelector('small');
          pdf.setFont('times', 'bold'); pdf.setFontSize(9.5);
          pdf.text(((b && b.textContent) || '').trim(), W / 2, y, { align: 'center' }); y += 4;
          const nm = ((s && s.textContent) || '').replace(/\u00a0/g, ' ').trim();
          if (nm) { pdf.setFont('times', 'normal'); pdf.setFontSize(9); pdf.text(nm, W / 2, y, { align: 'center' }); y += 4; }
        });
      }
      else if (t) { bloco(t, {}); y += 1.6; }
    });
    return pdf;
  }
  async function montarPdfContrato(avisar = () => {}) {
    avisar('Carregando componentes…');
    await comPrazo(Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'),
      // sem html2canvas ainda dá contrato: cai no plano B de texto puro
      loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js').catch(() => {})
    ]), 22000, 'o carregamento dos componentes');
    const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF indisponível');
    const el = $('#contractDoc');
    try {
      if (typeof html2canvas !== 'function') throw new Error('sem html2canvas');
      avisar('Capturando o documento…');
      const canvas = await comPrazo(
        html2canvas(el, { scale: escalaSegura(el, 2), backgroundColor: '#ffffff', imageTimeout: 6000 }),
        25000, 'a captura do documento');
      avisar('Montando o PDF…');
      conferirCaptura(canvas);
      const pdf = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      adicionarPaginado(pdf, canvas, el, 'h3, h4, p, .ct__ass > div');   // quebra só entre parágrafos
      return pdf;
    } catch (e) {
      console.error('captura do contrato falhou — gerando em texto puro', e);
      avisar('Montando o PDF (modo compatível)…');
      return montarPdfContratoTexto(jsPDFCtor);
    }
  }
  $('#btnPdfContract').addEventListener('click', async () => {
    const btn = $('#btnPdfContract'), rotulo = btn.textContent;
    try {
      const nomeArq = 'contrato-' + slugify(ctVal('cwNome') || 'torque') + '.pdf';
      if (!(pdfEntregaCache && pdfEntregaCache.key === 'ct' + ctRev)) {
        toast('Gerando contrato…'); btn.disabled = true; btn.textContent = 'Gerando…';
      }
      await entregarPdf(() => montarPdfContrato(toast), nomeArq, 'ct' + ctRev);
    } catch (e) {
      console.error(e);
      toast('Não foi possível gerar o contrato: ' + ((e && e.name) || 'erro') + ' — ' + String((e && e.message) || e).slice(0, 90));
    } finally { btn.disabled = false; btn.textContent = rotulo; }
  });
  // do orçamento em edição (botão no modal do orçamento)
  const btnContratoQuote = $('#btnContratoQuote');
  if (btnContratoQuote) btnContratoQuote.addEventListener('click', () => {
    const lines = cartLines();
    if (!lines.length) { toast('Adicione itens ao orçamento primeiro.'); return; }
    const cli = clienteById(Q().clienteId);
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const saldo = saldoFinanciar();
    abrirContrato({
      clienteNome: cli ? (cli.empresa || cli.nome) : '',
      clienteDoc: cli ? (cli.doc || '') : '',
      clienteEndereco: cli ? [cli.endereco, cli.cidade].filter(Boolean).join(', ') : '',
      itens: lines.map(l => ({ codigo: l.p.codigo, nome: l.p.nome, qtd: l.q, unitario: l.unit, total: l.total })),
      total: totalComDesconto(),
      sinal: sinalReais(),
      parcelas: n,
      valorParcela: saldo > 0 ? parcelaValor(saldo, n) : 0
    });
  });
  window.__contrato = abrirContrato;    // gancho para testes automatizados
  // de um negócio do funil (dados salvos na nuvem)
  function contratoDeRow(r) {
    const cli = (typeof clienteById === 'function' && r.cliente_id) ? clienteById(r.cliente_id) : null;
    abrirContrato({
      clienteNome: r.cliente_nome || (cli ? cli.nome : ''),
      clienteDoc: cli ? (cli.doc || '') : '',
      clienteEndereco: cli ? [cli.endereco, cli.cidade].filter(Boolean).join(', ') : '',
      itens: Array.isArray(r.itens) ? r.itens : [],
      total: Number(r.total) || 0,
      sinal: Number(r.sinal) || 0,
      parcelas: Number(r.parcelas) || 1,
      valorParcela: Number(r.valor_parcela) || 0
    });
  }

  $('#btnImageQuote').addEventListener('click', async () => {
    try {
      toast('Gerando imagem…');
      await comPrazo(loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'), 22000, 'o carregamento dos componentes');
      const el = $('#quoteDoc');
      const canvas = await comPrazo(html2canvas(el, { scale: escalaSegura(el, 2), backgroundColor: '#ffffff', useCORS: true, imageTimeout: 6000 }), 25000, 'a captura do documento');
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

  // O PDF do orçamento é preparado quando o modal ABRE: no iPhone, o
  // navigator.share só funciona logo após o toque — gerar na hora do clique
  // estoura essa janela e o Safari bloqueia sem avisar.
  let shareQuoteFile = null, shareQuotePrep = null;
  function prepararShareQuote() {
    shareQuoteFile = null;
    if (!ehMovel || !navigator.share || !navigator.canShare) { shareQuotePrep = null; return; }
    shareQuotePrep = (async () => {
      try {
        const pdf = await montarPdfQuote();
        const file = new File([pdf.output('blob')], `orcamento-${lastQuoteNumero || 'torque'}.pdf`, { type: 'application/pdf' });
        shareQuoteFile = file;
        return file;
      } catch (e) { return null; }
    })();
  }
  $('#btnShareQuote').addEventListener('click', async () => {
    const txt = resumoTexto();
    try {
      if (!ehMovel || !navigator.share) {
        // computador: baixa o PDF e copia o resumo (folha de compartilhar é coisa de celular)
        try { await navigator.clipboard.writeText(txt); } catch (e2) {}
        toast('Gerando PDF…');
        await entregarPdf(() => montarPdfQuote(toast), `orcamento-${lastQuoteNumero || 'torque'}.pdf`, 'q-' + (lastQuoteNumero || ''));
        toast('PDF baixado — resumo copiado para a área de transferência.');
        return;
      }
      let file = shareQuoteFile;
      if (!file && shareQuotePrep) { toast('Preparando o PDF…'); file = await shareQuotePrep; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Orçamento Torque Fitness' }); return; }
        catch (e) {
          if (e && e.name === 'AbortError') return;                            // usuário fechou a folha
          if (e && e.name === 'NotAllowedError') { toast('PDF pronto! Toque em Compartilhar de novo.'); return; }
        }
      }
      await navigator.share({ text: txt, title: 'Orçamento Torque Fitness' }); // último recurso: resumo em texto
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      try { await navigator.clipboard.writeText(txt); toast('Resumo copiado para a área de transferência.'); }
      catch (e2) { toast('Não foi possível compartilhar neste navegador.'); }
    }
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
    if (new URLSearchParams(location.search).get('tv') === '1') {   // modo TV: abre o painel direto, sem interface de edição
      document.body.classList.add('tv');
      openDashboard().then(() => switchDashView('metrics'));
    }
    // pré-carrega as libs do PDF em ocioso: o Compartilhar deve estar pronto no 1º toque
    setTimeout(() => {
      loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js').catch(() => {});
      loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js').catch(() => {});
    }, 3000);
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
  const isSiteLead = r => r.origem === 'site' || /^SITE-/i.test(String(r.numero || ''));

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
  $('#dashClose').addEventListener('click', () => { stopDashPoll(); $('#dashScreen').hidden = true; document.body.style.overflow = ''; });
  $('#dashSearch').addEventListener('input', renderDashboard);
  $('#dashVendedorFilter').addEventListener('change', renderDashboard);
  $('#dashFunnel').addEventListener('click', e => {
    const b = e.target.closest('.fchip'); if (!b) return;
    dashStage = b.dataset.stage; renderDashboard();
  });
  function switchDashView(v) {
    dashView = v;
    $$('#dashTabs .dtab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $('#viewList').hidden = v !== 'list'; $('#viewKanban').hidden = v !== 'kanban';
    $('#viewAgenda').hidden = v !== 'agenda'; $('#viewMetrics').hidden = v !== 'metrics';
    renderDashboard();
  }
  $('#dashAlerts') && $('#dashAlerts').addEventListener('click', e => {
    const b = e.target.closest('[data-alert]'); if (!b) return;
    const a = b.dataset.alert;
    if (a === 'metrics') switchDashView('metrics');
    else { dashStage = a; renderDashboard(); }
  });
  // mudar a fase de um orçamento direto no card
  $('#dashList').addEventListener('change', e => {
    if (e.target.dataset.act !== 'stage') return;
    changeStage(e.target.closest('.dcard').dataset.id, e.target.value);
  });

  // troca de fase unificada (lista + kanban). "Não fechou" pede o motivo antes.
  // cadência: dias até o próximo retorno por etapa (admin ajusta; estes são os padrões)
  const CADENCIA_DEF = { novo: 1, negociacao: 2, sem_retorno: 3 };
  function cadenciaDias(key) {
    const c = stageCfg(key).dias;
    if (c != null && c !== '' && !isNaN(c)) return Math.max(0, parseInt(c, 10));
    return CADENCIA_DEF[key] != null ? CADENCIA_DEF[key] : 0;
  }
  // agenda automaticamente o próximo retorno ao entrar numa etapa aberta (se ainda não houver um)
  async function aplicarCadencia(r) {
    const key = stageOf(r);
    if (!OPEN_STAGES.includes(key)) return null;
    if (tarefasPendentes(r).length) return null;          // já tem follow-up agendado → respeita
    const dias = cadenciaDias(key);
    if (dias <= 0) return null;
    const d = new Date(Date.now() + dias * DAY);
    const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try { await Cloud.updateOrcamento(r.id, { retorno_em: data }); r.retorno_em = data; return d.toLocaleDateString('pt-BR'); }
    catch (e) { console.warn('cadência:', e); return null; }   // sem coluna retorno_em → ignora
  }
  async function changeStage(id, status) {
    const r = dashData.find(x => x.id === id); if (!r) return;
    if (stageOf(r) === status) { renderDashboard(); return; }
    if (status === 'perdido') { openLossModal(r); return; }
    const prev = r.status;
    r.status = status; renderDashboard();                 // otimista
    try {
      await Cloud.updateOrcamento(id, { status });
      logActivityAuto(r, 'fase', `Movido para "${stageName(status)}"`);
      const quando = await aplicarCadencia(r);
      renderDashboard();
      toast(quando ? `Fase atualizada · retorno em ${quando}` : 'Fase atualizada.');
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
      const novos = novosLeads(dashData);
      if (novos.length) {
        notifyNewLeads(novos); markLeadsSeen(novos.map(r => r.id));
        toast(`🌐 ${novos.length} novo(s) lead(s) do site! Veja no funil.`);
      } else if (!remindShown) {
        const pend = pendentesRetorno(dashData);
        if (pend.length) { remindShown = true; toast(`📅 ${pend.length} retorno(s) atrasado(s) ou para hoje — veja a aba Agenda.`); }
      }
      startDashPoll();
    } catch (e) { console.error(e); $('#dashList').innerHTML = '<p class="dash__empty">Erro ao carregar os orçamentos.</p>'; }
  }
  // ---- tempo real: enquanto o CRM está aberto, busca leads novos a cada minuto ----
  let dashPollTimer = null;
  function beepLead() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.55);
      o.onended = () => { try { ctx.close(); } catch (e) {} };
    } catch (e) { /* navegador sem áudio liberado — segue só com o toast */ }
  }
  async function pollDash() {
    if ($('#dashScreen').hidden) { stopDashPoll(); return; }
    const ae = document.activeElement;
    const digitando = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'dashSearch';
    try {
      const rows = await Cloud.listOrcamentos();
      const novos = novosLeads(rows);
      dashData = rows;
      if (dashData.length && ativColumn === null) ativColumn = dashData.some(r => 'atividades' in r);
      if (!digitando) renderDashboard();
      if (novos.length) {
        beepLead(); notifyNewLeads(novos); markLeadsSeen(novos.map(r => r.id));
        toast(`🌐 ${novos.length} novo(s) lead(s) do site agora mesmo!`);
      }
    } catch (e) { /* rede oscilou — tenta de novo no próximo ciclo */ }
  }
  function startDashPoll() { stopDashPoll(); dashPollTimer = setInterval(pollDash, 60000); }
  function stopDashPoll() { if (dashPollTimer) { clearInterval(dashPollTimer); dashPollTimer = null; } }
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
  // ---- alertas gerenciais (só admin): leads sem atendimento, negócios parados, metas ----
  function renderAlerts(base) {
    const box = $('#dashAlerts'); if (!box) return;
    if (!(Cloud.isAdmin && Cloud.isAdmin())) { box.hidden = true; box.innerHTML = ''; return; }
    const semAtend = base.filter(r => stageOf(r) === 'novo' && atividadesDe(r).length === 0).length;
    const parados = base.filter(r => rottingInfo(r)).length;
    const _now = new Date();
    const mesAtual = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0');
    const ganhoMes = {};
    base.forEach(r => { if (stageOf(r) !== 'ganho') return; if (String(r.criado_em || '').slice(0, 7) !== mesAtual) return; const n = r.vendedor_nome || '—'; ganhoMes[n] = (ganhoMes[n] || 0) + (Number(r.total) || 0); });
    const metas = P().metas || {};
    const abaixo = Object.keys(metas).filter(n => n && (Number(metas[n]) || 0) > 0 && (ganhoMes[n] || 0) < Number(metas[n])).length;
    const chips = [];
    if (semAtend) chips.push(`<button class="dalert dalert--warn" data-alert="novo">🕐 <b>${semAtend}</b> lead(s) sem atendimento</button>`);
    if (parados) chips.push(`<span class="dalert dalert--bad">🧊 <b>${parados}</b> negócio(s) parado(s)</span>`);
    if (abaixo) chips.push(`<button class="dalert" data-alert="metrics">🎯 <b>${abaixo}</b> vendedor(es) abaixo da meta</button>`);
    if (!chips.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<span class="dalert__lab">Atenção do gestor</span>` + chips.join('');
  }
  function renderListView(base) {
    renderAlerts(base);
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
      `<div class="dash__stat"><b title="${money(emAbertoVal)}">${moneyK(emAbertoVal)}</b><span>em aberto</span></div>` +
      `<div class="dash__stat"><b title="${money(val.ganho)}">${moneyK(val.ganho)}</b><span>fechadas</span></div>` +
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
    if (isSiteLead(r)) flags.push('<span class="dflag site">🌐 Lead</span>');
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
  // ---- modelos de mensagem de WhatsApp (prontos, o vendedor revisa antes de enviar) ----
  const primeiroNome = s => String(s || '').trim().split(' ')[0] || '';
  function followupTexto(o) {
    const nome = primeiroNome(o.cliente_nome);
    const vend = primeiroNome(Cloud.profile && Cloud.profile.nome);
    const ref = o.numero ? ` ${o.numero}` : '';
    const valor = o.total ? ` (${money(o.total)})` : '';
    return `Olá ${nome}, tudo bem? Aqui é ${vend ? vend + ' da' : 'da'} Torque Fitness 💪 ` +
      `Passando para saber se você conseguiu avaliar o orçamento${ref}${valor}. ` +
      `Posso esclarecer qualquer dúvida ou ajustar as condições. Podemos seguir?`;
  }
  const WPP_TEMPLATES = [
    { key: 'contato', label: '👋 1º contato', build: o => {
        const nome = primeiroNome(o.cliente_nome), vend = primeiroNome(Cloud.profile && Cloud.profile.nome);
        const itens = (o.itens || []).map(i => `• ${i.qtd}× ${i.nome}`).join('\n');
        return `Olá ${nome}! Aqui é ${vend ? vend + ' da' : 'da'} Torque Fitness 💪 Recebi seu interesse` +
          (itens ? `:\n\n${itens}` : '') + `\n\nPosso te enviar o orçamento e tirar suas dúvidas?`;
      } },
    { key: 'followup', label: '🔁 Follow-up', build: o => followupTexto(o) },
    { key: 'proposta', label: '📄 Proposta enviada', build: o => {
        const nome = primeiroNome(o.cliente_nome), ref = o.numero ? ` ${o.numero}` : '';
        const val = o.total ? ` no valor de ${money(o.total)}` : '';
        const parc = (o.parcelas && o.valor_parcela) ? ` (ou em até ${o.parcelas}× de ${money(o.valor_parcela)})` : '';
        return `Olá ${nome}! Segue a proposta${ref}${val}${parc}. Qualquer dúvida sobre os equipamentos ou as condições, estou à disposição. O que achou?`;
      } },
    { key: 'fechamento', label: '✅ Fechamento', build: o => {
        const nome = primeiroNome(o.cliente_nome), val = o.total ? ` de ${money(o.total)}` : '';
        return `Olá ${nome}! Para garantir as condições${val}, posso já reservar e te enviar os próximos passos? Conseguimos fechar essa semana?`;
      } }
  ];
  function renderWppTpls() {
    const box = $('#wppTpls'); if (!box) return;
    box.innerHTML = WPP_TEMPLATES.map(t => `<button type="button" class="wpp-tpl" data-tpl="${t.key}">${t.label}</button>`).join('');
  }
  // abre o modal de mensagem (modelos + IA + edição) já com o follow-up preenchido
  function openWppFor(o) {
    suggestOrcId = o.id;
    $('#suggestCliente').textContent = (o.cliente_nome || 'Cliente') + (o.numero ? ' · ' + o.numero : '');
    $('#suggestHint').value = '';
    $('#suggestErr').hidden = true;
    renderWppTpls();
    $('#suggestText').value = followupTexto(o);
    openModal('#suggestModal');
  }

  /* ============ LEMBRETES DE RETORNO (notificações PWA) ============ */
  let notifShown = false;   // dispara no máx. 1× por sessão de uso
  let remindShown = false;  // aviso in-app de retornos pendentes (1× por sessão)
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
  // ---- aviso de LEAD NOVO (pedido pela vitrine ainda não visto) ----
  const SEEN_LEADS_KEY = 'torque_seen_leads';
  function seenLeads() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_LEADS_KEY) || '[]')); } catch (e) { return new Set(); } }
  function markLeadsSeen(ids) { try { const s = seenLeads(); ids.forEach(i => s.add(i)); localStorage.setItem(SEEN_LEADS_KEY, JSON.stringify(Array.from(s).slice(-800))); } catch (e) {} }
  function novosLeads(rows) { const s = seenLeads(); return rows.filter(r => isSiteLead(r) && stageOf(r) === 'novo' && !s.has(r.id)); }
  function notifyNewLeads(novos) {
    if (notifSupported() && Notification.permission === 'granted') {
      try { new Notification('Torque CRM · novo lead', { body: `${novos.length} pedido(s) novo(s) pela vitrine.`, icon: 'icons/icon-192.png', tag: 'torque-leads' }); } catch (e) {}
    }
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
      <div class="mkpi"><b title="${money(abertoV)}">${moneyK(abertoV)}</b><span>Pipeline aberto (${abertoC})</span></div>
      <div class="mkpi"><b title="${money(fcTotal)}">${moneyK(fcTotal)}</b><span>Previsão ponderada</span></div>
      <div class="mkpi"><b title="${money(val.ganho)}">${moneyK(val.ganho)}</b><span>Fechado (${cnt.ganho})</span></div>
      <div class="mkpi"><b title="${money(ticket)}">${moneyK(ticket)}</b><span>Ticket médio</span></div>
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
    const comPct = Number(P().comissao) || 0;
    const vendNomes = Array.from(new Set([...Object.keys(metas), ...Object.keys(ganhoMes)]))
      .filter(n => n && n !== '—').sort((a, b) => a.localeCompare(b, 'pt-BR'));
    let metasCard = '';
    if (vendNomes.length || ehAdmin) {
      const linha = (n, done, target, tot) => {
        const pct = target ? Math.min(100, Math.round(done / target * 100)) : 0;
        const inp = (ehAdmin && !tot) ? `<input class="metarow__in" data-meta="${esc(n)}" type="number" min="0" step="1000" value="${target || ''}" placeholder="meta" aria-label="Meta de ${esc(n)}" />` : '';
        const com = comPct ? `<span class="metarow__com" title="Comissão estimada (${comPct}%)">💰 ${moneyK(done * comPct / 100)}</span>` : '';
        return `<div class="metarow ${tot ? 'metarow--tot' : ''}" data-done="${done}">
          <span class="metarow__n">${esc(n)}</span>
          <div class="mbar__track"><div class="mbar__fill ${pct >= 100 ? 'ok' : ''}" style="width:${pct}%"></div></div>
          <span class="metarow__v"><b>${moneyK(done)}</b>${target ? ` / ${moneyK(target)} · ${pct}%` : ''}</span>${com}${inp}</div>`;
      };
      const rows = vendNomes.map(n => linha(n, ganhoMes[n] || 0, Number(metas[n]) || 0, false)).join('');
      const totT = vendNomes.reduce((t, n) => t + (Number(metas[n]) || 0), 0);
      const totD = vendNomes.reduce((t, n) => t + (ganhoMes[n] || 0), 0);
      const teamRow = totT ? linha('Equipe', totD, totT, true) : '';
      const corpo = rows || '<p class="atv__empty">Defina a meta mensal de cada vendedor nos campos à direita.</p>';
      const hint = comPct ? `Valor fechado no mês × meta · 💰 comissão estimada (${comPct}%).` : 'Valor fechado no mês × meta.';
      metasCard = `<div class="mcard"><h3 class="mcard__t">Metas de ${mesNome}</h3>${corpo}${teamRow}<p class="mcard__hint">${hint}</p></div>`;
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

    // ---- equipamentos mais orçados (demanda por produto em todos os negócios) ----
    const prodAgg = {};
    base.forEach(r => {
      const won = stageOf(r) === 'ganho';
      (Array.isArray(r.itens) ? r.itens : []).forEach(it => {
        const nome = (it.nome || it.codigo || '').trim(); if (!nome) return;
        const q = Number(it.qtd) || 0;
        const v = Number(it.total) || (Number(it.unitario || it.preco) || 0) * q;
        const p = prodAgg[nome] || (prodAgg[nome] = { qtd: 0, val: 0, deals: 0, wonQtd: 0 });
        p.qtd += q; p.val += v; p.deals += 1; if (won) p.wonQtd += q;
      });
    });
    const prodArr = Object.entries(prodAgg).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 8);
    const maxP = Math.max(1, ...prodArr.map(p => p[1].qtd));
    const prodBars = prodArr.length
      ? prodArr.map(([n, d]) => `<div class="mbar"><span class="mbar__lab" title="${esc(n)}">${esc(n)}</span><div class="mbar__track"><div class="mbar__fill" style="width:${Math.round(d.qtd / maxP * 100)}%"></div></div><span class="mbar__val">${d.qtd}× <small>· ${moneyK(d.val)}</small></span></div>`).join('')
      : '<p class="atv__empty">Nenhum item orçado ainda.</p>';
    const prodCard = `<div class="mcard"><h3 class="mcard__t">Equipamentos mais orçados</h3>${prodBars}<p class="mcard__hint">Quantidade somada em todos os orçamentos (× vezes) e valor total gerado. Use para priorizar estoque, foco de venda e negociação.</p></div>`;

    // ---- atribuição de origem: cupons / influenciadores (extraído das observações) ----
    const cupAgg = {};
    base.forEach(r => {
      const m = /Cupom:\s*([A-Za-z0-9]+)\s*(?:\(([^)]*)\))?/.exec(r.obs || '');
      if (!m) return;
      const code = m[1].toUpperCase();
      const quem = (m[2] || '').split('·')[1] ? m[2].split('·')[1].trim() : '';
      const label = code + (quem ? ' · ' + quem : '');
      const a = cupAgg[code] || (cupAgg[code] = { label, deals: 0, ganhoC: 0, ganhoV: 0 });
      a.deals++; if (stageOf(r) === 'ganho') { a.ganhoC++; a.ganhoV += Number(r.total) || 0; }
    });
    const cupArr = Object.values(cupAgg).sort((a, b) => (b.ganhoV - a.ganhoV) || (b.deals - a.deals));
    let cupCard = '';
    if (cupArr.length) {
      const maxC = Math.max(1, ...cupArr.map(c => c.deals));
      const cupBars = cupArr.map(c =>
        `<div class="mbar"><span class="mbar__lab" title="${esc(c.label)}">${esc(c.label)}</span><div class="mbar__track"><div class="mbar__fill" style="width:${Math.round(c.deals / maxC * 100)}%"></div></div><span class="mbar__val">${c.deals} orç. <small>· ${c.ganhoC} fech. · ${moneyK(c.ganhoV)}</small></span></div>`).join('');
      cupCard = `<div class="mcard"><h3 class="mcard__t">Origem por cupom / influenciador</h3>${cupBars}<p class="mcard__hint">Orçamentos que usaram cada cupom, quantos fecharam e o valor gerado. Mede o retorno de cada influenciador/campanha.</p></div>`;
    }

    // ---- desempenho da equipe (visão do gestor; só admin) ----
    let teamCard = '';
    if (ehAdmin) {
      const team = {};
      const T = n => team[n] || (team[n] = { abertoC: 0, abertoV: 0, ganhoC: 0, ganhoV: 0, perdidoC: 0, parados: 0 });
      base.forEach(r => {
        const n = r.vendedor_nome || '—'; const k = stageOf(r); const t = T(n);
        if (k === 'ganho') { t.ganhoC++; t.ganhoV += Number(r.total) || 0; }
        else if (k === 'perdido') { t.perdidoC++; }
        else { t.abertoC++; t.abertoV += Number(r.total) || 0; if (rottingInfo(r)) t.parados++; }
      });
      const rows = Object.entries(team).filter(([n]) => n && n !== '—')
        .sort((a, b) => b[1].ganhoV - a[1].ganhoV);
      if (rows.length) {
        const body = rows.map(([n, t]) => {
          const fech = t.ganhoC + t.perdidoC;
          const conv = fech ? Math.round(t.ganhoC / fech * 100) : 0;
          const par = t.parados ? `<b class="teamtbl__warn">${t.parados}</b>` : '<span class="teamtbl__ok">—</span>';
          return `<div class="teamtbl__r"><span class="teamtbl__n">${esc(n)}</span><span>${t.abertoC} · ${moneyK(t.abertoV)}</span><span>${conv}%</span><span>${moneyK(t.ganhoV)}</span><span>${par}</span></div>`;
        }).join('');
        teamCard = `<div class="mcard"><h3 class="mcard__t">Desempenho da equipe</h3>
          <div class="teamtbl"><div class="teamtbl__h"><span>Vendedor</span><span>Aberto</span><span>Conv.</span><span>Fechado</span><span title="Negócios parados">⚠️</span></div>${body}</div>
          <p class="mcard__hint">Pipeline aberto (nº · valor), taxa de conversão, valor fechado e ⚠️ negócios parados (sem próxima atividade há +${ROT_DIAS} dias) por vendedor.</p></div>`;
      }
    }

    // ---- ciclo de venda: dias entre a criação e o fechamento (pela última atividade) ----
    let cicloCard = '';
    {
      const won = base.filter(r => stageOf(r) === 'ganho' && r.criado_em);
      const dias = [], porVend = {};
      won.forEach(r => {
        const ini = new Date(r.criado_em).getTime(); if (isNaN(ini)) return;
        const ativs = atvOf(r).map(a => new Date(a.doneAt || a.at).getTime()).filter(n => !isNaN(n) && n >= ini);
        if (!ativs.length) return;                                  // sem histórico → sem como medir
        const d = Math.max(0, (Math.max(...ativs) - ini) / DAY);
        dias.push(d);
        const n = r.vendedor_nome || '—';
        (porVend[n] = porVend[n] || []).push(d);
      });
      if (dias.length) {
        const media = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
        const fmtD = d => d < 1 ? '<1 dia' : Math.round(d) + ' dia' + (Math.round(d) === 1 ? '' : 's');
        const geral = media(dias);
        const rows = Object.entries(porVend).filter(([n]) => n !== '—')
          .map(([n, arr]) => ({ n, m: media(arr), c: arr.length }))
          .sort((a, b) => a.m - b.m).slice(0, 6);
        const maxM = Math.max(1, ...rows.map(r => r.m));
        const bars = rows.map(r =>
          `<div class="mbar"><span class="mbar__lab">${esc(r.n)} <small class="mbar__prob">${r.c}</small></span><div class="mbar__track"><div class="mbar__fill" style="width:${Math.round(r.m / maxM * 100)}%"></div></div><span class="mbar__val">${fmtD(r.m)}</span></div>`).join('');
        cicloCard = `<div class="mcard"><h3 class="mcard__t">Ciclo de venda · média <b style="color:var(--violet)">${fmtD(geral)}</b></h3>${bars}<p class="mcard__hint">Tempo entre o pedido chegar e o fechamento (última atividade registrada), nas ${dias.length} venda(s) com histórico. Quanto menor, melhor.</p></div>`;
      }
    }

    $('#dashMetrics').innerHTML = kpis + convCard + fcCard + metasCard + teamCard + cicloCard +
      `<div class="mcard"><h3 class="mcard__t">Distribuição do funil</h3>${funil}</div>` +
      prodCard +
      cupCard +
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

    const lead = isSiteLead(r);
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
        <button class="dc-dup" data-act="dup-orc" type="button">⧉ Duplicar</button>
        <button class="dc-ct" data-act="contrato-orc" type="button">📜 Contrato</button>
        <button class="dc-prop" data-act="prop-orc" type="button">🔗 Proposta</button>
        <button class="dc-del" data-act="del-orc" type="button">🗑 Excluir</button>
      </div>
    </div>`;
  }
  // ---- proposta online: link com os dados codificados (sem expor o banco) ----
  function propostaLink(o) {
    const w = String((Cloud.profile && (Cloud.profile.celular || Cloud.profile.telefone)) || (P().contato && P().contato.whatsapp) || '').replace(/\D/g, '');
    const data = {
      n: o.numero || '', c: o.cliente_nome || '', v: o.vendedor_nome || (Cloud.profile && Cloud.profile.nome) || '', w: w,
      it: (o.itens || []).map(i => ({ n: i.nome, q: i.qtd, u: i.unitario || i.preco || 0 })),
      s: Number(o.subtotal) || 0, d: Number(o.desconto) || 0, t: Number(o.total) || 0, e: Number(o.sinal) || 0,
      p: { n: Number(o.parcelas) || 0, v: Number(o.valor_parcela) || 0 }
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');   // .../ (sem app.html)
    return base + 'proposta.html#d=' + b64;
  }
  async function compartilharProposta(o) {
    if (!(o.itens || []).length) { toast('Adicione itens antes de gerar a proposta.'); return; }
    const url = propostaLink(o);
    const titulo = 'Proposta Torque Fitness' + (o.numero ? ' ' + o.numero : '');
    try {
      if (navigator.share) await navigator.share({ title: titulo, text: `Proposta para ${o.cliente_nome || 'você'}`, url: url });
      else { await navigator.clipboard.writeText(url); toast('Link da proposta copiado!'); }
    } catch (e) { /* usuário cancelou */ }
  }
  $('#dashList').addEventListener('click', async e => {
    const card = e.target.closest('.dcard'); if (!card) return;
    const id = card.dataset.id;
    const o = dashData.find(x => x.id === id); if (!o) return;
    if (e.target.dataset.act === 'edit-orc') editOrcamento(o);
    if (e.target.dataset.act === 'dup-orc') duplicarOrcamento(o);
    if (e.target.dataset.act === 'contrato-orc') contratoDeRow(o);
    if (e.target.dataset.act === 'prop-orc') compartilharProposta(o);
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
      err.innerHTML = 'IA indisponível — usei um modelo pronto. Escolha outro modelo acima, edite, ou ative a IA. <button type="button" id="suggestHelp" class="atv__help">Como ativar</button>';
      if (!txt.value) txt.value = followupTexto(o);   // fallback: nunca deixa a caixa vazia
      txt.placeholder = 'Escolha um modelo acima ou escreva sua mensagem.';
    } finally {
      $('#btnSuggestSend').disabled = $('#btnSuggestRegen').disabled = false;
    }
  }
  function openSuggest(o) { openWppFor(o); }   // mesmo modal: modelos + IA + edição
  // modelos: preenche o texto com a mensagem escolhida
  $('#wppTpls') && $('#wppTpls').addEventListener('click', e => {
    const b = e.target.closest('[data-tpl]'); if (!b) return;
    const o = dashData.find(x => x.id === suggestOrcId); if (!o) return;
    const t = WPP_TEMPLATES.find(x => x.key === b.dataset.tpl); if (!t) return;
    $('#suggestText').value = t.build(o); $('#suggestErr').hidden = true;
    $$('#wppTpls .wpp-tpl').forEach(el => el.classList.toggle('on', el === b));
  });
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
    // leads antigos do site não gravavam `desconto` (cupom embutido só no total):
    // reconstrói pela diferença subtotal−total para não perder o desconto prometido
    state.quote.descValue = Number(o.desconto) || Math.max(0, (Number(o.subtotal) || 0) - (Number(o.total) || 0)) || 0;
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

  // Duplicar: carrega itens/cliente/condições num NOVO orçamento (não altera o original)
  function duplicarOrcamento(o) {
    state.cart = {};
    let faltando = 0;
    (o.itens || []).forEach(it => {
      const p = state.products.find(x => x.codigo && x.codigo === it.codigo);
      if (p) state.cart[p.id] = (state.cart[p.id] || 0) + (Number(it.qtd) || 0);
      else faltando++;
    });
    state.quote.clienteId = o.cliente_id || null;
    state.quote.descMode = 'brl';
    // leads antigos do site não gravavam `desconto` (cupom embutido só no total):
    // reconstrói pela diferença subtotal−total para não perder o desconto prometido
    state.quote.descValue = Number(o.desconto) || Math.max(0, (Number(o.subtotal) || 0) - (Number(o.total) || 0)) || 0;
    state.quote.sinal = Number(o.sinal) || 0;
    editingOrcamentoId = null; editingNumero = ''; editingObs = '';   // NOVO orçamento
    $('#dashScreen').hidden = true; document.body.style.overflow = '';
    save(); render();
    if (o.parcelas) { $('#installSelect').value = String(o.parcelas); updateInstallValue(saldoFinanciar()); }
    $('#summaryBar').classList.add('open');
    toast('Cópia carregada — revise e gere um novo orçamento.' + (faltando ? ` (${faltando} item fora do catálogo)` : ''));
  }

  /* ------------------------------------------------------------
     BACKUP / EXPORTAÇÃO (CSV) — baixa uma cópia dos dados
     ------------------------------------------------------------ */
  const csvCell = v => { const s = String(v == null ? '' : v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const numBR = n => (Number(n) || 0).toFixed(2).replace('.', ',');
  const toCSV = rows => '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
  function downloadText(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    const lista = baseRows();
    if (!lista.length) { toast('Nada para exportar nesta visão.'); return; }
    const head = ['Número', 'Data', 'Cliente', 'Vendedor', 'Fase', 'Total', 'Subtotal', 'Desconto', 'Sinal', 'Parcelas', 'Valor parcela', 'Telefone', 'E-mail', 'Origem', 'Observação', 'Itens'];
    const rows = [head];
    lista.forEach(r => {
      const itens = (r.itens || []).map(i => `${i.qtd}x ${i.nome} (${numBR(i.unitario || i.preco || 0)})`).join(' | ');
      rows.push([
        r.numero || '', r.criado_em ? dmy(r.criado_em) : '', r.cliente_nome || '', r.vendedor_nome || '',
        stageName(stageOf(r)), numBR(r.total), numBR(r.subtotal), numBR(r.desconto), numBR(r.sinal),
        r.parcelas || '', numBR(r.valor_parcela), r.contato_telefone || '', r.contato_email || '',
        r.origem || '', r.obs || '', itens
      ]);
    });
    downloadText(`torque-orcamentos-${stamp}.csv`, toCSV(rows));
    let extra = '';
    if ((state.clientes || []).length) {
      const ch = ['Nome', 'Empresa', 'Telefone', 'E-mail', 'Documento', 'Cidade', 'Observação'];
      const cr = [ch];
      state.clientes.forEach(c => cr.push([c.nome || '', c.empresa || '', c.telefone || '', c.email || '', c.doc || '', c.cidade || '', c.obs || '']));
      setTimeout(() => downloadText(`torque-clientes-${stamp}.csv`, toCSV(cr)), 500);
      extra = ` + ${state.clientes.length} cliente(s)`;
    }
    toast(`Backup gerado: ${lista.length} orçamento(s)${extra}.`);
  }
  $('#btnBackup') && $('#btnBackup').addEventListener('click', exportBackup);

  // Fechamento de comissão: exporta as vendas fechadas + comissão (filtra o período no Excel pela coluna Mês)
  function exportComissoes() {
    const comPct = Number(P().comissao) || 0;
    const ganhos = (dashData || []).filter(r => stageOf(r) === 'ganho')
      .sort((a, b) => new Date(a.criado_em || 0) - new Date(b.criado_em || 0));
    if (!ganhos.length) { toast('Nenhuma venda fechada para exportar.'); return; }
    const head = ['Mês', 'Data', 'Número', 'Cliente', 'Vendedor', 'Valor fechado', 'Comissão %', 'Comissão R$'];
    const rows = [head];
    ganhos.forEach(r => {
      const val = Number(r.total) || 0;
      rows.push([String(r.criado_em || '').slice(0, 7), r.criado_em ? dmy(r.criado_em) : '', r.numero || '',
        r.cliente_nome || '', r.vendedor_nome || '', numBR(val), numBR(comPct), numBR(val * comPct / 100)]);
    });
    downloadText(`torque-comissoes-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    toast(`${ganhos.length} venda(s) fechada(s) exportada(s).` + (comPct ? '' : ' Defina a comissão (%) nos Parâmetros.'));
  }
  $('#btnComissoes') && $('#btnComissoes').addEventListener('click', exportComissoes);

  /* ------------------------------------------------------------
     DISTRIBUIÇÃO DE LEADS — rodízio entre vendedores (admin)
     ------------------------------------------------------------ */
  async function distribuirLeads() {
    if (!(Cloud.isAdmin && Cloud.isAdmin())) { toast('Apenas o admin distribui leads.'); return; }
    const leads = dashData.filter(r => isSiteLead(r) && !String(r.vendedor_nome || '').trim() && emAberto(r));
    if (!leads.length) { toast('Nenhum lead do site sem vendedor.'); return; }
    let vends;
    try { vends = (await Cloud.listVendedores()).filter(v => v.role !== 'admin' && v.ativo !== false); }
    catch (e) { console.error(e); toast('Não foi possível carregar os vendedores.'); return; }
    if (!vends.length) { toast('Cadastre vendedores para distribuir.'); return; }
    if (!confirm(`Distribuir ${leads.length} lead(s) entre ${vends.length} vendedor(es) em rodízio?`)) return;
    let ok = 0;
    for (let i = 0; i < leads.length; i++) {
      const v = vends[i % vends.length];
      try {
        await Cloud.updateOrcamento(leads[i].id, { vendedor_id: v.id, vendedor_nome: v.nome });
        leads[i].vendedor_id = v.id; leads[i].vendedor_nome = v.nome; ok++;
      } catch (err) { console.error(err); }
    }
    renderDashboard();
    toast(`${ok} de ${leads.length} lead(s) distribuído(s).`);
  }
  $('#btnDistribuir') && $('#btnDistribuir').addEventListener('click', distribuirLeads);

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
