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
  // nomes em PT dos aparelhos consagrados no Brasil (o resto fica em inglês);
  // o nome original segue em p.nomeEn para descrições, grupos e busca
  const NOMES_PT = window.TORQUE_NOMES_PT || {};
  function aplicaNomesPt(list) {
    list.forEach(p => {
      const t = NOMES_PT[normName(p.nome)];
      if (t && t !== p.nome) { p.nomeEn = p.nome; p.nome = t; }
    });
    return list;
  }
  aplicaNomesPt(PRODUCTS);
  function prodDescHTML(p) {
    const d = DESC[normName(p.nomeEn || p.nome)];
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
  let SITEINFO = Object.assign({ endereco: '', mapsUrl: '', telefone: '', whatsapp: SITE.whatsapp || '', email: '', horario: '', gaId: '', metaPixel: '', faq: [], depoimentos: [], obras: [], cupons: [] }, window.TORQUE_SITE_INFO || {});
  let appliedCoupon = null;   // cupom de desconto aplicado ao orçamento
  const normCupom = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  function activeCupons() { return (Array.isArray(SITEINFO.cupons) ? SITEINFO.cupons : []).filter(c => c && c.codigo && c.ativo !== false && (Number(c.desconto) || 0) > 0); }
  function findCupom(code) { const n = normCupom(code); return activeCupons().find(c => normCupom(c.codigo) === n) || null; }
  function popupCupom() { return activeCupons().find(c => c.popup) || null; }
  function cupomDesc(sub) { return appliedCoupon ? Math.round(sub * (Number(appliedCoupon.desconto) || 0) / 100 * 100) / 100 : 0; }
  let CAROUSEL = {};        // imagem por slide do carrossel (id → URL), vinda do catalog.json
  let query = '';
  let priceBand = 'all';
  let sortBy = 'rel';
  let filterGrupo = 'all';   // filtro por grupamento muscular
  let shown = PAGE;
  let compare = new Set();   // códigos selecionados para comparar
  const CMP_MAX = 3;

  /* ---------- grupamento muscular ---------- */
  // Classifica cada equipamento por grupamento muscular a partir do nome (catálogo
  // em inglês). Se o admin definir p.grupo, ele tem prioridade. Ordem importa:
  // a primeira regra que casar vence (ex.: "Leg Curl" cai em Pernas, não em Braços).
  const GRUPO_ORDER = ['Cardio', 'Pernas e glúteos', 'Peito', 'Costas', 'Ombros', 'Braços', 'Abdômen e core', 'Pilates', 'Peso livre e funcional', 'Outros'];
  const GRUPO_RULES = [
    ['Cardio', /treadmill|elliptical|stair|climber|rowing|spinn?ing|spining|\bbike\b|recumbent|orbitrek|cross trainer|air bike|pedal|ergometer|kayak|dragon boat|paddle|surf/],
    ['Pernas e glúteos', /\bleg\b|squat|hack|calf|thigh|\bhip\b|glute|thrust|adduct|abduct|lunge|sissy|tibia|deadlift|pendulum|bridge|hamstring|\bkick\b|pelvic|belt|\binner\b|\bouter\b/],
    ['Peito', /chest|\bpec\b|pectoral|\bfly\b|crossover|cross over|horizontal press|inclin\w* press|seated push|straight arm|push ups?/],
    ['Costas', /\bback\b|pulldown|pull down|\blat\b|\brow\b|dorsy|pullover|pull over|chin|\bpull\b/],
    ['Ombros', /shoulder|\bdelt\b|deltoid|lateral raise|military|shrug|pearl|\braise\b/],
    ['Braços', /bicep|tricep|\bcurl\b|preacher|\bdip\b|forearm|wrist|french|grip/],
    ['Abdômen e core', /abdominal|crunch|oblique|torso|twist|roman|\bcore\b|hyper|sit ups?/],
    ['Pilates', /reformer|pilates|cadillac|barrel|trapeze|wunda/],
    ['Peso livre e funcional', /bench|\brack\b|dumbbell|barbell|\bplate\b|kettlebell|smith|functional|trainer|station|cable|\bbar\b|weight|ladder|tower|wall|shelf|stand|cage|training|stretch|multi press/]
  ];
  function grupoOf(p) {
    if (p && p.grupo) return p.grupo;
    const n = normName(p && (p.nomeEn || p.nome));
    for (let i = 0; i < GRUPO_RULES.length; i++) if (GRUPO_RULES[i][1].test(n)) return GRUPO_RULES[i][0];
    return 'Outros';
  }
  function gruposDisponiveis() {
    const set = new Set(PRODUCTS.map(grupoOf));
    return GRUPO_ORDER.filter(g => set.has(g));
  }
  /* ---------- busca em português ---------- */
  // normaliza sem acentos ("extensão" = "extensao")
  const fold = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // dicionário PT→EN: o catálogo é em inglês, o cliente busca em português
  const SYN = {
    supino: ['chest press', 'bench press', 'incline press', 'horizontal press', 'bench'], crucifixo: ['fly', 'pec'], voador: ['fly', 'pec', 'delt'],
    peito: ['chest', 'pec', 'fly'], costas: ['back', 'row', 'pull'], puxador: ['pulldown', 'pull down', 'lat pull', 'high pull'],
    pulley: ['pulldown', 'pull down', 'cable'], remada: ['row', 'pull back'], remo: ['rowing'],
    desenvolvimento: ['shoulder press'], ombro: ['shoulder', 'delt', 'raise'], ombros: ['shoulder', 'delt', 'raise'],
    elevacao: ['raise', 'lift'], encolhimento: ['shrug'], trapezio: ['shrug', 'upper back'],
    rosca: ['biceps', 'preacher', 'wrist curl', 'arm curl'], biceps: ['biceps', 'preacher', 'arm curl'], triceps: ['triceps', 'dip'],
    antebraco: ['forearm', 'wrist', 'grip'], mergulho: ['dip'], paralela: ['dip'], paralelas: ['dip'],
    agachamento: ['squat', 'hack'], gaiola: ['cage', 'rack'], barra: ['bar', 'barbell', 'rack'],
    halter: ['dumbbell'], halteres: ['dumbbell'], anilha: ['plate'], anilhas: ['plate'], banco: ['bench'],
    extensora: ['leg extension', 'extension'], flexora: ['leg curl', 'curl'], panturrilha: ['calf'],
    gluteo: ['glute', 'hip thrust', 'kick'], gluteos: ['glute', 'hip thrust', 'kick'],
    abdutora: ['abduction', 'outer'], adutora: ['adductor', 'adduction', 'inner'], quadril: ['hip'],
    terra: ['deadlift'], levantamento: ['deadlift', 'lift'], perna: ['leg', 'squat'], pernas: ['leg', 'squat'],
    abdominal: ['abdominal', 'crunch', 'sit up'], abdomen: ['abdominal', 'crunch', 'core', 'twist'],
    lombar: ['back extension', 'hyper', 'roman'], prancha: ['plank', 'core'],
    esteira: ['treadmill'], bicicleta: ['bike', 'spinning'], bike: ['bike', 'spinning'], ergometrica: ['bike'],
    eliptico: ['elliptical'], escada: ['stair', 'climber', 'ladder'], transport: ['elliptical'],
    corda: ['rope', 'battle'], colchonete: ['mat'], caneleira: ['ankle'], barrafixa: ['pull up', 'chin'],
    polia: ['cable', 'crossover', 'pulley'], crossover: ['crossover', 'cable'], multiestacao: ['multi', 'station'],
    suporte: ['rack', 'stand', 'shelf'], estante: ['rack', 'shelf', 'tree'], kettlebell: ['kettlebell'],
    funcional: ['functional', 'trainer'], graviton: ['pull up assistance', 'chin', 'dip']
  };
  let searchIdx = new Map();   // codigo → texto pesquisável (nome + série + grupo + descrição PT)
  function buildSearchIndex() {
    searchIdx = new Map();
    PRODUCTS.forEach(p => {
      const d = DESC[normName(p.nomeEn || p.nome)] || {};
      searchIdx.set(p.codigo, fold([p.nome, p.nomeEn, p.codigo, p.serie, grupoOf(p), d.f, d.m, d.i].filter(Boolean).join(' • ')));
    });
  }
  function matchesQuery(p, toks) {
    const idx = searchIdx.get(p.codigo) || fold(p.nome + ' ' + p.codigo + ' ' + (p.serie || ''));
    return toks.every(t => {
      if (idx.includes(t)) return true;
      const sing = t.replace(/s$/, '');                       // plural simples
      if (sing !== t && idx.includes(sing)) return true;
      const syn = SYN[t] || SYN[sing];
      return !!(syn && syn.some(s => idx.includes(s)));
    });
  }
  // relevância: casar no NOME do produto vale mais que casar na descrição
  function queryScore(p, toks) {
    const nome = fold(p.nome + ' ' + (p.nomeEn || ''));
    let s = 0;
    toks.forEach(t => {
      if (nome.includes(t)) { s += 3; return; }
      const syn = SYN[t] || SYN[t.replace(/s$/, '')];
      if (syn && syn.some(x => nome.includes(x))) s += 2;
    });
    return s;
  }

  /* ---------- favoritos (lista compartilhável) ---------- */
  const FAV_KEY = 'torque_favs';
  let favs = new Set((() => { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } })());
  let favView = null;   // Set de códigos quando está vendo a lista (própria ou compartilhada)
  function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) {} }
  function toggleFav(code) {
    if (favs.has(code)) favs.delete(code); else favs.add(code);
    saveFavs(); renderGrid(); renderFavBar();
  }
  function renderFavBar() {
    const t = $('#favToggle'), s = $('#favShare'); if (!t) return;
    const n = favs.size;
    t.hidden = n === 0 && !favView;
    const c = $('#favCount'); if (c) c.textContent = favView ? favView.size : n;
    t.classList.toggle('on', !!favView);
    t.firstChild.textContent = favView ? '✕ Sair dos favoritos ' : '♥ Favoritos ';
    if (s) s.hidden = !(favView && favView.size);
  }
  async function shareFavs() {
    if (!favView || !favView.size) return;
    const url = BASE_URL + '?favs=' + encodeURIComponent([...favView].join(','));
    try {
      if (navigator.share) { await navigator.share({ title: 'Meus equipamentos favoritos · Torque Fitness', url }); return; }
      await navigator.clipboard.writeText(url); toast('Link da lista copiado!');
    } catch (e) { /* usuário cancelou */ }
  }

  /* ---------- vistos recentemente ---------- */
  const RECENT_KEY = 'torque_recent';
  function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function pushRecent(code) {
    if (!code) return;
    let r = loadRecent().filter(c => c !== code);
    r.unshift(code); r = r.slice(0, 12);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) {}
    renderRecent();
  }
  function renderRecent() {
    const sec = $('#recent'), row = $('#recentRow'); if (!sec || !row) return;
    const items = loadRecent().map(byCode).filter(Boolean);
    if (items.length < 2) { sec.hidden = true; row.innerHTML = ''; return; }   // só aparece com 2+ vistos
    row.innerHTML = items.map(p => `<button class="rcard" data-rec="${esc(p.codigo)}" type="button">
      <span class="rcard__img">${p.imagem ? `<img src="${esc(p.imagem)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>` : ''}</span>
      <span class="rcard__name">${esc(p.nome)}</span>
      <span class="rcard__price">${money(p.preco)}</span>
    </button>`).join('');
    sec.hidden = false;
  }
  function renderGrupos() {
    const sel = $('#grupoFilter'); if (!sel) return;
    const groups = gruposDisponiveis();
    sel.innerHTML = '<option value="all">Músculos</option>' +
      groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if (!groups.includes(filterGrupo)) filterGrupo = 'all';
    sel.value = filterGrupo;
  }

  function load() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; } }
  function save() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
    prepararOrcPdf();          // PDF de compartilhar sempre pronto antes do 1º toque
  }

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
    const qToks = fold(query).split(/\s+/).filter(Boolean);
    const list = PRODUCTS.filter(p => {
      if (favView && !favView.has(p.codigo)) return false;
      if (filterSerie !== 'all' && (p.serie || 'Geral') !== filterSerie) return false;
      if (filterGrupo !== 'all' && grupoOf(p) !== filterGrupo) return false;
      if (filterTipo !== 'all') { const t = p.tipo || 'maquina'; if (filterTipo === 'acessorio' ? t !== 'acessorio' : t === 'acessorio') return false; }
      if (!inBand(p.preco)) return false;
      if (qToks.length && !matchesQuery(p, qToks)) return false;
      return true;
    });
    if (sortBy === 'price-asc') list.sort((a, b) => a.preco - b.preco);
    else if (sortBy === 'price-desc') list.sort((a, b) => b.preco - a.preco);
    else if (sortBy === 'name-asc') list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    else if (qToks.length) list.sort((a, b) => queryScore(b, qToks) - queryScore(a, qToks));   // relevância na busca
    return list;
  }
  function filtersActive() { return filterSerie !== 'all' || filterGrupo !== 'all' || query.trim() !== '' || priceBand !== 'all' || sortBy !== 'rel'; }
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
      <div class="pcard__media">${p.selo ? `<span class="pcard__selo">${esc(p.selo)}</span>` : ''}<button class="pcard__fav ${favs.has(p.codigo) ? 'on' : ''}" data-act="fav" data-code="${esc(p.codigo)}" type="button" title="Favoritar" aria-label="Favoritar ${esc(p.nome)}" aria-pressed="${favs.has(p.codigo)}">♥</button><button class="pcard__cmp ${compare.has(p.codigo) ? 'on' : ''}" data-act="cmp" data-code="${esc(p.codigo)}" type="button" title="Comparar" aria-label="Comparar ${esc(p.nome)}" aria-pressed="${compare.has(p.codigo)}">⇄</button>${media}</div>
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
    const subtotal = cartTotal();
    if (appliedCoupon && !findCupom(appliedCoupon.codigo)) appliedCoupon = null;   // cupom deixou de existir
    const desc = cupomDesc(subtotal);
    const total = Math.max(0, subtotal - desc);
    renderCupomBox(subtotal, desc);
    $('#drawerTotal').textContent = money(total);
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    $('#drawerParcela').textContent = total > 0 ? `ou até ${maxN}× de ${money(total / maxN)}` : '';
    $('#btnSolicitar').disabled = total <= 0;
    if (!$('#drawer').hidden) prepararOrcPdf();     // mantém o PDF de compartilhar sempre fresco
  }
  function renderCupomBox(subtotal, desc) {
    const box = $('#cupomBox'); if (!box) return;
    if (appliedCoupon) {
      box.innerHTML = `<div class="cupom-on"><span>✓ Cupom <b>${esc(appliedCoupon.codigo)}</b> — ${appliedCoupon.desconto}% off <small>(−${money(desc)})</small></span><button type="button" id="cupomRemove" class="cupom-x">remover</button></div>`;
    } else {
      box.innerHTML = `<div class="cupom-row"><input id="cupomInput" type="text" placeholder="Cupom de desconto" autocomplete="off" /><button type="button" id="cupomApply" class="cupom-apply">Aplicar</button></div><p class="cupom-msg" id="cupomMsg" hidden></p>`;
    }
  }
  function applyCupom(code) {
    const c = findCupom(code);
    const msg = $('#cupomMsg');
    if (!c) { if (msg) { msg.textContent = 'Cupom inválido ou expirado.'; msg.hidden = false; } return; }
    appliedCoupon = c; renderDrawer();
    toast(`Cupom ${c.codigo} aplicado: ${c.desconto}% de desconto!`);
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
    const catLink = e.target.closest('[data-catalog]');
    if (catLink) { e.preventDefault(); openCatalog(); closeMenu(); const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
    if (e.target.closest('[data-cact="orc"]')) { e.preventDefault(); askOrc(); return; }
    if (act === 'cmp' && code) { toggleCompare(code); return; }
    if (act === 'fav' && code) { toggleFav(code); return; }
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
  const grupoSel = $('#grupoFilter');
  if (grupoSel) grupoSel.addEventListener('change', e => { filterGrupo = e.target.value; shown = PAGE; renderGrid(); });
  $('#clearFilters').addEventListener('click', () => goToLinha('all', true, false));
  const favToggleBtn = $('#favToggle');
  if (favToggleBtn) favToggleBtn.addEventListener('click', () => {
    favView = favView ? null : new Set(favs);
    shown = PAGE; renderGrid(); renderFavBar();
  });
  const favShareBtn = $('#favShare');
  if (favShareBtn) favShareBtn.addEventListener('click', shareFavs);
  $('#loadMore').addEventListener('click', () => { shown += PAGE; renderGrid(); });
  $('#navCart').addEventListener('click', openDrawer);
  const cupomBox = $('#cupomBox');
  if (cupomBox) {
    cupomBox.addEventListener('click', e => {
      if (e.target.closest('#cupomApply')) { applyCupom(($('#cupomInput') || {}).value || ''); }
      else if (e.target.closest('#cupomRemove')) { appliedCoupon = null; renderDrawer(); }
    });
    cupomBox.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cupomInput') { e.preventDefault(); applyCupom(e.target.value); } });
  }

  function openDrawer() { renderDrawer(); $('#drawer').hidden = false; document.body.style.overflow = 'hidden'; prepararOrcPdf(); }
  function closeDrawer() { $('#drawer').hidden = true; document.body.style.overflow = ''; }

  /* ---------- lead ---------- */
  $('#btnSolicitar').addEventListener('click', openLead);
  function askOrc() { if (cartCount()) openLead(); else { openCatalog(); document.getElementById('produtos').scrollIntoView({ behavior: 'smooth' }); toast('Escolha alguns equipamentos primeiro'); } }
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
    const sub = cartTotal(); const desc = cupomDesc(sub); const tot = Math.max(0, sub - desc);
    const cupomLine = appliedCoupon ? ` · cupom <b>${esc(appliedCoupon.codigo)}</b> (−${money(desc)})` : '';
    return `<p class="lmodal__hint">Você selecionou <b>${cartCount()}</b> item(ns) · total estimado <b>${money(tot)}</b>${cupomLine}.<br>Preencha seus dados e um consultor entra em contato.</p>
      <label class="field"><span>Nome *</span><input id="leadNome" type="text" autocomplete="name" /></label>
      <div class="lgrid">
        <label class="field"><span>WhatsApp / Telefone *</span><input id="leadTel" type="tel" inputmode="tel" autocomplete="tel" /></label>
        <label class="field"><span>Cidade / UF</span><input id="leadCidade" type="text" /></label>
      </div>
      <label class="field"><span>E-mail</span><input id="leadEmail" type="email" inputmode="email" autocomplete="email" /></label>
      <label class="field"><span>Mensagem (opcional)</span><textarea id="leadMsg" rows="2" placeholder="Ex.: montar uma academia, prazo, etc."></textarea></label>
      <div class="trustbar trustbar--lead">
        <span>🛡️ 1 ano de garantia</span>
        <span>🇧🇷 Atendemos todo o Brasil</span>
        <span>🔒 Seus dados protegidos</span>
      </div>
      <p class="lmodal__err" id="leadErr" hidden></p>`;
  }
  function bindLeadInputs() {}

  // Supabase (insere o lead na mesma base do app via REST — dispensa a lib no site público).
  // Se alguma coluna não existir na tabela, remove e tenta de novo, dobrando o
  // contato no "obs" para a informação nunca se perder.
  async function insertOrcamento(row) {
    const cfg = window.TORQUE_SUPABASE;
    if (!cfg || !cfg.url) throw new Error('sem config do servidor');
    for (let tent = 0; tent < 5; tent++) {
      const r = await fetch(cfg.url.replace(/\/+$/, '') + '/rest/v1/orcamentos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      });
      if (r.ok) return;
      const txt = await r.text().catch(() => '');
      const m = /Could not find the '([^']+)' column/.exec(txt);
      if (r.status === 400 && m && (m[1] in row)) {
        const col = m[1], val = row[col];
        delete row[col];
        if (col === 'contato_telefone' && val) row.obs = 'Tel/WhatsApp: ' + val + (row.obs ? ' | ' + row.obs : '');
        if (col === 'contato_email' && val) row.obs = 'E-mail: ' + val + (row.obs ? ' | ' + row.obs : '');
        continue;                                        // tenta de novo sem a coluna ausente
      }
      const e = new Error('insert falhou: ' + r.status + ' ' + txt.slice(0, 200));
      e.status = r.status;
      throw e;
    }
    throw new Error('insert falhou: esquema incompatível');
  }

  $('#btnEnviarLead').addEventListener('click', enviarLead);
  // orçamento entregue após o cadastro (o carrinho já foi limpo nesse ponto)
  let ultimoOrc = null;   // { file, resumo, email }
  function baixarArquivo(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  // No iPhone o download clássico é ignorado — entrega pela folha nativa
  // ("Salvar em Arquivos"); no computador, baixa normal.
  let pdfShareCache = null;   // { key, file }
  const ehMovel = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.userAgent));   // iPadOS se apresenta como Mac
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
  async function entregarPdfArquivo(file, key) {
    pdfShareCache = { key, file };
    if (!ehMovel) {              // computador: download direto, sem folha de compartilhar
      try { baixarArquivo(file); } catch (e) {}
      mostrarLinkPdf(file);      // garantia visível caso o navegador bloqueie o download
      return;
    }
    mostrarLinkPdf(file);        // aparece ANTES do share: se a folha não abrir, tem onde tocar
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); ocultarLinkPdf(); return; }
      catch (e) {
        if (e && e.name === 'AbortError') return;                     // usuário fechou a folha
        toast('PDF pronto! Toque na barra verde para abrir.');
      }
    }
  }
  $('#leadBody').addEventListener('click', async e => {
    if (!ultimoOrc) return;
    if (e.target.closest('#posPdf') && ultimoOrc.file) { entregarPdfArquivo(ultimoOrc.file, 'pos'); return; }
    if (e.target.closest('#posWpp')) {
      const f = ultimoOrc.file;
      if (ehMovel && f && navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: 'Orçamento Torque Fitness' }); return; } catch (e2) { if (e2 && e2.name === 'AbortError') return; }
      }
      if (f) baixarArquivo(f);
      const wpp = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
      window.open((wpp ? `https://wa.me/${wpp}?text=` : 'https://wa.me/?text=') + encodeURIComponent(ultimoOrc.resumo), '_blank', 'noopener');
      return;
    }
    if (e.target.closest('#posMail')) {
      location.href = `mailto:${encodeURIComponent(ultimoOrc.email || '')}?subject=${encodeURIComponent('Seu orçamento Torque Fitness')}&body=${encodeURIComponent(ultimoOrc.resumo.replace(/\*/g, ''))}`;
    }
  });
  async function enviarLead() {
    const nome = ($('#leadNome').value || '').trim();
    const tel = ($('#leadTel').value || '').trim();
    const cidade = ($('#leadCidade').value || '').trim();
    const email = ($('#leadEmail').value || '').trim();
    const msg = ($('#leadMsg').value || '').trim();
    const err = $('#leadErr');
    if (!nome || !tel) { err.textContent = 'Informe nome e WhatsApp/telefone.'; err.hidden = false; return; }
    const lines = cartLines();
    const subtotal = cartTotal();
    const desc = cupomDesc(subtotal);
    const total = Math.max(0, subtotal - desc);
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    const cupomObs = appliedCoupon ? `Cupom: ${appliedCoupon.codigo} (${appliedCoupon.desconto}%${appliedCoupon.quem ? ' · ' + appliedCoupon.quem : ''})` : '';
    const btn = $('#btnEnviarLead'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await insertOrcamento({
        origem: 'site',
        numero: 'SITE-' + Date.now().toString(36).toUpperCase(),   // marca o lead mesmo sem a coluna "origem"
        cliente_nome: nome,
        contato_telefone: tel,
        contato_email: email,
        vendedor_nome: '',
        itens: lines.map(l => ({ codigo: l.p.codigo, nome: l.p.nome, qtd: l.q, unitario: l.p.preco, total: l.total })),
        subtotal: subtotal,
        desconto: desc,
        total: total,
        parcelas: maxN,
        valor_parcela: total / maxN,
        status: 'novo',
        obs: [cidade ? 'Cidade: ' + cidade : '', msg ? 'Mensagem: ' + msg : '', cupomObs].filter(Boolean).join(' | ')
      });
      if (window.fbq) try { fbq('track', 'Lead', { value: subtotal, currency: 'BRL' }); } catch (e) {}
      if (window.gtag) try { gtag('event', 'generate_lead', { value: subtotal, currency: 'BRL' }); } catch (e) {}
      // garante o PDF ANTES de limpar o carrinho (o pré-gerado costuma estar pronto)
      let pdfFile = (orcPdfPronto && orcPdfPronto.key === orcPdfKey()) ? orcPdfPronto.file : null;
      if (!pdfFile) {
        try {
          const g = await gerarOrcamentoPDF(lines);
          pdfFile = new File([g.doc.output('blob')], 'orcamento-torque-fitness.pdf', { type: 'application/pdf' });
        } catch (e) { /* segue sem PDF — só a confirmação */ }
      }
      ultimoOrc = { file: pdfFile, resumo: orcamentoTexto(), email: email };
      cart = {}; appliedCoupon = null; save(); syncAll();
      $('#leadTitle').textContent = 'Pedido enviado!';
      $('#btnEnviarLead').style.display = 'none';
      $('#leadBody').innerHTML = `<div class="lead-ok"><div class="ico">✓</div>
        <h3>Recebemos seu pedido!</h3>
        <p>Obrigado, <b>${esc(nome)}</b>. Um consultor Torque Fitness vai entrar em contato em breve pelo WhatsApp/telefone informado.</p>
        ${pdfFile ? `<p style="margin-top:10px">Seu orçamento em PDF está pronto:</p>
        <div class="drawer__share" style="margin-top:8px">
          <button class="btn btn--ghost" id="posPdf" type="button">📄 Baixar PDF</button>
          <button class="btn btn--ghost" id="posWpp" type="button">📲 WhatsApp</button>
          <button class="btn btn--ghost" id="posMail" type="button">✉️ E-mail</button>
        </div>` : ''}
        <a class="btn btn--ghost drawer__send" style="margin-top:10px" href="projeto.html">📐 Ver os aparelhos no meu projeto</a>`;
      // automático: celular → folha de envio já com o PDF anexado (ainda no gesto do toque);
      // computador → baixa o PDF sozinho
      if (pdfFile) {
        if (ehMovel && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          try { await navigator.share({ files: [pdfFile], title: 'Orçamento Torque Fitness', text: 'Seu orçamento Torque Fitness' }); } catch (e) {}
        } else {
          baixarArquivo(pdfFile);
        }
      }
    } catch (e) {
      console.error(e);
      // resgate: o lead NÃO se perde — manda os dados + orçamento direto no WhatsApp da loja
      const wpp = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
      if (wpp) {
        const dados = `*Pedido de orçamento (site)*\nNome: ${nome}\nWhatsApp: ${tel}` +
          (cidade ? `\nCidade: ${cidade}` : '') + (email ? `\nE-mail: ${email}` : '') +
          (msg ? `\nMensagem: ${msg}` : '') + '\n\n' + orcamentoTexto();
        err.textContent = 'Não foi possível registrar agora — envie seu pedido direto no nosso WhatsApp:';
        let b = document.getElementById('leadWppFallback');
        if (!b) {
          b = document.createElement('a');
          b.id = 'leadWppFallback'; b.className = 'btn btn--primary drawer__send';
          b.style.marginTop = '8px'; b.target = '_blank'; b.rel = 'noopener';
          b.textContent = '📲 Enviar pedido pelo WhatsApp';
          err.after(b);
        }
        b.href = 'https://wa.me/' + wpp + '?text=' + encodeURIComponent(dados);
      } else {
        err.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
      }
      err.hidden = false;
      btn.disabled = false; btn.textContent = 'Enviar pedido';
    }
  }

  /* ---------- menu mobile ---------- */
  function closeMenu() { $('#mmenu').hidden = true; $('#navBurger').classList.remove('open'); $('#navBurger').setAttribute('aria-expanded', 'false'); }
  $('#navBurger').addEventListener('click', () => {
    const m = $('#mmenu'); m.hidden = !m.hidden; $('#navBurger').classList.toggle('open', !m.hidden);
    $('#navBurger').setAttribute('aria-expanded', String(!m.hidden));
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
    query = ''; priceBand = 'all'; sortBy = 'rel'; filterGrupo = 'all'; favView = null; shown = PAGE;
    const si = $('#search'); if (si) si.value = '';
    const pb = $('#priceBand'); if (pb) pb.value = 'all';
    const so = $('#sortBy'); if (so) so.value = 'rel';
    const gf = $('#grupoFilter'); if (gf) gf.value = 'all';
    renderFavBar();
  }
  // revela a grade de linhas + catálogo (escondidos na landing até abrir pelo menu)
  function openCatalog() { document.body.classList.remove('catalog-hidden'); }
  function afterNav(push, urlParam, scroll) {
    openCatalog();
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
  // meta description do produto: usa a descrição rica (função + músculos) quando existe
  function prodDesc(p) {
    const d = DESC[normName(p.nomeEn || p.nome)];
    if (d && d.f) {
      const musc = (d.m && d.m !== '—') ? ` Trabalha: ${String(d.m).replace(/\.+$/, '')}.` : '';
      return `${p.nome} — ${d.f}${/[.!?]$/.test(d.f) ? '' : '.'}${musc} A partir de ${money(p.preco)} na Torque Fitness.`.slice(0, 300);
    }
    return `${p.nome} — equipamento ${p.serie ? 'da linha ' + p.serie + ' ' : ''}Torque Fitness, padrão comercial. A partir de ${money(p.preco)}. Solicite o orçamento e fale com um consultor.`;
  }

  // dados estruturados de Produto (Google) — injeta ao abrir o produto, remove ao fechar
  function setProductLd(p) {
    let s = document.getElementById('ldProd');
    if (!p) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldProd'; document.head.appendChild(s); }
    const trilha = [{ '@type': 'ListItem', position: 1, name: 'Início', item: BASE_URL }];
    if (p.serie) trilha.push({ '@type': 'ListItem', position: 2, name: p.serie, item: BASE_URL + '?linha=' + encodeURIComponent(p.serie) });
    trilha.push({ '@type': 'ListItem', position: trilha.length + 1, name: p.nome, item: prodURL(p) });
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{
        '@type': 'Product',
        name: p.nome, image: prodImageAbs(p), sku: p.codigo || undefined,
        description: prodDesc(p),
        category: p.serie || undefined,
        brand: { '@type': 'Brand', name: 'Torque Fitness' },
        offers: { '@type': 'Offer', priceCurrency: 'BRL', price: Number(p.preco) || 0, availability: 'https://schema.org/InStock', url: prodURL(p) }
      }, {
        '@type': 'BreadcrumbList', itemListElement: trilha
      }]
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
  // produtos relacionados (mesma linha primeiro, depois mesmo tipo) no modal
  function relatedTo(p) {
    const pool = PRODUCTS.filter(x => x.codigo !== p.codigo && x.preco > 0);
    const sameSerie = pool.filter(x => (x.serie || '') === (p.serie || '') && p.serie);
    const sameTipo = pool.filter(x => x.tipo === p.tipo && !sameSerie.includes(x));
    const rest = pool.filter(x => !sameSerie.includes(x) && !sameTipo.includes(x));
    return sameSerie.concat(sameTipo, rest).slice(0, 4);
  }
  function renderRelated(p) {
    const box = $('#pmRel'), grid = $('#pmRelGrid'); if (!box || !grid) return;
    const rel = relatedTo(p);
    if (!rel.length) { box.hidden = true; grid.innerHTML = ''; return; }
    grid.innerHTML = rel.map(x => `<button class="pmrel" data-rel="${esc(x.codigo)}" type="button">
      <span class="pmrel__img">${x.imagem ? `<img src="${esc(x.imagem)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>` : ''}</span>
      <span class="pmrel__name">${esc(x.nome)}</span>
      <span class="pmrel__price">${money(x.preco)}</span>
    </button>`).join('');
    box.hidden = false;
  }
  function openProd(code, push) {
    const p = byCode(code); if (!p) return;
    openCatalog();
    prodCode = code;
    pushRecent(code);
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
    renderRelated(p);
    $('#prodModal').hidden = false; document.body.style.overflow = 'hidden';
    $('.pmodal__card').scrollTop = 0;
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
  // clicar num produto relacionado abre o detalhe dele
  const relGrid = $('#pmRelGrid');
  if (relGrid) relGrid.addEventListener('click', e => {
    const b = e.target.closest('[data-rel]'); if (!b) return;
    openProd(b.dataset.rel, true);
  });
  // clicar num "visto recentemente" abre o detalhe
  const recRow = $('#recentRow');
  if (recRow) recRow.addEventListener('click', e => {
    const b = e.target.closest('[data-rec]'); if (!b) return;
    openProd(b.dataset.rec, true);
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
    // com depoimentos reais cadastrados, os exemplos fictícios da faixa saem de cena
    const fict = document.querySelector('.proof__quotes');
    if (fict) fict.hidden = arr.length > 0;
    if (!arr.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#depoGrid').innerHTML = arr.map(d => `<figure class="depocard"><blockquote>“${esc(d.texto)}”</blockquote><figcaption><b>${esc(d.nome || 'Cliente')}</b>${d.local ? `<span>${esc(d.local)}</span>` : ''}</figcaption></figure>`).join('');
  }
  // obras entregues (prova social com fotos reais de instalações)
  function renderObras() {
    const sec = $('#obras'); if (!sec) return;
    const arr = (Array.isArray(SITEINFO.obras) ? SITEINFO.obras : []).filter(o => o && (o.img || '').trim());
    if (!arr.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#obrasGrid').innerHTML = arr.map(o => `
      <figure class="obra">
        <img src="${esc(o.img)}" alt="${esc(o.titulo || 'Academia montada com equipamentos Torque Fitness')}" loading="lazy" decoding="async" onerror="this.closest('figure').remove()"/>
        ${(o.titulo || o.local) ? `<figcaption>${o.titulo ? `<b>${esc(o.titulo)}</b>` : ''}${o.local ? `<span>${esc(o.local)}</span>` : ''}</figcaption>` : ''}
      </figure>`).join('');
  }
  // lightbox: toque na foto abre em tela cheia (fecha com toque/Esc)
  (function wireObras() {
    const grid = $('#obrasGrid'); if (!grid) return;
    grid.addEventListener('click', e => {
      const img = e.target.closest('.obra img'); if (!img) return;
      let ov = document.getElementById('obraLight');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'obraLight'; ov.className = 'obra-light'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Foto ampliada');
        ov.innerHTML = '<img alt="Academia montada com equipamentos Torque Fitness"/><button type="button" aria-label="Fechar">✕</button>';
        const fecha = () => { ov.hidden = true; document.body.style.overflow = ''; };
        ov.addEventListener('click', fecha);
        document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !ov.hidden) fecha(); });
        document.body.appendChild(ov);
      }
      ov.querySelector('img').src = img.src;
      ov.hidden = false; document.body.style.overflow = 'hidden';
    });
  })();
  // FAQ + dados estruturados (FAQPage no Google)
  // Perguntas frequentes padrão (baseadas nas dúvidas mais comuns em sites de
  // equipamentos de academia). Usadas quando o admin ainda não publicou as suas.
  const DEFAULT_FAQ = [
    { q: 'A Torque Fitness atende todo o Brasil?', a: 'Sim, atendemos todo o Brasil — de capitais a cidades do interior. O frete entra no orçamento de acordo com a cidade de entrega.' },
    { q: 'Qual é o prazo de entrega dos equipamentos?', a: 'Os equipamentos são fabricados sob encomenda, com prazo médio de 100 a 120 dias após a confirmação do pedido. O prazo exato vai detalhado na sua proposta.' },
    { q: 'Os equipamentos têm garantia?', a: 'Sim. Todos os equipamentos têm 1 ano de garantia contra defeitos de fabricação.' },
    { q: 'Como funciona o parcelamento e quais as formas de pagamento?', a: 'Trabalhamos com diversas formas de pagamento e parcelamento, definidas conforme a análise e validação de crédito. Fale com o nosso time para encontrar a melhor condição para o seu caso.' },
    { q: 'Vocês ajudam a montar a academia (mix de equipamentos e layout)?', a: 'Sim. Temos parcerias com escritórios de arquitetura e empreiteiras para ajudar no layout, na obra e na montagem da academia — do projeto à instalação dos equipamentos.' },
    { q: 'Qual o investimento para montar uma academia?', a: 'O investimento depende principalmente da metragem (m²) da academia, do público e do mix de equipamentos. Monte um orçamento aqui no site ou fale conosco para uma estimativa sob medida.' },
    { q: 'Os equipamentos são para uso profissional e intenso?', a: 'Sim. Todos os nossos equipamentos são desenvolvidos para uso profissional e intenso, prontos para a alta rotatividade de uma academia comercial.' },
    { q: 'Vocês oferecem assistência técnica e reposição de peças?', a: 'Sim, oferecemos assistência técnica e reposição de peças das nossas linhas. Em caso de necessidade, fale com o nosso atendimento com o código do equipamento em mãos.' },
    { q: 'Vendem para pessoa física ou apenas para empresas (CNPJ)?', a: 'Atendemos tanto CNPJ quanto CPF — academias, empresas, personal trainers e pessoa física.' },
    { q: 'Como faço um orçamento?', a: 'É só entrar em contato pelo WhatsApp ou montar o seu orçamento aqui mesmo no site, escolhendo os equipamentos no catálogo. Nosso time retorna com valores, prazos e condições.' }
  ];
  function setFaqLd(arr) {
    let s = document.getElementById('ldFaq');
    if (!arr || !arr.length) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldFaq'; document.head.appendChild(s); }
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: arr.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  }
  function renderFaq() {
    const sec = $('#faq'); if (!sec) return;
    const pub = Array.isArray(SITEINFO.faq) ? SITEINFO.faq.filter(f => f && (f.q || '').trim()) : [];
    const arr = pub.length ? pub : DEFAULT_FAQ;
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
    if (!img) return s.grad;
    // vai dentro de style="…" (aspas duplas): usa aspas simples no url() e escapa o que sobrar
    const u = String(img).replace(/["'()\\]/g, c => encodeURIComponent(c));
    return `linear-gradient(to right, rgba(11,11,15,.92), rgba(11,11,15,.38)), url('${u}')`;
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
  // Trava-segurança: etapa pendurada vira erro visível em vez de botão "mudo"
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
  async function baixarCatalogoPDF() {
    const btn = $('#btnCatalogoPdf');
    const list = filtered();
    if (!list.length) { toast('Nenhum produto para exportar.'); return; }
    // 2º toque no iPhone: o PDF já gerado sai na hora, dentro do gesto
    if (ehMovel && pdfShareCache && String(pdfShareCache.key).startsWith('cat-') && navigator.canShare && navigator.canShare({ files: [pdfShareCache.file] })) {
      try { await navigator.share({ files: [pdfShareCache.file], title: pdfShareCache.file.name }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
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
      await entregarPdfArquivo(new File([doc.output('blob')], nm, { type: 'application/pdf' }), 'cat-' + nm);
      toast('Catálogo gerado!');
    } catch (e) {
      console.error(e); toast('Não foi possível gerar o PDF agora.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old || '📄 Baixar catálogo (PDF)'; }
    }
  }
  const btnPdf = $('#btnCatalogoPdf');
  if (btnPdf) btnPdf.addEventListener('click', baixarCatalogoPDF);

  /* ---------- PDF do orçamento (visitante) ---------- */
  // ===== documento de orçamento com o MESMO visual da área de vendas =====
  const ORC_LOGO = `<svg class="qd__logo" viewBox="0 0 227 271" fill="#8B5CF6"><g transform="translate(0,271) scale(0.1,-0.1)"><path d="M130 2617 c-50 -26 -50 -19 -50 -685 0 -686 -2 -669 61 -691 34 -12 367 -14 406 -3 12 4 105 84 205 178 533 498 494 463 524 455 38 -10 70 -54 58 -81 -5 -11 -268 -262 -584 -558 -586 -547 -620 -584 -652 -682 -6 -19 -13 -125 -15 -236 -6 -224 -3 -234 62 -234 30 0 96 59 706 630 601 563 677 630 703 628 18 -2 37 -14 50 -31 19 -26 19 -30 5 -55 -8 -15 -289 -283 -624 -597 l-609 -570 887 -3 c609 -1 894 1 908 8 19 11 20 24 17 973 -3 944 -4 963 -24 1023 -88 255 -268 427 -539 511 l-90 27 -690 3 c-546 3 -695 1 -715 -10z"/></g></svg>`;
  function buildOrcDoc(lines) {
    const el = document.getElementById('orcDoc'); if (!el) return null;
    const sub = cartTotal(); const desc = cupomDesc(sub); const tot = Math.max(0, sub - desc);
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    const hoje = new Date(); const val = new Date(Date.now() + 7 * 864e5);
    const dstr = d => d.toLocaleDateString('pt-BR');
    const numero = 'ORC-' + hoje.toISOString().slice(2, 10).replace(/-/g, '') + '-' + Date.now().toString(36).slice(-4).toUpperCase();
    const thumb = p => p.imagem
      ? `<img class="qd__thumb" src="${esc(p.imagem)}" alt="" onerror="this.style.visibility='hidden'"/>`
      : `<span class="qd__thumb qd__thumb--ph"></span>`;
    const rows = lines.map(l => `
      <tr>
        <td class="qd__imgcell">${thumb(l.p)}</td>
        <td><div class="qd__pname">${esc(l.p.nome)}</div>${l.p.codigo ? `<div class="qd__pcode">${esc(l.p.codigo)}</div>` : ''}${l.p.dims ? `<div class="qd__dims">${esc(l.p.dims)} mm</div>` : ''}</td>
        <td class="num">${l.q}</td>
        <td class="num">${money(l.p.preco)}</td>
        <td class="num">${money(l.total)}</td>
      </tr>`).join('');
    const wpp = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
    const contato = [wpp ? 'WhatsApp +' + wpp : '', SITEINFO.email || ''].filter(Boolean).join(' · ');
    el.innerHTML = `
      <div class="qd__head">
        ${ORC_LOGO}
        <div class="qd__brand"><strong>TORQUE FITNESS</strong><span>EQUIPAMENTOS</span></div>
        <div class="qd__meta">
          <div><b style="color:#fff">${numero}</b></div>
          <div>Emissão: ${dstr(hoje)}</div>
          <div>Validade: ${dstr(val)}</div>
        </div>
      </div>
      <div class="qd__client"><span>Orçamento montado no site</span>${contato ? `<span><b>${esc(contato)}</b></span>` : ''}</div>
      <table class="qd__table">
        <thead><tr><th colspan="2">Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="qd__totals">
        <div class="qrow"><span>Subtotal</span><b>${money(sub)}</b></div>
        ${desc > 0 ? `<div class="qrow"><span>Cupom ${esc(appliedCoupon ? appliedCoupon.codigo : '')} (−${appliedCoupon ? appliedCoupon.desconto : 0}%)</span><b>− ${money(desc)}</b></div>` : ''}
        <div class="qrow qd__grand"><span>Total geral</span><b>${money(tot)}</b></div>
      </div>
      <div class="qd__install">
        <div class="big">${maxN}× de ${money(tot / maxN)}</div>
        <small>Parcelamento em até ${maxN}× sem juros.</small>
      </div>
      <div class="qd__cond">
        <h4>Condições</h4>
        Pagamento: em até ${maxN}× sem juros, conforme validação de crédito.<br>
        Validade da proposta: <b>${dstr(val)}</b> (7 dias).<br>
        Frete e instalação a combinar. Prazo de entrega sujeito à disponibilidade de estoque.
      </div>
      <div class="qd__foot">
        Torque Fitness · Orçamento gerado em ${dstr(hoje)} pelo site · Valores estimados, sujeitos a confirmação de um consultor.
      </div>`;
    return { el, tot };
  }
  // monta o documento e converte em PDF A4 paginado (usado por baixar, WhatsApp e e-mail)
  async function gerarOrcamentoPDF(lines) {
    const built = buildOrcDoc(lines);
    if (!built) throw new Error('doc indisponível');
    await comPrazo(Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')
    ]), 22000, 'o carregamento dos componentes');
    // espera as fotos dos itens carregarem (senão saem em branco na captura)
    await Promise.all(Array.from(built.el.querySelectorAll('img')).map(im => im.complete
      ? Promise.resolve()
      : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 6000); })));
    const canvas = await comPrazo(
      html2canvas(built.el, { scale: escalaSegura(built.el, 2), backgroundColor: '#ffffff', useCORS: true, imageTimeout: 6000 }),
      25000, 'a captura do documento');
    const Ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!Ctor) throw new Error('jsPDF indisponível');
    if (!canvas || !canvas.width || !canvas.height) throw new Error('captura vazia');
    const doc = new Ctor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    // quebra de página só entre linhas/blocos — nunca no meio de uma foto
    adicionarPaginado(doc, canvas, built.el, '.qd__table tbody tr, .qd__parties, .qd__table, .qd__totals, .qd__install, .qd__cond, .qd__foot');
    return { doc, tot: built.tot };
  }
  // resumo do orçamento em texto puro (corpo do e-mail / mensagem do WhatsApp)
  function orcamentoTexto() {
    const lines = cartLines();
    const sub = cartTotal(); const desc = cupomDesc(sub); const tot = Math.max(0, sub - desc);
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    const t = ['*Orçamento Torque Fitness* — ' + new Date().toLocaleDateString('pt-BR'), ''];
    lines.forEach(l => t.push(`${l.q}× ${l.p.nome} — ${money(l.total)}`));
    t.push('');
    if (desc > 0) { t.push(`Subtotal: ${money(sub)}`); t.push(`Cupom ${appliedCoupon ? appliedCoupon.codigo : ''} (−${appliedCoupon ? appliedCoupon.desconto : 0}%): −${money(desc)}`); }
    t.push(`Total estimado: ${money(tot)} (ou até ${maxN}× de ${money(tot / maxN)})`);
    t.push('', location.origin + location.pathname);
    return t.join('\n');
  }
  // estado "Gerando…" nos botões do orçamento
  async function comBotao(btn, fn) {
    let old = '';
    if (btn) { btn.disabled = true; old = btn.textContent; btn.textContent = 'Gerando…'; }
    try { await fn(); }
    catch (e) { console.error(e); toast('Não foi possível gerar o PDF: ' + ((e && e.name) || 'erro') + ' — ' + String((e && e.message) || e).slice(0, 90)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }
  async function baixarOrcamentoPDF() {
    const lines = cartLines();
    if (!lines.length) { toast('Seu orçamento está vazio.'); return; }
    // 2º toque no celular: o PDF pré-gerado sai na hora, dentro do gesto
    if (ehMovel && orcPdfPronto && orcPdfPronto.key === orcPdfKey() && navigator.canShare && navigator.canShare({ files: [orcPdfPronto.file] })) {
      try { await navigator.share({ files: [orcPdfPronto.file], title: 'Orçamento Torque Fitness' }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    await comBotao($('#btnOrcPdf'), async () => {
      const { doc, tot } = await gerarOrcamentoPDF(lines);
      const file = new File([doc.output('blob')], 'orcamento-torque-fitness.pdf', { type: 'application/pdf' });
      await entregarPdfArquivo(file, 'orc-' + orcPdfKey());
      toast('PDF do orçamento gerado!');
      if (window.gtag) try { gtag('event', 'orcamento_pdf', { value: tot, currency: 'BRL' }); } catch (e) {}
    });
  }
  // Pré-gera o PDF quando o carrinho abre ou muda: no iPhone o navigator.share
  // só funciona logo após o toque — gerar na hora do clique estoura a janela.
  let orcPdfPronto = null;   // { key, file, tot }
  let orcPdfTimer = null;
  function orcPdfKey() { return JSON.stringify(cart) + '|' + (appliedCoupon ? appliedCoupon.codigo : ''); }
  function prepararOrcPdf() {
    if (!ehMovel || !(navigator.share && navigator.canShare)) return;   // só no celular (no PC é download direto)
    clearTimeout(orcPdfTimer);
    orcPdfTimer = setTimeout(async () => {
      const lines = cartLines();
      if (!lines.length) { orcPdfPronto = null; return; }
      const key = orcPdfKey();
      if (orcPdfPronto && orcPdfPronto.key === key) return;
      try {
        const { doc, tot } = await gerarOrcamentoPDF(lines);
        const file = new File([doc.output('blob')], 'orcamento-torque-fitness.pdf', { type: 'application/pdf' });
        orcPdfPronto = { key: key, file, tot };
      } catch (e) { orcPdfPronto = null; }
    }, 350);
  }
  async function enviarOrcamentoWhatsApp() {
    const lines = cartLines();
    if (!lines.length) { toast('Seu orçamento está vazio.'); return; }
    // caminho rápido: PDF já preparado → compartilha ainda dentro do gesto do toque
    if (ehMovel && orcPdfPronto && orcPdfPronto.key === orcPdfKey() && navigator.canShare && navigator.canShare({ files: [orcPdfPronto.file] })) {
      try {
        await navigator.share({ files: [orcPdfPronto.file], title: 'Orçamento Torque Fitness', text: 'Meu orçamento Torque Fitness' });
        if (window.gtag) try { gtag('event', 'orcamento_whatsapp', { value: orcPdfPronto.tot, currency: 'BRL' }); } catch (e) {}
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    await comBotao($('#btnOrcWpp'), async () => {
      const { doc, tot } = await gerarOrcamentoPDF(lines);
      const blob = doc.output('blob');
      const file = new File([blob], 'orcamento-torque-fitness.pdf', { type: 'application/pdf' });
      if (ehMovel && navigator.canShare && navigator.canShare({ files: [file] })) {
        // celular: abre a folha de compartilhar com o PDF anexado (WhatsApp, e-mail…)
        orcPdfPronto = { key: orcPdfKey(), file, tot };            // guarda: o próximo toque compartilha na hora
        try { await navigator.share({ files: [file], title: 'Orçamento Torque Fitness', text: 'Meu orçamento Torque Fitness' }); }
        catch (e) {
          if (e && e.name === 'NotAllowedError') { toast('PDF pronto! Toque de novo para enviar.'); return; }
          if (e && e.name !== 'AbortError') throw e;
        }
      } else {
        // sem suporte a compartilhar arquivo: baixa o PDF e abre o WhatsApp com o resumo
        doc.save('orcamento-torque-fitness.pdf');
        const wpp = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
        const url = (wpp ? `https://wa.me/${wpp}?text=` : 'https://wa.me/?text=') + encodeURIComponent(orcamentoTexto());
        window.open(url, '_blank', 'noopener');
        toast('PDF baixado — anexe na conversa se quiser.');
      }
      if (window.gtag) try { gtag('event', 'orcamento_whatsapp', { value: tot, currency: 'BRL' }); } catch (e) {}
    });
  }
  function enviarOrcamentoEmail() {
    const lines = cartLines();
    if (!lines.length) { toast('Seu orçamento está vazio.'); return; }
    const para = SITEINFO.email || '';
    const url = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent('Orçamento Torque Fitness')}&body=${encodeURIComponent(orcamentoTexto().replace(/\*/g, ''))}`;
    location.href = url;
    if (window.gtag) try { gtag('event', 'orcamento_email'); } catch (e) {}
  }
  const btnOrcPdf = $('#btnOrcPdf');
  if (btnOrcPdf) btnOrcPdf.addEventListener('click', baixarOrcamentoPDF);
  const btnOrcWpp = $('#btnOrcWpp');
  if (btnOrcWpp) btnOrcWpp.addEventListener('click', enviarOrcamentoWhatsApp);
  const btnOrcMail = $('#btnOrcMail');
  if (btnOrcMail) btnOrcMail.addEventListener('click', enviarOrcamentoEmail);

  /* ---------- comparador de produtos ---------- */
  function toggleCompare(code) {
    if (compare.has(code)) compare.delete(code);
    else { if (compare.size >= CMP_MAX) { toast(`Compare até ${CMP_MAX} por vez.`); return; } compare.add(code); }
    renderGrid(); renderCmpBar();
  }
  function renderCmpBar() {
    const bar = $('#cmpBar'); if (!bar) return;
    const n = compare.size;
    bar.hidden = n < 1;
    const c = $('#cmpCount'); if (c) c.textContent = n;
    const go = $('#cmpGo'); if (go) go.disabled = n < 2;
  }
  function closeCmp() { const m = $('#cmpModal'); if (m) m.hidden = true; document.body.style.overflow = ''; }
  function openCmp() {
    const items = Array.from(compare).map(byCode).filter(Boolean);
    if (items.length < 2) { toast('Selecione ao menos 2 equipamentos.'); return; }
    const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
    const head = `<th></th>` + items.map(p => `<th>
      <div class="cmpcol">${p.imagem ? `<img src="${esc(p.imagem)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"/>` : `<div class="cmpcol__ph"></div>`}
      <b>${esc(p.nome)}</b><button class="cmpcol__rm" data-cmprm="${esc(p.codigo)}" type="button" title="Tirar da comparação">✕</button></div></th>`).join('');
    const row = (lab, fn) => `<tr><td class="cmprow__lab">${lab}</td>${items.map(p => `<td>${fn(p)}</td>`).join('')}</tr>`;
    const body = `<div class="cmpscroll"><table class="cmptable"><thead><tr>${head}</tr></thead><tbody>
      ${row('Linha', p => esc(p.serie || '—'))}
      ${row('Tipo', p => (p.tipo === 'acessorio' ? 'Acessório' : 'Máquina'))}
      ${row('Dimensões', p => p.dims ? esc(p.dims) + ' mm' : '—')}
      ${row('Disponibilidade', p => p.disp ? esc(p.disp) : '—')}
      ${row('Preço', p => `<b class="cmpprice">${money(p.preco)}</b><small>${maxN}× de ${money(p.preco / maxN)}</small>`)}
      ${row('', p => `<button class="cmpadd" data-act="add" data-code="${esc(p.codigo)}" type="button">+ Adicionar</button>`)}
    </tbody></table></div>`;
    $('#cmpBody').innerHTML = body;
    $('#cmpModal').hidden = false; document.body.style.overflow = 'hidden';
  }
  (function wireCmp() {
    const go = $('#cmpGo'); if (go) go.addEventListener('click', openCmp);
    const clr = $('#cmpClear'); if (clr) clr.addEventListener('click', () => { compare.clear(); renderGrid(); renderCmpBar(); });
    const modal = $('#cmpModal');
    if (modal) modal.addEventListener('click', e => {
      if (e.target.closest('[data-cmpclose]')) { closeCmp(); return; }
      const rm = e.target.closest('[data-cmprm]');
      if (rm) { compare.delete(rm.dataset.cmprm); renderGrid(); renderCmpBar(); if (compare.size < 2) closeCmp(); else openCmp(); return; }
    });
  })();

  /* ---------- Simulador "Quanto custa montar sua academia?" (por m²) ---------- */
  (function montador() {
    const sec = $('#montar'); if (!sec) return;
    const foco = $('#montarFoco'), porte = $('#montarPorte'), go = $('#btnMontar');
    const m2Input = $('#montarM2'), result = $('#montarResult');
    if (foco) foco.addEventListener('click', e => { const b = e.target.closest('[data-foco]'); if (b) { b.classList.toggle('on'); if (result) result.hidden = true; } });
    if (porte) porte.addEventListener('click', e => {
      const b = e.target.closest('[data-porte]'); if (!b) return;
      $$('[data-porte]', porte).forEach(x => x.classList.toggle('on', x === b));
      if (m2Input) m2Input.value = b.dataset.m2 || '';        // o atalho preenche a metragem
      if (result) result.hidden = true;
    });
    if (m2Input) m2Input.addEventListener('input', () => {
      $$('[data-porte]', porte).forEach(x => x.classList.remove('on'));
      if (result) result.hidden = true;
    });
    const isCardio = p => /cardio|esteira|bike|el[ií]ptic|escada|spinning|remo/i.test((p.serie || '') + ' ' + (p.nome || ''));
    const isAcessorio = p => (p.tipo || 'maquina') === 'acessorio';
    function pick(pool, n) { if (n <= 0 || !pool.length) return []; const step = Math.max(1, Math.floor(pool.length / n)); const out = []; for (let i = 0; i < pool.length && out.length < n; i += step) out.push(pool[i]); return out; }
    function metragem() {
      const v = m2Input ? parseInt(m2Input.value, 10) : 0;
      if (v && v >= 20) return Math.min(5000, v);
      const ptEl = $('[data-porte].on', porte);
      return ptEl ? (parseInt(ptEl.dataset.m2, 10) || 200) : 200;
    }
    let simulado = null;   // último mix calculado (aplicado ao tocar em "Montar orçamento")
    function calcular() {
      const focos = $$('[data-foco].on', foco).map(b => b.dataset.foco);
      if (!focos.length) { toast('Escolha pelo menos um foco.'); return; }
      const m2 = metragem();
      // ~6,5 m² por estação (equipamento + circulação); acessórios entram por cima
      const nTotal = Math.max(4, Math.min(80, Math.round(m2 / 6.5)));
      const peso = { mus: 0.62, car: 0.22, fun: 0.16 };
      const somaPeso = focos.reduce((s, f) => s + peso[f], 0);
      const qt = f => focos.includes(f) ? Math.max(1, Math.round(nTotal * peso[f] / somaPeso)) : 0;
      const all = PRODUCTS.filter(p => p.preco > 0);
      let chosen = [];
      chosen = chosen.concat(pick(all.filter(p => !isAcessorio(p) && !isCardio(p)), qt('mus')));
      chosen = chosen.concat(pick(all.filter(isCardio), qt('car')));
      chosen = chosen.concat(pick(all.filter(isAcessorio), qt('fun')));
      if (!chosen.length) { toast('Não encontrei itens para essa combinação.'); return; }
      const total = chosen.reduce((s, p) => s + p.preco, 0);
      const faixaMin = Math.round(total * 0.95 / 1000) * 1000;
      const faixaMax = Math.round(total * 1.15 / 1000) * 1000;
      const maxN = Math.max(1, Math.floor(PARAMS.parcelasMax || 48));
      simulado = { chosen, m2, total };
      const wpp = String(SITEINFO.whatsapp || SITE.whatsapp || '').replace(/\D/g, '');
      const msg = encodeURIComponent(`Olá! Simulei uma academia de ${m2} m² no site — estimativa de ${money(faixaMin)} a ${money(faixaMax)} (${chosen.length} equipamentos). Quero fechar um orçamento.`);
      result.innerHTML = `
        <div class="montar__faixa"><small>Investimento estimado para <b>${m2} m²</b></small><b>${money(faixaMin)} – ${money(faixaMax)}</b>
        <span>${chosen.length} equipamentos · ou até ${maxN}× de ${money(total / maxN)}</span></div>
        <div class="montar__acts">
          <button class="btn btn--primary" id="btnSimMontar" type="button">🛒 Montar esse orçamento</button>
          <a class="btn btn--ghost" href="${wpp ? `https://wa.me/${wpp}?text=${msg}` : '#contato'}" ${wpp ? 'target="_blank" rel="noopener"' : ''}>📱 Falar com consultor</a>
        </div>
        <small class="montar__aviso">Estimativa com base no mix sugerido — os valores finais dependem dos modelos escolhidos, frete e condições.</small>`;
      result.hidden = false;
      if (window.gtag) try { gtag('event', 'simulador_m2', { value: total, currency: 'BRL', m2: m2 }); } catch (e) {}
    }
    function aplicar() {
      if (!simulado) return;
      simulado.chosen.forEach(p => { if (p.codigo) cart[p.codigo] = (cart[p.codigo] || 0) + 1; });
      save(); syncAll();
      if (window.gtag) try { gtag('event', 'montar_academia', { items: simulado.chosen.length }); } catch (e) {}
      if (window.fbq) try { fbq('track', 'AddToCart', { num_items: simulado.chosen.length }); } catch (e) {}
      openDrawer();
      toast(`Montamos ${simulado.chosen.length} equipamento(s) — revise e peça o orçamento!`);
    }
    if (go) go.addEventListener('click', calcular);
    if (result) result.addEventListener('click', e => { if (e.target.closest('#btnSimMontar')) aplicar(); });
  })();

  /* ---------- pop-up de boas-vindas (cupom) ---------- */
  const PROMO_KEY = 'torque_promo_seen';
  let promoDone = false;
  function maybeShowPromo() {
    if (promoDone) return;
    const c = popupCupom(); if (!c) return;
    let seen = 0; try { seen = +localStorage.getItem(PROMO_KEY) || 0; } catch (e) {}
    if (Date.now() - seen < 2 * 864e5) return;   // não repete por 2 dias
    if (!$('#drawer').hidden || !$('#leadModal').hidden || !$('#prodModal').hidden || currentCode()) return;   // não atrapalha outra ação
    const m = $('#promoModal'); if (!m) return;
    promoDone = true;
    const d = $('#promoDesc'); if (d) d.textContent = `${c.desconto}% de desconto no seu primeiro orçamento`;
    const cd = $('#promoCode'); if (cd) cd.textContent = c.codigo;
    m.hidden = false;
  }
  function closePromo() { const m = $('#promoModal'); if (m) m.hidden = true; try { localStorage.setItem(PROMO_KEY, String(Date.now())); } catch (e) {} }
  (function wirePromo() {
    const m = $('#promoModal'); if (!m) return;
    m.addEventListener('click', e => {
      if (e.target.closest('[data-promo-close]')) { closePromo(); return; }
      if (e.target.closest('#promoCopy')) {
        const c = popupCupom(); if (!c) return;
        try { navigator.clipboard.writeText(c.codigo); } catch (e) {}
        toast('Código copiado!');
        return;
      }
      if (e.target.closest('#promoUse')) {
        const c = popupCupom(); if (c) { appliedCoupon = c; renderDrawer(); }
        closePromo();
        toast(`Cupom ${c ? c.codigo : ''} aplicado — escolha seus equipamentos!`);
        openCatalog();
        const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    });
  })();

  /* ---------- botão voltar ao topo ---------- */
  (function backToTop() {
    const btn = $('#toTop'); if (!btn) return;
    const upd = () => { btn.hidden = window.scrollY < 600; };
    window.addEventListener('scroll', upd, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    upd();
  })();

  /* ---------- toast ---------- */
  let tT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => t.hidden = true, 2200); }

  /* ---------- init ---------- */
  window.__plate = plate;
  $('#ano').textContent = new Date().getFullYear();
  buildSearchIndex(); renderSeries(); renderChips(); renderGrupos(); renderGrid(); refreshCounts(); renderRecent(); renderFavBar();
  renderLinhasMenu(); renderLinhaHead();
  renderCarousel(); startCar(); renderContato(); renderDepo(); renderObras(); renderFaq();
  // pré-carrega as libs do PDF em ocioso: o compartilhar precisa estar pronto já no 1º toque
  setTimeout(() => {
    loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js').catch(() => {});
    loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js').catch(() => {});
  }, 3500);
  // deep-link: ?linha=Cardio ou ?tipo=acessorio já entram filtrados
  (function initView() {
    const tp = currentTipo(), dl = currentLinha();
    if (tp) goToTipo(tp, 'replace', false);
    else if (dl) goToLinha(dl, 'replace', false);
    // lista de favoritos compartilhada (?favs=COD1,COD2)
    const fv = new URLSearchParams(location.search).get('favs');
    if (fv) { favView = new Set(fv.split(',').map(s => s.trim()).filter(Boolean)); openCatalog(); renderGrid(); renderFavBar(); }
    // chegada com #produtos (links de outras páginas): revela o catálogo antes de rolar
    const hashProd = location.hash === '#produtos';
    if (hashProd) openCatalog();
    if (tp || dl || hashProd || fv) setTimeout(() => { const el = document.getElementById('produtos'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 250);
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
        .map(p => ({ id: p.id, codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral', tipo: p.tipo || 'maquina', grupo: p.grupo || '', imagem: p.imagem || '', imagens: Array.isArray(p.imagens) ? p.imagens : [], video: p.video || '', dims: p.dims || '', disp: p.disp || '', selo: p.selo || '', preco: Number(p.preco) || 0 }));
      if (!live.length) return;
      PRODUCTS = aplicaNomesPt(live);
      if (data && data.banners && typeof data.banners === 'object') BANNERS = data.banners;   // banners por categoria
      if (data && data.carousel && typeof data.carousel === 'object') CAROUSEL = data.carousel;   // imagens do carrossel
      if (data && data.site && typeof data.site === 'object') SITEINFO = Object.assign(SITEINFO, data.site);   // contato/localização
      buildSearchIndex(); renderSeries(); renderChips(); renderGrupos(); renderGrid(); refreshCounts(); renderRecent(); renderLinhasMenu();
      const tp = currentTipo(), dl = currentLinha();                    // re-aplica a vista com o catálogo ao vivo
      if (tp) goToTipo(tp, false, false); else if (dl) goToLinha(dl, false, false);
      renderLinhaHead(); renderCarousel(); renderContato(); renderDepo(); renderObras(); renderFaq(); applyWpp(); injectAnalytics();
      setTimeout(maybeShowPromo, 700);   // pop-up de cupom de boas-vindas

    } catch (e) { /* offline ou bucket vazio → mantém o catálogo embutido */ }
  }
  loadLiveCatalog();

  /* ---------- PWA: instalar a vitrine como app ---------- */
  (function pwa() {
    let deferred = null;
    const btn = $('#installBtn');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (btn) btn.hidden = false; });
    if (btn) btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null; btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => { if (btn) btn.hidden = true; });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  })();

  // deep-link: se a URL já vier com ?p=codigo, abre o produto direto
  (function initDeepLink() {
    const code = currentCode();
    if (code && byCode(code)) {
      history.replaceState({ prod: code }, '', prodURL(byCode(code)));
      openProd(code, false);
    }
  })();
})();
