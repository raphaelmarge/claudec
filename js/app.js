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
  let state = load();

  function freshFromSeed() {
    const seed = window.TORQUE_SEED;
    return {
      mode: 'vendedor',
      params: { ...seed.params },
      products: seed.products.map(p => ({
        id: uid(), codigo: p.codigo || '', nome: p.nome || '', serie: p.serie || 'Geral',
        imagem: p.imagem || '', custo: Number(p.custo) || 0,
        margem: null, precoManual: null, oculto: false
      })),
      cart: {},
      filters: { serie: 'all', query: '' }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        s.filters = s.filters || { serie: 'all', query: '' };
        s.cart = s.cart || {};
        return s;
      }
    } catch (e) { /* corrupt -> reseed */ }
    return freshFromSeed();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ------------------------------------------------------------
     PRECIFICAÇÃO
     ------------------------------------------------------------ */
  const P = () => state.params;
  function custoBase(p) { return P().custoEmDolar ? p.custo * (P().cambio || 1) : p.custo; }
  function custoComCustos(p) { return custoBase(p) * (1 + (P().frete || 0) / 100) * (1 + (P().impostos || 0) / 100); }
  function margemDe(p) { return (p.margem != null && p.margem !== '') ? Number(p.margem) : Number(P().margemPadrao || 0); }
  function precoCalculado(p) { return custoComCustos(p) * (1 + margemDe(p) / 100); }
  function precoEfetivo(p) { return (p.precoManual != null && p.precoManual !== '') ? Number(p.precoManual) : precoCalculado(p); }
  function margemEfetivaPct(p) {
    const c = custoComCustos(p); const v = precoEfetivo(p);
    if (!c) return 0; return ((v - c) / c) * 100;
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
    setVal('#cfgCambio', p.cambio); setVal('#cfgFrete', p.frete);
    setVal('#cfgImpostos', p.impostos); setVal('#cfgMargem', p.margemPadrao);
    setVal('#cfgParcelas', p.parcelasMax); setVal('#cfgJuros', p.juros);
    setVal('#cfgValidade', p.validade);
    $('#cfgCustoDolar').checked = !!p.custoEmDolar;
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

  function renderGrid() {
    const grid = $('#productGrid');
    const list = visibleProducts();
    const isAdmin = state.mode === 'admin';
    $('#emptyState').hidden = list.length !== 0;

    grid.innerHTML = list.map(p => {
      const price = precoEfetivo(p);
      const q = qtyOf(p.id);
      const media = p.imagem
        ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy" onerror="this.replaceWith(document.createRange().createContextualFragment(window.__PLATE))"/>`
        : plateSVG;

      const adminCost = isAdmin ? `
        <div class="card__cost">
          <span>Custo <b>${money(custoBase(p))}</b></span>
          <span class="tag-margin">Mrg ${margemEfetivaPct(p).toFixed(0)}%</span>
          ${p.precoManual != null && p.precoManual !== '' ? '<span class="tag-manual">manual</span>' : ''}
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
    }).join('');
  }

  function renderSerieDatalist() {
    $('#serieList').innerHTML = series().map(s => `<option value="${esc(s)}">`).join('');
  }

  function renderSummary() {
    const lines = cartLines();
    const total = cartTotal();
    $('#cartCount').textContent = cartCount();
    $('#cartTotalMini').textContent = money(total);
    $('#sumSubtotal').textContent = money(total);
    $('#sumTotal').textContent = money(total);

    $('#summaryItems').innerHTML = lines.length ? lines.map(l => `
      <div class="sitem" data-id="${l.p.id}">
        <span class="sitem__name">${esc(l.p.nome)}</span>
        <button class="btn btn--ghost sitem__rm" data-act="rm" aria-label="Remover" style="padding:6px 10px">✕</button>
        <span class="sitem__meta">${l.q} × ${money(l.unit)}</span>
        <span class="sitem__total">${money(l.total)}</span>
      </div>`).join('')
      : `<p class="empty" style="padding:18px 0">Escolha produtos para montar o orçamento.</p>`;

    renderInstallSelect(total);
  }

  function renderInstallSelect(total) {
    const sel = $('#installSelect');
    const maxN = Math.max(1, Math.floor(P().parcelasMax || 12));
    const opts = [];
    [1, 3, 6, 10, 12, 18, 24, 36, 48, 60, 72, 96].forEach(n => { if (n <= maxN) opts.push(n); });
    if (!opts.includes(maxN)) opts.push(maxN);
    const current = Number(sel.value) || maxN;
    sel.innerHTML = opts.map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}x</option>`).join('');
    updateInstallValue(total);
  }
  function updateInstallValue(total) {
    const n = Number($('#installSelect').value) || 1;
    const v = total > 0 ? parcelaValor(total, n) : 0;
    $('#installValue').textContent = total > 0 ? `${n}× de ${money(v)}` : '—';
    const juros = P().juros || 0;
    $('#installNote').textContent = total > 0
      ? (juros > 0 ? `Com juros de ${juros}% a.m. · total ${money(v * n)}` : 'Sem juros')
      : '';
  }

  /* ------------------------------------------------------------
     EVENTOS — globais
     ------------------------------------------------------------ */
  window.__PLATE = plateSVG;

  $('#modeToggle').addEventListener('click', () => {
    state.mode = state.mode === 'admin' ? 'vendedor' : 'admin';
    save(); render();
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

  // config inputs -> recalcula
  ['#cfgCambio', '#cfgFrete', '#cfgImpostos', '#cfgMargem', '#cfgParcelas', '#cfgJuros', '#cfgValidade'].forEach(sel => {
    $(sel).addEventListener('input', () => {
      const p = P();
      p.cambio = num($('#cfgCambio').value) || 0;
      p.frete = num($('#cfgFrete').value) || 0;
      p.impostos = num($('#cfgImpostos').value) || 0;
      p.margemPadrao = num($('#cfgMargem').value) || 0;
      p.parcelasMax = Math.max(1, parseInt($('#cfgParcelas').value, 10) || 1);
      p.juros = num($('#cfgJuros').value) || 0;
      p.validade = Math.max(1, parseInt($('#cfgValidade').value, 10) || 1);
      save(); renderGrid(); renderSummary();
    });
  });
  $('#cfgCustoDolar').addEventListener('change', e => { P().custoEmDolar = e.target.checked; save(); renderGrid(); renderSummary(); });

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
  $('#installSelect').addEventListener('change', () => updateInstallValue(cartTotal()));
  $('#summaryItems').addEventListener('click', e => {
    if (e.target.dataset.act === 'rm') {
      const id = e.target.closest('.sitem').dataset.id; setQty(id, 0); refreshCard(id); renderSummary();
    }
  });
  $('#btnClearCart').addEventListener('click', () => {
    if (!cartCount() || confirm('Limpar todos os itens do orçamento?')) { state.cart = {}; save(); render(); }
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
    $('#edCusto').value = p ? p.custo : '';
    $('#edMargem').value = (p && p.margem != null) ? p.margem : '';
    $('#edPreco').value = (p && p.precoManual != null) ? p.precoManual : '';
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
      custo: num($('#edCusto').value) || 0,
      margem: $('#edMargem').value === '' ? null : (num($('#edMargem').value) || 0),
      precoManual: $('#edPreco').value === '' ? null : (num($('#edPreco').value) || 0),
      oculto: $('#edOculto').checked
    };
  }
  function updateEditPreview() {
    const f = readEditForm();
    const tmp = { ...f };
    const c = custoComCustos(tmp);
    const v = precoEfetivo(tmp);
    const mrg = c ? ((v - c) / c * 100) : 0;
    $('#pricePreview').innerHTML =
      `Custo base: <b>${money(custoBase(tmp))}</b> · com frete/impostos: <b>${money(c)}</b><br>` +
      `Preço de venda: <b>${money(v)}</b> · margem efetiva: <b>${mrg.toFixed(1)}%</b>` +
      (f.precoManual != null ? ' (preço manual)' : ' (automático)');
  }
  ['#edCusto', '#edMargem', '#edPreco'].forEach(s => $(s).addEventListener('input', updateEditPreview));

  $('#btnSaveProduct').addEventListener('click', () => {
    const f = readEditForm();
    if (!f.nome) { toast('Informe o nome do produto.'); return; }
    if (editingId) {
      const p = state.products.find(x => x.id === editingId);
      Object.assign(p, f);
    } else {
      state.products.push({ id: uid(), ...f });
    }
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
    if (confirm('Restaurar os dados de exemplo? Isso substitui o catálogo atual.')) {
      state = freshFromSeed(); state.mode = 'admin'; save(); render(); toast('Dados de exemplo restaurados.');
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
    { key: 'custo',  label: 'Custo', rx: /(custo|cost|fob|compra)/i },
    { key: 'preco',  label: 'Preço de venda', rx: /(venda|pre[cç]o|price|valor|varejo)/i },
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
      return {
        id: uid(),
        codigo: m.codigo ? String(r[m.codigo] ?? '').trim() : '',
        nome,
        serie: (m.serie ? String(r[m.serie] ?? '').trim() : '') || 'Geral',
        imagem: m.imagem ? String(r[m.imagem] ?? '').trim() : '',
        custo: m.custo ? (num(r[m.custo]) || 0) : 0,
        margem: null,
        precoManual: m.preco ? (num(r[m.preco]) || null) : null,
        oculto: false
      };
    }).filter(Boolean);
    if (!imported.length) { toast('Nenhuma linha válida encontrada.'); return; }
    if ($('#impReplace').checked) { state.products = imported; state.cart = {}; }
    else state.products = state.products.concat(imported);
    save(); closeModal('#importModal'); render();
    toast(`${imported.length} produto(s) importado(s).`);
  });

  /* ------------------------------------------------------------
     QUOTE / EXPORT
     ------------------------------------------------------------ */
  $('#btnExport').addEventListener('click', () => {
    if (!cartCount()) { toast('Adicione produtos ao orçamento primeiro.'); return; }
    buildQuoteDoc(); openModal('#quoteModal');
  });
  $('#qCliente').addEventListener('input', buildQuoteDoc);
  $('#qVendedor').addEventListener('input', buildQuoteDoc);

  function todayStr() {
    return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function validadeStr() {
    const d = new Date(); d.setDate(d.getDate() + (P().validade || 7));
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function buildQuoteDoc() {
    const lines = cartLines();
    const total = cartTotal();
    const n = Number($('#installSelect').value) || Math.floor(P().parcelasMax || 12);
    const parc = parcelaValor(total, n);
    const cliente = $('#qCliente').value.trim();
    const vendedor = $('#qVendedor').value.trim();
    const numero = 'ORC-' + new Date().toISOString().slice(2, 10).replace(/-/g, '');

    const logo = `<svg class="qd__logo" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#1D1D27" stroke="#8B5CF6" stroke-width="4"/><path d="M22 74 A 38 38 0 1 1 78 74" fill="none" stroke="#8B5CF6" stroke-width="6" stroke-linecap="round"/><line x1="50" y1="50" x2="73" y2="33" stroke="#8B5CF6" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="50" r="7" fill="#8B5CF6"/></svg>`;

    const rows = lines.map(l => `
      <tr>
        <td><div class="qd__pname">${esc(l.p.nome)}</div>${l.p.codigo ? `<div class="qd__pcode">${esc(l.p.codigo)}</div>` : ''}</td>
        <td class="num">${l.q}</td>
        <td class="num">${money(l.unit)}</td>
        <td class="num">${money(l.total)}</td>
      </tr>`).join('');

    const jurosTxt = (P().juros || 0) > 0 ? `em ${n}× com juros de ${P().juros}% a.m.` : `em até ${n}× sem juros`;

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
        <span>Cliente: <b>${esc(cliente || '—')}</b></span>
        <span>Vendedor: <b>${esc(vendedor || '—')}</b></span>
      </div>
      <table class="qd__table">
        <thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="qd__totals">
        <div class="qrow"><span>Subtotal</span><b>${money(total)}</b></div>
        <div class="qrow qd__grand"><span>Total geral</span><b>${money(total)}</b></div>
      </div>
      <div class="qd__install">
        <div class="big">${n}× de ${money(parc)}</div>
        <small>Parcelamento ${jurosTxt}${(P().juros||0)>0 ? ` · total ${money(parc*n)}` : ''}.</small>
      </div>
      <div class="qd__foot">
        Orçamento gerado em ${todayStr()} · ${P().empresa || 'Torque Fitness'} · Valores sujeitos a alteração sem aviso prévio.
      </div>`;
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
    const total = cartTotal();
    const lines = cartLines();
    const txt = `*Orçamento Torque Fitness*\n\n` +
      lines.map(l => `• ${l.q}× ${l.p.nome} — ${money(l.total)}`).join('\n') +
      `\n\n*Total: ${money(total)}*`;
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
