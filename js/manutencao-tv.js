/* ============================================================
   TORQUE FITNESS — Painel de TV (telão) das manutenções
   Lê os mesmos dados do app (localStorage) e mostra a situação
   em tela cheia: KPIs, atenção agora, limpeza do dia e gráficos.
   Atualiza sozinho (30 s) e reage a mudanças feitas em outra aba.
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'tf_manutencao_v1';

  var AREA_ICO = {
    'Equipamentos': '🏋️', 'Predial': '🏢', 'Elétrica': '⚡', 'Hidráulica': '🚿',
    'Climatização': '❄️', 'Limpeza': '🧹', 'Segurança': '🛡️', 'Outros': '📦'
  };
  var STATUS_ABERTOS = ['aberta', 'andamento', 'aguardando'];
  var STATUS_NOME = { aberta: 'Abertas', andamento: 'Em andamento', aguardando: 'Aguardando peça' };
  /* rampa ordinal (um matiz, claro→escuro) validada p/ superfície escura */
  var STATUS_COR = { aberta: '#C4B5FD', andamento: '#8B5CF6', aguardando: '#6D28D9' };
  /* tinta do rótulo dentro do segmento, pela luminância do preenchimento */
  var STATUS_INK = { aberta: '#0B0B0F', andamento: '#FFFFFF', aguardando: '#FFFFFF' };
  var PRIO_ORDEM = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var DIAS_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  function $(s) { return document.querySelector(s); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p[2] + '/' + p[1];
  }
  function fmtMoney(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  /* ========================= dados ========================= */
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s && Array.isArray(s.os) && Array.isArray(s.ativos) && Array.isArray(s.planos)) {
        if (!Array.isArray(s.limpeza)) s.limpeza = [];
        if (!Array.isArray(s.limpezaLog)) s.limpezaLog = [];
        return s;
      }
    } catch (e) { /* sem dados */ }
    return null;
  }
  function ativoNome(state, id) {
    for (var i = 0; i < state.ativos.length; i++) if (state.ativos[i].id === id) return state.ativos[i].nome;
    return '';
  }
  function osAtiva(o) { return o.status !== 'concluida' && o.status !== 'cancelada'; }
  function osAtrasada(o) { return osAtiva(o) && o.prazo && o.prazo < todayISO(); }

  /* ========================= render ========================= */
  function render() {
    var state = load();
    if (!state || (!state.os.length && !state.planos.length && !state.limpeza.length && !state.ativos.length)) {
      $('#setup').hidden = false;
      $('#board').style.visibility = 'hidden';
      return;
    }
    $('#setup').hidden = true;
    $('#board').style.visibility = '';

    var hoje = todayISO();
    var mes = hoje.slice(0, 7);

    /* ---------- KPIs ---------- */
    var abertas = 0, atrasadas = 0, custoMes = 0;
    state.os.forEach(function (o) {
      if (osAtiva(o)) abertas++;
      if (osAtrasada(o)) atrasadas++;
      if (o.status === 'concluida' && o.concluida && o.concluida.slice(0, 7) === mes) custoMes += Number(o.custo) || 0;
    });
    var prevVencidas = state.planos.filter(function (p) { return p.proxima && p.proxima < hoje; }).length;

    $('#kpis').innerHTML =
      kpiHTML(abertas, 'Chamados em aberto', abertas ? 'kpi--violet' : 'kpi--ok', '🛠️') +
      kpiHTML(atrasadas, 'Chamados atrasados', atrasadas ? 'kpi--bad' : 'kpi--ok', atrasadas ? '🔴' : '✅') +
      kpiHTML(prevVencidas, 'Preventivas vencidas', prevVencidas ? 'kpi--warn' : 'kpi--ok', prevVencidas ? '⏰' : '✅') +
      '<div class="kpi kpi--money"><b>' + fmtMoney(custoMes) + '</b><span>💸 Gasto no mês</span></div>';

    /* ---------- atenção agora ---------- */
    renderAtencao(state, hoje);

    /* ---------- limpeza de hoje ---------- */
    renderLimpeza(state, hoje);

    /* ---------- abertos por área ---------- */
    renderPorArea(state);

    /* ---------- abertos por etapa ---------- */
    renderPorStatus(state);

    /* ---------- gasto por mês ---------- */
    renderPorMes(state);
  }

  function kpiHTML(n, label, cls, ico) {
    return '<div class="kpi ' + cls + '"><b>' + n + '</b><span>' + ico + ' ' + label + '</span></div>';
  }

  function renderAtencao(state, hoje) {
    var itens = [];
    state.os.filter(function (o) { return osAtiva(o) && (o.prioridade === 'urgente' || osAtrasada(o)); })
      .sort(function (a, b) { return PRIO_ORDEM[a.prioridade] - PRIO_ORDEM[b.prioridade]; })
      .forEach(function (o) {
        var sub = [];
        var at = o.ativoId ? ativoNome(state, o.ativoId) : '';
        if (at) sub.push(esc(at));
        sub.push((AREA_ICO[o.area] || '') + ' ' + esc(o.area));
        if (o.prazo) sub.push('prazo <span class="mono">' + fmtDate(o.prazo) + '</span>');
        if (o.responsavel) sub.push(esc(o.responsavel));
        itens.push({
          bad: o.prioridade === 'urgente' || osAtrasada(o),
          tag: o.prioridade === 'urgente' ? 'Urgente' : 'Atrasado',
          titulo: esc(o.titulo),
          sub: sub.join(' · ')
        });
      });
    state.planos.filter(function (p) { return p.proxima && p.proxima < hoje; })
      .sort(function (a, b) { return a.proxima.localeCompare(b.proxima); })
      .forEach(function (p) {
        itens.push({
          bad: false, tag: 'Preventiva vencida',
          titulo: '🔁 ' + esc(p.titulo),
          sub: 'desde <span class="mono">' + fmtDate(p.proxima) + '</span>' +
            (p.responsavel ? ' · ' + esc(p.responsavel) : '')
        });
      });

    var MAXI = 6;
    var h;
    if (!itens.length) {
      h = '<div class="at-empty">Tudo em dia — nenhuma pendência urgente 💪</div>';
    } else {
      h = itens.slice(0, MAXI).map(function (it) {
        return '<div class="at-item' + (it.bad ? '' : ' at-item--warn') + '">' +
          '<div class="at-item__title"><span class="at-tag ' + (it.bad ? 'at-tag--bad' : 'at-tag--warn') + '">' + it.tag + '</span>' + it.titulo + '</div>' +
          '<div class="at-item__sub">' + it.sub + '</div></div>';
      }).join('');
      if (itens.length > MAXI) h += '<div class="at-more">+ ' + (itens.length - MAXI) + ' outras pendências no app</div>';
    }
    $('#atencao').innerHTML = h;
  }

  function renderLimpeza(state, hoje) {
    var dow = new Date().getDay();
    var deHoje = state.limpeza.filter(function (t) { return (t.dias || []).indexOf(dow) !== -1; });
    var feitas = deHoje.filter(function (t) {
      return state.limpezaLog.some(function (l) { return l.taskId === t.id && l.data === hoje; });
    });
    var pend = deHoje.filter(function (t) { return feitas.indexOf(t) === -1; });
    var pct = deHoje.length ? Math.round(100 * feitas.length / deHoje.length) : 0;

    var h;
    if (!deHoje.length) {
      h = '<div class="chart-empty">Nada programado para hoje 🎉</div>';
    } else {
      h = '<div class="meter-wrap">' +
        '<div class="meter-num"><b>' + feitas.length + '</b><small>de ' + deHoje.length + ' tarefas</small>' +
        '<span class="meter-pct">' + pct + '%</span></div>' +
        '<div class="meter' + (pct === 100 ? ' meter--full' : '') + '"><i style="width:' + pct + '%"></i></div>';
      if (pend.length) {
        h += '<div class="meter-pend"><ul>' + pend.slice(0, 4).map(function (t) {
          return '<li><span class="dot"></span>' + esc(t.titulo) + (t.local ? ' <span style="color:var(--txt-mut)">— ' + esc(t.local) + '</span>' : '') + '</li>';
        }).join('') + (pend.length > 4 ? '<li style="color:var(--txt-mut)">+ ' + (pend.length - 4) + ' pendentes</li>' : '') + '</ul></div>';
      } else {
        h += '<div class="meter-done">✓ Limpeza do dia 100% concluída</div>';
      }
      h += '</div>';
    }
    $('#limpeza').innerHTML = h;
  }

  function renderPorArea(state) {
    var conta = {};
    state.os.forEach(function (o) {
      if (osAtiva(o)) conta[o.area] = (conta[o.area] || 0) + 1;
    });
    var areas = Object.keys(conta).sort(function (a, b) { return conta[b] - conta[a]; }).slice(0, 6);
    if (!areas.length) {
      $('#porArea').innerHTML = '<div class="chart-empty">Nenhum chamado em aberto 🎉</div>';
      return;
    }
    var max = conta[areas[0]];
    $('#porArea').innerHTML = '<div class="hbars">' + areas.map(function (a) {
      var pct = Math.round(100 * conta[a] / max);
      return '<div class="hbar">' +
        '<span class="hbar__label">' + (AREA_ICO[a] || '') + ' ' + esc(a) + '</span>' +
        '<span class="hbar__track"><i class="hbar__fill" style="width:' + pct + '%"></i></span>' +
        '<span class="hbar__val">' + conta[a] + '</span></div>';
    }).join('') + '</div>';
  }

  function renderPorStatus(state) {
    var conta = { aberta: 0, andamento: 0, aguardando: 0 };
    var total = 0;
    state.os.forEach(function (o) {
      if (STATUS_ABERTOS.indexOf(o.status) !== -1) { conta[o.status]++; total++; }
    });
    if (!total) {
      $('#porStatus').innerHTML = '<div class="chart-empty">Nenhum chamado em aberto 🎉</div>';
      return;
    }
    var segs = '', legend = '';
    STATUS_ABERTOS.forEach(function (st) {
      var n = conta[st];
      legend += '<span><i style="background:' + STATUS_COR[st] + '"></i>' + STATUS_NOME[st] + ' <b>' + n + '</b></span>';
      if (!n) return;
      var pct = 100 * n / total;
      /* rótulo dentro do segmento só quando cabe com folga (~9% da largura) */
      var label = pct >= 9 ? '<b style="color:' + STATUS_INK[st] + '">' + n + '</b>' : '';
      segs += '<i style="flex:' + n + ';background:' + STATUS_COR[st] + '">' + label + '</i>';
    });
    $('#porStatus').innerHTML = '<div class="stack-wrap">' +
      '<div class="stack">' + segs + '</div>' +
      '<div class="stack-legend">' + legend + '</div></div>';
  }

  function renderPorMes(state) {
    var d = new Date();
    var meses = [];
    for (var i = 5; i >= 0; i--) {
      var m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      meses.push({
        key: m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'),
        label: MESES[m.getMonth()] + (m.getMonth() === 0 || i === 5 ? '/' + String(m.getFullYear()).slice(2) : ''),
        total: 0
      });
    }
    state.os.forEach(function (o) {
      if (o.status !== 'concluida' || !o.concluida) return;
      var key = o.concluida.slice(0, 7);
      meses.forEach(function (mm) { if (mm.key === key) mm.total += Number(o.custo) || 0; });
    });
    var max = Math.max.apply(null, meses.map(function (m) { return m.total; }));
    if (!max) {
      $('#porMes').innerHTML = '<div class="chart-empty">Sem gastos registrados nos últimos 6 meses</div>';
      return;
    }
    $('#porMes').innerHTML = '<div class="cols">' + meses.map(function (m) {
      /* deixa ~1.6rem livres no topo para o rótulo do valor */
      var pct = m.total ? Math.max(2, Math.round(88 * m.total / max)) : 0;
      return '<div class="col"><div class="col__area">' +
        '<span class="col__val" style="bottom:calc(' + pct + '% + .35rem)">' + (m.total ? fmtMoney(m.total) : '—') + '</span>' +
        '<i class="col__bar' + (m.total ? '' : ' col__bar--zero') + '" style="height:' + Math.max(2, pct) + '%"></i>' +
        '</div><span class="col__label">' + m.label + '</span></div>';
    }).join('') + '</div>';
  }

  /* ========================= relógio ========================= */
  function tick() {
    var d = new Date();
    $('#clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('#clockDate').textContent = DIAS_LONGO[d.getDay()] + ', ' + d.getDate() + ' de ' +
      ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()] +
      ' de ' + d.getFullYear();
  }

  /* ========================= importar backup ========================= */
  function pedirImport() { $('#importFile').click(); }
  $('#importFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = JSON.parse(reader.result);
        if (!s || !Array.isArray(s.os) || !Array.isArray(s.ativos) || !Array.isArray(s.planos)) throw new Error('formato');
        s.exemplo = false;
        localStorage.setItem(LS_KEY, JSON.stringify(s));
        render();
      } catch (e) {
        alert('Arquivo inválido. Selecione um backup exportado pelo app de manutenções.');
      }
    };
    reader.readAsText(file);
  });
  $('#btnImportTV').addEventListener('click', pedirImport);
  $('#btnImportSetup').addEventListener('click', pedirImport);

  /* ========================= boot ========================= */
  tick();
  render();
  setInterval(tick, 1000);
  setInterval(render, 30000);
  /* mudanças feitas no app em outra aba deste aparelho aparecem na hora */
  window.addEventListener('storage', function (ev) { if (ev.key === LS_KEY) render(); });

  /* ---------- nuvem: usa a sessão salva neste aparelho (login feito no app) ---------- */
  if (window.ManutCloud) {
    var tvState = load() || { ativos: [], os: [], planos: [], limpeza: [], limpezaLog: [], seqOS: 0, exemplo: false };
    ManutCloud.start({
      getState: function () { return tvState; },
      persist: function () {
        try { localStorage.setItem(LS_KEY, JSON.stringify(tvState)); } catch (e) { /* segue só exibindo */ }
      },
      rerender: render,
      onStatus: function (st) {
        $('#footInfo').textContent = st === 'ok' || st === 'sync'
          ? '☁ Sincronizado com a nuvem — atualiza em tempo real'
          : st === 'err'
            ? '⚠ Erro de sincronização — mostrando os últimos dados deste aparelho'
            : 'Atualiza sozinho a cada 30 segundos · dados deste aparelho';
      }
    });
  }
})();
