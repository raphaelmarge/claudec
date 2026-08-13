/* ============================================================
   CuidarJá — app de home care sob demanda (protótipo)
   Tudo roda no navegador. Dados de exemplo + persistência em
   localStorage. A camada de dados (Store) é isolada de propósito:
   trocar por Supabase depois é só reimplementar os métodos.
   ============================================================ */
(function () {
  'use strict';

  /* ============================ CATÁLOGO ============================ */
  const ROLES = {
    cuidador:     { label: 'Cuidador(a) de idosos',   ico: '🧓', desc: 'Higiene, alimentação, companhia, mobilidade', registro: null },
    tecnico:      { label: 'Técnico(a) de enfermagem', ico: '💉', desc: 'Medicação, curativos, sondas, aferição',      registro: 'COREN' },
    enfermeiro:   { label: 'Enfermeiro(a)',            ico: '🩺', desc: 'Home care complexo, gestão do cuidado',        registro: 'COREN' },
    fisio:        { label: 'Fisioterapeuta',           ico: '🤸', desc: 'Reabilitação e fisioterapia respiratória',     registro: 'CREFITO' },
    acompanhante: { label: 'Acompanhante hospitalar',  ico: '🏥', desc: 'Acompanhamento em consultas e internação',     registro: null }
  };

  const DURACOES = {
    hora:      { label: 'Por hora',    horasFixas: null },
    diaria:    { label: 'Diária (8h)', horasFixas: 8 },
    plantao12: { label: 'Plantão 12h', horasFixas: 12 },
    noite:     { label: 'Pernoite',    horasFixas: 12 }
  };

  const STATUS = {
    pendente:     'Aguardando confirmação',
    confirmado:   'Confirmado',
    em_andamento: 'Em atendimento',
    concluido:    'Concluído',
    cancelado:    'Cancelado'
  };
  const FLOW = ['pendente', 'confirmado', 'em_andamento', 'concluido'];
  const FLOW_LABEL = { pendente: 'Solicitado', confirmado: 'Confirmado', em_andamento: 'Em atendimento', concluido: 'Concluído' };

  const AVATAR_COLORS = ['#0E9F8E', '#3F7BD6', '#E0724A', '#8A5CD1', '#2FA36B', '#D0578F', '#C79A1E', '#4AA3B8', '#B5603C'];

  /* ============================ DADOS DE EXEMPLO ============================ */
  function seedPros() {
    return [
      { id: 'p1', nome: 'Ana Paula Ribeiro', role: 'cuidador', precoHora: 32, avaliacao: 4.9, numAval: 213, distanciaKm: 1.2, etaMin: 8,
        experienciaAnos: 8, coren: null, bairro: 'Vila Mariana', disponivel: true,
        especialidades: ['Alzheimer', 'Mobilidade reduzida', 'Acamados', 'Companhia'],
        bio: 'Cuidadora há 8 anos, especializada no cuidado de idosos com demência. Paciência, carinho e rotina bem organizada.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p2', nome: 'Marcos Vinícius Alves', role: 'tecnico', precoHora: 58, avaliacao: 4.8, numAval: 156, distanciaKm: 2.4, etaMin: 13,
        experienciaAnos: 6, coren: 'COREN-SP 1.234.567', bairro: 'Saúde', disponivel: true,
        especialidades: ['Curativos', 'Medicação', 'Sondas', 'Pós-operatório'],
        bio: 'Técnico de enfermagem com foco em pós-operatório e cuidados domiciliares. Curativos complexos e controle de medicação.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p3', nome: 'Juliana Santos', role: 'enfermeiro', precoHora: 110, avaliacao: 5.0, numAval: 98, distanciaKm: 3.1, etaMin: 16,
        experienciaAnos: 11, coren: 'COREN-SP 345.678', bairro: 'Moema', disponivel: true,
        especialidades: ['Home care complexo', 'Oncologia', 'Gestão de caso', 'Cuidados paliativos'],
        bio: 'Enfermeira especialista em home care de alta complexidade. Coordeno o cuidado junto à família e à equipe médica.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p4', nome: 'Carlos Eduardo Lima', role: 'cuidador', precoHora: 28, avaliacao: 4.7, numAval: 88, distanciaKm: 0.8, etaMin: 6,
        experienciaAnos: 4, coren: null, bairro: 'Vila Mariana', disponivel: true,
        especialidades: ['Parkinson', 'Higiene', 'Companhia', 'Transferência'],
        bio: 'Cuidador atencioso, experiência com Parkinson e apoio na locomoção. Gosto de manter o idoso ativo e bem-humorado.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p5', nome: 'Fernanda Costa', role: 'fisio', precoHora: 130, avaliacao: 4.9, numAval: 142, distanciaKm: 4.0, etaMin: 19,
        experienciaAnos: 9, coren: 'CREFITO-3 98.765', bairro: 'Ipiranga', disponivel: true,
        especialidades: ['Reabilitação', 'Fisio respiratória', 'Idosos', 'Pós-AVC'],
        bio: 'Fisioterapeuta domiciliar. Reabilitação funcional e respiratória, com plano de evolução a cada visita.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p6', nome: 'Patrícia Gomes', role: 'tecnico', precoHora: 52, avaliacao: 4.6, numAval: 74, distanciaKm: 1.9, etaMin: 11,
        experienciaAnos: 5, coren: 'COREN-SP 987.654', bairro: 'Cambuci', disponivel: true,
        especialidades: ['Diabetes', 'Aplicação de insulina', 'Aferição', 'Glicemia'],
        bio: 'Técnica de enfermagem com foco em pacientes diabéticos. Controle de glicemia, insulina e orientação à família.',
        verif: { identidade: true, antecedentes: false } },

      { id: 'p7', nome: 'Roberto Nascimento', role: 'cuidador', precoHora: 30, avaliacao: 4.8, numAval: 61, distanciaKm: 2.7, etaMin: 14,
        experienciaAnos: 7, coren: null, bairro: 'Jabaquara', disponivel: true,
        especialidades: ['Acamados', 'Transferência', 'Cuidado noturno', 'Sonda gástrica'],
        bio: 'Cuidador com experiência em pacientes acamados e plantões noturnos. Força, técnica de transferência e atenção constante.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p8', nome: 'Beatriz Almeida', role: 'enfermeiro', precoHora: 120, avaliacao: 4.9, numAval: 110, distanciaKm: 5.2, etaMin: 24,
        experienciaAnos: 13, coren: 'COREN-SP 222.111', bairro: 'Aclimação', disponivel: true,
        especialidades: ['Feridas complexas', 'Estomia', 'Home care', 'Cateter'],
        bio: 'Enfermeira estomaterapeuta. Especialista em feridas complexas, estomias e cateteres, com registro fotográfico da evolução.',
        verif: { identidade: true, antecedentes: true } },

      { id: 'p9', nome: 'Sônia Ferreira', role: 'acompanhante', precoHora: 26, avaliacao: 4.7, numAval: 52, distanciaKm: 1.5, etaMin: 9,
        experienciaAnos: 6, coren: null, bairro: 'Vila Mariana', disponivel: true,
        especialidades: ['Acompanhamento hospitalar', 'Consultas', 'Pós-alta', 'Companhia'],
        bio: 'Acompanhante para consultas, exames e internações. Organizo horários, medicações e dou tranquilidade à família.',
        verif: { identidade: true, antecedentes: true } }
    ];
  }

  /* ============================ STORE (localStorage) ============================ */
  const Store = (function () {
    const K = { pros: 'cuidarja:pros', bookings: 'cuidarja:bookings', proMe: 'cuidarja:proMe', role: 'cuidarja:role' };
    function read(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
    function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    return {
      getPros() { let p = read(K.pros, null); if (!p) { p = seedPros(); write(K.pros, p); } return p; },
      savePros(p) { write(K.pros, p); },
      getBookings() { return read(K.bookings, []); },
      saveBookings(b) { write(K.bookings, b); },
      getProMe() { return read(K.proMe, null); },
      saveProMe(p) { write(K.proMe, p); },
      getRole() { return read(K.role, 'familia'); },
      saveRole(r) { write(K.role, r); }
    };
  })();

  /* ============================ ESTADO ============================ */
  const state = {
    role: Store.getRole(),           // 'familia' | 'pro'
    screen: 'solicitar',
    pros: Store.getPros(),
    bookings: Store.getBookings(),
    draft: null,                     // solicitação em construção
    sort: 'dist'
  };

  /* ============================ UTIL ============================ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const brl = n => 'R$ ' + (Math.round(n)).toLocaleString('pt-BR');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function initials(nome) {
    const parts = String(nome || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts.length > 1 ? parts[parts.length - 1][0] : '') || '').toUpperCase();
  }
  function avatarColor(id) {
    let h = 0; const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function avatar(p, cls) {
    return `<div class="avatar ${cls || ''}" style="background:${avatarColor(p.id)}">${esc(initials(p.nome))}</div>`;
  }
  function stars(v) {
    const full = Math.round(v);
    return '<span class="star">' + '★'.repeat(full) + '</span>';
  }
  function ratingHtml(p) {
    return `<span class="rating"><span class="star">★</span>${p.avaliacao.toFixed(1)} <small>(${p.numAval})</small></span>`;
  }
  function horasDe(b) {
    const d = DURACOES[b.duracao];
    return d && d.horasFixas ? d.horasFixas : (b.horas || 4);
  }
  function precoEstimado(prof, b) { return prof.precoHora * horasDe(b); }

  function quandoLabel(b) {
    if (b.quando === 'agora') return 'O quanto antes';
    if (b.data) {
      try {
        const dt = new Date(b.data + 'T' + (b.hora || '08:00'));
        return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' · ' + (b.hora || '08:00');
      } catch (e) { return 'Agendado'; }
    }
    return 'Agendado';
  }
  function duracaoLabel(b) {
    if (b.duracao === 'hora') return (b.horas || 4) + ' horas';
    if (b.duracao === 'diaria') return 'Diária · 8h';
    if (b.duracao === 'plantao12') return 'Plantão · 12h';
    if (b.duracao === 'noite') return 'Pernoite · 12h';
    return '';
  }

  function toast(msg, kind) {
    const t = $('#toast');
    t.className = 'toast' + (kind ? ' toast--' + kind : '');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, 2600);
  }

  /* ============================ SHEET (modal) ============================ */
  const Sheet = {
    open(html) { $('#sheetBody').innerHTML = html; $('#sheetRoot').hidden = false; document.body.style.overflow = 'hidden'; },
    close() { $('#sheetRoot').hidden = true; $('#sheetBody').innerHTML = ''; document.body.style.overflow = ''; }
  };

  /* ============================ NAVEGAÇÃO ============================ */
  const TABS = {
    familia: [
      { screen: 'solicitar', ico: '➕', label: 'Solicitar' },
      { screen: 'agendamentos', ico: '📋', label: 'Atendimentos' },
      { screen: 'ajuda', ico: '❔', label: 'Como funciona' }
    ],
    pro: [
      { screen: 'solicitacoes', ico: '🔔', label: 'Solicitações' },
      { screen: 'agenda', ico: '📅', label: 'Agenda' },
      { screen: 'perfil', ico: '👤', label: 'Perfil' }
    ]
  };

  function setRole(role) {
    state.role = role;
    Store.saveRole(role);
    document.body.dataset.role = role;
    $$('.role-switch__btn').forEach(b => b.classList.toggle('is-on', b.dataset.role === role));
    go(TABS[role][0].screen);
    renderTabbar();
    if (role === 'pro') { renderProInbox(); renderProAgenda(); }
  }

  function go(screen) {
    state.screen = screen;
    $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === screen));
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.screen === screen));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (screen === 'agendamentos') renderBookings();
    if (screen === 'solicitacoes') renderProInbox();
    if (screen === 'agenda') renderProAgenda();
    if (screen === 'perfil') fillProForm();
  }

  function pendingCount() { return state.bookings.filter(b => b.status === 'pendente').length; }

  function renderTabbar() {
    const bar = $('#tabbar');
    bar.innerHTML = TABS[state.role].map(t => {
      let badge = '';
      if (state.role === 'pro' && t.screen === 'solicitacoes' && pendingCount() > 0)
        badge = `<span class="tab__badge">${pendingCount()}</span>`;
      return `<button class="tab ${t.screen === state.screen ? 'is-on' : ''}" data-screen="${t.screen}">
        <span class="tab__ico">${t.ico}</span>${esc(t.label)}${badge}</button>`;
    }).join('');
    $$('.tab', bar).forEach(t => t.addEventListener('click', () => go(t.dataset.screen)));
  }

  /* ============================ FORM: care grid ============================ */
  function renderCareGrid() {
    const grid = $('#careGrid');
    grid.innerHTML = Object.keys(ROLES).map((key, i) => {
      const r = ROLES[key];
      return `<div class="care-opt">
        <input type="radio" name="tipoCuidado" id="care-${key}" value="${key}" ${i === 0 ? 'checked' : ''} />
        <label for="care-${key}">
          <span class="care-opt__ico">${r.ico}</span>
          <span class="care-opt__txt"><b>${esc(r.label)}</b><span>${esc(r.desc)}</span></span>
        </label>
      </div>`;
    }).join('');
  }

  /* ============================ BUSCA / MATCH ============================ */
  function matchedPros() {
    const tipo = state.draft.tipoCuidado;
    let list = state.pros.filter(p => p.disponivel);
    let same = list.filter(p => p.role === tipo);
    let base = same.length ? same : list;
    const s = state.sort;
    base = base.slice().sort((a, b) => {
      if (s === 'rate') return b.avaliacao - a.avaliacao || a.distanciaKm - b.distanciaKm;
      if (s === 'price') return a.precoHora - b.precoHora || a.distanciaKm - b.distanciaKm;
      return a.distanciaKm - b.distanciaKm; // dist
    });
    return { list: base, exact: same.length > 0 };
  }

  function proCardHtml(p, b) {
    const est = precoEstimado(p, b);
    const horas = horasDe(b);
    const badges = [];
    if (p.avaliacao >= 4.9) badges.push('<span class="badge badge--top">★ Destaque</span>');
    if (p.coren) badges.push(`<span class="badge badge--coren">✓ ${esc(p.coren.split(' ')[0])}</span>`);
    if (p.verif.antecedentes) badges.push('<span class="badge badge--verify">✓ Verificado</span>');
    const tags = p.especialidades.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="pro-card" data-pro="${p.id}">
      <div class="pro-card__top">
        ${avatar(p)}
        <div class="pro-card__main">
          <div class="pro-card__name"><b>${esc(p.nome)}</b>${badges.join('')}</div>
          <div class="pro-card__role">${esc(ROLES[p.role].label)}</div>
          <div class="pro-card__meta">
            ${ratingHtml(p)}<span class="dot">•</span>
            <span>${p.distanciaKm.toFixed(1)} km</span><span class="dot">•</span>
            <span class="eta-chip">⚡ ~${p.etaMin} min</span>
          </div>
        </div>
      </div>
      <div class="chips-row">${tags}</div>
      <div class="pro-card__foot">
        <div class="price"><b>${brl(est)}</b><span>estimado · ${horas}h × ${brl(p.precoHora)}</span></div>
        <button class="btn btn--primary" data-choose="${p.id}">Solicitar →</button>
      </div>
    </div>`;
  }

  function renderMatch() {
    const b = state.draft;
    const { list, exact } = matchedPros();
    $('#searchSummary').innerHTML =
      `<b>${esc(ROLES[b.tipoCuidado].label)}</b> · ${esc(b.bairro)}, ${esc(b.cidade)}<br>` +
      `${quandoLabel(b)} · ${duracaoLabel(b)} · ${list.length} profissiona${list.length === 1 ? 'l' : 'is'} ${exact ? 'compatíve' + (list.length === 1 ? 'l' : 'is') : 'disponíveis'}`;

    const wrap = $('#matchList');
    if (!list.length) {
      wrap.innerHTML = emptyState('🔍', 'Nenhum profissional disponível', 'Tente outro tipo de cuidado ou horário.');
      return;
    }
    let head = '';
    if (!exact) head = `<div class="obs-line">Ainda não temos ${esc(ROLES[b.tipoCuidado].label).toLowerCase()} livre agora. Veja outros profissionais disponíveis perto de você:</div>`;
    wrap.innerHTML = head + list.map(p => proCardHtml(p, b)).join('');

    $$('[data-choose]', wrap).forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); openConfirm(btn.dataset.choose); }));
    $$('.pro-card', wrap).forEach(card =>
      card.addEventListener('click', () => openProDetail(card.dataset.pro)));
  }

  /* ============================ DETALHE DO PROFISSIONAL ============================ */
  function openProDetail(id) {
    const p = state.pros.find(x => x.id === id);
    const b = state.draft;
    const est = b ? precoEstimado(p, b) : null;
    const verifItems = [];
    if (p.verif.identidade) verifItems.push('Identidade conferida');
    if (p.verif.antecedentes) verifItems.push('Antecedentes verificados');
    if (p.coren) verifItems.push('Registro ' + p.coren + ' validado');
    Sheet.open(`
      <div class="sheet-hero">
        ${avatar(p, 'avatar--lg')}
        <div>
          <h3>${esc(p.nome)}</h3>
          <div class="pro-card__role">${esc(ROLES[p.role].label)}</div>
          <div class="pro-card__meta" style="margin-top:6px">${ratingHtml(p)}<span class="dot">•</span><span>${p.distanciaKm.toFixed(1)} km</span></div>
        </div>
      </div>
      <p class="bio">${esc(p.bio)}</p>
      <div class="sheet-section">
        <h4>Especialidades</h4>
        <div class="chips-row">${p.especialidades.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="sheet-section">
        <h4>Confiança</h4>
        <ul class="checklist">${verifItems.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
      </div>
      <div class="sheet-section">
        <div class="kv"><span>Preço por hora</span><b class="mono">${brl(p.precoHora)}</b></div>
        <div class="kv"><span>Experiência</span><b>${p.experienciaAnos} anos</b></div>
        <div class="kv"><span>Tempo até você</span><b>~${p.etaMin} min</b></div>
      </div>
      ${b ? `<button class="btn btn--primary btn--lg" id="detailChoose">Solicitar · ${brl(est)} estimado</button>`
          : `<button class="btn btn--ghost btn--lg" data-close>Fechar</button>`}
    `);
    if (b) $('#detailChoose').addEventListener('click', () => openConfirm(id));
  }

  /* ============================ CONFIRMAÇÃO DO PEDIDO ============================ */
  function openConfirm(id) {
    const p = state.pros.find(x => x.id === id);
    const b = state.draft;
    const horas = horasDe(b);
    const est = precoEstimado(p, b);
    Sheet.open(`
      <h3>Confirmar solicitação</h3>
      <div class="sheet-hero" style="margin-top:14px">
        ${avatar(p, 'avatar--lg')}
        <div><b style="font-family:var(--font-title);font-size:1.05rem">${esc(p.nome)}</b>
        <div class="pro-card__role">${esc(ROLES[p.role].label)}</div>
        <div class="pro-card__meta" style="margin-top:5px">${ratingHtml(p)}</div></div>
      </div>
      <div class="sheet-section">
        <div class="kv"><span>Paciente</span><b>${esc(b.pacienteNome || '—')}${b.pacienteIdade ? ', ' + esc(b.pacienteIdade) + ' anos' : ''}</b></div>
        ${b.condicao ? `<div class="kv"><span>Condição</span><b>${esc(b.condicao)}</b></div>` : ''}
        <div class="kv"><span>Local</span><b>${esc(b.bairro)}, ${esc(b.cidade)}</b></div>
        <div class="kv"><span>Quando</span><b>${quandoLabel(b)}</b></div>
        <div class="kv"><span>Duração</span><b>${duracaoLabel(b)}</b></div>
        <div class="kv"><span>Valor por hora</span><b class="mono">${brl(p.precoHora)}</b></div>
      </div>
      <div class="total-row"><span>Estimativa do atendimento</span><b>${brl(est)}</b></div>
      <p class="fineprint" style="margin-top:0">Estimativa (${horas}h × ${brl(p.precoHora)}). O valor final é combinado com o profissional conforme o atendimento.</p>
      <button class="btn btn--coral btn--lg" id="confirmBooking">Confirmar solicitação</button>
      <button class="btn btn--ghost btn--block" data-close style="margin-top:9px">Voltar</button>
    `);
    $('#confirmBooking').addEventListener('click', () => createBooking(p));
  }

  function createBooking(p) {
    const b = state.draft;
    const booking = {
      id: uid(),
      criadoEm: new Date().toISOString(),
      status: 'pendente',
      tipoCuidado: b.tipoCuidado,
      pacienteNome: b.pacienteNome, pacienteIdade: b.pacienteIdade, condicao: b.condicao,
      bairro: b.bairro, cidade: b.cidade,
      quando: b.quando, data: b.data, hora: b.hora,
      duracao: b.duracao, horas: b.horas,
      obs: b.obs,
      profId: p.id,
      profNome: p.nome, profRole: p.role, precoHora: p.precoHora,
      precoEstimado: precoEstimado(p, b),
      avaliado: false
    };
    state.bookings.unshift(booking);
    Store.saveBookings(state.bookings);
    Sheet.close();
    toast('Solicitação enviada para ' + p.nome.split(' ')[0] + '! 🎉', 'ok');
    go('agendamentos');
    renderTabbar();
  }

  /* ============================ BOOKINGS (família) ============================ */
  function timeline(status) {
    if (status === 'cancelado') return '<div class="obs-line">Este atendimento foi cancelado.</div>';
    const idx = FLOW.indexOf(status);
    return `<div class="timeline">${FLOW.map((s, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      return `<div class="timeline__step ${cls}"><span class="timeline__dot"></span><span class="timeline__label">${FLOW_LABEL[s]}</span></div>`;
    }).join('')}</div>`;
  }

  function proOf(id) { return state.pros.find(p => p.id === id) || { id, nome: 'Profissional', role: 'cuidador' }; }

  function bookingCard(b, side) {
    const p = proOf(b.profId);
    const canRate = side === 'familia' && b.status === 'concluido' && !b.avaliado;
    let actions = '';
    if (side === 'familia') {
      if (b.status === 'pendente') actions = `<div class="action-row"><button class="btn btn--danger-ghost btn--block" data-cancel="${b.id}">Cancelar solicitação</button></div>`;
      if (canRate) actions = `<div class="action-row"><button class="btn btn--primary btn--block" data-rate="${b.id}">★ Avaliar atendimento</button></div>`;
      if (b.status === 'concluido' && b.avaliado) actions = `<div class="obs-line">Você avaliou: ${stars(b.notaCliente)} <b>${b.notaCliente.toFixed(1)}</b>${b.comentario ? ' — “' + esc(b.comentario) + '”' : ''}</div>`;
    }
    return `<div class="booking">
      <div class="booking__head">
        ${avatar(p)}
        <div class="booking__main">
          <div class="booking__titlerow">
            <div class="booking__title">${esc(ROLES[b.tipoCuidado].label)}</div>
            <span class="status status--${b.status}">${STATUS[b.status]}</span>
          </div>
          <div class="booking__sub">com ${esc(b.profNome)} · ${esc(b.bairro)}</div>
          <div class="booking__when">🗓️ ${quandoLabel(b)} · ${duracaoLabel(b)} · <b class="mono">${brl(b.precoEstimado)}</b></div>
        </div>
      </div>
      <div class="booking__body">
        ${timeline(b.status)}
        ${b.obs ? `<div class="obs-line"><b>Obs.:</b> ${esc(b.obs)}</div>` : ''}
        ${actions}
      </div>
    </div>`;
  }

  function renderBookings() {
    const wrap = $('#bookingList');
    if (!state.bookings.length) {
      wrap.innerHTML = emptyState('📭', 'Nenhum atendimento ainda', 'Faça sua primeira solicitação na aba Solicitar.', 'Solicitar cuidado', () => go('solicitar'));
      bindEmptyBtn(wrap);
      return;
    }
    wrap.innerHTML = state.bookings.map(b => bookingCard(b, 'familia')).join('');
    $$('[data-cancel]', wrap).forEach(btn => btn.addEventListener('click', () => cancelBooking(btn.dataset.cancel)));
    $$('[data-rate]', wrap).forEach(btn => btn.addEventListener('click', () => openRate(btn.dataset.rate)));
  }

  function cancelBooking(id) {
    const b = state.bookings.find(x => x.id === id);
    if (!b) return;
    b.status = 'cancelado';
    Store.saveBookings(state.bookings);
    renderBookings(); renderTabbar();
    toast('Solicitação cancelada.');
  }

  /* ============================ AVALIAÇÃO ============================ */
  function openRate(id) {
    const b = state.bookings.find(x => x.id === id);
    if (!b) return;
    let nota = 5;
    Sheet.open(`
      <h3>Como foi o atendimento?</h3>
      <p class="bio" style="margin:8px 0 4px">${esc(b.profNome)} · ${esc(ROLES[b.tipoCuidado].label)}</p>
      <div class="star-input" id="starInput">
        ${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="on">★</button>`).join('')}
      </div>
      <label class="field"><span>Deixe um comentário <small>(opcional)</small></span>
        <textarea id="rateComment" placeholder="Ex.: pontual, atenciosa, recomendo…"></textarea></label>
      <button class="btn btn--primary btn--lg" id="submitRate">Enviar avaliação</button>
    `);
    const paint = () => $$('#starInput button').forEach(btn => btn.classList.toggle('on', +btn.dataset.n <= nota));
    $$('#starInput button').forEach(btn => btn.addEventListener('click', () => { nota = +btn.dataset.n; paint(); }));
    $('#submitRate').addEventListener('click', () => {
      b.avaliado = true; b.notaCliente = nota; b.comentario = $('#rateComment').value.trim();
      // atualiza a média do profissional (demo)
      const p = state.pros.find(x => x.id === b.profId);
      if (p) { p.avaliacao = ((p.avaliacao * p.numAval) + nota) / (p.numAval + 1); p.numAval += 1; Store.savePros(state.pros); }
      Store.saveBookings(state.bookings);
      Sheet.close(); renderBookings();
      toast('Obrigado pela avaliação! ⭐', 'ok');
    });
  }

  /* ============================ LADO PROFISSIONAL ============================ */
  function proBookingCard(b) {
    let actions = '';
    if (b.status === 'pendente')
      actions = `<div class="action-row">
        <button class="btn btn--ghost" data-decline="${b.id}">Recusar</button>
        <button class="btn btn--primary" data-accept="${b.id}">Aceitar atendimento</button></div>`;
    else if (b.status === 'confirmado')
      actions = `<div class="action-row"><button class="btn btn--coral btn--block" data-start="${b.id}">Iniciar atendimento</button></div>`;
    else if (b.status === 'em_andamento')
      actions = `<div class="action-row"><button class="btn btn--primary btn--block" data-finish="${b.id}">Concluir atendimento</button></div>`;
    else if (b.status === 'concluido')
      actions = b.avaliado ? `<div class="obs-line">Avaliação recebida: ${stars(b.notaCliente)} <b>${b.notaCliente.toFixed(1)}</b></div>` : `<div class="obs-line">Atendimento concluído. Aguardando avaliação da família.</div>`;

    return `<div class="booking">
      <div class="booking__head">
        <div class="avatar" style="background:${avatarColor(b.id)}">${esc(initials(b.pacienteNome || 'Paciente'))}</div>
        <div class="booking__main">
          <div class="booking__titlerow">
            <div class="booking__title">${esc(b.pacienteNome || 'Paciente')}${b.pacienteIdade ? ', ' + esc(b.pacienteIdade) : ''}</div>
            <span class="status status--${b.status}">${STATUS[b.status]}</span>
          </div>
          <div class="booking__sub">${esc(ROLES[b.tipoCuidado].label)}${b.condicao ? ' · ' + esc(b.condicao) : ''}</div>
          <div class="booking__when">📍 ${esc(b.bairro)}, ${esc(b.cidade)} · ${quandoLabel(b)}</div>
        </div>
      </div>
      <div class="booking__body">
        <div class="pro-card__foot" style="margin-top:0;border-top:none;padding-top:0">
          <div class="price"><b>${brl(b.precoEstimado)}</b><span>${duracaoLabel(b)} · ${brl(b.precoHora)}/h</span></div>
        </div>
        ${b.obs ? `<div class="obs-line"><b>Obs. da família:</b> ${esc(b.obs)}</div>` : ''}
        ${actions}
      </div>
    </div>`;
  }

  function renderProInbox() {
    const wrap = $('#proInbox');
    const list = state.bookings.filter(b => b.status === 'pendente');
    if (!list.length) {
      wrap.innerHTML = emptyState('🔔', 'Nenhuma solicitação no momento', 'Quando uma família solicitar um atendimento compatível, ele aparece aqui. Experimente criar uma solicitação no modo “Preciso de cuidado”.');
      return;
    }
    wrap.innerHTML = list.map(proBookingCard).join('');
    bindProActions(wrap);
  }

  function renderProAgenda() {
    const wrap = $('#proAgenda');
    const list = state.bookings.filter(b => ['confirmado', 'em_andamento', 'concluido'].includes(b.status));
    if (!list.length) {
      wrap.innerHTML = emptyState('📅', 'Sua agenda está livre', 'Aceite solicitações para preencher sua agenda.');
      return;
    }
    wrap.innerHTML = list.map(proBookingCard).join('');
    bindProActions(wrap);
  }

  function bindProActions(wrap) {
    const set = (sel, fn) => $$(sel, wrap).forEach(btn => btn.addEventListener('click', () => fn(btn)));
    set('[data-accept]', b => advance(b.dataset.accept, 'confirmado', 'Atendimento aceito! Ele já está na sua agenda.', 'ok'));
    set('[data-decline]', b => advance(b.dataset.decline, 'cancelado', 'Solicitação recusada.'));
    set('[data-start]', b => advance(b.dataset.start, 'em_andamento', 'Atendimento iniciado.', 'coral'));
    set('[data-finish]', b => advance(b.dataset.finish, 'concluido', 'Atendimento concluído! 👏', 'ok'));
  }

  function advance(id, status, msg, kind) {
    const b = state.bookings.find(x => x.id === id);
    if (!b) return;
    b.status = status;
    Store.saveBookings(state.bookings);
    renderProInbox(); renderProAgenda(); renderTabbar();
    toast(msg, kind);
  }

  /* ============================ PERFIL DO PROFISSIONAL ============================ */
  function defaultProMe() {
    return { nome: 'Você', role: 'cuidador', precoHora: 35, experienciaAnos: 3, coren: '',
      especialidades: 'Companhia, Higiene, Mobilidade', bio: 'Cuidador(a) dedicado(a) ao bem-estar dos idosos.', disponivel: true };
  }
  function fillProForm() {
    const me = Store.getProMe() || defaultProMe();
    const f = $('#proForm');
    f.nome.value = me.nome; f.role.value = me.role; f.precoHora.value = me.precoHora;
    f.experienciaAnos.value = me.experienciaAnos; f.coren.value = me.coren || '';
    f.especialidades.value = me.especialidades; f.bio.value = me.bio; f.disponivel.checked = !!me.disponivel;
    updateProPreview();
    toggleCorenField();
  }
  function toggleCorenField() {
    const role = $('#proForm').role.value;
    const reg = ROLES[role].registro;
    const field = $('#corenField');
    field.style.display = reg ? '' : 'none';
    if (reg) $('span', field).innerHTML = `Registro profissional (${reg}) <small>(obrigatório para ${ROLES[role].label.toLowerCase()})</small>`;
  }
  function updateProPreview() {
    const f = $('#proForm');
    const p = { id: 'me', nome: f.nome.value || 'Você' };
    $('#proPreview').innerHTML = `${avatar(p, 'avatar--lg')}
      <div class="pro-preview__info"><b>${esc(f.nome.value || 'Seu nome')}</b>
      <div>${esc(ROLES[f.role.value].label)} · ${brl(+f.precoHora.value || 0)}/h</div></div>`;
  }

  /* ============================ EMPTY STATE ============================ */
  function emptyState(ico, title, msg, btnLabel, btnFn) {
    emptyState._fn = btnFn || null;
    return `<div class="empty"><div class="empty__ico">${ico}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p>${btnLabel ? `<button class="btn btn--primary" id="emptyBtn">${esc(btnLabel)}</button>` : ''}</div>`;
  }
  function bindEmptyBtn(wrap) {
    const b = $('#emptyBtn', wrap);
    if (b && emptyState._fn) b.addEventListener('click', emptyState._fn);
  }

  /* ============================ SUBMIT DA SOLICITAÇÃO ============================ */
  function onRequestSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const draft = {
      tipoCuidado: f.tipoCuidado.value,
      pacienteNome: f.pacienteNome.value.trim(),
      pacienteIdade: f.pacienteIdade.value.trim(),
      condicao: f.condicao.value.trim(),
      bairro: f.bairro.value.trim() || 'Seu bairro',
      cidade: f.cidade.value.trim() || 'Sua cidade',
      quando: f.quando.value,
      data: f.data.value, hora: f.hora.value,
      duracao: f.duracao.value,
      horas: +f.horas.value || 4,
      obs: f.obs.value.trim()
    };
    state.draft = draft;
    state.sort = 'dist';
    $$('#sortChips input').forEach(i => (i.checked = i.value === 'dist'));
    renderMatch();
    go('buscar');
  }

  /* ============================ EVENTOS GLOBAIS ============================ */
  function wire() {
    renderCareGrid();
    renderTabbar();

    // troca de papel
    $$('.role-switch__btn').forEach(b => b.addEventListener('click', () => setRole(b.dataset.role)));
    $('#brandHome').addEventListener('click', () => go(TABS[state.role][0].screen));

    // form solicitar
    $('#requestForm').addEventListener('submit', onRequestSubmit);
    $('#whenChips').addEventListener('change', e => {
      $('#scheduleFields').hidden = e.target.value !== 'agendar';
    });
    $('#durChips').addEventListener('change', e => {
      $('#horasField').style.display = e.target.value === 'hora' ? '' : 'none';
    });

    // voltar da busca
    $('#backToForm').addEventListener('click', () => go('solicitar'));

    // ordenação
    $('#sortChips').addEventListener('change', e => { state.sort = e.target.value; renderMatch(); });

    // sheet: fechar
    $('#sheetRoot').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.classList.contains('sheet-backdrop')) Sheet.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheetRoot').hidden) Sheet.close(); });

    // perfil pro
    const pf = $('#proForm');
    pf.addEventListener('input', updateProPreview);
    pf.role.addEventListener('change', () => { toggleCorenField(); updateProPreview(); });
    pf.addEventListener('submit', e => {
      e.preventDefault();
      const me = {
        nome: pf.nome.value.trim() || 'Você', role: pf.role.value,
        precoHora: +pf.precoHora.value || 0, experienciaAnos: +pf.experienciaAnos.value || 0,
        coren: pf.coren.value.trim(), especialidades: pf.especialidades.value.trim(),
        bio: pf.bio.value.trim(), disponivel: pf.disponivel.checked
      };
      Store.saveProMe(me);
      toast('Perfil salvo! ✅', 'ok');
    });

    // estado inicial
    setRole(state.role);
    go(TABS[state.role][0].screen);
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
