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
  const PRODUCTS = (DATA.products || []).filter(p => p.preco > 0);
  const PAGE = 24;

  let cart = load();
  let filterSerie = 'all';
  let query = '';
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
  function filtered() {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter(p => {
      if (filterSerie !== 'all' && (p.serie || 'Geral') !== filterSerie) return false;
      if (q && !((p.nome + ' ' + p.codigo + ' ' + p.serie).toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const qtyOf = code => Number(cart[code]) || 0;

  function pcardHTML(p) {
    const q = qtyOf(p.codigo);
    const media = p.imagem
      ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__plate))"/>`
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
      const media = l.p.imagem ? `<img src="${esc(l.p.imagem)}" alt="" onerror="this.style.visibility='hidden'"/>` : `<span></span>`;
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
    if (sc) { filterSerie = sc.dataset.serie; shown = PAGE; renderSeries(); renderChips(); renderGrid(); if (sc.classList.contains('scard')) document.getElementById('produtos').scrollIntoView({ behavior: 'smooth' }); return; }
    if (e.target.closest('[data-dclose]')) closeDrawer();
    if (e.target.closest('[data-lclose]')) closeLead();
  });
  $('#search').addEventListener('input', e => { query = e.target.value; shown = PAGE; renderGrid(); });
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

  /* ---------- toast ---------- */
  let tT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 2200); }

  /* ---------- init ---------- */
  window.__plate = plate;
  $('#ano').textContent = new Date().getFullYear();
  renderSeries(); renderChips(); renderGrid(); refreshCounts();
})();
