(function () {
'use strict';

/* ---------- configuración ---------- */
// Formato de la "Prueba completa". DEBE coincidir con el formato oficial de la CNSC
// (número de preguntas y minutos). Valores provisionales: ajustar cuando se confirmen.
// La prueba de 2022 fue una sola sesión de 5 horas; el número de ítems no es público (100 es aproximado).
var CONFIG = { simulacroCompleto: { preguntas: 100, minutos: 300 } };

/* ---------- utilidades ---------- */
var $ = function (s) { return document.querySelector(s); };
var main = $('#main');
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
  else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
}
function shuffle(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function say(t) { var l = $('#live'); l.textContent = ''; setTimeout(function () { l.textContent = t; }, 30); }
var toastT;
function toast(t) { var e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2800); }
function dayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(s) { s = Math.max(0, s); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }

/* ---------- progreso ---------- */
var KEY = 'profe-progress';
var P = freshProgress();
function freshProgress() { return { q: {}, xp: 0, streak: { lastDay: null, days: 0 }, best: 0, bestBy: {}, run: 0, runMax: 0 }; }
function normalize(o) {
  var b = freshProgress();
  if (!o || typeof o !== 'object') return b;
  if (o.q && typeof o.q === 'object') for (var id in o.q) {
    var r = o.q[id];
    if (r && typeof r === 'object') b.q[id] = { intentos: +r.intentos || 0, aciertos: +r.aciertos || 0, ultimaCorrecta: !!r.ultimaCorrecta, ts: +r.ts || 0 };
  }
  b.xp = Math.max(0, +o.xp || 0);
  if (o.streak && typeof o.streak === 'object') b.streak = { lastDay: typeof o.streak.lastDay === 'string' ? o.streak.lastDay : null, days: +o.streak.days || 0 };
  b.best = +o.best || 0;
  if (o.bestBy && typeof o.bestBy === 'object') ['20', '50', 'completa'].forEach(function (k) { if (+o.bestBy[k] > 0) b.bestBy[k] = Math.min(100, +o.bestBy[k]); }); b.run = +o.run || 0; b.runMax = +o.runMax || 0;
  return b;
}
function load() { try { var s = localStorage.getItem(KEY); if (s) P = normalize(JSON.parse(s)); } catch (e) { P = freshProgress(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* sin almacenamiento */ } }
function touchStreak() {
  var today = dayStr();
  if (P.streak.lastDay === today) return;
  var y = new Date(); y.setDate(y.getDate() - 1);
  P.streak.days = P.streak.lastDay === dayStr(y) ? P.streak.days + 1 : 1;
  P.streak.lastDay = today;
}
function streakDays() {
  var t = dayStr(), y = new Date(); y.setDate(y.getDate() - 1);
  return (P.streak.lastDay === t || P.streak.lastDay === dayStr(y)) ? P.streak.days : 0;
}
function xpFor(q) { return 10 + 5 * ((q.dificultad || 1) - 1); }
function record(q, ok) {
  var r = P.q[q.id] || (P.q[q.id] = { intentos: 0, aciertos: 0, ultimaCorrecta: false, ts: 0 });
  r.intentos++; if (ok) r.aciertos++;
  r.ultimaCorrecta = ok; r.ts = Date.now();
  if (ok) { P.run++; if (P.run > P.runMax) P.runMax = P.run; } else P.run = 0;
  touchStreak();
}

var LEVELS = [
  { n: 'Normalista', xp: 0 }, { n: 'Docente de aula', xp: 100 }, { n: 'Maestro', xp: 300 },
  { n: 'Directivo', xp: 700 }, { n: 'Rector', xp: 1500 }
];
function levelInfo() {
  var i = 0; while (i + 1 < LEVELS.length && P.xp >= LEVELS[i + 1].xp) i++;
  var cur = LEVELS[i], nxt = LEVELS[i + 1];
  return { i: i, name: cur.n, next: nxt, pct: nxt ? Math.round((P.xp - cur.xp) / (nxt.xp - cur.xp) * 100) : 100 };
}

/* ---------- datos ---------- */
var temas = [], Q = [], byTema = {}, loaded = false;
function validQ(q, tema) {
  return q && typeof q === 'object' && typeof q.enunciado === 'string' && q.enunciado &&
    Array.isArray(q.opciones) && q.opciones.length >= 2 && q.opciones.every(function (o) { return typeof o === 'string'; }) &&
    Number.isInteger(q.correcta) && q.correcta >= 0 && q.correcta < q.opciones.length;
}
function loadData() {
  return fetch('data/temas.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (ts) {
    if (!Array.isArray(ts)) throw 0;
    temas = ts.filter(function (t) { return t && t.id && t.titulo; });
    return Promise.allSettled(temas.map(function (t) {
      return fetch('data/' + encodeURIComponent(t.id) + '.json').then(function (r) { if (!r.ok) throw 0; return r.json(); });
    }));
  }).then(function (res) {
    var seen = {};
    res.forEach(function (r, i) {
      var t = temas[i]; byTema[t.id] = [];
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
      r.value.forEach(function (q, n) {
        if (!validQ(q)) return;
        q.tema = t.id;
        if (!q.id || seen[q.id]) q.id = t.id + '-x' + (n + 1);
        seen[q.id] = 1;
        q.dificultad = [1, 2, 3].indexOf(q.dificultad) >= 0 ? q.dificultad : 2;
        q.tipo = q.tipo === 'situacional' ? 'situacional' : 'conocimiento';
        byTema[t.id].push(q); Q.push(q);
      });
    });
    temas = temas.filter(function (t) { return byTema[t.id].length > 0; });
  }).catch(function () { temas = []; Q = []; }).then(function () { loaded = true; });
}
var qById = function (id) { for (var i = 0; i < Q.length; i++) if (Q[i].id === id) return Q[i]; };
function temaOf(id) { for (var i = 0; i < temas.length; i++) if (temas[i].id === id) return temas[i]; }
function temaStats(t) {
  var qs = byTema[t.id] || [], ok = 0, ans = 0;
  qs.forEach(function (q) { var r = P.q[q.id]; if (r) { if (r.intentos) ans++; if (r.aciertos) ok++; } });
  return { total: qs.length, ok: ok, ans: ans, pct: qs.length ? Math.round(ok / qs.length * 100) : 0 };
}
function errorQs() { return Q.filter(function (q) { var r = P.q[q.id]; return r && r.intentos && !r.ultimaCorrecta; }); }

/* ---------- componentes ---------- */
function ring(pct, color, big) {
  var r = 20, c = 2 * Math.PI * r;
  var svg = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="bg" cx="24" cy="24" r="' + r + '" fill="none" stroke-width="5"/><circle cx="24" cy="24" r="' + r +
    '" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (c * pct / 100) + ' ' + c + '"/></svg>';
  var el = h('div', { class: 'ring' + (big ? ' big' : ''), role: 'img', 'aria-label': pct + '%' });
  el.innerHTML = svg;
  el.appendChild(h('span', { text: pct + '%' }));
  return el;
}
function dots(n) { return h('span', { class: 'dots', role: 'img', 'aria-label': 'Dificultad ' + n + ' de 3' }, [1, 2, 3].map(function (i) { return h('i', { class: i <= n ? 'on' : '' }); })); }
function render(nodes, focusSel) {
  stopTimer();
  main.textContent = '';
  add(main, nodes);
  window.scrollTo(0, 0);
  var f = (focusSel && main.querySelector(focusSel)) || main.querySelector('h1,h2') || main;
  if (!f.hasAttribute('tabindex')) f.setAttribute('tabindex', '-1');
  f.focus({ preventScroll: true });
}
function updateChip() {
  var li = levelInfo();
  $('#lvlchip').textContent = '⭐ ' + li.name + ' · ' + P.xp + ' XP';
}
function confirmDialog(title, text, okLabel, onOk) {
  var prev = document.activeElement;
  var close = function () { bg.remove(); document.removeEventListener('keydown', esc, true); if (prev && prev.focus) prev.focus(); };
  var esc = function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { var b = bg.querySelectorAll('button'); var f = b[0], l = b[b.length - 1];
      if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); } else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); } }
  };
  var cancel = h('button', { class: 'btn', type: 'button', text: 'Cancelar', onclick: close });
  var bg = h('div', { class: 'modal-bg' },
    h('div', { class: 'modal glass', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mt' },
      h('h3', { id: 'mt', text: title }), h('p', { text: text }),
      h('div', { class: 'cta' }, cancel, h('button', { class: 'btn danger', type: 'button', text: okLabel, onclick: function () { close(); onOk(); } }))));
  document.body.appendChild(bg); document.addEventListener('keydown', esc, true); cancel.focus();
}

/* ---------- confeti ---------- */
function confetti() {
  if (reduced) return;
  var cv = $('#confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  var cols = ['#8b7cff', '#F5C542', '#00B8A9', '#E17055', '#3B82F6', '#C2185B'];
  var ps = []; for (var i = 0; i < 120; i++) ps.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .5, vx: Math.random() * 2 - 1, vy: 2 + Math.random() * 3, s: 5 + Math.random() * 6, c: cols[i % cols.length], r: Math.random() * 6, vr: Math.random() * .3 - .15 });
  var t0 = performance.now();
  (function f(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
    if (t - t0 < 3500) requestAnimationFrame(f); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

/* ---------- home ---------- */
function badgeList() {
  var anyAns = Object.keys(P.q).some(function (k) { return P.q[k].intentos > 0; });
  var temaDone = temas.some(function (t) { var s = temaStats(t); return s.total > 0 && s.ok === s.total; });
  return [
    { i: '🌱', n: 'Primera respuesta', on: anyAns }, { i: '🔥', n: '10 correctas seguidas', on: P.runMax >= 10 },
    { i: '🏅', n: 'Tema completado', on: temaDone }, { i: '🏆', n: 'Simulacro ≥ 80%', on: P.best >= 80 }
  ];
}
function viewHome() {
  var total = Q.length, answered = 0, okN = 0, att = 0;
  Q.forEach(function (q) { var r = P.q[q.id]; if (r && r.intentos) { answered++; att += r.intentos; okN += r.aciertos; } });
  var li = levelInfo(), errs = errorQs().length;
  var stat = function (n, l) { return h('div', { class: 'stat glass' }, h('div', { class: 'n', text: String(n) }), h('div', { class: 'l', text: l })); };
  var fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', onchange: importFile });
  var first = temas.length ? '#/tema/' + temas[0].id : '#/';
  render([
    h('section', { class: 'hero' },
      h('div', { class: 'deco', 'aria-hidden': 'true' }, ['🎓', '📚', '✏️', '⭐', '💡'].map(function (e, i) { return h('span', { style: 'left:' + [4, 40, 90, 14, 62][i] + '%;top:' + [10, 4, 30, 78, 86][i] + '%;animation-delay:-' + (i * 2) + 's', text: e }); })),
      h('div', null,
        h('p', { class: 'eyebrow', text: 'Concurso docente · CNSC' }),
        h('h1', { class: 'grad', text: 'Profe' }),
        h('p', { class: 'tagline', text: 'Practica, aprende y gana tu plaza' }),
        h('p', { class: 'lead', text: 'Preguntas de práctica por tema, simulacros con tiempo y repaso de errores para prepararte para el concurso de méritos docente en Colombia.' }),
        h('p', null, h('span', { class: 'count-pill' }, h('b', { text: String(total) }), ' preguntas disponibles')),
        h('div', { class: 'cta' },
          total ? h('a', { class: 'btn primary', href: '#/simulacro', text: '⏱️ Hacer simulacro' }) : null,
          total ? h('a', { class: 'btn', href: '#temas-anchor', onclick: function (e) { e.preventDefault(); var a = $('#temas-anchor'); if (a) { a.scrollIntoView(); a.focus({ preventScroll: true }); } }, text: '📚 Elegir tema' }) : null,
          total ? h('a', { class: 'btn', href: '#/dia', text: '☀️ Pregunta del día' }) : null))),
    !total ? h('div', { class: 'empty glass' }, h('h2', { text: 'Aún no hay preguntas' }), h('p', { class: 'lead', text: loaded ? 'No se pudieron cargar las preguntas. Revisa la carpeta data/ o intenta de nuevo más tarde.' : 'Cargando…' })) : null,
    h('section', null,
      h('div', { class: 'stats' }, stat(answered, 'respondidas'), stat(att ? Math.round(okN / att * 100) + '%' : '—', 'de acierto'), stat(streakDays(), 'días de racha'), stat(li.name, 'nivel · ' + P.xp + ' XP')),
      h('div', { class: 'lvlbox glass' },
        h('div', { class: 'row' }, h('span', { text: 'Nivel: ' + li.name }), h('span', { class: 'small', text: li.next ? (li.next.xp - P.xp) + ' XP para ' + li.next.n : 'Nivel máximo' })),
        h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Progreso de nivel', 'aria-valuenow': li.pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: 'width:' + li.pct + '%' }))),
      h('div', { class: 'badges', role: 'list', 'aria-label': 'Insignias' }, badgeList().map(function (b) { return h('div', { class: 'bdg ' + (b.on ? 'on' : 'off'), role: 'listitem', title: b.on ? 'Conseguida' : 'Por conseguir' }, h('span', { 'aria-hidden': 'true', text: b.i }), b.n, h('span', { class: 'sr-only', text: b.on ? ' (conseguida)' : ' (bloqueada)' })); }))),
    total ? h('section', null,
      h('h2', { text: 'Modos de práctica' }),
      h('div', { class: 'modes' },
        modeLink('#/simulacro', 'tile-teal', '⏱️', 'Simulacro', '20, 50 o prueba completa, con tiempo'),
        modeLink('#/concurso', 'tile-gold', '🧭', 'Cómo es el concurso', 'Pruebas, pesos, reglas y mitos frecuentes'),
        modeLink('#/errores', 'tile-coral', '🔁', 'Repasar errores', errs ? errs + ' por repasar' : 'Sin errores pendientes'),
        modeLink('#/dia', 'tile-gold', '☀️', 'Pregunta del día', 'Una al día, para mantener la racha'))) : null,
    total ? temaGroups() : null,
    h('section', null,
      h('h2', { text: 'Tu progreso' }),
      h('div', { class: 'tools-box glass' },
        h('p', { class: 'small', text: 'Se guarda solo en este navegador. Exporta una copia para no perderla o llevarla a otro dispositivo.' }),
        h('div', { class: 'cta' },
          h('button', { class: 'btn sm', type: 'button', text: '⬇️ Exportar', onclick: exportProgress }),
          h('button', { class: 'btn sm', type: 'button', text: '⬆️ Importar', onclick: function () { fileIn.click(); } }),
          h('button', { class: 'btn sm danger', type: 'button', text: '🗑️ Reiniciar progreso', onclick: function () { confirmDialog('¿Reiniciar progreso?', 'Se borrarán tus respuestas, XP, racha e insignias de este navegador. No se puede deshacer.', 'Sí, reiniciar', function () { P = freshProgress(); save(); updateChip(); toast('Progreso reiniciado'); route(); }); } }),
          fileIn)))
  ]);
}
function temaCard(t) {
  var s = temaStats(t), col = t.color || '#6C5CE7';
  return h('article', { class: 'card glass' },
    h('div', { class: 'top' }, h('div', { class: 'ic', style: 'background:linear-gradient(135deg,' + col + ',' + col + 'aa)', 'aria-hidden': 'true', text: t.icono || '📘' }), ring(s.pct, col)),
    h('h3', { text: t.titulo }), h('p', { text: t.descripcion || '' }),
    h('div', { class: 'meta' }, h('span', { text: s.total + ' preguntas · ' + s.ok + ' dominadas' }),
      h('a', { class: 'btn primary sm', href: '#/tema/' + t.id, 'aria-label': 'Practicar ' + t.titulo, text: 'Practicar' })));
}
function temaGroups() {
  var spec = temas.filter(function (t) { return t.grupo === 'especifico'; }), com = temas.filter(function (t) { return t.grupo !== 'especifico'; });
  var out = [];
  var grp = function (title, list, anchor) { if (list.length) out.push(h('section', null, h('h2', { id: anchor ? 'temas-anchor' : null, tabindex: anchor ? '-1' : null, text: title }), h('div', { class: 'cards' }, list.map(temaCard)))); };
  grp(spec.length ? 'Comunes a todos los cargos' : 'Temas', com, true);
  grp('Conocimientos específicos por cargo', spec, false);
  return out;
}
function modeLink(href, tile, icon, title, sub) {
  return h('a', { class: 'mode glass', href: href }, h('div', { class: 'ic ' + tile, 'aria-hidden': 'true', text: icon }), h('div', null, h('b', { text: title }), h('small', { text: sub })));
}
function exportProgress() {
  try {
    var blob = new Blob([JSON.stringify(P, null, 2)], { type: 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'profe-progreso-' + dayStr() + '.json' });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Progreso exportado');
  } catch (e) { toast('No se pudo exportar'); }
}
function importFile(e) {
  var f = e.target.files && e.target.files[0]; if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var o = JSON.parse(rd.result);
      if (!o || typeof o !== 'object' || !o.q || typeof o.q !== 'object' || Array.isArray(o.q)) throw 0;
      P = normalize(o); save(); updateChip(); toast('Progreso importado'); route();
    } catch (err) { toast('Archivo no válido'); }
  };
  rd.onerror = function () { toast('No se pudo leer el archivo'); };
  rd.readAsText(f);
}

/* ---------- configuración de tema ---------- */
var filt = { dif: [], tipo: [], nuevas: false };
function viewTema(id) {
  var t = temaOf(id);
  if (!t) return notFound();
  var all = byTema[id];
  var match = function () {
    return all.filter(function (q) {
      return (!filt.dif.length || filt.dif.indexOf(q.dificultad) >= 0) && (!filt.tipo.length || filt.tipo.indexOf(q.tipo) >= 0) &&
        (!filt.nuevas || !(P.q[q.id] && P.q[q.id].intentos));
    });
  };
  var countEl = h('p', { class: 'lead', 'aria-live': 'polite' }), start = h('button', { class: 'btn primary', type: 'button', text: 'Empezar' });
  var upd = function () { var n = match().length; countEl.textContent = n + (n === 1 ? ' pregunta coincide' : ' preguntas coinciden') + ' con tus filtros.'; start.disabled = !n; };
  var toggle = function (arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  var chip = function (label, on, fn) { var b = h('button', { type: 'button', 'aria-pressed': on ? 'true' : 'false', text: label, onclick: function () { fn(); b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); upd(); } }); return b; };
  start.addEventListener('click', function () { startSession({ mode: 'practica', title: t.titulo, icon: t.icono, qs: shuffle(match()), again: '#/tema/' + id }); });
  render([
    h('section', null,
      h('a', { class: 'crumb', href: '#/', text: '← Inicio' }),
      h('div', { class: 'ic', style: 'background:linear-gradient(135deg,' + t.color + ',' + t.color + 'aa)', 'aria-hidden': 'true', text: t.icono }),
      h('h2', { text: t.titulo }), h('p', { class: 'lead', text: t.descripcion || '' }),
      h('div', { class: 'setup glass' },
        h('h3', { text: 'Filtros (opcionales)' }),
        h('div', { class: 'filters' },
          h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Dificultad' }, h('div', { class: 't', text: 'Dificultad' }), h('div', { class: 'seg' }, [1, 2, 3].map(function (d) { return chip(['', 'Fácil', 'Media', 'Difícil'][d], filt.dif.indexOf(d) >= 0, function () { toggle(filt.dif, d); }); }))),
          h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Tipo' }, h('div', { class: 't', text: 'Tipo' }), h('div', { class: 'seg' }, ['conocimiento', 'situacional'].map(function (d) { return chip(d === 'conocimiento' ? 'Conocimiento' : 'Situacional', filt.tipo.indexOf(d) >= 0, function () { toggle(filt.tipo, d); }); }))),
          h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Estado' }, h('div', { class: 't', text: 'Estado' }), h('div', { class: 'seg' }, chip('Solo no respondidas', filt.nuevas, function () { filt.nuevas = !filt.nuevas; })))),
        countEl, h('div', { class: 'cta' }, start)))
  ]);
  upd();
}
function notFound() {
  render(h('section', { class: 'empty glass' }, h('h2', { text: 'No encontramos esa página' }), h('a', { class: 'btn primary', href: '#/', text: 'Ir al inicio' })));
}

/* ---------- sesión de quiz ---------- */
var S = null, timerId = null;
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
function startSession(o) {
  if (!o.qs.length) { toast('No hay preguntas para esta sesión'); return; }
  S = { mode: o.mode, title: o.title, icon: o.icon, qs: o.qs, idx: 0, items: o.qs.map(function (q) { return { q: q, sel: -1, ok: false, done: false }; }),
    xp: 0, again: o.again, total: o.qs.length, left: o.mode === 'simulacro' ? o.secs : 0, limit: o.secs || 0, len: o.len || null, view: 'quiz' };
  renderQuiz();
}
function renderQuiz() {
  var it = S.items[S.idx], q = it.q, t = temaOf(q.tema) || {};
  var sim = S.mode === 'simulacro', lastQ = S.idx === S.total - 1;
  var optsEl = h('div', { class: 'opts', role: 'group', 'aria-label': 'Opciones de respuesta' });
  var fb = h('div', { 'aria-live': 'polite' });
  var nextBtn = h('button', { class: 'btn primary', type: 'button', text: lastQ ? 'Finalizar' : 'Siguiente →', onclick: next });
  var btns = q.opciones.map(function (o, i) {
    var b = h('button', { class: 'opt', type: 'button', 'data-i': i, onclick: function () { choose(i); } }, h('span', { class: 'l', 'aria-hidden': 'true', text: 'ABCDEFGH'[i] }), h('span', { lang: langOf(q), text: o }));
    optsEl.appendChild(b); return b;
  });
  var timerEl = sim ? h('span', { class: 'timer', role: 'timer', 'aria-label': 'Tiempo restante', text: '⏱ ' + fmtTime(S.left) }) : null;
  var node = h('section', null,
    h('div', { class: 'qhead' }, h('span', { text: (S.icon || '') + ' ' + S.title + ' · ' + (S.idx + 1) + ' / ' + S.total }), timerEl),
    h('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': S.total, 'aria-valuenow': S.idx + (it.done ? 1 : 0), 'aria-label': 'Progreso' }, h('i', { style: 'width:' + ((S.idx + (it.done ? 1 : 0)) / S.total * 100) + '%' })),
    h('div', { class: 'qtags' },
      h('span', { class: 'tag', style: 'border-color:' + (t.color || '') , text: (t.icono || '') + ' ' + (t.titulo || q.tema) }),
      q.subtema ? h('span', { class: 'tag', text: q.subtema }) : null,
      dots(q.dificultad), h('span', { class: 'tag' + (q.tipo === 'situacional' ? ' sit' : ''), text: q.tipo === 'situacional' ? 'Situacional' : 'Conocimiento' })),
    q.contexto ? ctxBox(q.contexto, langOf(q)) : null,
    h('h2', { class: 'enun', id: 'enun', tabindex: '-1', lang: langOf(q), text: q.enunciado }), optsEl, fb,
    h('div', { class: 'next' }, sim && S.idx > 0 ? h('button', { class: 'btn', type: 'button', text: '← Anterior', onclick: function () { S.idx--; renderQuiz(); } }) : null,
      sim ? nextBtn : null, h('span', { id: 'nextslot' })));
  S.dom = { btns: btns, fb: fb, nextBtn: nextBtn, node: node, timerEl: timerEl };
  render(node, '#enun');
  if (sim) {
    stopTimer(); timerId = setInterval(tick, 1000);
    if (it.sel >= 0) btns[it.sel].classList.add('sel');
  } else if (it.done) revealPractice(it, false);
}
function tick() {
  if (!S || S.view !== 'quiz') return stopTimer();
  S.left--;
  var el = $('.timer'); if (el) { el.textContent = '⏱ ' + fmtTime(S.left); el.classList.toggle('low', S.left <= 60); }
  if (S.left === 60) say('Queda un minuto');
  if (S.left <= 0) { toast('Se acabó el tiempo'); finish(); }
}
function langOf(q) { return q.tema === 'ingles' ? 'en' : null; }
function ctxBox(txt, lang) {
  var lines = String(txt).split('\n');
  var tabular = lines.filter(function (l) { return l.indexOf('|') >= 0 || l.indexOf('\t') >= 0; });
  if (tabular.length >= 2) {
    var tbl = h('table'), pre = [], rows = [];
    lines.forEach(function (l) { if (l.indexOf('|') >= 0 || l.indexOf('\t') >= 0) rows.push(l); else if (!rows.length) pre.push(l); else pre.push(l); });
    var cells = function (l) { return l.split(/\||\t/).map(function (c) { return c.trim(); }).filter(function (c, i, a) { return c || (i > 0 && i < a.length - 1); }); };
    rows.forEach(function (l, i) {
      if (/^[\s|:\-+]+$/.test(l)) return;
      var tr = h('tr'); cells(l).forEach(function (c) { tr.appendChild(h(i === 0 ? 'th' : 'td', { text: c })); }); tbl.appendChild(tr);
    });
    var before = lines.slice(0, lines.indexOf(rows[0])).join('\n').trim(), after = lines.slice(lines.lastIndexOf(rows[rows.length - 1]) + 1).join('\n').trim();
    return h('div', { class: 'ctx tbl', lang: lang, tabindex: '0', role: 'region', 'aria-label': 'Contexto' }, before ? h('p', { style: 'white-space:pre-wrap', text: before }) : null, tbl, after ? h('p', { style: 'white-space:pre-wrap;margin-top:10px', text: after }) : null);
  }
  return h('div', { class: 'ctx', lang: lang, tabindex: '0', role: 'region', 'aria-label': 'Contexto', text: txt });
}
function choose(i) {
  if (!S || S.view !== 'quiz') return;
  var it = S.items[S.idx];
  if (S.mode === 'simulacro') {
    it.sel = i; it.done = true;
    S.dom.btns.forEach(function (b, k) { b.classList.toggle('sel', k === i); });
    say('Opción ' + 'ABCD'[i] + ' seleccionada');
    return;
  }
  if (it.done) return;
  it.sel = i; it.done = true; it.ok = i === it.q.correcta;
  record(it.q, it.ok);
  var gain = it.ok ? xpFor(it.q) : 0;
  if (gain) { P.xp += gain; S.xp += gain; floatXp(gain); }
  save(); updateChip();
  revealPractice(it, true);
}
function floatXp(n) { if (reduced) return; var e = h('div', { class: 'xp', 'aria-hidden': 'true', text: '+' + n + ' XP' }); document.body.appendChild(e); setTimeout(function () { e.remove(); }, 1200); }
function retroOf(q, i) { return Array.isArray(q.retro) && typeof q.retro[i] === 'string' && q.retro[i].trim() ? q.retro[i] : null; }
function feedbackCard(q, sel, ok) {
  var L = 'ABCDEFGH', lang = langOf(q), rc = retroOf(q, q.correcta);
  var parts = [];
  if (ok) {
    parts.push(h('h3', { class: 'fb-h', text: '✅ ¡Correcto!' }));
    if (rc) parts.push(h('p', { class: 'fb-why', lang: lang, text: rc }));
  } else {
    var rs = sel >= 0 ? retroOf(q, sel) : null;
    parts.push(h('div', { class: 'fb-blk bad' },
      h('h3', { class: 'fb-h', lang: lang, text: sel >= 0 ? '❌ Tu respuesta: ' + L[sel] + ') ' + q.opciones[sel] : '❌ Sin responder' }),
      rs ? h('p', { class: 'fb-why' }, h('b', { text: 'Por qué no es correcta: ' }), h('span', { lang: lang, text: rs })) : null));
    parts.push(h('div', { class: 'fb-blk good' },
      h('h3', { class: 'fb-h', lang: lang, text: '✅ Respuesta correcta: ' + L[q.correcta] + ') ' + q.opciones[q.correcta] }),
      rc ? h('p', { class: 'fb-why', lang: lang, text: rc }) : null));
  }
  parts.push(h('h4', { class: 'fb-sub', text: 'Explicación' }), h('p', { text: q.explicacion || '' }));
  if (q.fuente) parts.push(h('p', { class: 'src' }, h('b', { text: (q.tema === 'psicotecnica' ? 'Competencia evaluada' : 'Fuente') + ': ' }), q.fuente));
  return h('div', { class: 'expl glass ' + (ok ? 'good' : 'bad') }, parts);
}
function revealPractice(it, fresh) {
  var q = it.q, d = S.dom;
  d.btns.forEach(function (b, k) {
    b.disabled = true;
    if (k === q.correcta) b.classList.add('ok'); else if (k === it.sel) b.classList.add('bad');
  });
  if (!it.ok) d.btns[q.correcta].classList.add('missed');
  d.fb.textContent = '';
  var card = feedbackCard(q, it.sel, it.ok);
  d.fb.appendChild(card);
  var last = S.idx === S.total - 1;
  var nb = h('button', { class: 'btn primary', type: 'button', text: last ? 'Ver resultados' : 'Siguiente →', onclick: next });
  $('#nextslot').replaceWith(nb);
  if (fresh) say(it.ok ? 'Correcto.' : 'Incorrecto. La respuesta correcta es ' + 'ABCDEFGH'[q.correcta] + '.');
  nb.focus({ preventScroll: true });
  card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
}
function next() {
  if (!S || S.view !== 'quiz') return;
  var it = S.items[S.idx];
  if (S.mode === 'practica' || S.mode === 'errores' || S.mode === 'dia') { if (!it.done) return; }
  if (S.idx >= S.total - 1) return finish();
  S.idx++; renderQuiz();
}
function finish() {
  if (!S) return;
  stopTimer();
  var sim = S.mode === 'simulacro';
  var done = S.items.filter(function (i) { return i.done; });
  if (sim) {
    S.items.forEach(function (it) {
      var ok = it.sel === it.q.correcta; it.ok = ok; it.done = true;
      record(it.q, ok); if (ok) { var g = xpFor(it.q); P.xp += g; S.xp += g; }
    });
  } else S.items = done;
  var correct = S.items.filter(function (i) { return i.ok; }).length, tot = sim ? S.total : S.items.length;
  var pct = tot ? Math.round(correct / tot * 100) : 0;
  var wasBest = sim && pct > (S.len ? (P.bestBy[S.len] || 0) : P.best);
  if (sim && pct > P.best) P.best = pct;
  if (sim && S.len && pct > (P.bestBy[S.len] || 0)) P.bestBy[S.len] = pct;
  save(); updateChip();
  S.view = 'result'; S.result = { correct: correct, total: tot, pct: pct, wasBest: wasBest, elapsed: sim ? S.limit - S.left : 0 };
  location.hash = '#/resultados';
}
function viewResultados() {
  if (!S || S.view !== 'result') { location.replace('#/'); return; }
  var r = S.result, sim = S.mode === 'simulacro', by = {};
  S.items.forEach(function (it) { var b = by[it.q.tema] || (by[it.q.tema] = { n: 0, ok: 0 }); b.n++; if (it.ok) b.ok++; });
  var col = r.pct >= 70 ? 'var(--ok)' : r.pct >= 40 ? 'var(--gold)' : 'var(--bad)';
  var msg = r.pct >= 90 ? '¡Excelente, Profe!' : r.pct >= 70 ? '¡Muy buen trabajo!' : r.pct >= 40 ? 'Vas por buen camino, sigue practicando.' : 'Repasa y vuelve a intentarlo; cada error enseña.';
  var errs = S.items.filter(function (i) { return !i.ok; }).length;
  var node = [
    h('section', { class: 'res glass' },
      h('h2', { text: sim ? 'Resultado del simulacro' : 'Resultados · ' + S.title }),
      ring(r.pct, col, true),
      h('p', { class: 'lead', style: 'margin:8px auto', text: r.correct + ' de ' + r.total + ' correctas. ' + msg }),
      h('p', { class: 'count-pill' }, '+', h('b', { text: String(S.xp) }), ' XP ganados'),
      sim ? h('p', { class: 'small', text: 'Tiempo usado: ' + fmtTime(r.elapsed) + (r.wasBest ? ' · ¡Nuevo mejor puntaje!' : ' · Mejor puntaje: ' + (S.len ? (P.bestBy[S.len] || pct) : P.best) + '%') }) : null,
      h('div', { class: 'cta', style: 'justify-content:center' },
        h('button', { class: 'btn primary', type: 'button', text: '🔄 Repetir', onclick: again }),
        errorQs().length ? h('a', { class: 'btn', href: '#/errores', text: '🔁 Repasar errores' }) : null,
        h('a', { class: 'btn', href: '#/', text: '🏠 Inicio' }))),
    h('section', null, h('h3', { text: 'Por tema' }), h('div', { class: 'bd' }, Object.keys(by).map(function (id) {
      var t = temaOf(id) || {}, b = by[id], p = Math.round(b.ok / b.n * 100);
      return h('div', { class: 'row glass' }, h('span', { 'aria-hidden': 'true', text: t.icono || '' }), h('div', null, h('b', { text: t.titulo || id }), h('div', { class: 'meter' }, h('i', { style: 'width:' + p + '%' }))), h('span', { text: b.ok + '/' + b.n }));
    }))),
    sim ? h('section', null, h('h3', { text: 'Revisión de preguntas (' + errs + ' incorrectas)' }), h('div', { class: 'review' }, S.items.map(function (it, n) {
      var q = it.q;
      return h('details', { class: 'glass', lang: langOf(q) },
        h('summary', null, h('span', { class: it.ok ? 'rok' : 'rbad', text: it.ok ? '✔ ' : '✘ ' }), (n + 1) + '. ' + q.enunciado.slice(0, 110) + (q.enunciado.length > 110 ? '…' : '')),
        q.contexto ? h('p', { class: 'small', style: 'white-space:pre-wrap', text: q.contexto }) : null,
        h('p', { style: 'white-space:pre-wrap;font-weight:700', text: q.enunciado }),
        feedbackCard(q, it.sel, it.ok));
    }))) : null
  ];
  render(node, 'h2');
  say('Resultado: ' + r.correct + ' de ' + r.total + ' correctas');
  if (r.pct >= 70) confetti();
}
function again() {
  if (!S) return;
  var a = S.again;
  if (a === '#/simulacro') { S = null; if (location.hash === a) route(); else location.hash = a; return; }
  if (a === '#/errores' || a === '#/dia') { S = null; if (location.hash === a) route(); else location.hash = a; return; }
  // tema: mismas preguntas, nuevo orden
  startSession({ mode: S.mode, title: S.title, icon: S.icon, qs: shuffle(S.items.map(function (i) { return i.q; })), again: a });
  if (location.hash !== a) history.replaceState(null, '', a);
}

/* ---------- modos ---------- */
var simCfg = { len: '20', scope: 'comunes' };
function simPool(scope) {
  var pool = [];
  temas.forEach(function (t) { if (t.grupo !== 'especifico' || t.id === scope) pool = pool.concat(byTema[t.id] || []); });
  return pool;
}
function simPlan() {
  var pool = simPool(simCfg.scope), full = simCfg.len === 'completa', C = CONFIG.simulacroCompleto;
  var want = full ? C.preguntas : +simCfg.len, n = Math.min(want, pool.length);
  // 2 min por pregunta (20/50); prueba completa: minutos oficiales (proporcional si faltan preguntas)
  var secs = full ? Math.round(C.minutos * 60 * (n / C.preguntas)) : n * 120;
  return { pool: pool, n: n, want: want, secs: secs };
}
function viewSimulacro() {
  if (!Q.length) return notFound();
  var specs = temas.filter(function (t) { return t.grupo === 'especifico'; });
  if (simCfg.scope !== 'comunes' && !specs.some(function (t) { return t.id === simCfg.scope; })) simCfg.scope = 'comunes';
  var info = h('p', { class: 'lead', 'aria-live': 'polite' }), bestEl = h('p', { class: 'small' }), start = h('button', { class: 'btn primary', type: 'button', text: 'Comenzar simulacro' });
  var lenBox = h('div', { class: 'seg' }), scBox = h('div', { class: 'seg' });
  var paint = function () {
    var p = simPlan();
    [].forEach.call(lenBox.children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === simCfg.len ? 'true' : 'false'); });
    [].forEach.call(scBox.children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === simCfg.scope ? 'true' : 'false'); });
    info.textContent = p.n ? p.n + ' preguntas al azar' + (p.n < p.want ? ' (solo hay ' + p.n + ' disponibles en este alcance)' : '') + ', con cuenta regresiva de ' + Math.round(p.secs / 60) + ' minutos. Las explicaciones se muestran solo al final.' : 'No hay preguntas disponibles en este alcance.';
    start.disabled = !p.n;
    var bb = P.bestBy[simCfg.len]; bestEl.textContent = bb ? 'Tu mejor puntaje en esta longitud: ' + bb + '%' : '';
  };
  var opt = function (box, v, label, key) { box.appendChild(h('button', { type: 'button', 'data-v': v, 'aria-pressed': 'false', text: label, onclick: function () { simCfg[key] = v; paint(); } })); };
  opt(lenBox, '20', '20 preguntas', 'len'); opt(lenBox, '50', '50 preguntas', 'len'); opt(lenBox, 'completa', 'Prueba completa (≈5 horas)', 'len');
  opt(scBox, 'comunes', 'Todos los temas comunes', 'scope');
  specs.forEach(function (t) { opt(scBox, t.id, 'Comunes + ' + t.titulo, 'scope'); });
  start.addEventListener('click', function () {
    var p = simPlan(); if (!p.n) return;
    startSession({ mode: 'simulacro', title: 'Simulacro', icon: '⏱️', qs: shuffle(p.pool).slice(0, p.n), again: '#/simulacro', secs: p.secs, len: simCfg.len });
  });
  render(h('section', null,
    h('a', { class: 'crumb', href: '#/', text: '← Inicio' }),
    h('div', { class: 'ic tile-teal', 'aria-hidden': 'true', text: '⏱️' }), h('h2', { text: 'Simulacro' }),
    h('div', { class: 'setup glass' },
      h('div', { class: 'filters' },
        h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Longitud' }, h('div', { class: 't', text: 'Longitud' }), lenBox),
        h('div', { class: 'fgroup', role: 'group', 'aria-label': 'Alcance' }, h('div', { class: 't', text: 'Alcance (cargo o área)' }), scBox)),
      info, bestEl,
      h('p', { class: 'small' }, 'Nota: la prueba completa usa ' + CONFIG.simulacroCompleto.preguntas + ' preguntas como cifra aproximada; el número real de ítems del examen no es público.'),
      h('div', { class: 'cta' }, start))));
  paint();
}
function viewConcurso() {
  var L = function (href, text) { return h('a', { href: href, target: '_blank', rel: 'noopener noreferrer', text: text + ' ↗' }); };
  var heads = ['Prueba', 'Carácter', 'Peso docente', 'Peso directivo', 'Puntaje mínimo'];
  var rows = [
    ['Aptitudes y competencias básicas', 'Eliminatoria', '55 %', '55 %', 'Mínimo 60/100 docentes; 70/100 directivos'],
    ['Psicotécnica', 'Clasificatoria', '5 %', '10 %', 'No aplica'],
    ['Valoración de antecedentes', 'Clasificatoria', '30 %', '25 %', 'No aplica'],
    ['Entrevista', 'Clasificatoria', '10 %', '10 %', 'No aplica']];
  var card = function (title, body) { return h('article', { class: 'card glass' }, h('h3', { text: title }), body); };
  var ul = function (items) { return h('ul', { class: 'cc-list' }, items.map(function (t) { return h('li', null, t); })); };
  render(h('section', null,
    h('a', { class: 'crumb', href: '#/', text: '← Inicio' }),
    h('div', { class: 'ic tile-gold', 'aria-hidden': 'true', text: '🧭' }), h('h2', { text: 'Cómo es el concurso' }),
    h('p', { class: 'lead', text: 'Resumen de las pruebas del concurso de méritos docente según el Acuerdo 239 de 2026 y su anexo técnico (proceso de Barranquilla). Cada convocatoria puede variar: manda su acuerdo.' }),
    h('h3', { text: 'Pruebas y pesos (2026)' }),
    h('div', { class: 'tbl-wrap glass', role: 'region', 'aria-label': 'Tabla de pruebas', tabindex: '0' },
      h('table', { class: 'cc-tbl' },
        h('thead', null, h('tr', null, heads.map(function (c) { return h('th', { scope: 'col', text: c }); }))),
        h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c, i) { return h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, 'data-l': heads[i], text: c }); })); })))),
    h('div', { class: 'cards', style: 'margin-top:16px' },
      card('Formato de los ítems', h('div', null,
        h('p', { text: 'El examen real usa juicio situacional: un caso del que se derivan de 3 a 5 enunciados, cada uno con 3 opciones y una sola correcta.' }),
        h('p', { text: 'Profe usa 4 opciones por pregunta para practicar con más distractores.' }))),
      card('Fechas y reglas clave', ul([
        'Citación a las pruebas escritas con al menos 10 días calendario de antelación.',
        'Reclamaciones contra resultados de pruebas escritas: 5 días hábiles desde la publicación, por SIMO.',
        'Llegada tarde: máximo 30 minutos después de la hora de inicio, sin tiempo adicional.',
        'Las pruebas se califican de 0 a 100; aptitudes y psicotécnica se aplican el mismo día.']))),
    h('section', { class: 'cc-myths glass' },
      h('h3', { text: '⚠️ Mitos frecuentes' }),
      ul([
        'Mito: la psicotécnica elimina. Realidad: es clasificatoria; la única prueba eliminatoria es la de aptitudes y competencias básicas.',
        'Mito: los mínimos son 70 y 80. Realidad: son 60 para docentes y 70 para directivos docentes.',
        'Mito: los pesos de 2022 siguen vigentes. Realidad: en 2026 la entrevista pesa 10 % (antes 5 %) y los antecedentes de docentes 30 % (antes 20 %).',
        'Mito: el examen real tiene 4 opciones. Realidad: usa 3 (en 2013 eran 4; no mezcles formatos).',
        'Mito: la guía de orientación manda sobre el acuerdo. Realidad: la guía es solo operativa; prevalecen el acuerdo y su anexo técnico.',
        'Mito: hay simulacros oficiales. Realidad: no se encontró ninguno; los de sitios privados, incluido este, no son oficiales.'])),
    h('h3', { text: 'Fuentes oficiales' }),
    ul([
      L('https://www.cnsc.gov.co/convocatorias/docentes-y-directivos-docentes-2026', 'CNSC: convocatoria docentes y directivos docentes 2026'),
      L('https://www.cnsc.gov.co/sites/default/files/2026-10/20261021_barranquilla_acuerdo-no.239.pdf', 'CNSC: Acuerdo 239 de 2026'),
      L('https://www.mineducacion.gov.co', 'Ministerio de Educación Nacional (MEN)'),
      L('https://simo.cnsc.gov.co', 'SIMO: inscripción y reclamaciones')]),
    h('p', { class: 'small', text: 'Fecha de corte de la información: noviembre 2026.' })));
}
function viewErrores() {
  var qs = errorQs();
  if (!qs.length) return render(h('section', { class: 'empty glass' }, h('a', { class: 'crumb', href: '#/', text: '← Inicio' }), h('h2', { text: '¡Sin errores pendientes!' }), h('p', { class: 'lead', text: 'Cuando falles una pregunta aparecerá aquí para que la repases. Si la aciertas, sale de la lista.' }), h('a', { class: 'btn primary', href: '#/', text: 'Ir a practicar' })));
  startSession({ mode: 'errores', title: 'Repasar errores', icon: '🔁', qs: shuffle(qs), again: '#/errores' });
}
function viewDia() {
  if (!Q.length) return notFound();
  var d = dayStr(), hsh = 0;
  for (var i = 0; i < d.length; i++) hsh = (hsh * 31 + d.charCodeAt(i)) >>> 0;
  var sorted = Q.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  startSession({ mode: 'dia', title: 'Pregunta del día', icon: '☀️', qs: [sorted[hsh % sorted.length]], again: '#/dia' });
}

/* ---------- router ---------- */
function route() {
  stopTimer();
  var hash = location.hash || '#/', p = hash.replace(/^#\/?/, '').split('/');
  if (!loaded) return render(h('p', { class: 'lead', text: 'Cargando…' }));
  var r = p[0];
  if (r !== 'resultados' && S && S.view === 'result') S = null;
  if (r === '' ) { S = null; return viewHome(); }
  if (r === 'tema') { S = null; return viewTema(decodeURIComponent(p[1] || '')); }
  if (r === 'simulacro') { if (S && S.mode === 'simulacro' && S.view === 'quiz') { return renderQuiz(); } return viewSimulacro(); }
  if (r === 'concurso') { S = null; return viewConcurso(); }
  if (r === 'errores') return viewErrores();
  if (r === 'dia') return viewDia();
  if (r === 'resultados') return viewResultados();
  notFound();
}
window.addEventListener('hashchange', function () {
  // salir de un quiz en curso al navegar a otra ruta
  var r = (location.hash.replace(/^#\/?/, '').split('/')[0]);
  if (S && S.view === 'quiz' && r !== 'resultados' && r !== 'simulacro') S = null;
  route();
});

/* ---------- teclado ---------- */
document.addEventListener('keydown', function (e) {
  if (!S || S.view !== 'quiz' || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-bg')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  var k = e.key, i = -1;
  if (/^[1-4]$/.test(k)) i = +k - 1; else if (/^[a-dA-D]$/.test(k)) i = k.toLowerCase().charCodeAt(0) - 97;
  if (i >= 0) { if (i < S.items[S.idx].q.opciones.length) { e.preventDefault(); choose(i); } return; }
  var it = S.items[S.idx];
  if (k === 'ArrowRight' || (k === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A')) {
    if (S.mode === 'simulacro' || it.done) { e.preventDefault(); next(); }
  } else if (k === 'ArrowLeft' && S.mode === 'simulacro' && S.idx > 0) { e.preventDefault(); S.idx--; renderQuiz(); }
});

/* ---------- tema claro/oscuro ---------- */
$('#theme').addEventListener('click', function () {
  var root = document.documentElement, cur = root.getAttribute('data-theme');
  if (!cur) cur = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  var nx = cur === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', nx);
  try { localStorage.setItem('profe-theme', nx); } catch (e) { /* ignorar */ }
});

/* ---------- inicio ---------- */
load(); updateChip();
route();
loadData().then(function () { updateChip(); route(); });
})();
