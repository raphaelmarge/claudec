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
    if (rc) rc.innerHTML = count === total ? `<b>${total}</b> produtos` : `<b>${count}</b> de ${total} produtos`;
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
      <div class="pcard__media">${media}</div>
      <div class="pcard__b">
        <span class="pcard__serie">${esc(p.serie || '')}</span>
        <span class="pcard__name">${esc(p.nome)}</span>
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
    if (act === 'add' && code) { setQty(code, 1); syncAll(); toast('Adicionado ao orçamento'); return; }
    if (act === 'inc' && code) { setQty(code, qtyOf(code) + 1); syncAll(); return; }
    if (act === 'dec' && code) { setQty(code, qtyOf(code) - 1); syncAll(); return; }
    const sc = e.target.closest('[data-serie]');
    if (sc) { e.preventDefault(); const scroll = sc.classList.contains('scard') || sc.classList.contains('nav__mi'); goToLinha(sc.dataset.serie, true, scroll); return; }
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
  $('#heroOrc').addEventListener('click', () => { if (cartCount()) openLead(); else { document.getElementById('produtos').scrollIntoView({ behavior: 'smooth' }); toast('Escolha alguns equipamentos primeiro'); } });
  $('#ctaOrc').addEventListener('click', () => { if (cartCount()) openLead(); else { document.getElementById('produtos').scrollIntoView({ behavior: 'smooth' }); toast('Escolha alguns equipamentos primeiro'); } });

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
  function lineMenuHTML() {
    const items = series().map(s => `<a href="?linha=${encodeURIComponent(s)}" data-serie="${esc(s)}" class="nav__mi"><span>${esc(s)}</span><i>${countSerie(s)}</i></a>`).join('');
    return `<a href="${BASE_URL}" data-serie="all" class="nav__mi nav__mi--all">Todas as linhas</a>` + items;
  }
  function renderLinhasMenu() {
    const d = $('#linhasMenu'); if (d) d.innerHTML = lineMenuHTML();
    const m = $('#mLinhas'); if (m) m.innerHTML = lineMenuHTML();
  }
  function renderLinhaHead() {
    const t = $('#catTitle'), r = $('#linhaReset');
    const ativa = filterSerie && filterSerie !== 'all';
    if (t) t.textContent = ativa ? filterSerie : 'Equipamentos';
    if (r) r.hidden = !ativa;
  }
  function closeLinhasDrop() {
    const d = $('#linhasMenu'); if (d) d.hidden = true;
    const tr = $('#linhasTrig'); if (tr) tr.setAttribute('aria-expanded', 'false');
  }
  function goToLinha(serie, push, scroll) {
    filterSerie = serie || 'all';
    query = ''; priceBand = 'all'; sortBy = 'rel'; shown = PAGE;
    const si = $('#search'); if (si) si.value = '';
    const pb = $('#priceBand'); if (pb) pb.value = 'all';
    const so = $('#sortBy'); if (so) so.value = 'rel';
    if (push !== false) {
      const url = (filterSerie !== 'all') ? (BASE_URL + '?linha=' + encodeURIComponent(filterSerie)) : BASE_URL;
      history[push === 'replace' ? 'replaceState' : 'pushState']({ linha: filterSerie }, '', url);
    }
    renderSeries(); renderChips(); renderGrid(); renderLinhaHead();
    closeLinhasDrop(); closeMenu();
    if (scroll) { const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
  }
  function prodImageAbs(p) { try { return p.imagem ? new URL(p.imagem, BASE_URL).href : DEFAULT_META.ogImage; } catch (e) { return DEFAULT_META.ogImage; } }
  function prodDesc(p) { return `${p.nome} — equipamento ${p.serie ? 'da linha ' + p.serie + ' ' : ''}Torque Fitness, padrão comercial. A partir de ${money(p.preco)}. Solicite o orçamento e fale com um consultor.`; }

  function applyProdMeta(p) {
    const t = `${p.nome} · Torque Fitness`, d = prodDesc(p), u = prodURL(p), img = prodImageAbs(p);
    document.title = t;
    setNameMeta('description', d);
    setProp('og:type', 'product'); setProp('og:title', t); setProp('og:description', d);
    setProp('og:url', u); setProp('og:image', img);
    setNameMeta('twitter:title', t); setNameMeta('twitter:description', d); setNameMeta('twitter:image', img);
    setCanonical(u);
  }
  function restoreMeta() {
    document.title = DEFAULT_META.title;
    setNameMeta('description', DEFAULT_META.desc);
    setProp('og:type', DEFAULT_META.ogType); setProp('og:title', DEFAULT_META.ogTitle); setProp('og:description', DEFAULT_META.ogDesc);
    setProp('og:url', DEFAULT_META.ogUrl); setProp('og:image', DEFAULT_META.ogImage);
    setNameMeta('twitter:title', DEFAULT_META.ogTitle); setNameMeta('twitter:description', DEFAULT_META.ogDesc); setNameMeta('twitter:image', DEFAULT_META.ogImage);
    setCanonical(DEFAULT_META.canonical);
  }

  function prodCtrlHTML(p) {
    const q = qtyOf(p.codigo);
    return q > 0
      ? `<div class="pmodal__stepper" data-code="${esc(p.codigo)}"><button data-act="dec">−</button><input data-act="qty" inputmode="numeric" value="${q}"/><button data-act="inc">+</button></div>`
      : `<button class="pmodal__add" data-act="add" data-code="${esc(p.codigo)}">+ Adicionar ao orçamento</button>`;
  }
  function openProd(code, push) {
    const p = byCode(code); if (!p) return;
    prodCode = code;
    $('#pmMedia').innerHTML = p.imagem
      ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" decoding="async" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__plate))"/>`
      : plate;
    $('#pmSerie').textContent = p.serie || '';
    $('#pmNome').textContent = p.nome;
    $('#pmDims').textContent = p.dims ? 'Dimensões: ' + p.dims + ' mm' : '';
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
    const linha = currentLinha() || 'all';        // voltar/avançar troca a linha
    if (linha !== filterSerie) goToLinha(linha, false, false);
  });

  // compartilhar (Web Share API no celular; copia o link no desktop)
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

  /* ---------- WhatsApp flutuante ---------- */
  (function () {
    const num = String(SITE.whatsapp || '').replace(/\D/g, '');
    const msg = encodeURIComponent(SITE.whatsappMsg || 'Olá! Quero um orçamento.');
    const el = $('#wppFloat');
    if (el) el.href = num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
  })();

  /* ---------- animações de rolagem ---------- */
  (function () {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window) || !els.length) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  })();

  /* ---------- toast ---------- */
  let tT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 2200); }

  /* ---------- init ---------- */
  window.__plate = plate;
  $('#ano').textContent = new Date().getFullYear();
  renderSeries(); renderChips(); renderGrid(); refreshCounts();
  renderLinhasMenu(); renderLinhaHead();
  // deep-link de linha: ?linha=Cardio já entra filtrado na linha
  (function initLinha() {
    const dl = currentLinha();
    if (dl) { goToLinha(dl, 'replace', false); setTimeout(() => { const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 250); }
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
        .map(p => ({ id: p.id, codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral', imagem: p.imagem || '', dims: p.dims || '', preco: Number(p.preco) || 0 }));
      if (!live.length) return;
      PRODUCTS = live;
      renderSeries(); renderChips(); renderGrid(); refreshCounts(); renderLinhasMenu();
      const dl = currentLinha(); if (dl) goToLinha(dl, false, false);   // re-filtra na linha atual com o catálogo ao vivo
      renderLinhaHead();
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
