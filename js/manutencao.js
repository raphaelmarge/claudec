/* ============================================================
   TORQUE FITNESS — Manutenções da academia
   Chamados (ordens de serviço), preventivas recorrentes e
   cadastro de aparelhos/locais. Tudo salvo no navegador
   (localStorage), com exportação/importação de backup em JSON.
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'tf_manutencao_v1';

  var AREAS = [
    'Equipamentos', 'Predial', 'Elétrica', 'Hidráulica',
    'Climatização', 'Limpeza', 'Segurança', 'Outros'
  ];
  var AREA_ICO = {
    'Equipamentos': '🏋️', 'Predial': '🏢', 'Elétrica': '⚡', 'Hidráulica': '🚿',
    'Climatização': '❄️', 'Limpeza': '🧹', 'Segurança': '🛡️', 'Outros': '📦'
  };
  var STATUS = {
    aberta:     'Aberta',
    andamento:  'Em andamento',
    aguardando: 'Aguardando peça/serviço',
    concluida:  'Concluída',
    cancelada:  'Cancelada'
  };
  var PRIORIDADE = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  var PRIO_ORDEM = { urgente: 0, alta: 1, media: 2, baixa: 3 };

  /* ========================= helpers ========================= */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function diffDays(fromISO, toISO) {
    var a = fromISO.split('-'), b = toISO.split('-');
    var d1 = new Date(+a[0], +a[1] - 1, +a[2]);
    var d2 = new Date(+b[0], +b[1] - 1, +b[2]);
    return Math.round((d2 - d1) / 86400000);
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function fmtMoney(v) {
    v = Number(v) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ========================= estado ========================= */
  var state = load();
  var view = 'painel';
  var fStatus = 'ativas';   // filtro de chamados: ativas | todas | <status>
  var fArea = '';           // filtro por área
  var fBusca = '';
  var fAtivoArea = '';      // filtro da aba de ativos

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.os) && Array.isArray(s.ativos) && Array.isArray(s.planos)) return s;
      }
    } catch (e) { /* dados corrompidos → recomeça com exemplo */ }
    return seed();
  }
  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  /* Dados de exemplo na primeira abertura, para ver o app funcionando */
  function seed() {
    var hoje = todayISO();
    var s = { ativos: [], os: [], planos: [], seqOS: 0, exemplo: true };

    function ativo(nome, categoria, local, marca) {
      var a = { id: uid(), nome: nome, categoria: categoria, local: local, marca: marca || '', serie: '', compra: '', notas: '' };
      s.ativos.push(a); return a;
    }
    var esteira = ativo('Esteira 03', 'Equipamentos', 'Área de cardio', 'Torque Cardio');
    var bike    = ativo('Bike Spinning 07', 'Equipamentos', 'Sala de spinning', 'Torque Cardio');
    ativo('Leg Press 45°', 'Equipamentos', 'Área de musculação', 'Torque K5');
    var arCond  = ativo('Ar-condicionado — Salão principal', 'Climatização', 'Salão principal', '');
    ativo('Vestiário masculino', 'Predial', 'Vestiários', '');

    function os(t) {
      s.seqOS += 1;
      t.id = uid(); t.num = s.seqOS;
      s.os.push(t); return t;
    }
    os({ titulo: 'Esteira 03 desarmando durante o uso', ativoId: esteira.id, area: 'Equipamentos',
      prioridade: 'urgente', status: 'aberta', responsavel: '', custo: 0,
      criada: addDays(hoje, -2), prazo: hoje, concluida: '', notas: 'Aluno relatou que a esteira desliga sozinha depois de ~10 min.', origemPlanoId: '' });
    os({ titulo: 'Trocar lâmpada queimada do vestiário masculino', ativoId: s.ativos[4].id, area: 'Elétrica',
      prioridade: 'media', status: 'andamento', responsavel: 'Carlos (zelador)', custo: 25,
      criada: addDays(hoje, -4), prazo: addDays(hoje, 2), concluida: '', notas: '', origemPlanoId: '' });
    os({ titulo: 'Infiltração na parede do salão principal', ativoId: '', area: 'Predial',
      prioridade: 'alta', status: 'aguardando', responsavel: 'Empreiteira Silva', custo: 850,
      criada: addDays(hoje, -10), prazo: addDays(hoje, 7), concluida: '', notas: 'Aguardando orçamento aprovado; material chega semana que vem.', origemPlanoId: '' });
    os({ titulo: 'Ajustar banco da Bike Spinning 07', ativoId: bike.id, area: 'Equipamentos',
      prioridade: 'baixa', status: 'concluida', responsavel: 'Equipe interna', custo: 0,
      criada: addDays(hoje, -6), prazo: '', concluida: addDays(hoje, -5), notas: '', origemPlanoId: '' });

    s.planos.push({ id: uid(), titulo: 'Lubrificar lona das esteiras', ativoId: esteira.id, area: 'Equipamentos',
      freqDias: 30, proxima: addDays(hoje, -3), ultima: addDays(hoje, -33), responsavel: 'Equipe interna',
      notas: 'Usar silicone próprio para esteira.' });
    s.planos.push({ id: uid(), titulo: 'Limpar filtros do ar-condicionado', ativoId: arCond.id, area: 'Climatização',
      freqDias: 45, proxima: addDays(hoje, 5), ultima: addDays(hoje, -40), responsavel: '', notas: '' });
    s.planos.push({ id: uid(), titulo: 'Apertar parafusos e cabos da musculação (checklist geral)', ativoId: '', area: 'Equipamentos',
      freqDias: 60, proxima: addDays(hoje, 20), ultima: '', responsavel: '', notas: '' });

    localStorage.setItem(LS_KEY, JSON.stringify(s));
    return s;
  }

  /* ========================= consultas ========================= */
  function ativoById(id) {
    for (var i = 0; i < state.ativos.length; i++) if (state.ativos[i].id === id) return state.ativos[i];
    return null;
  }
  function osById(id) {
    for (var i = 0; i < state.os.length; i++) if (state.os[i].id === id) return state.os[i];
    return null;
  }
  function planoById(id) {
    for (var i = 0; i < state.planos.length; i++) if (state.planos[i].id === id) return state.planos[i];
    return null;
  }
  function osAtiva(o) { return o.status !== 'concluida' && o.status !== 'cancelada'; }
  function osAtrasada(o) { return osAtiva(o) && o.prazo && o.prazo < todayISO(); }
  function planoVencido(p) { return p.proxima && p.proxima < todayISO(); }
  function planoVenceEm(p) { return p.proxima ? diffDays(todayISO(), p.proxima) : null; }

  /* ========================= render raiz ========================= */
  function render() {
    $$('.view').forEach(function (v) { v.hidden = true; });
    $$('.tab').forEach(function (t) { t.classList.toggle('is-active', t.dataset.tab === view); });
    var el = $('#view-' + view);
    el.hidden = false;
    if (view === 'painel') renderPainel(el);
    else if (view === 'chamados') renderChamados(el);
    else if (view === 'planos') renderPlanos(el);
    else renderAtivos(el);
  }

  /* ========================= PAINEL ========================= */
  function renderPainel(el) {
    var hoje = todayISO();
    var mes = hoje.slice(0, 7);
    var abertas = 0, atrasadas = 0, custoMes = 0, concluidasMes = 0;
    state.os.forEach(function (o) {
      if (osAtiva(o)) abertas++;
      if (osAtrasada(o)) atrasadas++;
      if (o.status === 'concluida' && o.concluida && o.concluida.slice(0, 7) === mes) {
        concluidasMes++; custoMes += Number(o.custo) || 0;
      }
    });
    var prevVencidas = state.planos.filter(planoVencido).length;

    var urgentes = state.os.filter(function (o) {
      return osAtiva(o) && (o.prioridade === 'urgente' || osAtrasada(o));
    }).sort(function (a, b) { return PRIO_ORDEM[a.prioridade] - PRIO_ORDEM[b.prioridade]; });

    var prevAtencao = state.planos.filter(function (p) {
      var d = planoVenceEm(p);
      return d !== null && d <= 7;
    }).sort(function (a, b) { return (a.proxima || '').localeCompare(b.proxima || ''); });

    var h = '';
    h += '<div class="view-head"><div><h1>Painel</h1>' +
         '<p>' + fmtDate(hoje) + ' · visão geral da manutenção</p></div>' +
         '<button type="button" class="addbtn" data-act="nova-os">+ Chamado</button></div>';

    h += '<div class="stats">' +
      '<button type="button" class="stat stat--violet" data-goto="chamados" data-fstatus="ativas"><b>' + abertas + '</b><span>Chamados em aberto</span></button>' +
      '<button type="button" class="stat ' + (atrasadas ? 'stat--bad' : 'stat--ok') + '" data-goto="chamados" data-fstatus="atrasadas"><b>' + atrasadas + '</b><span>Chamados atrasados</span></button>' +
      '<button type="button" class="stat ' + (prevVencidas ? 'stat--warn' : 'stat--ok') + '" data-goto="planos"><b>' + prevVencidas + '</b><span>Preventivas vencidas</span></button>' +
      '<div class="stat"><b class="mono">' + fmtMoney(custoMes) + '</b><span>Gasto no mês (' + concluidasMes + ' concluída' + (concluidasMes === 1 ? '' : 's') + ')</span></div>' +
      '</div>';

    h += '<div class="section-title">⚠ Atenção agora</div>';
    if (!urgentes.length && !prevAtencao.length) {
      h += '<div class="empty">Tudo em dia. Nenhum chamado urgente ou preventiva vencendo. 💪</div>';
    } else {
      h += '<div class="list">';
      urgentes.slice(0, 6).forEach(function (o) { h += osItemHTML(o, true); });
      prevAtencao.slice(0, 6).forEach(function (p) { h += planoItemHTML(p, true); });
      h += '</div>';
    }

    el.innerHTML = h;
    wireListEvents(el);
  }

  /* ========================= CHAMADOS ========================= */
  function osItemHTML(o, compact) {
    var at = o.ativoId ? ativoById(o.ativoId) : null;
    var late = osAtrasada(o);
    var cls = 'item';
    if (late) cls += ' item--late';
    if (!osAtiva(o)) cls += ' item--done';

    var meta = '<span class="badge badge--' + o.status + '">' + esc(STATUS[o.status] || o.status) + '</span>' +
               '<span class="badge badge--' + o.prioridade + '">' + esc(PRIORIDADE[o.prioridade] || o.prioridade) + '</span>' +
               '<span class="badge">' + (AREA_ICO[o.area] || '') + ' ' + esc(o.area) + '</span>';
    if (late) meta += '<span class="badge badge--late">Atrasado</span>';

    var sub = [];
    if (at) sub.push(esc(at.nome));
    else if (!o.ativoId && o.area !== 'Equipamentos') sub.push('Academia (geral)');
    if (o.prazo && osAtiva(o)) sub.push('prazo <span class="mono">' + fmtDate(o.prazo) + '</span>');
    if (o.status === 'concluida' && o.concluida) sub.push('concluído em <span class="mono">' + fmtDate(o.concluida) + '</span>');
    if (Number(o.custo)) sub.push('<span class="mono">' + fmtMoney(o.custo) + '</span>');
    if (o.responsavel) sub.push(esc(o.responsavel));

    var quick = '';
    if (!compact && osAtiva(o)) {
      quick = '<div class="quick">' +
        (o.status === 'aberta' ? '<button type="button" class="q-go" data-quick="andamento" data-id="' + o.id + '">▶ Iniciar</button>' : '') +
        '<button type="button" class="q-ok" data-quick="concluida" data-id="' + o.id + '">✓ Concluir</button>' +
        '</div>';
    }

    return '<div class="' + cls + '" data-os="' + o.id + '" role="button" tabindex="0">' +
      '<div class="item__top"><div class="item__title">' + esc(o.titulo) + '</div>' +
      '<span class="item__num">OS-' + String(o.num).padStart(3, '0') + '</span></div>' +
      '<div class="item__meta">' + meta + '</div>' +
      (sub.length ? '<div class="item__sub">' + sub.join(' · ') + '</div>' : '') +
      quick + '</div>';
  }

  function renderChamados(el) {
    var lista = state.os.slice().sort(function (a, b) {
      var aa = osAtiva(a) ? 0 : 1, bb = osAtiva(b) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      if (aa === 0) {
        var la = osAtrasada(a) ? 0 : 1, lb = osAtrasada(b) ? 0 : 1;
        if (la !== lb) return la - lb;
        var pa = PRIO_ORDEM[a.prioridade], pb = PRIO_ORDEM[b.prioridade];
        if (pa !== pb) return pa - pb;
        return (a.prazo || '9999').localeCompare(b.prazo || '9999');
      }
      return (b.concluida || b.criada || '').localeCompare(a.concluida || a.criada || '');
    });

    lista = lista.filter(function (o) {
      if (fStatus === 'ativas' && !osAtiva(o)) return false;
      if (fStatus === 'atrasadas' && !osAtrasada(o)) return false;
      if (fStatus !== 'ativas' && fStatus !== 'todas' && fStatus !== 'atrasadas' && o.status !== fStatus) return false;
      if (fArea && o.area !== fArea) return false;
      if (fBusca) {
        var at = o.ativoId ? ativoById(o.ativoId) : null;
        var alvo = (o.titulo + ' ' + (at ? at.nome : '') + ' ' + (o.responsavel || '') + ' ' + (o.notas || '')).toLowerCase();
        if (alvo.indexOf(fBusca.toLowerCase()) === -1) return false;
      }
      return true;
    });

    var chips = [
      ['ativas', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['aguardando', 'Aguardando'],
      ['concluida', 'Concluídas'], ['todas', 'Todas']
    ];
    var h = '<div class="view-head"><div><h1>Chamados</h1>' +
      '<p>Ordens de serviço: conserto, reparo, obra…</p></div>' +
      '<button type="button" class="addbtn" data-act="nova-os">+ Novo</button></div>';

    h += '<div class="filters">' +
      '<div class="search"><input type="search" id="buscaOS" placeholder="Buscar por título, aparelho, responsável…" value="' + esc(fBusca) + '" /></div>' +
      '<div class="chiprow">' + chips.map(function (c) {
        return '<button type="button" class="chip' + (fStatus === c[0] ? ' is-on' : '') + '" data-fstatus="' + c[0] + '">' + c[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="chiprow"><button type="button" class="chip' + (!fArea ? ' is-on' : '') + '" data-farea="">Todas as áreas</button>' +
      AREAS.map(function (a) {
        return '<button type="button" class="chip' + (fArea === a ? ' is-on' : '') + '" data-farea="' + esc(a) + '">' + AREA_ICO[a] + ' ' + a + '</button>';
      }).join('') + '</div></div>';

    if (!lista.length) h += '<div class="empty">Nenhum chamado aqui. Toque em <b>+ Novo</b> para registrar um problema ou serviço.</div>';
    else h += '<div class="list">' + lista.map(function (o) { return osItemHTML(o, false); }).join('') + '</div>';

    el.innerHTML = h;
    wireListEvents(el);

    var busca = $('#buscaOS', el);
    if (busca) busca.addEventListener('input', function () {
      fBusca = busca.value;
      // re-renderiza só a lista mantendo o foco no campo
      var pos = busca.selectionStart;
      renderChamados(el);
      var b2 = $('#buscaOS', el);
      b2.focus(); b2.setSelectionRange(pos, pos);
    });
  }

  /* ========================= PREVENTIVAS ========================= */
  function planoItemHTML(p, compact) {
    var at = p.ativoId ? ativoById(p.ativoId) : null;
    var dias = planoVenceEm(p);
    var cls = 'item', badge;
    if (dias === null) badge = '<span class="badge">sem data</span>';
    else if (dias < 0) { cls += ' item--late'; badge = '<span class="badge badge--late">Vencida há ' + (-dias) + ' dia' + (dias === -1 ? '' : 's') + '</span>'; }
    else if (dias === 0) { cls += ' item--soon'; badge = '<span class="badge badge--soon">Vence hoje</span>'; }
    else if (dias <= 7) { cls += ' item--soon'; badge = '<span class="badge badge--soon">Vence em ' + dias + ' dia' + (dias === 1 ? '' : 's') + '</span>'; }
    else badge = '<span class="badge badge--okday">Em dia</span>';

    var sub = [];
    if (at) sub.push(esc(at.nome));
    sub.push('a cada <span class="mono">' + p.freqDias + '</span> dias');
    if (p.proxima) sub.push('próxima <span class="mono">' + fmtDate(p.proxima) + '</span>');
    if (p.ultima) sub.push('última <span class="mono">' + fmtDate(p.ultima) + '</span>');

    var quick = compact ? '' :
      '<div class="quick"><button type="button" class="q-ok" data-exec="' + p.id + '">✓ Feita hoje</button></div>';

    return '<div class="' + cls + '" data-plano="' + p.id + '" role="button" tabindex="0">' +
      '<div class="item__top"><div class="item__title">🔁 ' + esc(p.titulo) + '</div></div>' +
      '<div class="item__meta">' + badge +
      '<span class="badge">' + (AREA_ICO[p.area] || '') + ' ' + esc(p.area) + '</span></div>' +
      '<div class="item__sub">' + sub.join(' · ') + '</div>' + quick + '</div>';
  }

  function renderPlanos(el) {
    var lista = state.planos.slice().sort(function (a, b) {
      return (a.proxima || '9999').localeCompare(b.proxima || '9999');
    });
    var h = '<div class="view-head"><div><h1>Preventivas</h1>' +
      '<p>Rotinas que se repetem: lubrificar, limpar filtro, revisar…</p></div>' +
      '<button type="button" class="addbtn" data-act="novo-plano">+ Nova</button></div>';

    if (!lista.length) h += '<div class="empty">Nenhuma preventiva cadastrada.<br/>Ex.: “Lubrificar esteiras a cada 30 dias”.</div>';
    else h += '<div class="list">' + lista.map(function (p) { return planoItemHTML(p, false); }).join('') + '</div>';

    el.innerHTML = h;
    wireListEvents(el);
  }

  /* ========================= ATIVOS ========================= */
  function renderAtivos(el) {
    var lista = state.ativos.slice().sort(function (a, b) {
      if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
      return a.nome.localeCompare(b.nome);
    });
    if (fAtivoArea) lista = lista.filter(function (a) { return a.categoria === fAtivoArea; });

    var h = '<div class="view-head"><div><h1>Ativos</h1>' +
      '<p>Aparelhos, instalações e locais da academia</p></div>' +
      '<button type="button" class="addbtn" data-act="novo-ativo">+ Novo</button></div>';

    h += '<div class="filters"><div class="chiprow">' +
      '<button type="button" class="chip' + (!fAtivoArea ? ' is-on' : '') + '" data-fativoarea="">Todos</button>' +
      AREAS.map(function (a) {
        return '<button type="button" class="chip' + (fAtivoArea === a ? ' is-on' : '') + '" data-fativoarea="' + esc(a) + '">' + AREA_ICO[a] + ' ' + a + '</button>';
      }).join('') + '</div></div>';

    if (!lista.length) h += '<div class="empty">Nenhum ativo cadastrado nesta categoria.</div>';
    else {
      h += '<div class="list">' + lista.map(function (a) {
        var abertos = state.os.filter(function (o) { return o.ativoId === a.id && osAtiva(o); }).length;
        var sub = [];
        if (a.local) sub.push(esc(a.local));
        if (a.marca) sub.push(esc(a.marca));
        return '<div class="item" data-ativo="' + a.id + '" role="button" tabindex="0">' +
          '<div class="item__top"><div class="item__title">' + (AREA_ICO[a.categoria] || '') + ' ' + esc(a.nome) + '</div></div>' +
          '<div class="item__meta"><span class="badge">' + esc(a.categoria) + '</span>' +
          (abertos ? '<span class="badge badge--soon">' + abertos + ' chamado' + (abertos === 1 ? '' : 's') + ' em aberto</span>'
                   : '<span class="badge badge--okday">Sem pendências</span>') + '</div>' +
          (sub.length ? '<div class="item__sub">' + sub.join(' · ') + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }

    el.innerHTML = h;
    wireListEvents(el);
  }

  /* ========================= eventos das listas ========================= */
  function wireListEvents(el) {
    $$('[data-act="nova-os"]', el).forEach(function (b) { b.addEventListener('click', function () { openOSForm(null); }); });
    $$('[data-act="novo-plano"]', el).forEach(function (b) { b.addEventListener('click', function () { openPlanoForm(null); }); });
    $$('[data-act="novo-ativo"]', el).forEach(function (b) { b.addEventListener('click', function () { openAtivoForm(null); }); });

    $$('[data-goto]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.fstatus) fStatus = b.dataset.fstatus;
        view = b.dataset.goto; render();
      });
    });
    $$('[data-fstatus]', el).forEach(function (b) {
      if (b.dataset.goto !== undefined) return;
      b.addEventListener('click', function () { fStatus = b.dataset.fstatus; renderChamados($('#view-chamados')); });
    });
    $$('[data-farea]', el).forEach(function (b) {
      b.addEventListener('click', function () { fArea = b.dataset.farea; renderChamados($('#view-chamados')); });
    });
    $$('[data-fativoarea]', el).forEach(function (b) {
      b.addEventListener('click', function () { fAtivoArea = b.dataset.fativoarea; renderAtivos($('#view-ativos')); });
    });

    $$('[data-quick]', el).forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var o = osById(b.dataset.id);
        if (!o) return;
        o.status = b.dataset.quick;
        if (o.status === 'concluida') o.concluida = todayISO();
        save(); render();
        toast(o.status === 'concluida' ? 'Chamado concluído ✓' : 'Chamado em andamento');
      });
    });
    $$('[data-exec]', el).forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        execPlano(b.dataset.exec);
      });
    });

    $$('[data-os]', el).forEach(function (it) {
      it.addEventListener('click', function () { openOSForm(it.dataset.os); });
    });
    $$('[data-plano]', el).forEach(function (it) {
      it.addEventListener('click', function () { openPlanoForm(it.dataset.plano); });
    });
    $$('[data-ativo]', el).forEach(function (it) {
      it.addEventListener('click', function () { openAtivoForm(it.dataset.ativo); });
    });
  }

  /* Registrar execução de preventiva: gera OS concluída (histórico) e reagenda */
  function execPlano(id) {
    var p = planoById(id);
    if (!p) return;
    var hoje = todayISO();
    state.seqOS += 1;
    state.os.push({
      id: uid(), num: state.seqOS,
      titulo: p.titulo, ativoId: p.ativoId || '', area: p.area,
      prioridade: 'media', status: 'concluida', responsavel: p.responsavel || '',
      custo: 0, criada: hoje, prazo: '', concluida: hoje,
      notas: 'Execução da preventiva.', origemPlanoId: p.id
    });
    p.ultima = hoje;
    p.proxima = addDays(hoje, Number(p.freqDias) || 30);
    save(); render();
    toast('Preventiva registrada ✓ Próxima: ' + fmtDate(p.proxima));
  }

  /* ========================= MODAL ========================= */
  function openModal(title, bodyHTML) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modalBody').innerHTML = '';
    document.body.style.overflow = '';
  }

  function ativoOptionsHTML(selecionado) {
    var h = '<option value="">— Academia em geral (sem ativo) —</option>';
    state.ativos.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); })
      .forEach(function (a) {
        h += '<option value="' + a.id + '"' + (a.id === selecionado ? ' selected' : '') + '>' + esc(a.nome) + '</option>';
      });
    return h;
  }
  function areaOptionsHTML(sel) {
    return AREAS.map(function (a) {
      return '<option value="' + esc(a) + '"' + (a === sel ? ' selected' : '') + '>' + AREA_ICO[a] + ' ' + a + '</option>';
    }).join('');
  }

  /* ---------- formulário de chamado (OS) ---------- */
  function openOSForm(id) {
    var o = id ? osById(id) : null;
    var hoje = todayISO();
    var h = '<form id="formOS">' +
      '<label class="field"><span>O que precisa ser feito? *</span>' +
      '<input name="titulo" type="text" required placeholder="Ex.: Trocar correia da esteira 03" value="' + esc(o ? o.titulo : '') + '" /></label>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Área</span><select name="area">' + areaOptionsHTML(o ? o.area : 'Equipamentos') + '</select></label>' +
      '<label class="field"><span>Prioridade</span><select name="prioridade">' +
        Object.keys(PRIORIDADE).map(function (k) {
          return '<option value="' + k + '"' + ((o ? o.prioridade : 'media') === k ? ' selected' : '') + '>' + PRIORIDADE[k] + '</option>';
        }).join('') + '</select></label>' +
      '</div>' +

      '<label class="field"><span>Aparelho / local (opcional)</span>' +
      '<select name="ativoId">' + ativoOptionsHTML(o ? o.ativoId : '') + '</select></label>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Status</span><select name="status">' +
        Object.keys(STATUS).map(function (k) {
          return '<option value="' + k + '"' + ((o ? o.status : 'aberta') === k ? ' selected' : '') + '>' + STATUS[k] + '</option>';
        }).join('') + '</select></label>' +
      '<label class="field"><span>Prazo</span><input name="prazo" type="date" value="' + esc(o ? o.prazo : '') + '" /></label>' +
      '</div>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Responsável / prestador</span>' +
      '<input name="responsavel" type="text" placeholder="Ex.: Carlos, Refrigeração ABC…" value="' + esc(o ? o.responsavel : '') + '" /></label>' +
      '<label class="field"><span>Custo (R$)</span>' +
      '<input name="custo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="' + (o && Number(o.custo) ? o.custo : '') + '" /></label>' +
      '</div>' +

      '<label class="field"><span>Observações</span>' +
      '<textarea name="notas" placeholder="Detalhes, orçamento, o que foi feito…">' + esc(o ? o.notas : '') + '</textarea></label>' +

      '<div class="btn-row">' +
      '<button type="submit" class="btn">' + (o ? 'Salvar alterações' : 'Abrir chamado') + '</button>' +
      (o ? '<button type="button" class="btn btn--danger" id="btnExcluirOS">Excluir</button>' : '') +
      '</div></form>';

    openModal(o ? 'Chamado OS-' + String(o.num).padStart(3, '0') : 'Novo chamado', h);

    $('#formOS').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = new FormData(ev.target);
      var novoStatus = f.get('status');
      if (!o) {
        state.seqOS += 1;
        o = { id: uid(), num: state.seqOS, criada: hoje, concluida: '', origemPlanoId: '' };
        state.os.push(o);
      }
      o.titulo = String(f.get('titulo') || '').trim();
      o.area = f.get('area');
      o.prioridade = f.get('prioridade');
      o.ativoId = f.get('ativoId') || '';
      o.prazo = f.get('prazo') || '';
      o.responsavel = String(f.get('responsavel') || '').trim();
      o.custo = Number(f.get('custo')) || 0;
      o.notas = String(f.get('notas') || '').trim();
      if (novoStatus === 'concluida' && o.status !== 'concluida') o.concluida = todayISO();
      if (novoStatus !== 'concluida') o.concluida = '';
      o.status = novoStatus;
      save(); closeModal(); render();
      toast('Chamado salvo ✓');
    });

    var del = $('#btnExcluirOS');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Excluir este chamado? Essa ação não tem volta.')) return;
      state.os = state.os.filter(function (x) { return x.id !== o.id; });
      save(); closeModal(); render();
      toast('Chamado excluído');
    });
  }

  /* ---------- formulário de preventiva ---------- */
  function openPlanoForm(id) {
    var p = id ? planoById(id) : null;
    var h = '<form id="formPlano">' +
      '<label class="field"><span>Rotina *</span>' +
      '<input name="titulo" type="text" required placeholder="Ex.: Lubrificar lona das esteiras" value="' + esc(p ? p.titulo : '') + '" /></label>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Área</span><select name="area">' + areaOptionsHTML(p ? p.area : 'Equipamentos') + '</select></label>' +
      '<label class="field"><span>Repetir a cada (dias) *</span>' +
      '<input name="freqDias" type="number" min="1" step="1" required inputmode="numeric" value="' + (p ? p.freqDias : 30) + '" /></label>' +
      '</div>' +

      '<label class="field"><span>Aparelho / local (opcional)</span>' +
      '<select name="ativoId">' + ativoOptionsHTML(p ? p.ativoId : '') + '</select></label>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Próxima execução *</span>' +
      '<input name="proxima" type="date" required value="' + esc(p ? p.proxima : todayISO()) + '" /></label>' +
      '<label class="field"><span>Responsável</span>' +
      '<input name="responsavel" type="text" value="' + esc(p ? p.responsavel : '') + '" /></label>' +
      '</div>' +

      '<label class="field"><span>Observações</span>' +
      '<textarea name="notas" placeholder="Produto usado, passo a passo…">' + esc(p ? p.notas : '') + '</textarea></label>' +

      '<div class="btn-row">' +
      '<button type="submit" class="btn">' + (p ? 'Salvar alterações' : 'Criar preventiva') + '</button>' +
      (p ? '<button type="button" class="btn btn--ghost" id="btnExecPlano">✓ Feita hoje</button>' : '') +
      (p ? '<button type="button" class="btn btn--danger" id="btnExcluirPlano">Excluir</button>' : '') +
      '</div>' +
      (p ? histPlanoHTML(p) : '') +
      '</form>';

    openModal(p ? 'Preventiva' : 'Nova preventiva', h);

    $('#formPlano').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = new FormData(ev.target);
      if (!p) { p = { id: uid(), ultima: '' }; state.planos.push(p); }
      p.titulo = String(f.get('titulo') || '').trim();
      p.area = f.get('area');
      p.freqDias = Math.max(1, Number(f.get('freqDias')) || 30);
      p.ativoId = f.get('ativoId') || '';
      p.proxima = f.get('proxima') || todayISO();
      p.responsavel = String(f.get('responsavel') || '').trim();
      p.notas = String(f.get('notas') || '').trim();
      save(); closeModal(); render();
      toast('Preventiva salva ✓');
    });

    var ex = $('#btnExecPlano');
    if (ex) ex.addEventListener('click', function () { closeModal(); execPlano(p.id); });

    var del = $('#btnExcluirPlano');
    if (del) del.addEventListener('click', function () {
      if (!confirm('Excluir esta preventiva? O histórico de execuções continua nos chamados.')) return;
      state.planos = state.planos.filter(function (x) { return x.id !== p.id; });
      save(); closeModal(); render();
      toast('Preventiva excluída');
    });
  }

  function histPlanoHTML(p) {
    var execs = state.os.filter(function (o) { return o.origemPlanoId === p.id; })
      .sort(function (a, b) { return (b.concluida || '').localeCompare(a.concluida || ''); });
    if (!execs.length) return '';
    return '<div class="section-title">Histórico de execuções</div><ul class="hist">' +
      execs.slice(0, 10).map(function (o) {
        return '<li><span class="h-date">' + fmtDate(o.concluida) + '</span>' +
          '<span class="h-txt">' + esc(o.responsavel || 'Executada') + '</span></li>';
      }).join('') + '</ul>';
  }

  /* ---------- formulário de ativo ---------- */
  function openAtivoForm(id) {
    var a = id ? ativoById(id) : null;
    var h = '<form id="formAtivo">' +
      '<label class="field"><span>Nome *</span>' +
      '<input name="nome" type="text" required placeholder="Ex.: Esteira 03, Vestiário feminino…" value="' + esc(a ? a.nome : '') + '" /></label>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Categoria</span><select name="categoria">' + areaOptionsHTML(a ? a.categoria : 'Equipamentos') + '</select></label>' +
      '<label class="field"><span>Local</span>' +
      '<input name="local" type="text" placeholder="Ex.: Área de cardio" value="' + esc(a ? a.local : '') + '" /></label>' +
      '</div>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Marca / modelo</span>' +
      '<input name="marca" type="text" value="' + esc(a ? a.marca : '') + '" /></label>' +
      '<label class="field"><span>Nº de série</span>' +
      '<input name="serie" type="text" value="' + esc(a ? a.serie : '') + '" /></label>' +
      '</div>' +

      '<div class="grid-2">' +
      '<label class="field"><span>Data de compra</span>' +
      '<input name="compra" type="date" value="' + esc(a ? a.compra : '') + '" /></label>' +
      '</div>' +

      '<label class="field"><span>Observações</span>' +
      '<textarea name="notas" placeholder="Garantia, fornecedor, manual…">' + esc(a ? a.notas : '') + '</textarea></label>' +

      '<div class="btn-row">' +
      '<button type="submit" class="btn">' + (a ? 'Salvar alterações' : 'Cadastrar ativo') + '</button>' +
      (a ? '<button type="button" class="btn btn--ghost" id="btnOSDoAtivo">+ Chamado para este ativo</button>' : '') +
      (a ? '<button type="button" class="btn btn--danger" id="btnExcluirAtivo">Excluir</button>' : '') +
      '</div>' +
      (a ? histAtivoHTML(a) : '') +
      '</form>';

    openModal(a ? 'Ativo' : 'Novo ativo', h);

    $('#formAtivo').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = new FormData(ev.target);
      if (!a) { a = { id: uid() }; state.ativos.push(a); }
      a.nome = String(f.get('nome') || '').trim();
      a.categoria = f.get('categoria');
      a.local = String(f.get('local') || '').trim();
      a.marca = String(f.get('marca') || '').trim();
      a.serie = String(f.get('serie') || '').trim();
      a.compra = f.get('compra') || '';
      a.notas = String(f.get('notas') || '').trim();
      save(); closeModal(); render();
      toast('Ativo salvo ✓');
    });

    var novaOS = $('#btnOSDoAtivo');
    if (novaOS) novaOS.addEventListener('click', function () {
      closeModal();
      openOSForm(null);
      var sel = $('#formOS select[name="ativoId"]');
      if (sel) sel.value = a.id;
      var selArea = $('#formOS select[name="area"]');
      if (selArea) selArea.value = a.categoria;
    });

    var del = $('#btnExcluirAtivo');
    if (del) del.addEventListener('click', function () {
      var ligados = state.os.filter(function (o) { return o.ativoId === a.id; }).length;
      var msg = 'Excluir este ativo?' + (ligados ? ' Os ' + ligados + ' chamados dele continuam no histórico, sem o vínculo.' : '');
      if (!confirm(msg)) return;
      state.ativos = state.ativos.filter(function (x) { return x.id !== a.id; });
      state.os.forEach(function (o) { if (o.ativoId === a.id) o.ativoId = ''; });
      state.planos.forEach(function (p) { if (p.ativoId === a.id) p.ativoId = ''; });
      save(); closeModal(); render();
      toast('Ativo excluído');
    });
  }

  function histAtivoHTML(a) {
    var lista = state.os.filter(function (o) { return o.ativoId === a.id; })
      .sort(function (x, y) { return (y.concluida || y.criada || '').localeCompare(x.concluida || x.criada || ''); });
    if (!lista.length) return '';
    var custo = lista.reduce(function (s, o) { return s + (Number(o.custo) || 0); }, 0);
    return '<div class="section-title">Histórico deste ativo · total gasto ' + fmtMoney(custo) + '</div><ul class="hist">' +
      lista.slice(0, 12).map(function (o) {
        return '<li><span class="h-date">' + fmtDate(o.concluida || o.criada) + '</span>' +
          '<span class="h-txt">' + esc(o.titulo) + ' <em>(' + esc(STATUS[o.status]) + ')</em></span>' +
          (Number(o.custo) ? '<span class="h-cost">' + fmtMoney(o.custo) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
  }

  /* ========================= BACKUP ========================= */
  function openBackup() {
    var n = state.os.length + ' chamados · ' + state.planos.length + ' preventivas · ' + state.ativos.length + ' ativos';
    var h = '<p style="color:var(--txt-dim);font-size:.9rem;margin:0 0 14px;">' +
      'Os dados ficam salvos <b>neste aparelho</b> (navegador). Exporte um backup de vez em quando ' +
      'e importe-o em outro aparelho para transferir tudo.<br/><br/><span class="mono" style="font-size:.8rem;">' + n + '</span></p>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn" id="btnExport">⬇ Exportar backup (JSON)</button>' +
      '<button type="button" class="btn btn--ghost" id="btnImport">⬆ Importar backup</button>' +
      '</div><div class="btn-row" style="margin-top:10px;">' +
      (state.exemplo ? '<button type="button" class="btn btn--danger" id="btnLimparExemplo">Apagar dados de exemplo e começar do zero</button>' : '') +
      '</div>';
    openModal('Backup e dados', h);

    $('#btnExport').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'manutencoes-academia-' + todayISO() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Backup exportado ✓');
    });
    $('#btnImport').addEventListener('click', function () { $('#importFile').click(); });

    var limpar = $('#btnLimparExemplo');
    if (limpar) limpar.addEventListener('click', function () {
      if (!confirm('Apagar os dados de exemplo? Você começa com o app vazio.')) return;
      state = { ativos: [], os: [], planos: [], seqOS: 0, exemplo: false };
      save(); closeModal(); render();
      toast('Pronto! App zerado para os seus dados.');
    });
  }

  $('#importFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = JSON.parse(reader.result);
        if (!s || !Array.isArray(s.os) || !Array.isArray(s.ativos) || !Array.isArray(s.planos)) throw new Error('formato');
        if (!confirm('Importar backup com ' + s.os.length + ' chamados, ' + s.planos.length +
          ' preventivas e ' + s.ativos.length + ' ativos? Isso substitui os dados atuais deste aparelho.')) return;
        s.exemplo = false;
        state = s; save(); closeModal(); render();
        toast('Backup importado ✓');
      } catch (e) {
        alert('Arquivo inválido. Selecione um backup exportado por este app.');
      }
    };
    reader.readAsText(file);
  });

  /* ========================= boot ========================= */
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () { view = t.dataset.tab; render(); });
  });
  $('#btnBackup').addEventListener('click', openBackup);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (ev) { if (ev.target === this) closeModal(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  render();
  if (state.exemplo) {
    setTimeout(function () {
      toast('Você está vendo dados de exemplo. Apague-os em ⚙ quando quiser.');
    }, 600);
  }
})();
