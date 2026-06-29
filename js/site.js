/* ============================================================
   TORQUE FITNESS — Site público (vitrine + captação de lead)
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = n => BRL.format(Number.isFinite(n) ? n : 0);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CART_KEY = 'torque_site_cart';

  const DATA = window.TORQUE_PUBLIC || { products: [], params: {} };
  const PARAMS = DATA.params || {};
  let PRODUCTS = (DATA.products || []).filter(p => p.preco > 0);   // catálogo embutido (substituído pelo ao vivo, se houver)
  const SITE = window.TORQUE_SITE || {};
  const DESC = window.TORQUE_DESCRICOES || {};
  const normName = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function prodDescHTML(p) {
    const d = DESC[normName(p.nome)];
    if (!d) return `${esc(p.nome)} — equipamento ${p.serie ? 'da linha ' + esc(p.serie) + ' ' : ''}Torque Fitness, padrão comercial. Solicite o orçamento e fale com um consultor.`;
    const row = (lab, val) => (val && val !== '—') ? `<span class="pm-desc__row"><b>${lab}:</b> ${esc(val)}</span>` : '';
    return row('Função', d.f) + row('Músculos', d.m) + row('Biomecânica', d.b) + row('Indicação', d.i) + row('Dica de execução', d.d);
  }
  const PAGE = 24;
  const byCode = code => PRODUCTS.find(x => x.codigo === code);

  let cart = load();
  let filterSerie = 'all';
  let filterTipo = 'all';   // 'all' | 'maquina' | 'acessorio'
  const TIPO_LABEL = { maquina: 'Máquinas', acessorio: 'Acessórios' };
  let BANNERS = {};         // imagens de banner por categoria (nome → URL), vindas do catalog.json
  const bannerImg = nome => BANNERS[nome] || '';
  // dados de localização/contato (default + ao vivo via catalog.json → data.site)
  let SITEINFO = Object.assign({ endereco: '', mapsUrl: '', telefone: '', whatsapp: SITE.whatsapp || '', email: '', horario: '', gaId: '', metaPixel: '', faq: [], depoimentos: [] }, window.TORQUE_SITE_INFO || {});
  let CAROUSEL = {};        // imagem por slide do carrossel (id → URL), vinda do catalog.json
  let query = '';
  let priceBand = 'all';
  let sortBy = 'rel';
  let shown = PAGE;

  function load() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }

  const plate = `<svg class="pcard__plate-svg" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="#3A3A48" stroke-width="3"/><circle cx="50" cy="50" r="13" fill="#1D1D27" stroke="#8B5CF6" stroke-width="3"/><g stroke="#3A3A48" stroke-width="3"><line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/><line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/></g></svg>`;

  /* ---------- séries ---------- */
  function series() {
    return Array.from(new Set(PRODUCTS.map(p => p.serie || 'Geral'))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  function countSerie(s) { return PRODUCTS.filter(p => (p.serie || 'Geral') === s).length; }

  function renderSeries() {
    $('#seriesGrid').innerHTML = series().map(s =>
      `<div class="scard ${filterSerie === s ? 'active' : ''}" data-serie="${esc(s)}"><b>${esc(s)}</b><span>${countSerie(s)} itens</span></div>`
    ).join('');
    $('#statProdutos').textContent = PRODUCTS.length;
    $('#statSeries').textContent = series().length;
  }
  function renderChips() {
    const all = ['all', ...series()];
    $('#chips').innerHTML = all.map(s =>
      `<button class="chip ${filterSerie === s ? 'active' : ''}" data-serie="${esc(s)}">${s === 'all' ? 'Todos' : esc(s)}</button>`
    ).join('');
  }

  /* ---------- catálogo ---------- */
  function inBand(preco) {
    if (priceBand === 'all') return true;
    const [lo, hi] = priceBand.split('-');
    const min = Number(lo) || 0;
    const max = hi === '' || hi === undefined ? Infinity : Number(hi);
    return preco >= min && preco < max;
  }
  function filtered() {
    const q = query.trim().toLowerCase();
    const list = PRODUCTS.filter(p => {
      if (filterSerie !== 'all' && (p.serie || 'Geral') !== filterSerie) return false;
      if (filterTipo !== 'all') { const t = p.tipo || 'maquina'; if (filterTipo === 'acessorio' ? t !== 'acessorio' : t === 'acessorio') return false; }
      if (!inBand(p.preco)) return false;
      if (q && !((p.nome + ' ' + p.codigo + ' ' + p.serie).toLowerCase().includes(q))) return false;
      return true;
    });
    if (sortBy === 'price-asc') list.sort((a, b) => a.preco - b.preco);
    else if (sortBy === 'price-desc') list.sort((a, b) => b.preco - a.preco);
    else if (sortBy === 'name-asc') list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return list;
  }
  function filtersActive() { return filterSerie !== 'all' || query.trim() !== '' || priceBand !== 'all' || sortBy !== 'rel'; }
  function renderMeta(count) {
    const total = PRODUCTS.length;
    const rc = $('#resultCount');
    if (rc) rc.innerHTML = (count === total) ? `<b>${total}</b> produtos` : `<b>${count}</b> produto${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`;
    const cf = $('#clearFilters');
    if (cf) cf.hidden = !filtersActive();
  }
  const qtyOf = code => Number(cart[code]) || 0;

  function pcardHTML(p) {
    const q = qtyOf(p.codigo);
    const media = p.imagem
      ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy" decoding="async" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__plate))"/>`
      : plate;
    const ctrl = q > 0
      ? `<div class="pcard__stepper" data-code="${esc(p.codigo)}"><button data-act="dec">−</button><input data-act="qty" inputmode="numeric" value="${q}"/><button data-act="inc">+</button></div>`
      : `<button class="pcard__add" data-act="add" data-code="${esc(p.codigo)}">+ Adicionar</button>`;
    return `<article class="pcard ${q > 0 ? 'in' : ''}" data-code="${esc(p.codigo)}">
      <div class="pcard__media">${p.selo ? `<span class="pcard__selo">${esc(p.selo)}</span>` : ''}${media}</div>
      <div class="pcard__b">
        <span class="pcard__serie">${esc(p.serie || '')}</span>
        <span class="pcard__name">${esc(p.nome)}</span>
        ${p.disp ? `<span class="pcard__disp">📦 ${esc(p.disp)}</span>` : ''}
        <div class="pcard__sp"></div>
        <div class="pcard__price"><small>a partir de</small><b>${money(p.preco)}</b></div>
        ${ctrl}
      </div>
    </article>`;
  }
  function renderGrid() {
    const list = filtered();
    const slice = list.slice(0, shown);
    $('#prodGrid').innerHTML = slice.map(pcardHTML).join('');
    $('#empty').hidden = list.length !== 0;
    $('#loadMore').hidden = list.length <= shown;
    renderMeta(list.length);
  }

  /* ---------- carrinho / drawer ---------- */
  const cartLines = () => Object.keys(cart).map(code => {
    const p = PRODUCTS.find(x => x.codigo === code); if (!p) return null;
    const q = qtyOf(code); return { p, q, total: p.preco * q };
  }).filter(Boolean).filter(l => l.q > 0);
  const cartTotal = () => cartLines().reduce((s, l) => s + l.total, 0);
  const cartCount = () => cartLines().reduce((s, l) => s + l.q, 0);

  function setQty(code, q) { q = Math.max(0, Math.floor(q || 0)); if (q <= 0) delete cart[code]; else cart[code] = q; save(); }

  function refreshCounts() { $('#cartCount').textContent = cartCount(); }
  function renderDrawer() {
    const lines = cartLines();
    $('#drawerItems').innerHTML = lines.length ? lines.map(l => {
      const media = l.p.imagem ? `<img src="${esc(l.p.imagem)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'"/>` : `<span></span>`;
      return `<div class="ditem" data-code="${esc(l.p.codigo)}">
        ${media}
        <div><div class="ditem__nm">${esc(l.p.nome)}</div><div class="ditem__pr">${money(l.p.preco)} un</div></div>
        <div class="ditem__step"><button data-act="dec">−</button><input data-act="qty" inputmode="numeric" value="${l.q}"/><button data-act="inc">+</button></div>
      </div>`;
    }).join('') : `<p class="drawer__empty">Seu orçamento está vazio.<br>Adicione equipamentos para começar.</p>`;
    const total = cartTotal();
    $('#drawerTotal').textContent = money(total);
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    $('#drawerParcela').textContent = total > 0 ? `ou até ${maxN}× de ${money(total / maxN)}` : '';
    $('#btnSolicitar').disabled = total <= 0;
  }
  function syncAll() { refreshCounts(); renderGrid(); renderDrawer(); }

  /* ---------- eventos ---------- */
  document.addEventListener('input', e => {
    const code = e.target.closest('[data-code]')?.dataset.code;
    if (e.target.dataset.act === 'qty' && code) { setQty(code, parseInt(e.target.value, 10) || 0); refreshCounts(); renderDrawer(); if (e.target.closest('.pcard')) renderGrid(); }
  });
  document.addEventListener('click', e => {
    const act = e.target.dataset.act;
    const codeEl = e.target.closest('[data-code]');
    const code = codeEl && codeEl.dataset.code;
    if (e.target.closest('[data-cact="orc"]')) { e.preventDefault(); askOrc(); return; }
    if (act === 'add' && code) { setQty(code, 1); syncAll(); toast('Adicionado ao orçamento'); return; }
    if (act === 'inc' && code) { setQty(code, qtyOf(code) + 1); syncAll(); return; }
    if (act === 'dec' && code) { setQty(code, qtyOf(code) - 1); syncAll(); return; }
    const sc = e.target.closest('[data-serie]');
    if (sc) { e.preventDefault(); const scroll = sc.classList.contains('scard') || sc.classList.contains('nav__mi'); goToLinha(sc.dataset.serie, true, scroll); return; }
    const tp = e.target.closest('[data-tipo]');
    if (tp) { e.preventDefault(); goToTipo(tp.dataset.tipo, true, true); return; }
    if (e.target.closest('[data-dclose]')) closeDrawer();
    if (e.target.closest('[data-lclose]')) closeLead();
    if (e.target.closest('[data-pclose]')) closeProd();
    if (e.target.closest('[data-mclose]')) closeMenu();
    // abrir detalhe do produto (clique no card, fora dos botões)
    const pc = e.target.closest('.pcard');
    if (pc && !e.target.closest('button') && !e.target.closest('input')) openProd(pc.dataset.code);
  });
  $('#search').addEventListener('input', e => { query = e.target.value; shown = PAGE; renderGrid(); });
  $('#priceBand').addEventListener('change', e => { priceBand = e.target.value; shown = PAGE; renderGrid(); });
  $('#sortBy').addEventListener('change', e => { sortBy = e.target.value; shown = PAGE; renderGrid(); });
  $('#clearFilters').addEventListener('click', () => goToLinha('all', true, false));
  $('#loadMore').addEventListener('click', () => { shown += PAGE; renderGrid(); });
  $('#navCart').addEventListener('click', openDrawer);

  function openDrawer() { renderDrawer(); $('#drawer').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeDrawer() { $('#drawer').hidden = true; document.body.style.overflow = ''; }

  /* ---------- lead ---------- */
  $('#btnSolicitar').addEventListener('click', openLead);
  function askOrc() { if (cartCount()) openLead(); else { document.getElementById('produtos').scrollIntoView({ behavior: 'smooth' }); toast('Escolha alguns equipamentos primeiro'); } }
  const ctaOrcBtn = $('#ctaOrc'); if (ctaOrcBtn) ctaOrcBtn.addEventListener('click', askOrc);
  const heroOrcBtn = $('#heroOrc'); if (heroOrcBtn) heroOrcBtn.addEventListener('click', askOrc);

  function openLead() {
    if (!cartCount()) { toast('Seu orçamento está vazio'); return; }
    resetLeadForm();
    $('#leadModal').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeLead() { $('#leadModal').hidden = true; document.body.style.overflow = ''; }
  function resetLeadForm() {
    $('#leadTitle').textContent = 'Solicitar orçamento';
    $('#leadBody').innerHTML = leadFormHTML();
    $('#btnEnviarLead').style.display = '';
    bindLeadInputs();
  }
  function leadFormHTML() {
    return `<p class="lmodal__hint">Você selecionou <b>${cartCount()}</b> item(ns) · total estimado <b>${money(cartTotal())}</b>.<br>Preencha seus dados e um consultor entra em contato.</p>
      <label class="field"><span>Nome *</span><input id="leadNome" type="text" autocomplete="name" /></label>
      <div class="lgrid">
        <label class="field"><span>WhatsApp / Telefone *</span><input id="leadTel" type="tel" inputmode="tel" autocomplete="tel" /></label>
        <label class="field"><span>Cidade / UF</span><input id="leadCidade" type="text" /></label>
      </div>
      <label class="field"><span>E-mail</span><input id="leadEmail" type="email" inputmode="email" autocomplete="email" /></label>
      <label class="field"><span>Mensagem (opcional)</span><textarea id="leadMsg" rows="2" placeholder="Ex.: montar uma academia, prazo, etc."></textarea></label>
      <p class="lmodal__err" id="leadErr" hidden></p>`;
  }
  function bindLeadInputs() {}

  // Supabase (insere o lead na mesma base do app)
  let sb = null;
  function db() {
    if (sb) return sb;
    const cfg = window.TORQUE_SUPABASE;
    if (!cfg || !window.supabase) return null;
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    return sb;
  }

  $('#btnEnviarLead').addEventListener('click', enviarLead);
  async function enviarLead() {
    const nome = ($('#leadNome').value || '').trim();
    const tel = ($('#leadTel').value || '').trim();
    const cidade = ($('#leadCidade').value || '').trim();
    const email = ($('#leadEmail').value || '').trim();
    const msg = ($('#leadMsg').value || '').trim();
    const err = $('#leadErr');
    if (!nome || !tel) { err.textContent = 'Informe nome e WhatsApp/telefone.'; err.hidden = false; return; }
    const client = db();
    if (!client) { err.textContent = 'Sem conexão com o servidor. Tente novamente.'; err.hidden = false; return; }

    const lines = cartLines();
    const subtotal = cartTotal();
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    const btn = $('#btnEnviarLead'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const { error } = await client.from('orcamentos').insert({
        origem: 'site',
        cliente_nome: nome,
        contato_telefone: tel,
        contato_email: email,
        vendedor_nome: '',
        itens: lines.map(l => ({ codigo: l.p.codigo, nome: l.p.nome, qtd: l.q, unitario: l.p.preco, total: l.total })),
        subtotal: subtotal,
        total: subtotal,
        parcelas: maxN,
        valor_parcela: subtotal / maxN,
        status: 'novo',
        obs: [cidade ? 'Cidade: ' + cidade : '', msg ? 'Mensagem: ' + msg : ''].filter(Boolean).join(' | ')
      });
      if (error) throw error;
      if (window.fbq) try { fbq('track', 'Lead', { value: subtotal, currency: 'BRL' }); } catch (e) {}
      if (window.gtag) try { gtag('event', 'generate_lead', { value: subtotal, currency: 'BRL' }); } catch (e) {}
      cart = {}; save(); syncAll();
      $('#leadTitle').textContent = 'Pedido enviado!';
      $('#btnEnviarLead').style.display = 'none';
      $('#leadBody').innerHTML = `<div class="lead-ok"><div class="ico">✓</div>
        <h3>Recebemos seu pedido!</h3>
        <p>Obrigado, <b>${esc(nome)}</b >. Um consultor Torque Fitness vai entrar em contato em breve pelo WhatsApp/telefone informado.</p></div>`;
    } catch (e) {
      console.error(e);
      err.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
      err.hidden = false;
      btn.disabled = false; btn.textContent = 'Enviar pedido';
    }
  }

  /* ---------- menu mobile ---------- */
  function closeMenu() { $('#mmenu').hidden = true; $('#navBurger').classList.remove('open'); }
  $('#navBurger').addEventListener('click', () => {
    const m = $('#mmenu'); m.hidden = !m.hidden; $('#navBurger').classList.toggle('open', !m.hidden);
  });
  // dropdown "Linhas" do menu (desktop)
  const linhasTrig = $('#linhasTrig');
  if (linhasTrig) linhasTrig.addEventListener('click', e => {
    e.stopPropagation();
    const d = $('#linhasMenu'); const abrir = d.hidden; d.hidden = !abrir;
    linhasTrig.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.nav__drop')) closeLinhasDrop(); });
  const linhaReset = $('#linhaReset');
  if (linhaReset) linhaReset.addEventListener('click', () => goToLinha('all', true, false));

  /* ---------- detalhe do produto + deep-link ---------- */
  let prodCode = null;
  const BASE_URL = location.origin + location.pathname;

  // captura o estado original do <head> para restaurar ao fechar o produto
  function metaProp(p) { const m = document.querySelector(`meta[property="${p}"]`); return m ? m.content : ''; }
  function metaName(n) { const m = document.querySelector(`meta[name="${n}"]`); return m ? m.content : ''; }
  const DEFAULT_META = {
    title: document.title,
    desc: metaName('description'),
    ogTitle: metaProp('og:title'), ogDesc: metaProp('og:description'),
    ogUrl: metaProp('og:url'), ogImage: metaProp('og:image'),
    ogType: metaProp('og:type') || 'website',
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || BASE_URL
  };
  function setProp(prop, val) { let m = document.querySelector(`meta[property="${prop}"]`); if (!m) { m = document.createElement('meta'); m.setAttribute('property', prop); document.head.appendChild(m); } m.setAttribute('content', val); }
  function setNameMeta(name, val) { let m = document.querySelector(`meta[name="${name}"]`); if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m); } m.setAttribute('content', val); }
  function setCanonical(href) { let l = document.querySelector('link[rel="canonical"]'); if (!l) { l = document.createElement('link'); l.setAttribute('rel', 'canonical'); document.head.appendChild(l); } l.setAttribute('href', href); }

  const currentCode = () => new URLSearchParams(location.search).get('p');
  const prodURL = p => BASE_URL + '?p=' + encodeURIComponent(p.codigo);

  /* ---------- navegação por LINHA (cada linha tem seu link ?linha=) ---------- */
  const currentLinha = () => new URLSearchParams(location.search).get('linha');
  const currentTipo = () => new URLSearchParams(location.search).get('tipo');
  function lineMenuHTML() {
    const items = series().map(s => `<a href="?linha=${encodeURIComponent(s)}" data-serie="${esc(s)}" class="nav__mi"><span>${esc(s)}</span><i>${countSerie(s)}</i></a>`).join('');
    return `<a href="${BASE_URL}" data-serie="all" class="nav__mi nav__mi--all">Todas as linhas</a>` + items;
  }
  function renderLinhasMenu() {
    const d = $('#linhasMenu'); if (d) d.innerHTML = lineMenuHTML();
    const m = $('#mLinhas'); if (m) m.innerHTML = lineMenuHTML();
  }
  function currentViewName() {
    if (filterTipo !== 'all') return TIPO_LABEL[filterTipo] || null;
    if (filterSerie && filterSerie !== 'all') return filterSerie;
    return null;
  }
  function renderCatBanner() {
    const b = $('#catBanner'); if (!b) return;
    const nome = currentViewName();
    if (!nome) { b.hidden = true; b.innerHTML = ''; b.className = 'catbanner'; b.style.backgroundImage = ''; return; }
    const img = bannerImg(nome);
    b.hidden = false;
    b.className = 'catbanner' + (img ? ' catbanner--img' : '');
    b.style.backgroundImage = img ? `linear-gradient(to top, rgba(11,11,15,.86), rgba(11,11,15,.45)), url("${img}")` : '';
    b.innerHTML = `
      ${img ? '' : `<div class="catbanner__bg" aria-hidden="true">${plate}</div>`}
      <div class="catbanner__inner">
        <nav class="catbanner__crumb"><a href="${BASE_URL}" data-serie="all">Início</a><span>›</span><b>${esc(nome)}</b></nav>
        <h1 class="catbanner__title">${esc(nome)}</h1>
        <p class="catbanner__sub">Equipamentos profissionais Torque Fitness</p>
      </div>`;
  }
  // página focada: dentro de uma categoria, esconde o hero e a seção "Nossas linhas"
  function applyViewLayout() {
    const cat = !!currentViewName();
    ['topo', 'series', 'montar'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = cat ? 'none' : ''; });
    document.body.classList.toggle('cat-view', cat);
  }
  function renderLinhaHead() {
    const t = $('#catTitle'), r = $('#linhaReset');
    const nome = currentViewName();
    if (t) t.textContent = nome || 'Equipamentos';
    if (r) r.hidden = !nome;
    renderCatBanner();
    applyViewLayout();
    applyCategoryMeta();
  }
  function closeLinhasDrop() {
    const d = $('#linhasMenu'); if (d) d.hidden = true;
    const tr = $('#linhasTrig'); if (tr) tr.setAttribute('aria-expanded', 'false');
  }
  function resetFiltros() {
    query = ''; priceBand = 'all'; sortBy = 'rel'; shown = PAGE;
    const si = $('#search'); if (si) si.value = '';
    const pb = $('#priceBand'); if (pb) pb.value = 'all';
    const so = $('#sortBy'); if (so) so.value = 'rel';
  }
  function afterNav(push, urlParam, scroll) {
    if (push !== false) history[push === 'replace' ? 'replaceState' : 'pushState']({}, '', urlParam ? (BASE_URL + urlParam) : BASE_URL);
    renderSeries(); renderChips(); renderGrid(); renderLinhaHead();
    closeLinhasDrop(); closeMenu();
    if (scroll) { const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
  }
  function goToLinha(serie, push, scroll) {
    filterSerie = serie || 'all'; filterTipo = 'all'; resetFiltros();
    afterNav(push, filterSerie !== 'all' ? '?linha=' + encodeURIComponent(filterSerie) : '', scroll);
  }
  function goToTipo(tipo, push, scroll) {
    filterTipo = (tipo === 'maquina' || tipo === 'acessorio') ? tipo : 'all';
    filterSerie = 'all'; resetFiltros();
    afterNav(push, filterTipo !== 'all' ? '?tipo=' + filterTipo : '', scroll);
  }
  function prodImageAbs(p) { try { return p.imagem ? new URL(p.imagem, BASE_URL).href : DEFAULT_META.ogImage; } catch (e) { return DEFAULT_META.ogImage; } }
  function prodDesc(p) { return `${p.nome} — equipamento ${p.serie ? 'da linha ' + p.serie + ' ' : ''}Torque Fitness, padrão comercial. A partir de ${money(p.preco)}. Solicite o orçamento e fale com um consultor.`; }

  // dados estruturados de Produto (Google) — injeta ao abrir o produto, remove ao fechar
  function setProductLd(p) {
    let s = document.getElementById('ldProd');
    if (!p) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldProd'; document.head.appendChild(s); }
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product',
      name: p.nome, image: prodImageAbs(p), sku: p.codigo || undefined,
      category: p.serie || undefined,
      brand: { '@type': 'Brand', name: 'Torque Fitness' },
      offers: { '@type': 'Offer', priceCurrency: 'BRL', price: Number(p.preco) || 0, availability: 'https://schema.org/InStock', url: prodURL(p) }
    });
  }
  function applyProdMeta(p) {
    const t = `${p.nome} · Torque Fitness`, d = prodDesc(p), u = prodURL(p), img = prodImageAbs(p);
    document.title = t;
    setNameMeta('description', d);
    setProp('og:type', 'product'); setProp('og:title', t); setProp('og:description', d);
    setProp('og:url', u); setProp('og:image', img);
    setNameMeta('twitter:title', t); setNameMeta('twitter:description', d); setNameMeta('twitter:image', img);
    setCanonical(u);
    setProductLd(p);
  }
  function restoreMeta() {
    document.title = DEFAULT_META.title;
    setNameMeta('description', DEFAULT_META.desc);
    setProp('og:type', DEFAULT_META.ogType); setProp('og:title', DEFAULT_META.ogTitle); setProp('og:description', DEFAULT_META.ogDesc);
    setProp('og:url', DEFAULT_META.ogUrl); setProp('og:image', DEFAULT_META.ogImage);
    setNameMeta('twitter:title', DEFAULT_META.ogTitle); setNameMeta('twitter:description', DEFAULT_META.ogDesc); setNameMeta('twitter:image', DEFAULT_META.ogImage);
    setCanonical(DEFAULT_META.canonical);
    setProductLd(null);
  }
  // título/descrição por categoria (linha ou tipo) — melhora busca e compartilhamento
  function applyCategoryMeta() {
    if (currentCode()) return;                 // produto aberto tem prioridade
    const nome = currentViewName();
    if (!nome) { restoreMeta(); return; }
    const n = filtered().length;
    const t = `${nome} · Torque Fitness`;
    const d = `${nome}: ${n} equipamento${n === 1 ? '' : 's'} Torque Fitness de padrão comercial. Veja preços, monte seu orçamento e fale com um consultor.`;
    const u = BASE_URL + (currentTipo() ? '?tipo=' + currentTipo() : (currentLinha() ? '?linha=' + encodeURIComponent(currentLinha()) : ''));
    document.title = t;
    setNameMeta('description', d);
    setProp('og:type', 'website'); setProp('og:title', t); setProp('og:description', d); setProp('og:url', u);
    setNameMeta('twitter:title', t); setNameMeta('twitter:description', d);
    setCanonical(u);
  }

  function prodCtrlHTML(p) {
    const q = qtyOf(p.codigo);
    return q > 0
      ? `<div class="pmodal__stepper" data-code="${esc(p.codigo)}"><button data-act="dec">−</button><input data-act="qty" inputmode="numeric" value="${q}"/><button data-act="inc">+</button></div>`
      : `<button class="pmodal__add" data-act="add" data-code="${esc(p.codigo)}">+ Adicionar ao orçamento</button>`;
  }
  // extrai o ID de um vídeo do YouTube (vários formatos de link)
  function ytId(url) {
    if (!url) return '';
    const s = String(url).trim();
    const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
    return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : '');
  }
  function galleryHTML(p) {
    const imgs = [p.imagem, ...(Array.isArray(p.imagens) ? p.imagens : [])].filter(Boolean);
    const vid = ytId(p.video);
    const cover = imgs[0] || '';
    const mainHTML = cover
      ? `<img src="${esc(cover)}" alt="${esc(p.nome)}" decoding="async" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__plate))"/>`
      : plate;
    if (imgs.length <= 1 && !vid) return mainHTML;   // só uma imagem → sem miniaturas
    const thumbs = imgs.map((u, i) => `<button class="pmthumb ${i === 0 ? 'on' : ''}" type="button" data-img="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy" /></button>`).join('')
      + (vid ? `<button class="pmthumb pmthumb--vid" type="button" data-vid="${esc(vid)}"><img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="vídeo" loading="lazy" /><span class="pmthumb__play">▶</span></button>` : '');
    return `<div class="pmgal"><div class="pmgal__main" id="pmgalMain">${mainHTML}</div><div class="pmgal__thumbs">${thumbs}</div></div>`;
  }
  (function wireGallery() {
    const media = $('#pmMedia'); if (!media) return;
    media.addEventListener('click', e => {
      const main = $('#pmgalMain'); if (!main) return;
      const it = e.target.closest('[data-img]'), vt = e.target.closest('[data-vid]');
      if (it) { main.innerHTML = `<img src="${esc(it.dataset.img)}" alt="" decoding="async" />`; }
      else if (vt) { main.innerHTML = `<div class="pmgal__video"><iframe src="https://www.youtube.com/embed/${esc(vt.dataset.vid)}?autoplay=1&rel=0" title="Vídeo do produto" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>`; }
      else return;
      $$('.pmthumb', media).forEach(t => t.classList.toggle('on', t === (it || vt)));
    });
  })();
  function openProd(code, push) {
    const p = byCode(code); if (!p) return;
    prodCode = code;
    $('#pmMedia').innerHTML = galleryHTML(p);
    $('#pmSerie').textContent = (p.selo ? p.selo + ' · ' : '') + (p.serie || '');
    $('#pmNome').textContent = p.nome;
    $('#pmDims').textContent = p.dims ? 'Dimensões: ' + p.dims + ' mm' : '';
    const dispEl = $('#pmDisp');
    if (dispEl) { if (p.disp) { dispEl.textContent = '📦 ' + p.disp; dispEl.hidden = false; } else { dispEl.hidden = true; } }
    $('#pmDesc').innerHTML = prodDescHTML(p);
    $('#pmPrice').textContent = money(p.preco);
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    $('#pmParc').textContent = `ou ${maxN}× de ${money(p.preco / maxN)}`;
    $('#pmCtrl').innerHTML = prodCtrlHTML(p);
    $('#prodModal').hidden = false; document.body.style.overflow = 'hidden';
    applyProdMeta(p);
    if (push !== false && currentCode() !== code) history.pushState({ prod: code }, '', prodURL(p));
  }
  function closeProdDOM() {
    $('#prodModal').hidden = true; prodCode = null;
    restoreMeta();
    if (!$('#drawer').hidden || !$('#leadModal').hidden) return;
    document.body.style.overflow = '';
  }
  function closeProd() {
    if (currentCode()) history.replaceState({}, '', BASE_URL);
    closeProdDOM();
  }
  function refreshProd() { if (prodCode) { const p = byCode(prodCode); if (p) $('#pmCtrl').innerHTML = prodCtrlHTML(p); } }

  // botão voltar/avançar do navegador sincroniza o modal com a URL
  window.addEventListener('popstate', () => {
    const code = currentCode();
    if (code && byCode(code)) { if (prodCode !== code) openProd(code, false); }
    else if (prodCode) closeProdDOM();
    const tp = currentTipo(), ln = currentLinha();        // voltar/avançar troca a vista
    if (tp) { if (filterTipo !== tp) goToTipo(tp, false, false); }
    else if (ln) { if (filterSerie !== ln || filterTipo !== 'all') goToLinha(ln, false, false); }
    else if (filterSerie !== 'all' || filterTipo !== 'all') goToLinha('all', false, false);
  });

  // compartilhar (Web Share API no celular; copia o link no desktop)
  // pedir este produto no WhatsApp (mensagem já com nome/código/preço)
  const wppProdBtn = $('#pmWpp');
  if (wppProdBtn) wppProdBtn.addEventListener('click', () => {
    if (!prodCode) return; const p = byCode(prodCode); if (!p) return;
    const n = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
    const txt = encodeURIComponent(`Olá! Tenho interesse no equipamento *${p.nome}*${p.codigo ? ` (${p.codigo})` : ''} — ${money(p.preco)}. Pode me passar mais informações?`);
    if (window.fbq) try { fbq('track', 'Lead', { content_name: p.nome }); } catch (e) {}
    if (window.gtag) try { gtag('event', 'contact', { item_name: p.nome }); } catch (e) {}
    window.open(n ? `https://wa.me/${n}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank');
  });
  const shareBtn = $('#pmShare');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    if (!prodCode) return; const p = byCode(prodCode); if (!p) return;
    const url = prodURL(p), data = { title: `${p.nome} · Torque Fitness`, text: p.nome, url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); toast('Link copiado!'); }
    } catch (e) { /* usuário cancelou */ }
  });

  // re-render do controle do modal quando o carrinho muda
  const _sync = syncAll;
  syncAll = function () { _sync(); refreshProd(); };

  /* ---------- carrossel (hero) ---------- */
  function wppHref() {
    const n = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
    const m = encodeURIComponent(SITE.whatsappMsg || 'Olá! Quero um orçamento.');
    return n ? `https://wa.me/${n}?text=${m}` : `https://wa.me/?text=${m}`;
  }
  function applyWpp() { const el = $('#wppFloat'); if (el) el.href = wppHref(); }
  // depoimentos (prova social)
  function renderDepo() {
    const sec = $('#depoimentos'); if (!sec) return;
    const arr = Array.isArray(SITEINFO.depoimentos) ? SITEINFO.depoimentos : [];
    if (!arr.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#depoGrid').innerHTML = arr.map(d => `<figure class="depocard"><blockquote>“${esc(d.texto)}”</blockquote><figcaption><b>${esc(d.nome || 'Cliente')}</b>${d.local ? `<span>${esc(d.local)}</span>` : ''}</figcaption></figure>`).join('');
  }
  // FAQ + dados estruturados (FAQPage no Google)
  function setFaqLd(arr) {
    let s = document.getElementById('ldFaq');
    if (!arr || !arr.length) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldFaq'; document.head.appendChild(s); }
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: arr.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  function renderFaq() {
    const sec = $('#faq'); if (!sec) return;
    const arr = Array.isArray(SITEINFO.faq) ? SITEINFO.faq : [];
    if (!arr.length) { sec.hidden = true; setFaqLd(null); return; }
    sec.hidden = false;
    $('#faqList').innerHTML = arr.map((f, i) => `<div class="faqitem"><button class="faqitem__q" type="button" data-faq="${i}" aria-expanded="false">${esc(f.q)}<span class="faqitem__chev">▾</span></button><div class="faqitem__a" hidden>${esc(f.a)}</div></div>`).join('');
    setFaqLd(arr);
  }
  (function wireFaq() {
    const list = $('#faqList'); if (!list) return;
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-faq]'); if (!b) return;
      const a = b.nextElementSibling; const abrir = a.hidden;
      a.hidden = !abrir; b.setAttribute('aria-expanded', String(abrir)); b.classList.toggle('on', abrir);
    });
  })();
  // Analytics/Pixel: injeta o Google Analytics 4 e/ou o Meta Pixel quando os IDs estão configurados
  let analyticsDone = false;
  function injectAnalytics() {
    if (analyticsDone) return;
    const ga = String(SITEINFO.gaId || '').trim(), px = String(SITEINFO.metaPixel || '').trim();
    if (!ga && !px) return;
    analyticsDone = true;
    if (ga) {
      const s = document.createElement('script'); s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', ga);
    }
    if (px) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', px); window.fbq('track', 'PageView');
    }
  }
  const SLIDES = [
    { id: 'home', kind: 'home', grad: 'linear-gradient(135deg,#14121c,#1f1733)',
      tag: 'Linha profissional & comercial',
      title: 'Equipamentos de <span>alta performance</span>',
      sub: 'Racks, máquinas de força, funcionais, cardio e acessórios para academias, studios e CrossFit.',
      cta: [{ label: 'Ver produtos', act: 'scroll' }, { label: 'Solicitar orçamento', act: 'orc', ghost: true }] },
    { id: 'hm', kind: 'linha', linha: 'HM', grad: 'linear-gradient(135deg,#161226,#241a3d)',
      tag: 'Musculação', title: 'Linha HM',
      sub: 'Força e durabilidade para alta performance — máquinas robustas para uso intenso.',
      cta: [{ label: 'Conhecer a linha', act: 'linha', linha: 'HM' }] },
    { id: 'cardio', kind: 'linha', linha: 'Cardio', grad: 'linear-gradient(135deg,#101a26,#16263d)',
      tag: 'Cardio', title: 'Linha Cardio',
      sub: 'Esteiras, bikes e elípticos de padrão academia, prontos para alta rotatividade.',
      cta: [{ label: 'Ver cardio', act: 'linha', linha: 'Cardio' }] },
    { id: 'contato', kind: 'contato', grad: 'linear-gradient(135deg,#1a1326,#2a1840)',
      tag: 'Atendimento', title: 'Seu projeto, nossa experiência',
      sub: 'Monte sua academia do zero com quem entende. Fale com um consultor agora.',
      cta: [{ label: 'Falar no WhatsApp', act: 'wpp' }, { label: 'Montar orçamento', act: 'orc', ghost: true }] }
  ];
  let carIdx = 0, carTimer = null;
  // imagem do slide: a definida no carrossel tem prioridade; senão, o banner da linha (HM/Cardio)
  function slideImg(s) { return CAROUSEL[s.id] || (s.kind === 'linha' ? bannerImg(s.linha) : ''); }
  function slideBg(s) {
    const img = slideImg(s);
    return img ? `linear-gradient(to right, rgba(11,11,15,.92), rgba(11,11,15,.38)), url("${img}")` : s.grad;
  }
  function ctaBtnHTML(c) {
    const cls = 'btn ' + (c.ghost ? 'btn--ghost' : 'btn--primary');
    if (c.act === 'scroll') return `<a class="${cls}" href="#produtos">${esc(c.label)}</a>`;
    if (c.act === 'linha') return `<a class="${cls}" href="?linha=${encodeURIComponent(c.linha)}" data-serie="${esc(c.linha)}">${esc(c.label)}</a>`;
    if (c.act === 'wpp') return `<a class="${cls}" href="${wppHref()}" target="_blank" rel="noopener">${esc(c.label)}</a>`;
    if (c.act === 'orc') return `<button class="${cls}" type="button" data-cact="orc">${esc(c.label)}</button>`;
    return `<button class="${cls}" type="button">${esc(c.label)}</button>`;
  }
  function renderCarousel() {
    const track = $('#carTrack'); if (!track) return;
    track.innerHTML = SLIDES.map((s, i) => {
      const hasImg = !!slideImg(s);
      return `<div class="slide ${i === carIdx ? 'slide--active' : ''}" style="background-image:${slideBg(s)}">
        ${hasImg ? '' : `<div class="slide__deco" aria-hidden="true">${plate}</div>`}
        <div class="slide__inner">
          ${s.tag ? `<span class="slide__tag">${esc(s.tag)}</span>` : ''}
          <h1 class="slide__title">${s.title}</h1>
          <p class="slide__sub">${esc(s.sub)}</p>
          <div class="slide__cta">${s.cta.map(ctaBtnHTML).join('')}</div>
        </div>
      </div>`;
    }).join('');
    const dots = $('#carDots');
    if (dots) dots.innerHTML = SLIDES.map((s, i) => `<button type="button" class="${i === carIdx ? 'on' : ''}" data-cdot="${i}" aria-label="Slide ${i + 1}"></button>`).join('');
  }
  function goSlide(i) {
    carIdx = (i + SLIDES.length) % SLIDES.length;
    $$('.slide', $('#carTrack')).forEach((el, idx) => el.classList.toggle('slide--active', idx === carIdx));
    $$('#carDots button').forEach((el, idx) => el.classList.toggle('on', idx === carIdx));
  }
  function startCar() { stopCar(); if (SLIDES.length > 1) carTimer = setInterval(() => goSlide(carIdx + 1), 6000); }
  function stopCar() { if (carTimer) { clearInterval(carTimer); carTimer = null; } }
  (function wireCarousel() {
    const prev = $('#carPrev'), next = $('#carNext'), wrap = $('#carousel');
    if (prev) prev.addEventListener('click', () => { goSlide(carIdx - 1); startCar(); });
    if (next) next.addEventListener('click', () => { goSlide(carIdx + 1); startCar(); });
    if (wrap) {
      wrap.addEventListener('click', e => { const d = e.target.closest('[data-cdot]'); if (d) { goSlide(+d.dataset.cdot); startCar(); } });
      wrap.addEventListener('mouseenter', stopCar);
      wrap.addEventListener('mouseleave', startCar);
    }
  })();

  /* ---------- localização / contato ---------- */
  function renderContato() {
    const sec = $('#localizacao'); if (!sec) return;
    const i = SITEINFO;
    const has = i.endereco || i.telefone || i.mapsUrl || i.horario || i.email;
    if (!has) { sec.hidden = true; return; }
    sec.hidden = false;
    const rows = [];
    if (i.endereco) rows.push(`<div class="local__row"><span class="local__ic">📍</span><div><b>Endereço</b><p>${esc(i.endereco)}</p></div></div>`);
    if (i.telefone) rows.push(`<div class="local__row"><span class="local__ic">📞</span><div><b>Telefone / WhatsApp</b><p><a href="tel:${esc(i.telefone.replace(/[^\d+]/g, ''))}">${esc(i.telefone)}</a></p></div></div>`);
    if (i.email) rows.push(`<div class="local__row"><span class="local__ic">✉️</span><div><b>E-mail</b><p><a href="mailto:${esc(i.email)}">${esc(i.email)}</a></p></div></div>`);
    if (i.horario) rows.push(`<div class="local__row"><span class="local__ic">🕐</span><div><b>Atendimento</b><p>${esc(i.horario)}</p></div></div>`);
    const info = $('#locInfo'); if (info) info.innerHTML = rows.join('');
    const btn = $('#locMap'); if (btn) { if (i.mapsUrl) { btn.hidden = false; btn.href = i.mapsUrl; } else btn.hidden = true; }
    const box = $('#locMapBox'); if (box) { if (i.mapsUrl) { box.hidden = false; box.href = i.mapsUrl; } else box.hidden = true; }
  }

  /* ---------- WhatsApp flutuante ---------- */
  applyWpp();

  /* ---------- animações de rolagem ---------- */
  (function () {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window) || !els.length) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  })();

  /* ---------- catálogo em PDF (jsPDF via CDN, sob demanda) ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  async function baixarCatalogoPDF() {
    const btn = $('#btnCatalogoPdf');
    const list = filtered();
    if (!list.length) { toast('Nenhum produto para exportar.'); return; }
    let old = '';
    if (btn) { btn.disabled = true; old = btn.textContent; btn.textContent = 'Gerando…'; }
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      const Ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      if (!Ctor) throw new Error('jsPDF indisponível');
      const doc = new Ctor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      const M = 14, violet = [139, 92, 246], gray = [110, 110, 128];
      const hoje = new Date().toLocaleDateString('pt-BR');
      const viewName = currentViewName();
      let y = 0, page = 1;
      const header = () => {
        doc.setFillColor(11, 11, 15); doc.rect(0, 0, W, 26, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text('TORQUE FITNESS', M, 12);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(180, 180, 200);
        doc.text('Catálogo de equipamentos' + (viewName ? (' · ' + viewName) : ''), M, 18.5);
        doc.setTextColor(violet[0], violet[1], violet[2]); doc.text(hoje, W - M, 12, { align: 'right' });
        y = 34;
      };
      const footer = (n) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(gray[0], gray[1], gray[2]);
        const c = [SITEINFO.telefone, SITEINFO.email].filter(Boolean).join('   ·   ') || 'raphaelmarge.github.io/claudec';
        doc.text(c, M, H - 8); doc.text('Página ' + n, W - M, H - 8, { align: 'right' });
      };
      const ensure = (h) => { if (y + h > H - 14) { footer(page); doc.addPage(); page++; header(); } };
      header();
      const groups = {};
      list.forEach(p => { const s = p.serie || 'Geral'; (groups[s] = groups[s] || []).push(p); });
      Object.keys(groups).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(ln => {
        ensure(14);
        doc.setFillColor(244, 242, 250); doc.rect(M, y - 5, W - 2 * M, 9, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(violet[0], violet[1], violet[2]);
        doc.text(`${ln} (${groups[ln].length})`, M + 2, y + 1); y += 11;
        groups[ln].forEach(p => {
          ensure(8);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 50);
          const nome = p.nome.length > 56 ? p.nome.slice(0, 55) + '…' : p.nome;
          doc.text(nome, M + 2, y);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(gray[0], gray[1], gray[2]);
          doc.text(String(p.codigo || ''), M + 2, y + 3.6);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(violet[0], violet[1], violet[2]);
          doc.text(money(p.preco), W - M - 2, y, { align: 'right' });
          y += 8; doc.setDrawColor(232, 232, 238); doc.line(M + 2, y - 2.5, W - M - 2, y - 2.5);
        });
        y += 3;
      });
      footer(page);
      const nm = 'catalogo-torque-fitness' + (viewName ? '-' + viewName.replace(/\s+/g, '-').toLowerCase() : '') + '.pdf';
      doc.save(nm);
      toast('Catálogo gerado!');
    } catch (e) {
      console.error(e); toast('Não foi possível gerar o PDF agora.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old || '📄 Baixar catálogo (PDF)'; }
    }
  }
  const btnPdf = $('#btnCatalogoPdf');
  if (btnPdf) btnPdf.addEventListener('click', baixarCatalogoPDF);

  /* ---------- "Monte sua academia" (montador) ---------- */
  (function montador() {
    const sec = $('#montar'); if (!sec) return;
    const foco = $('#montarFoco'), porte = $('#montarPorte'), go = $('#btnMontar');
    if (foco) foco.addEventListener('click', e => { const b = e.target.closest('[data-foco]'); if (b) b.classList.toggle('on'); });
    if (porte) porte.addEventListener('click', e => { const b = e.target.closest('[data-porte]'); if (!b) return; $$('[data-porte]', porte).forEach(x => x.classList.toggle('on', x === b)); });
    const PORTE = { p: { mus: 4, car: 2, fun: 3 }, m: { mus: 10, car: 4, fun: 6 }, g: { mus: 18, car: 8, fun: 10 } };
    const isCardio = p => /cardio|esteira|bike|el[ií]ptic|escada|spinning|remo/i.test((p.serie || '') + ' ' + (p.nome || ''));
    const isAcessorio = p => (p.tipo || 'maquina') === 'acessorio';
    function pick(pool, n) { if (n <= 0 || !pool.length) return []; const step = Math.max(1, Math.floor(pool.length / n)); const out = []; for (let i = 0; i < pool.length && out.length < n; i += step) out.push(pool[i]); return out; }
    if (go) go.addEventListener('click', () => {
      const focos = $$('[data-foco].on', foco).map(b => b.dataset.foco);
      if (!focos.length) { toast('Escolha pelo menos um foco.'); return; }
      const ptEl = $('[data-porte].on', porte); const pt = (ptEl && ptEl.dataset.porte) || 'm';
      const cfg = PORTE[pt] || PORTE.m;
      const all = PRODUCTS.filter(p => p.preco > 0);
      let chosen = [];
      if (focos.includes('mus')) chosen = chosen.concat(pick(all.filter(p => !isAcessorio(p) && !isCardio(p)), cfg.mus));
      if (focos.includes('car')) chosen = chosen.concat(pick(all.filter(isCardio), cfg.car));
      if (focos.includes('fun')) chosen = chosen.concat(pick(all.filter(isAcessorio), cfg.fun));
      if (!chosen.length) { toast('Não encontrei itens para essa combinação.'); return; }
      chosen.forEach(p => { if (p.codigo) cart[p.codigo] = (cart[p.codigo] || 0) + 1; });
      save(); syncAll();
      if (window.gtag) try { gtag('event', 'montar_academia', { items: chosen.length }); } catch (e) {}
      if (window.fbq) try { fbq('track', 'AddToCart', { num_items: chosen.length }); } catch (e) {}
      openDrawer();
      toast(`Montamos ${chosen.length} equipamento(s) — revise e peça o orçamento!`);
    });
  })();

  /* ---------- toast ---------- */
  let tT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 2200); }

  /* ---------- init ---------- */
  window.__plate = plate;
  $('#ano').textContent = new Date().getFullYear();
  renderSeries(); renderChips(); renderGrid(); refreshCounts();
  renderLinhasMenu(); renderLinhaHead();
  renderCarousel(); startCar(); renderContato(); renderDepo(); renderFaq();
  // deep-link: ?linha=Cardio ou ?tipo=acessorio já entram filtrados
  (function initView() {
    const tp = currentTipo(), dl = currentLinha();
    if (tp) goToTipo(tp, 'replace', false);
    else if (dl) goToLinha(dl, 'replace', false);
    if (tp || dl) setTimeout(() => { const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 250);
  })();

  // catálogo ao vivo: lê o catalog.json publicado pelo app (bucket público) e
  // substitui a vitrine pelas edições do admin (nomes, preços e fotos atuais).
  async function loadLiveCatalog() {
    try {
      const cfg = window.TORQUE_SUPABASE;
      if (!cfg || !cfg.url) return;
      const url = cfg.url.replace(/\/+$/, '') + '/storage/v1/object/public/produtos/catalog.json?t=' + Date.now();
      const res = await fetch(url);
      if (!res.ok) return;                          // sem catálogo publicado ainda → mantém o embutido
      const data = await res.json();
      const items = (data && Array.isArray(data.products)) ? data.products : (Array.isArray(data) ? data : null);
      if (!items || !items.length) return;
      const live = items
        .filter(p => p && p.preco > 0 && !p.oculto)
        .map(p => ({ id: p.id, codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral', tipo: p.tipo || 'maquina', imagem: p.imagem || '', imagens: Array.isArray(p.imagens) ? p.imagens : [], video: p.video || '', dims: p.dims || '', disp: p.disp || '', selo: p.selo || '', preco: Number(p.preco) || 0 }));
      if (!live.length) return;
      PRODUCTS = live;
      if (data && data.banners && typeof data.banners === 'object') BANNERS = data.banners;   // banners por categoria
      if (data && data.carousel && typeof data.carousel === 'object') CAROUSEL = data.carousel;   // imagens do carrossel
      if (data && data.site && typeof data.site === 'object') SITEINFO = Object.assign(SITEINFO, data.site);   // contato/localização
      renderSeries(); renderChips(); renderGrid(); refreshCounts(); renderLinhasMenu();
      const tp = currentTipo(), dl = currentLinha();                    // re-aplica a vista com o catálogo ao vivo
      if (tp) goToTipo(tp, false, false); else if (dl) goToLinha(dl, false, false);
      renderLinhaHead(); renderCarousel(); renderContato(); renderDepo(); renderFaq(); applyWpp(); injectAnalytics();
    } catch (e) { /* offline ou bucket vazio → mantém o catálogo embutido */ }
  }
  loadLiveCatalog();

  // deep-link: se a URL já vier com ?p=codigo, abre o produto direto
  (function initDeepLink() {
    const code = currentCode();
    if (code && byCode(code)) {
      history.replaceState({ prod: code }, '', prodURL(byCode(code)));
      openProd(code, false);
    }
  })();
})();
