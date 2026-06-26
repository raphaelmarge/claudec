/* ============================================================
   ACADEMIA — app de gestão (núcleo)
   SPA offline-first: localStorage como base do dispositivo e, quando
   logado, sincroniza com o Supabase (AcadCloud). Sem build, JS vanilla.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- utilidades ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const genId = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));

  const pad = n => String(n).padStart(2, '0');
  function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function addDays(iso, days) {
    const d = iso ? new Date(iso + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10).split('-');
    return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : iso;
  }
  function fmtMoney(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function daysBetween(aISO, bISO) {
    const a = new Date(aISO + 'T00:00:00'), b = new Date(bISO + 'T00:00:00');
    return Math.round((a - b) / 86400000);
  }
  function refMes(iso) { return String(iso || todayISO()).slice(0, 7); }
  function onlyDigits(s) { return (s || '').replace(/\D+/g, ''); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------- estado + persistência ---------------- */
  const LS = {
    planos: 'acad_planos', alunos: 'acad_alunos',
    pagamentos: 'acad_pagamentos', acessos: 'acad_acessos', config: 'acad_config'
  };
  const DEFAULT_CONFIG = { nomeAcademia: 'Minha Academia', faceThreshold: 0.52, toleranciaDias: 0 };

  const Store = {
    mode: 'local',        // 'local' | 'cloud'
    planos: [], alunos: [], pagamentos: [], acessos: [],
    config: Object.assign({}, DEFAULT_CONFIG),

    loadLocal() {
      const get = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
      this.planos = get(LS.planos, []);
      this.alunos = get(LS.alunos, []);
      this.pagamentos = get(LS.pagamentos, []);
      this.acessos = get(LS.acessos, []);
      this.config = Object.assign({}, DEFAULT_CONFIG, get(LS.config, {}));
    },
    persistLocal() {
      localStorage.setItem(LS.planos, JSON.stringify(this.planos));
      localStorage.setItem(LS.alunos, JSON.stringify(this.alunos));
      localStorage.setItem(LS.pagamentos, JSON.stringify(this.pagamentos));
      localStorage.setItem(LS.acessos, JSON.stringify(this.acessos.slice(0, 1000)));
      localStorage.setItem(LS.config, JSON.stringify(this.config));
    },

    table(entity) {
      return { planos: 'acad_planos', alunos: 'acad_alunos',
        pagamentos: 'acad_pagamentos', acessos: 'acad_acessos' }[entity];
    },

    async save(entity, obj) {
      if (!obj.id) obj.id = genId();
      const arr = this[entity];
      const i = arr.findIndex(x => x.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.unshift(obj);
      if (this.mode === 'cloud') {
        const row = await AcadCloud.upsert(this.table(entity), obj);
        const j = arr.findIndex(x => x.id === obj.id);
        if (j >= 0 && row) arr[j] = row;
        return arr[j] || obj;
      }
      this.persistLocal();
      return obj;
    },

    async remove(entity, id) {
      this[entity] = this[entity].filter(x => x.id !== id);
      if (this.mode === 'cloud') await AcadCloud.remove(this.table(entity), id);
      else this.persistLocal();
    },

    async saveConfig(cfg) {
      this.config = Object.assign({}, this.config, cfg);
      if (this.mode === 'cloud') await AcadCloud.saveConfig(this.config);
      else this.persistLocal();
    },

    async switchToCloud() {
      const data = await AcadCloud.loadAll();
      this.mode = 'cloud';
      this.planos = data.planos; this.alunos = data.alunos;
      this.pagamentos = data.pagamentos; this.acessos = data.acessos;
      this.config = Object.assign({}, DEFAULT_CONFIG, data.config || {});
    },
    switchToLocal() { this.mode = 'local'; this.loadLocal(); }
  };

  /* ---------------- regras de negócio ---------------- */
  function planoById(id) { return Store.planos.find(p => p.id === id) || null; }

  function alunoStatus(a) {
    if (!a) return { key: 'inativo', label: 'Inativo' };
    if (a.status === 'inativo') return { key: 'inativo', label: 'Inativo' };
    if (!a.vencimento) return { key: 'pendente', label: 'Sem matrícula' };
    const diff = daysBetween(a.vencimento, todayISO()); // >=0 em dia
    if (diff >= 0) return { key: 'em_dia', label: 'Em dia', dias: diff };
    return { key: 'inadimplente', label: 'Inadimplente', dias: diff };
  }

  function checkAccess(a) {
    if (!a) return { liberado: false, motivo: 'aluno não identificado' };
    if (a.status === 'inativo') return { liberado: false, motivo: 'cadastro inativo' };
    if (!a.vencimento) return { liberado: false, motivo: 'sem matrícula ativa' };
    const diff = daysBetween(a.vencimento, todayISO());
    const tol = Number(Store.config.toleranciaDias) || 0;
    if (diff + tol >= 0) return { liberado: true, motivo: diff >= 0 ? 'em dia' : `tolerância (${diff}d)` };
    return { liberado: false, motivo: `inadimplente (${-diff} dias)` };
  }

  async function registrarPagamento(aluno, plano, valor, metodo) {
    const base = (aluno.vencimento && daysBetween(aluno.vencimento, todayISO()) > 0)
      ? aluno.vencimento : todayISO();
    const novoVenc = addDays(base, plano ? Number(plano.duracao_dias) || 30 : 30);
    const pg = {
      id: genId(), aluno_id: aluno.id, plano_id: plano ? plano.id : null,
      valor: Number(valor) || 0, vencimento: novoVenc, pago: true,
      pago_em: new Date().toISOString(), metodo: metodo || 'dinheiro',
      ref_mes: refMes(todayISO()), obs: ''
    };
    await Store.save('pagamentos', pg);
    aluno.vencimento = novoVenc;
    aluno.status = 'ativo';
    if (plano) aluno.plano_id = plano.id;
    await Store.save('alunos', aluno);
    return pg;
  }

  async function registrarAcesso(alunoId, liberado, metodo, motivo) {
    const ac = {
      id: genId(), aluno_id: alunoId || null, ts: new Date().toISOString(),
      liberado: !!liberado, metodo: metodo || 'manual', motivo: motivo || ''
    };
    await Store.save('acessos', ac);
    return ac;
  }

  /* ---------------- UI: toast + modais ---------------- */
  function toast(msg, type) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }
  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  /* ---------------- navegação ---------------- */
  const TABS = [
    { id: 'dashboard', label: 'Painel', icon: '📊' },
    { id: 'alunos', label: 'Alunos', icon: '🧑' },
    { id: 'catraca', label: 'Catraca', icon: '🚪' },
    { id: 'financeiro', label: 'Financeiro', icon: '💳' },
    { id: 'planos', label: 'Planos', icon: '🏷️' },
    { id: 'config', label: 'Config', icon: '⚙️' }
  ];
  let current = 'dashboard';

  function render() {
    $('#tabs').innerHTML = TABS.map(t =>
      `<button class="tab ${t.id === current ? 'active' : ''}" data-tab="${t.id}">
        <span>${t.icon}</span><span>${t.label}</span></button>`).join('');
    const view = $('#view');
    if (current !== 'catraca') { clearInterval(catracaTimer); catracaTimer = null; AcadFace.stopCamera(); }
    ({
      dashboard: renderDashboard, alunos: renderAlunos, catraca: renderCatraca,
      financeiro: renderFinanceiro, planos: renderPlanos, config: renderConfig
    }[current])(view);
  }

  /* ---------------- PAINEL ---------------- */
  function renderDashboard(view) {
    const total = Store.alunos.length;
    let emDia = 0, inad = 0, inativos = 0;
    Store.alunos.forEach(a => {
      const s = alunoStatus(a).key;
      if (s === 'em_dia') emDia++;
      else if (s === 'inadimplente') inad++;
      else inativos++;
    });
    const hoje = todayISO();
    const checkinsHoje = Store.acessos.filter(x => String(x.ts).slice(0, 10) === hoje).length;
    const liberadosHoje = Store.acessos.filter(x => String(x.ts).slice(0, 10) === hoje && x.liberado).length;
    const mes = refMes(hoje);
    const receitaMes = Store.pagamentos
      .filter(p => p.pago && refMes(p.pago_em ? String(p.pago_em).slice(0, 10) : p.criado_em) === mes)
      .reduce((s, p) => s + (Number(p.valor) || 0), 0);

    const aniversariantes = Store.alunos.filter(a =>
      a.nascimento && String(a.nascimento).slice(5, 7) === mes.slice(5, 7));

    view.innerHTML = `
      <div class="grid stats">
        ${stat('Alunos', total, 'total')}
        ${stat('Em dia', emDia, 'ok')}
        ${stat('Inadimplentes', inad, 'bad')}
        ${stat('Inativos / sem matrícula', inativos, 'muted')}
        ${stat('Check-ins hoje', `${liberadosHoje}/${checkinsHoje}`, 'info')}
        ${stat('Receita do mês', fmtMoney(receitaMes), 'money')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Acessos recentes</h3>
          <button class="btn" data-go="catraca">Abrir catraca</button></div>
        ${acessosTable(Store.acessos.slice(0, 12))}
      </div>

      <div class="card">
        <div class="card-head"><h3>Inadimplentes</h3>
          <button class="btn" data-go="financeiro">Ir ao financeiro</button></div>
        ${inadList()}
      </div>

      <div class="card">
        <div class="card-head"><h3>Aniversariantes do mês 🎂</h3></div>
        ${aniversariantes.length
          ? `<ul class="plain">${aniversariantes.map(a =>
              `<li>${esc(a.nome)} — ${fmtDate(a.nascimento)}</li>`).join('')}</ul>`
          : '<p class="muted">Ninguém faz aniversário este mês.</p>'}
      </div>`;

    $$('[data-go]', view).forEach(b => b.onclick = () => go(b.dataset.go));
  }

  function stat(label, value, kind) {
    return `<div class="stat stat-${kind || ''}"><div class="stat-v">${value}</div>
      <div class="stat-l">${label}</div></div>`;
  }
  function inadList() {
    const list = Store.alunos.filter(a => alunoStatus(a).key === 'inadimplente')
      .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
    if (!list.length) return '<p class="muted">Nenhum inadimplente. 🎉</p>';
    return `<table class="table"><thead><tr><th>Aluno</th><th>Venceu em</th><th>Dias</th><th></th></tr></thead>
      <tbody>${list.slice(0, 15).map(a => {
        const d = -daysBetween(a.vencimento, todayISO());
        return `<tr><td>${esc(a.nome)}</td><td>${fmtDate(a.vencimento)}</td>
          <td><span class="badge badge-bad">${d}d</span></td>
          <td><button class="btn btn-sm" data-pay="${a.id}">Receber</button></td></tr>`;
      }).join('')}</tbody></table>`;
  }

  /* ---------------- ALUNOS ---------------- */
  let alunoFilter = '';
  function renderAlunos(view) {
    view.innerHTML = `
      <div class="toolbar">
        <input id="alunoSearch" class="input" placeholder="Buscar por nome ou CPF…" value="${esc(alunoFilter)}">
        <button class="btn btn-primary" id="novoAluno">+ Novo aluno</button>
      </div>
      <div id="alunosList"></div>`;
    $('#novoAluno').onclick = () => abrirAlunoModal(null);
    const s = $('#alunoSearch');
    s.oninput = () => { alunoFilter = s.value; drawAlunos(); };
    drawAlunos();
  }
  function drawAlunos() {
    const q = onlyDigits(alunoFilter) ? onlyDigits(alunoFilter) : alunoFilter.toLowerCase().trim();
    const list = Store.alunos.filter(a => {
      if (!alunoFilter.trim()) return true;
      return (a.nome || '').toLowerCase().includes(q) || onlyDigits(a.cpf).includes(q);
    }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const host = $('#alunosList');
    if (!list.length) { host.innerHTML = '<p class="muted card">Nenhum aluno encontrado.</p>'; return; }
    host.innerHTML = `<div class="grid cards">${list.map(alunoCard).join('')}</div>`;
    $$('[data-edit]', host).forEach(b => b.onclick = () => abrirAlunoModal(b.dataset.edit));
    $$('[data-pay]', host).forEach(b => b.onclick = () => abrirPagamentoModal(b.dataset.pay));
  }
  function alunoCard(a) {
    const st = alunoStatus(a);
    const badge = { em_dia: 'ok', inadimplente: 'bad', inativo: 'muted', pendente: 'warn' }[st.key];
    const foto = a.foto ? `<img src="${a.foto}" alt="">`
      : `<div class="avatar-ph">${esc((a.nome || '?').charAt(0).toUpperCase())}</div>`;
    const plano = planoById(a.plano_id);
    const face = a.face_descriptor && a.face_descriptor.length ? '<span title="Rosto cadastrado">📷</span>' : '';
    return `<div class="card aluno-card">
      <div class="aluno-top">
        <div class="avatar">${foto}</div>
        <div class="aluno-id">
          <strong>${esc(a.nome)} ${face}</strong>
          <span class="muted">${plano ? esc(plano.nome) : 'sem plano'}</span>
          <span class="badge badge-${badge}">${st.label}</span>
        </div>
      </div>
      <div class="aluno-meta">
        <span>📞 ${esc(a.telefone || '—')}</span>
        <span>Vence: ${fmtDate(a.vencimento)}</span>
      </div>
      <div class="aluno-actions">
        <button class="btn btn-sm" data-edit="${a.id}">Editar</button>
        <button class="btn btn-sm btn-primary" data-pay="${a.id}">Receber</button>
      </div>
    </div>`;
  }

  /* ----- modal de aluno (cadastro + facial) ----- */
  let faceCaptureState = { descriptor: null, foto: null };
  function abrirAlunoModal(id) {
    const a = id ? Store.alunos.find(x => x.id === id) : null;
    faceCaptureState = { descriptor: a && a.face_descriptor ? a.face_descriptor : null, foto: a ? a.foto : null };
    const planosOpts = Store.planos.map(p =>
      `<option value="${p.id}" ${a && a.plano_id === p.id ? 'selected' : ''}>${esc(p.nome)} — ${fmtMoney(p.valor)}</option>`).join('');
    $('#modal-aluno .modal-card').innerHTML = `
      <div class="modal-head"><h3>${a ? 'Editar aluno' : 'Novo aluno'}</h3>
        <button class="x" data-close>✕</button></div>
      <div class="modal-body">
        <div class="face-enroll">
          <div class="avatar lg" id="enrollPreview">
            ${faceCaptureState.foto ? `<img src="${faceCaptureState.foto}">` : '<div class="avatar-ph">📷</div>'}
          </div>
          <video id="enrollVideo" playsinline muted hidden></video>
          <div class="face-buttons">
            <button class="btn btn-sm" id="btnCam">Ligar câmera</button>
            <button class="btn btn-sm btn-primary" id="btnCapture" hidden>Capturar rosto</button>
            <span id="faceStatus" class="muted">${faceCaptureState.descriptor ? '✅ rosto cadastrado' : 'rosto não cadastrado'}</span>
          </div>
        </div>
        <div class="form-grid">
          ${field('nome', 'Nome completo', a ? a.nome : '', 'text', true)}
          ${field('cpf', 'CPF', a ? a.cpf : '')}
          ${field('telefone', 'Telefone', a ? a.telefone : '')}
          ${field('email', 'E-mail', a ? a.email : '', 'email')}
          ${field('nascimento', 'Nascimento', a ? (a.nascimento || '') : '', 'date')}
          <label class="field"><span>Plano</span>
            <select id="f_plano"><option value="">— sem plano —</option>${planosOpts}</select></label>
          ${field('inicio', 'Início', a ? (a.inicio || todayISO()) : todayISO(), 'date')}
          ${field('vencimento', 'Vencimento', a ? (a.vencimento || '') : '', 'date')}
          <label class="field"><span>Status</span>
            <select id="f_status">
              <option value="ativo" ${!a || a.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${a && a.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select></label>
        </div>
        <label class="field"><span>Observações</span>
          <textarea id="f_obs" rows="2">${esc(a ? a.obs : '')}</textarea></label>
      </div>
      <div class="modal-foot">
        ${a ? `<button class="btn btn-danger" id="btnDel">Excluir</button>` : '<span></span>'}
        <div>
          <button class="btn" data-close>Cancelar</button>
          <button class="btn btn-primary" id="btnSave">Salvar</button>
        </div>
      </div>`;
    openModal('#modal-aluno');

    $$('[data-close]', $('#modal-aluno')).forEach(b => b.onclick = () => { AcadFace.stopCamera(); closeModal('#modal-aluno'); });
    const video = $('#enrollVideo'), preview = $('#enrollPreview');
    const fstatus = $('#faceStatus');

    $('#btnCam').onclick = async () => {
      try {
        $('#faceStatus').textContent = 'carregando câmera/modelos…';
        await AcadFace.startCamera(video);
        AcadFace.ensureReady().catch(() => {});
        video.hidden = false; preview.hidden = true;
        $('#btnCapture').hidden = false; $('#btnCam').hidden = true;
        fstatus.textContent = 'enquadre o rosto e capture';
      } catch (e) { toast(e.message || 'Falha na câmera', 'bad'); fstatus.textContent = 'câmera indisponível'; }
    };
    $('#btnCapture').onclick = async () => {
      try {
        fstatus.textContent = 'analisando…';
        const desc = await AcadFace.captureDescriptor(video);
        if (!desc) { fstatus.textContent = '❌ rosto não detectado, tente de novo'; return; }
        // snapshot para foto
        const c = document.createElement('canvas');
        c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        faceCaptureState.descriptor = desc;
        faceCaptureState.foto = c.toDataURL('image/jpeg', 0.7);
        AcadFace.stopCamera();
        video.hidden = true; preview.hidden = false;
        preview.innerHTML = `<img src="${faceCaptureState.foto}">`;
        $('#btnCapture').hidden = true; $('#btnCam').hidden = false; $('#btnCam').textContent = 'Recapturar';
        fstatus.textContent = '✅ rosto cadastrado';
      } catch (e) { fstatus.textContent = 'erro: ' + (e.message || e); }
    };

    $('#btnSave').onclick = async () => {
      const nome = $('#f_nome').value.trim();
      if (!nome) { toast('Informe o nome.', 'bad'); return; }
      const obj = Object.assign({}, a || {}, {
        nome,
        cpf: onlyDigits($('#f_cpf').value),
        telefone: $('#f_telefone').value.trim(),
        email: $('#f_email').value.trim(),
        nascimento: $('#f_nascimento').value || null,
        plano_id: $('#f_plano').value || null,
        inicio: $('#f_inicio').value || todayISO(),
        vencimento: $('#f_vencimento').value || null,
        status: $('#f_status').value,
        obs: $('#f_obs').value.trim(),
        foto: faceCaptureState.foto || (a ? a.foto : ''),
        face_descriptor: faceCaptureState.descriptor || (a ? a.face_descriptor : null)
      });
      try {
        await Store.save('alunos', obj);
        AcadFace.stopCamera(); closeModal('#modal-aluno');
        toast('Aluno salvo.', 'ok'); drawAlunos(); refreshHeader();
      } catch (e) { toast('Erro ao salvar: ' + (e.message || e), 'bad'); }
    };

    if (a) $('#btnDel').onclick = async () => {
      if (!confirm(`Excluir ${a.nome}? Os pagamentos do aluno também serão removidos.`)) return;
      try {
        await Store.remove('alunos', a.id);
        Store.pagamentos = Store.pagamentos.filter(p => p.aluno_id !== a.id);
        if (Store.mode === 'local') Store.persistLocal();
        AcadFace.stopCamera(); closeModal('#modal-aluno');
        toast('Aluno excluído.', 'ok'); render();
      } catch (e) { toast('Erro ao excluir: ' + (e.message || e), 'bad'); }
    };
  }

  function field(name, label, val, type, req) {
    return `<label class="field"><span>${label}${req ? ' *' : ''}</span>
      <input id="f_${name}" type="${type || 'text'}" value="${esc(val)}" ${req ? 'required' : ''}></label>`;
  }

  /* ----- modal de pagamento ----- */
  function abrirPagamentoModal(alunoId) {
    const a = Store.alunos.find(x => x.id === alunoId);
    if (!a) return;
    const planoAtual = planoById(a.plano_id);
    const planosOpts = Store.planos.map(p =>
      `<option value="${p.id}" ${a.plano_id === p.id ? 'selected' : ''}>${esc(p.nome)} — ${fmtMoney(p.valor)} / ${p.duracao_dias}d</option>`).join('');
    $('#modal-pagamento .modal-card').innerHTML = `
      <div class="modal-head"><h3>Receber — ${esc(a.nome)}</h3><button class="x" data-close>✕</button></div>
      <div class="modal-body">
        <p class="muted">Vencimento atual: <strong>${fmtDate(a.vencimento)}</strong></p>
        <div class="form-grid">
          <label class="field"><span>Plano</span>
            <select id="p_plano"><option value="">— avulso —</option>${planosOpts}</select></label>
          <label class="field"><span>Valor (R$)</span>
            <input id="p_valor" type="number" step="0.01" value="${planoAtual ? planoAtual.valor : 0}"></label>
          <label class="field"><span>Forma</span>
            <select id="p_metodo">
              <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option>
              <option value="cartao">Cartão</option><option value="boleto">Boleto</option>
            </select></label>
        </div>
        <p class="muted" id="p_preview"></p>
      </div>
      <div class="modal-foot"><span></span><div>
        <button class="btn" data-close>Cancelar</button>
        <button class="btn btn-primary" id="p_confirm">Confirmar pagamento</button>
      </div></div>`;
    openModal('#modal-pagamento');
    $$('[data-close]', $('#modal-pagamento')).forEach(b => b.onclick = () => closeModal('#modal-pagamento'));

    const selPlano = $('#p_plano'), inpValor = $('#p_valor'), prev = $('#p_preview');
    function upd() {
      const p = planoById(selPlano.value);
      if (p) inpValor.value = p.valor;
      const dur = p ? Number(p.duracao_dias) || 30 : 30;
      const base = (a.vencimento && daysBetween(a.vencimento, todayISO()) > 0) ? a.vencimento : todayISO();
      prev.textContent = `Novo vencimento: ${fmtDate(addDays(base, dur))}`;
    }
    selPlano.onchange = upd; upd();

    $('#p_confirm').onclick = async () => {
      try {
        const p = planoById(selPlano.value);
        await registrarPagamento(a, p, inpValor.value, $('#p_metodo').value);
        closeModal('#modal-pagamento');
        toast('Pagamento registrado. Acesso liberado.', 'ok');
        render();
      } catch (e) { toast('Erro: ' + (e.message || e), 'bad'); }
    };
  }

  /* ---------------- CATRACA ---------------- */
  let catracaTimer = null, lastHit = { id: null, ts: 0 };
  function renderCatraca(view) {
    const semFacial = !AcadFace.supported();
    view.innerHTML = `
      <div class="catraca">
        <div class="cam-wrap">
          <video id="catVideo" playsinline muted></video>
          <div id="catResult" class="cat-result">Aponte o rosto para a câmera</div>
        </div>
        <div class="cat-side">
          <div class="card">
            <h3>Reconhecimento facial</h3>
            <p class="muted">Identifica o aluno e libera/bloqueia conforme o plano.</p>
            <button class="btn btn-primary" id="catStart">▶ Iniciar reconhecimento</button>
            <button class="btn" id="catStop" hidden>⏸ Parar</button>
            <p class="muted" id="catFaceMsg"></p>
          </div>
          <div class="card">
            <h3>Liberação manual</h3>
            <p class="muted">Sem câmera ou rosto não cadastrado.</p>
            <input id="catCpf" class="input" placeholder="CPF ou nome do aluno">
            <div id="catManualList" class="manual-list"></div>
          </div>
        </div>
      </div>`;
    if (semFacial) { $('#catFaceMsg').textContent = 'Câmera não disponível neste dispositivo — use a liberação manual.'; $('#catStart').disabled = true; }

    $('#catStart').onclick = startCatraca;
    $('#catStop').onclick = stopCatraca;
    const cpf = $('#catCpf');
    cpf.oninput = () => drawManual(cpf.value);
    drawManual('');
  }

  function drawManual(q) {
    const host = $('#catManualList'); if (!host) return;
    const term = onlyDigits(q) || (q || '').toLowerCase().trim();
    const list = (q || '').trim()
      ? Store.alunos.filter(a => (a.nome || '').toLowerCase().includes(term) || onlyDigits(a.cpf).includes(term)).slice(0, 6)
      : [];
    host.innerHTML = list.map(a =>
      `<button class="manual-item" data-id="${a.id}">${esc(a.nome)} <span class="muted">${esc(a.cpf || '')}</span></button>`).join('')
      || (q.trim() ? '<p class="muted">Nenhum aluno.</p>' : '');
    $$('[data-id]', host).forEach(b => b.onclick = () => liberarAluno(b.dataset.id, 'manual'));
  }

  async function startCatraca() {
    try {
      $('#catFaceMsg').textContent = 'carregando modelos de reconhecimento…';
      await AcadFace.startCamera($('#catVideo'));
      await AcadFace.ensureReady();
      $('#catStart').hidden = true; $('#catStop').hidden = false;
      $('#catFaceMsg').textContent = 'reconhecendo… aponte o rosto.';
      const cands = Store.alunos.filter(a => a.face_descriptor && a.face_descriptor.length)
        .map(a => ({ id: a.id, descriptor: a.face_descriptor }));
      if (!cands.length) $('#catFaceMsg').textContent = 'Nenhum aluno tem rosto cadastrado ainda.';
      const thr = Number(Store.config.faceThreshold) || 0.52;
      clearInterval(catracaTimer);
      catracaTimer = setInterval(async () => {
        try {
          const desc = await AcadFace.captureDescriptor($('#catVideo'));
          if (!desc) return;
          const m = AcadFace.bestMatch(desc, cands, thr);
          if (!m) { showCatResult(null, { liberado: false, motivo: 'não reconhecido' }); return; }
          if (m.id === lastHit.id && Date.now() - lastHit.ts < 6000) return; // debounce
          lastHit = { id: m.id, ts: Date.now() };
          liberarAluno(m.id, 'facial');
        } catch (_) {}
      }, 1200);
    } catch (e) { $('#catFaceMsg').textContent = e.message || 'Falha na câmera'; }
  }
  function stopCatraca() {
    clearInterval(catracaTimer); catracaTimer = null;
    AcadFace.stopCamera();
    if ($('#catStart')) { $('#catStart').hidden = false; $('#catStop').hidden = true; $('#catFaceMsg').textContent = ''; }
  }

  async function liberarAluno(id, metodo) {
    const a = Store.alunos.find(x => x.id === id);
    const res = checkAccess(a);
    showCatResult(a, res);
    await registrarAcesso(id, res.liberado, metodo, res.motivo);
    if (metodo === 'manual') { const c = $('#catCpf'); if (c) c.value = ''; drawManual(''); }
  }
  function showCatResult(a, res) {
    const el = $('#catResult'); if (!el) return;
    if (!a) { el.className = 'cat-result deny'; el.innerHTML = `🚫 <b>Acesso negado</b><br><span>${esc(res.motivo)}</span>`; return; }
    el.className = 'cat-result ' + (res.liberado ? 'allow' : 'deny');
    const foto = a.foto ? `<img src="${a.foto}" class="cat-foto">` : '';
    el.innerHTML = `${foto}${res.liberado ? '✅ <b>LIBERADO</b>' : '🚫 <b>BLOQUEADO</b>'}
      <br><span class="cat-nome">${esc(a.nome)}</span>
      <br><span>${esc(res.motivo)}</span>
      <br><small>Vence: ${fmtDate(a.vencimento)}</small>`;
  }

  /* ---------------- FINANCEIRO ---------------- */
  function renderFinanceiro(view) {
    const mes = refMes(todayISO());
    const pagosMes = Store.pagamentos.filter(p => p.pago &&
      refMes(p.pago_em ? String(p.pago_em).slice(0, 10) : p.criado_em) === mes);
    const receita = pagosMes.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const inad = Store.alunos.filter(a => alunoStatus(a).key === 'inadimplente');
    const aReceber = inad.reduce((s, a) => { const p = planoById(a.plano_id); return s + (p ? Number(p.valor) || 0 : 0); }, 0);

    view.innerHTML = `
      <div class="grid stats">
        ${stat('Receita do mês', fmtMoney(receita), 'money')}
        ${stat('Pagamentos no mês', pagosMes.length, 'info')}
        ${stat('Inadimplentes', inad.length, 'bad')}
        ${stat('A receber (estimado)', fmtMoney(aReceber), 'warn')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Inadimplentes</h3></div>
        ${inadList()}
      </div>
      <div class="card">
        <div class="card-head"><h3>Últimos pagamentos</h3></div>
        ${pagamentosTable(Store.pagamentos.slice(0, 30))}
      </div>`;
    $$('[data-pay]', view).forEach(b => b.onclick = () => abrirPagamentoModal(b.dataset.pay));
  }
  function pagamentosTable(list) {
    if (!list.length) return '<p class="muted">Nenhum pagamento registrado.</p>';
    return `<table class="table"><thead><tr><th>Aluno</th><th>Valor</th><th>Forma</th><th>Data</th><th>Vence</th></tr></thead>
      <tbody>${list.map(p => {
        const a = Store.alunos.find(x => x.id === p.aluno_id);
        return `<tr><td>${esc(a ? a.nome : '—')}</td><td>${fmtMoney(p.valor)}</td>
          <td>${esc(p.metodo)}</td><td>${fmtDate(p.pago_em ? String(p.pago_em).slice(0, 10) : p.criado_em)}</td>
          <td>${fmtDate(p.vencimento)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  function acessosTable(list) {
    if (!list.length) return '<p class="muted">Nenhum acesso registrado.</p>';
    return `<table class="table"><thead><tr><th>Hora</th><th>Aluno</th><th>Via</th><th>Resultado</th></tr></thead>
      <tbody>${list.map(x => {
        const a = Store.alunos.find(z => z.id === x.aluno_id);
        const t = new Date(x.ts);
        const hora = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
        return `<tr><td>${hora}</td><td>${esc(a ? a.nome : '—')}</td><td>${esc(x.metodo)}</td>
          <td><span class="badge badge-${x.liberado ? 'ok' : 'bad'}">${x.liberado ? 'Liberado' : 'Bloqueado'}</span>
          <span class="muted">${esc(x.motivo)}</span></td></tr>`;
      }).join('')}</tbody></table>`;
  }

  /* ---------------- PLANOS ---------------- */
  function renderPlanos(view) {
    view.innerHTML = `
      <div class="toolbar"><h3 style="margin:0">Planos</h3>
        <button class="btn btn-primary" id="novoPlano">+ Novo plano</button></div>
      <div class="grid cards">${Store.planos.map(planoCard).join('') || '<p class="muted card">Nenhum plano cadastrado.</p>'}</div>`;
    $('#novoPlano').onclick = () => abrirPlanoModal(null);
    $$('[data-edit]', view).forEach(b => b.onclick = () => abrirPlanoModal(b.dataset.edit));
  }
  function planoCard(p) {
    const n = Store.alunos.filter(a => a.plano_id === p.id).length;
    return `<div class="card plano-card">
      <strong>${esc(p.nome)}</strong>
      <div class="plano-valor">${fmtMoney(p.valor)}</div>
      <span class="muted">${p.duracao_dias} dias · ${n} aluno(s)</span>
      ${p.descricao ? `<p class="muted">${esc(p.descricao)}</p>` : ''}
      <button class="btn btn-sm" data-edit="${p.id}">Editar</button>
    </div>`;
  }
  function abrirPlanoModal(id) {
    const p = id ? Store.planos.find(x => x.id === id) : null;
    $('#modal-plano .modal-card').innerHTML = `
      <div class="modal-head"><h3>${p ? 'Editar plano' : 'Novo plano'}</h3><button class="x" data-close>✕</button></div>
      <div class="modal-body"><div class="form-grid">
        ${field('pl_nome', 'Nome', p ? p.nome : '', 'text', true)}
        ${field('pl_valor', 'Valor (R$)', p ? p.valor : '', 'number')}
        ${field('pl_dur', 'Duração (dias)', p ? p.duracao_dias : 30, 'number')}
      </div>
      <label class="field"><span>Descrição</span><textarea id="f_pl_desc" rows="2">${esc(p ? p.descricao : '')}</textarea></label></div>
      <div class="modal-foot">
        ${p ? '<button class="btn btn-danger" id="pl_del">Excluir</button>' : '<span></span>'}
        <div><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="pl_save">Salvar</button></div>
      </div>`;
    openModal('#modal-plano');
    $$('[data-close]', $('#modal-plano')).forEach(b => b.onclick = () => closeModal('#modal-plano'));
    $('#pl_save').onclick = async () => {
      const nome = $('#f_pl_nome').value.trim();
      if (!nome) { toast('Informe o nome do plano.', 'bad'); return; }
      const obj = Object.assign({}, p || {}, {
        nome, valor: Number($('#f_pl_valor').value) || 0,
        duracao_dias: Number($('#f_pl_dur').value) || 30,
        descricao: $('#f_pl_desc').value.trim(), ativo: true
      });
      try { await Store.save('planos', obj); closeModal('#modal-plano'); toast('Plano salvo.', 'ok'); render(); }
      catch (e) { toast('Erro: ' + (e.message || e), 'bad'); }
    };
    if (p) $('#pl_del').onclick = async () => {
      if (!confirm('Excluir este plano?')) return;
      try { await Store.remove('planos', p.id); closeModal('#modal-plano'); toast('Plano excluído.', 'ok'); render(); }
      catch (e) { toast('Erro: ' + (e.message || e), 'bad'); }
    };
  }

  /* ---------------- CONFIG ---------------- */
  function renderConfig(view) {
    const c = Store.config;
    const logged = Store.mode === 'cloud' && AcadCloud.user;
    view.innerHTML = `
      <div class="card">
        <h3>Geral</h3>
        <div class="form-grid">
          ${field('cfg_nome', 'Nome da academia', c.nomeAcademia)}
          ${field('cfg_tol', 'Tolerância de atraso (dias)', c.toleranciaDias, 'number')}
          ${field('cfg_thr', 'Sensibilidade facial (0,4–0,6)', c.faceThreshold, 'number')}
        </div>
        <button class="btn btn-primary" id="cfgSave">Salvar configurações</button>
      </div>

      <div class="card">
        <h3>Nuvem (Supabase)</h3>
        ${AcadCloud.configured()
          ? (logged
            ? `<p>✅ Conectado como <strong>${esc(AcadCloud.user.email || '')}</strong>. Dados sincronizando na nuvem.</p>
               <button class="btn" id="cloudOut">Sair (usar só este dispositivo)</button>`
            : `<p class="muted">Faça login para sincronizar os dados entre dispositivos. Sem login, tudo fica salvo só neste aparelho.</p>
               <button class="btn btn-primary" id="cloudIn">Entrar / criar conta</button>`)
          : '<p class="muted">Supabase não configurado neste projeto.</p>'}
      </div>

      <div class="card">
        <h3>Dados</h3>
        <p class="muted">Modo atual: <strong>${Store.mode === 'cloud' ? 'Nuvem' : 'Somente este dispositivo'}</strong>.</p>
        <button class="btn" id="expData">Exportar base (JSON)</button>
        <label class="btn" style="cursor:pointer">Importar base (JSON)
          <input type="file" id="impData" accept="application/json" hidden></label>
      </div>`;

    $('#cfgSave').onclick = async () => {
      await Store.saveConfig({
        nomeAcademia: $('#f_cfg_nome').value.trim() || 'Minha Academia',
        toleranciaDias: Number($('#f_cfg_tol').value) || 0,
        faceThreshold: Number($('#f_cfg_thr').value) || 0.52
      });
      toast('Configurações salvas.', 'ok'); refreshHeader();
    };
    const ci = $('#cloudIn'); if (ci) ci.onclick = () => openLogin();
    const co = $('#cloudOut'); if (co) co.onclick = async () => {
      await AcadCloud.signOut(); Store.switchToLocal(); toast('Você saiu. Usando dados locais.', 'ok'); refreshHeader(); render();
    };
    $('#expData').onclick = exportData;
    $('#impData').onchange = importData;
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({
      planos: Store.planos, alunos: Store.alunos,
      pagamentos: Store.pagamentos, acessos: Store.acessos, config: Store.config
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `academia-backup-${todayISO()}.json`;
    a.click();
  }
  async function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!confirm('Importar vai SUBSTITUIR os dados atuais deste dispositivo. Continuar?')) return;
      Store.planos = d.planos || []; Store.alunos = d.alunos || [];
      Store.pagamentos = d.pagamentos || []; Store.acessos = d.acessos || [];
      Store.config = Object.assign({}, DEFAULT_CONFIG, d.config || {});
      if (Store.mode === 'local') Store.persistLocal();
      toast('Base importada.', 'ok'); refreshHeader(); render();
    } catch (err) { toast('Arquivo inválido.', 'bad'); }
  }

  /* ---------------- login (Supabase) ---------------- */
  function openLogin() {
    $('#modal-login .modal-card').innerHTML = `
      <div class="modal-head"><h3>Entrar</h3><button class="x" data-close>✕</button></div>
      <div class="modal-body">
        <div class="form-grid">
          ${field('lg_email', 'E-mail', '', 'email')}
          ${field('lg_pass', 'Senha', '', 'password')}
          ${field('lg_nome', 'Nome (só p/ criar conta)', '')}
        </div>
        <p class="muted" id="lg_msg"></p>
      </div>
      <div class="modal-foot"><span></span><div>
        <button class="btn" id="lg_signup">Criar conta</button>
        <button class="btn btn-primary" id="lg_signin">Entrar</button>
      </div></div>`;
    openModal('#modal-login');
    $$('[data-close]', $('#modal-login')).forEach(b => b.onclick = () => closeModal('#modal-login'));
    const msg = $('#lg_msg');
    $('#lg_signin').onclick = async () => {
      try {
        msg.textContent = 'entrando…';
        await AcadCloud.signIn($('#f_lg_email').value, $('#f_lg_pass').value);
        await Store.switchToCloud();
        closeModal('#modal-login'); toast('Conectado à nuvem.', 'ok'); refreshHeader(); render();
      } catch (e) { msg.textContent = 'Erro: ' + (e.message || e); }
    };
    $('#lg_signup').onclick = async () => {
      try {
        msg.textContent = 'criando conta…';
        await AcadCloud.signUp($('#f_lg_email').value, $('#f_lg_pass').value, $('#f_lg_nome').value);
        msg.textContent = 'Conta criada. Se exigir confirmação por e-mail, confirme e depois entre.';
      } catch (e) { msg.textContent = 'Erro: ' + (e.message || e); }
    };
  }

  /* ---------------- header / navegação ---------------- */
  function refreshHeader() {
    $('#acadName').textContent = Store.config.nomeAcademia || 'Academia';
    const cloud = $('#cloudBadge');
    if (Store.mode === 'cloud') { cloud.textContent = '☁ nuvem'; cloud.className = 'cloud-badge on'; }
    else { cloud.textContent = '📍 local'; cloud.className = 'cloud-badge'; }
  }
  function go(tab) { current = tab; render(); window.scrollTo(0, 0); }

  /* global click delegation p/ botões data-pay no painel */
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { go(tab.dataset.tab); return; }
    const pay = e.target.closest('#view [data-pay]');
    if (pay && current === 'dashboard') abrirPagamentoModal(pay.dataset.pay);
  });

  /* ---------------- boot ---------------- */
  async function boot() {
    Store.loadLocal();
    // semente: se não houver planos, cria exemplos para começar
    if (!Store.planos.length) {
      Store.planos = [
        { id: genId(), nome: 'Mensal', valor: 99.9, duracao_dias: 30, descricao: 'Acesso livre', ativo: true },
        { id: genId(), nome: 'Trimestral', valor: 269.9, duracao_dias: 90, descricao: '3 meses', ativo: true },
        { id: genId(), nome: 'Anual', valor: 899.9, duracao_dias: 365, descricao: '12 meses', ativo: true }
      ];
      Store.persistLocal();
    }
    refreshHeader();
    render();

    // tenta nuvem em segundo plano
    if (AcadCloud.configured() && window.supabase) {
      AcadCloud.init();
      try {
        const s = await AcadCloud.getSession();
        if (s) { await Store.switchToCloud(); refreshHeader(); render(); }
      } catch (_) {}
      AcadCloud.onAuthChange(async (sess) => {
        if (!sess && Store.mode === 'cloud') { Store.switchToLocal(); refreshHeader(); render(); }
      });
    }
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
