/* ============================================================
   TORQUE FITNESS — Montar Treino (autoatendimento)
   Lê o questionário, chama a Edge Function generate-workout
   (que guarda a chave da Anthropic em segredo) e renderiza a
   série. Sem login, sem servidor próprio — roda no navegador.
   ============================================================ */
(function () {
  'use strict';

  var SB = window.TORQUE_SUPABASE || {};
  var FN_URL = (SB.url || '').replace(/\/+$/, '') + '/functions/v1/generate-workout';

  var $ = function (id) { return document.getElementById(id); };
  var form = $('quizForm');
  var genBtn = $('genBtn');
  var formError = $('formError');

  var steps = {
    form: $('formStep'),
    loading: $('loadingStep'),
    result: $('resultStep')
  };

  function show(name) {
    Object.keys(steps).forEach(function (k) { steps[k].hidden = (k !== name); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  // -------- chamada à IA --------
  function generate(payload) {
    if (!SB.url || !SB.anonKey) {
      return Promise.reject(new Error('Supabase não configurado (js/config.js).'));
    }
    return fetch(FN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': SB.anonKey,
        'authorization': 'Bearer ' + SB.anonKey
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok || data.error) {
          throw new Error(data.error || ('Falha na IA (HTTP ' + r.status + ').'));
        }
        if (!data.treino) throw new Error('A IA não retornou uma série válida.');
        return data.treino;
      });
    });
  }

  // -------- render --------
  var current = null; // treino atual (para compartilhar)

  function noteFill(boxId, text) {
    var box = $(boxId);
    if (text && String(text).trim()) {
      box.querySelector('p').textContent = text;
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  function render(t) {
    current = t;
    $('rTitulo').textContent = t.titulo || 'Sua série de treino';
    $('rDivisao').textContent = t.divisao || '';
    $('rDivisao').hidden = !t.divisao;
    $('rResumo').textContent = t.resumo || '';

    noteFill('rAquecimento', t.aquecimento);

    var dias = Array.isArray(t.dias) ? t.dias : [];
    var html = dias.map(function (d) {
      var ex = Array.isArray(d.exercicios) ? d.exercicios : [];
      var rows = ex.map(function (e) {
        var obs = e.obs ? '<span class="exobs">' + esc(e.obs) + '</span>' : '';
        return '<tr>' +
          '<td><span class="exname">' + esc(e.nome) + '</span>' + obs + '</td>' +
          '<td class="num">' + esc(e.series) + '</td>' +
          '<td class="num">' + esc(e.repeticoes) + '</td>' +
          '<td class="num">' + esc(e.descanso) + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="day">' +
        '<div class="day__head"><h3>' + esc(d.nome) + '</h3>' +
        (d.foco ? '<span class="foco">' + esc(d.foco) + '</span>' : '') + '</div>' +
        '<table class="ex"><thead><tr>' +
        '<th>Exercício</th><th>Séries</th><th>Reps</th><th>Descanso</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }).join('');
    $('rDias').innerHTML = html;

    noteFill('rProgressao', t.progressao);
    noteFill('rAvisos', t.avisos);

    show('result');
  }

  // -------- texto p/ compartilhar --------
  function asText(t) {
    var lines = [];
    lines.push((t.titulo || 'Treino').toUpperCase());
    if (t.divisao) lines.push('Divisão: ' + t.divisao);
    if (t.resumo) lines.push('', t.resumo);
    (t.dias || []).forEach(function (d) {
      lines.push('', '— ' + (d.nome || '') + (d.foco ? ' (' + d.foco + ')' : ''));
      (d.exercicios || []).forEach(function (e) {
        lines.push('• ' + e.nome + ' — ' + e.series + 'x' + e.repeticoes + ' | desc. ' + e.descanso);
      });
    });
    if (t.progressao) lines.push('', 'Progressão: ' + t.progressao);
    if (t.avisos) lines.push('', '⚠ ' + t.avisos);
    lines.push('', 'Gerado com Torque Fitness · Montar Treino');
    return lines.join('\n');
  }

  // -------- eventos --------
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    formError.hidden = true;

    var fd = new FormData(form);
    var payload = {
      objetivo: fd.get('objetivo'),
      nivel: fd.get('nivel'),
      dias: fd.get('dias'),
      tempo: fd.get('tempo'),
      local: fd.get('local'),
      foco: (fd.get('foco') || '').trim(),
      sexo: fd.get('sexo') || '',
      idade: (fd.get('idade') || '').trim(),
      limitacoes: (fd.get('limitacoes') || '').trim()
    };

    genBtn.disabled = true;
    show('loading');

    generate(payload)
      .then(render)
      .catch(function (err) {
        show('form');
        showError(err.message || 'Não consegui montar o treino agora. Tente de novo.');
      })
      .finally(function () { genBtn.disabled = false; });
  });

  $('printBtn').addEventListener('click', function () { window.print(); });

  $('shareBtn').addEventListener('click', function () {
    if (!current) return;
    var text = asText(current);
    if (navigator.share) {
      navigator.share({ title: current.titulo || 'Meu treino', text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var b = $('shareBtn'); var old = b.textContent;
        b.textContent = '✓ Copiado!';
        setTimeout(function () { b.textContent = old; }, 1800);
      });
    }
  });

  $('restartBtn').addEventListener('click', function () {
    current = null;
    show('form');
  });
})();
