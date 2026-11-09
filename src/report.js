/* Отчёты: общий, индивидуальный, взаимные выборы. */
(function (root) {
  'use strict';
  var SM = root.SM, h = SM.util.h, U = SM.util, App = SM.app, calc = SM.calc, T = SM.texts;
  var fmt = calc.fmt;

  // tables - функция, возвращающая модели таблиц раздела (для меню «Копировать / PNG»)
  function section(title, content, cls, tables) {
    return h('section', { class: 'card report-sec ' + (cls || '') },
      h('div', { class: 'sec-head' }, h('h2', { class: 'card-title' }, title), tables ? tableMenu(title, tables) : null), content);
  }
  var openMenu = null;
  document.addEventListener('mousedown', function (e) { if (openMenu && !openMenu.contains(e.target)) { openMenu.classList.remove('open'); openMenu = null; } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openMenu) { openMenu.classList.remove('open'); openMenu = null; } });
  function tableMenu(title, getModels) {
    var TK = SM.tablekit;
    var wrap = h('div', { class: 'sec-menu no-print' });
    function close() { wrap.classList.remove('open'); openMenu = null; }
    var btn = h('button', { type: 'button', class: 'icon-btn sec-menu-btn', title: 'Копировать или скачать таблицу', 'aria-label': 'Действия с таблицей «' + title + '»', 'aria-haspopup': 'true', onclick: function () {
      var was = wrap.classList.contains('open');
      if (openMenu) openMenu.classList.remove('open');
      if (!was) { wrap.classList.add('open'); openMenu = wrap; } else openMenu = null;
    } }, '⋯');
    var list = h('div', { class: 'sec-menu-list', role: 'menu' },
      h('button', { type: 'button', role: 'menuitem', onclick: function () {
        close();
        var models = getModels();
        U.copyRich(TK.toHtml(models, !!App.bw), TK.toText(models))
          .then(function () { U.toast('Таблица скопирована - вставьте её в Word или Excel (Ctrl+V)'); })
          .catch(function (e) { U.toast('Не удалось скопировать: ' + e.message, 'error'); });
      } }, 'Копировать как таблицу'),
      h('button', { type: 'button', role: 'menuitem', onclick: function () {
        close();
        var models = getModels();
        models[0] = Object.assign({}, models[0], { title: title + (models[0].title ? ': ' + models[0].title : '') });
        // Promise внутри ClipboardItem, чтобы браузер не потерял «жест пользователя», пока рисуется картинка
        var png = TK.toPng(models, !!App.bw);
        var job = (navigator.clipboard && window.ClipboardItem)
          ? navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
          : Promise.reject(new Error('браузер не умеет копировать картинки'));
        job.then(function () { U.toast('Картинка таблицы скопирована - вставьте её в Word, презентацию или сообщение (Ctrl+V)'); })
          .catch(function (e) { U.toast('Не удалось скопировать картинку: ' + e.message + '. Используйте «Скачать PNG».', 'error'); });
      } }, 'Копировать PNG'),
      h('button', { type: 'button', role: 'menuitem', onclick: function () {
        close();
        var models = getModels();
        models[0] = Object.assign({}, models[0], { title: title + (models[0].title ? ': ' + models[0].title : '') });
        TK.toPng(models, !!App.bw).then(function (b) { U.download(b, safeName(title) + '.png'); });
      } }, 'Скачать PNG'));
    wrap.appendChild(btn); wrap.appendChild(list);
    return wrap;
  }

  // ---------- Модели таблиц (для копирования и PNG) ----------
  function mMatrix(an, ps) {
    var mc = mutualCounts(an);
    var rows = an.M.map(function (row, i) {
      return [{ t: i + 1, align: 'c' }, ps[i].name].concat(row.map(function (v, j) {
        if (i === j) return { t: '', kind: 'self' };
        return v === 1 ? { t: '+', kind: 'pos', align: 'c' } : v === -1 ? { t: '-', kind: 'neg', align: 'c' } : { t: '', align: 'c' };
      }));
    });
    var Rp = an.personal.map(function (p) { return p.Rp; }), Rn = an.personal.map(function (p) { return p.Rn; });
    [['Положительные', Rp], ['Отрицательные', Rn], ['Всего', Rp.map(function (x, k) { return x + Rn[k]; })],
      ['Всего взаимно-положительных', mc.mp], ['Всего взаимно-отрицательных', mc.mn]].forEach(function (f) {
      rows.push([{ t: f[0], span: 2, kind: f[0] === 'Всего' ? 'bold' : null }].concat(f[1].map(function (x) { return { t: x, align: 'c', kind: f[0] === 'Всего' ? 'bold' : null }; })));
    });
    return [{ head: [{ t: '№', align: 'c' }, 'ФИО'].concat(ps.map(function (p, j) { return { t: j + 1, align: 'c' }; })), rows: rows }];
  }
  function mPairs(A, ps) {
    return [{ head: ['Тип пары', 'Участник 1', 'Участник 2'], rows: pairsOf(A, ps) }];
  }
  function mPersonal(A, ps) {
    var a = A.main, P = !!A.perc;
    return [{ head: ['№', 'ФИО', 'Статус'].concat(P ? ['Перцептивный статус'] : [], ['R+', 'R-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд']).map(function (x, i) { return { t: x, align: i > 2 ? 'c' : null }; }),
      rows: a.personal.map(function (p, i) {
        return [{ t: i + 1, align: 'c' }, ps[i].name, calc.STATUS[p.status]].concat(P ? [calc.STATUS[A.perc.personal[i].status]] : [],
          [p.Rp, p.Rn].map(function (x) { return { t: x, align: 'c' }; }),
          [p.CiPos, p.CiNeg, p.Ci, p.EPos, p.ENeg, p.E, p.Kud].map(function (x) { return { t: fmt(x), align: 'c' }; }));
      }) }];
  }
  function mStatus(a, ps) {
    return [{ head: ['Статус', { t: 'Человек', align: 'c' }, { t: '%', align: 'c' }, 'Участники'], rows: calc.STATUS_ORDER.map(function (k) {
      var names = []; a.personal.forEach(function (p, i) { if (p.status === k) names.push(ps[i].name); });
      return [calc.STATUS[k], { t: a.statusCounts[k], align: 'c' }, { t: a.N ? Math.round(a.statusCounts[k] / a.N * 100) : 0, align: 'c' }, names.join(', ')];
    }) }];
  }
  function mGroup(an) {
    return [{ head: [{ t: '№', align: 'c' }, 'Индекс', { t: 'Значение', align: 'c' }, 'Что показывает'],
      rows: groupRows(an).map(function (g, i) { return [{ t: i + 1, align: 'c' }, g.name, { t: g.text, align: 'c', kind: 'bold' }, g.desc]; }) }];
  }
  function plural(n, a, b, c) { return T.plural(n, [a, b, c]); }
  function swatch(k, kind) { return SM.graph.statusSwatch(k, !!App.bw, kind || 'fill'); }
  // Словесное описание обозначений (для легенд в Word и подписей)
  var BW_FILL_DESC = { star: 'сплошная заливка', preferred: 'косая штриховка', accepted: 'точки', neglected: 'горизонтальные линии', rejected: 'сетка', isolated: 'без заливки' };
  var BW_RING_DESC = { star: 'двойная', preferred: 'толстая сплошная', accepted: 'тонкая', neglected: 'штрихами', rejected: 'крупными точками', isolated: 'тонкая серая' };
  var COLOR_DESC = { star: 'фиолетовый', preferred: 'синий', accepted: 'бирюзовый', neglected: 'оранжевый', rejected: 'красный', isolated: 'серый' };
  function nameList(ps, idxs) { return idxs.map(function (i) { return ps[i].name; }).join(', '); }
  function pairText(ps, pr) { return ps[pr[0]].name + ' - ' + ps[pr[1]].name; }

  function guard(container, proto) {
    if (proto.participants.length < 2) {
      container.appendChild(h('div', { class: 'card' }, h('p', null, 'Для отчёта нужно хотя бы два участника.'), h('a', { href: '#/p/' + encodeURIComponent(proto.id) }, 'Перейти к протоколу')));
      return false;
    }
    if (!App.hasChoices(proto)) {
      container.appendChild(h('div', { class: 'notice' }, 'Выборы ещё не заполнены - все показатели будут нулевыми. Заполните протокол на вкладке «Протокол».'));
    }
    return true;
  }

  function statusVars(a) {
    var tr = a.thresholds.rejected;
    return { thrStar: a.thresholds.star, thrPref: a.thresholds.preferred, thrRej: tr, mPlus: fmt(a.mPlus),
      rejPos: tr <= 1 ? 'положительных нет' : 'положительных нет или меньше ' + tr };
  }

  // ---------- Социоматрица ----------
  function matrixTable(a, ps) {
    var N = a.N, mp = [], mn = [], i;
    for (i = 0; i < N; i++) { mp.push(0); mn.push(0); }
    a.mutPos.forEach(function (p) { mp[p[0]]++; mp[p[1]]++; });
    a.mutNeg.forEach(function (p) { mn[p[0]]++; mn[p[1]]++; });
    var head = h('tr', null, h('th', { class: 'c' }, '№'), h('th', { class: 'th-name' }, 'ФИО'),
      ps.map(function (p, j) { return h('th', { class: 'c mx-h', title: p.name }, j + 1); }));
    var body = h('tbody');
    a.M.forEach(function (row, r) {
      body.appendChild(h('tr', null, h('td', { class: 'c' }, r + 1), h('td', { class: 'td-name' }, ps[r].name),
        row.map(function (v, c) {
          if (r === c) return h('td', { class: 'mx-self' });
          return h('td', { class: 'c ' + (v === 1 ? 'cell-pos' : v === -1 ? 'cell-neg' : '') }, v === 1 ? '+' : v === -1 ? '-' : '');
        })));
    });
    function foot(label, arr, cls) {
      return h('tr', { class: 'mx-foot ' + (cls || '') }, h('td', { colspan: 2 }, label), arr.map(function (x) { return h('td', { class: 'c' }, x); }));
    }
    var Rp = a.personal.map(function (p) { return p.Rp; }), Rn = a.personal.map(function (p) { return p.Rn; });
    var tfoot = h('tfoot', null,
      foot('Положительные', Rp), foot('Отрицательные', Rn),
      foot('Всего', Rp.map(function (x, k) { return x + Rn[k]; }), 'strong'),
      foot('Всего взаимно-положительных', mp), foot('Всего взаимно-отрицательных', mn));
    return h('div', { class: 'table-scroll' }, h('table', { class: 'tbl matrix' }, h('thead', null, head), body, tfoot));
  }

  function pairsBlock(A, ps) {
    var a = A.main;
    function list(title, items, render) {
      return h('div', { class: 'pairs-col' }, h('h3', null, title + ' (' + items.length + ')'),
        items.length ? h('ul', { class: 'plain' }, items.map(function (x) { return h('li', null, render(x)); })) : h('p', { class: 'muted' }, 'нет'));
    }
    return h('div', { class: 'pairs' },
      list('Взаимно-положительные', a.mutPos, function (p) { return pairText(ps, p); }),
      list('Взаимно-отрицательные', a.mutNeg, function (p) { return pairText(ps, p); }),
      list('Парадоксальные (+ в одну сторону, - в другую)', a.paradox, function (p) {
        return h('span', null, ps[p[0]].name, ' ', h('b', { class: 'pos' }, '+'), ' → ', ps[p[1]].name, ', обратно ', h('b', { class: 'neg' }, '-'));
      }),
      A.perc ? list('Взаимно-положительные перцептивные', A.perc.mutPos, function (p) { return pairText(ps, p); }) : null,
      A.perc ? list('Парадоксальные перцептивные', A.perc.paradox, function (p) {
        return h('span', null, ps[p[0]].name, ' ', h('b', { class: 'pos' }, '+p'), ' → ', ps[p[1]].name, ', обратно ', h('b', { class: 'neg' }, '-p'));
      }) : null);
  }

  function personalTable(A, proto) {
    var a = A.main, ps = proto.participants, P = !!A.perc;
    var head = h('tr', null, h('th', { class: 'c' }, '№'), h('th', { class: 'th-name' }, 'ФИО'), h('th', null, 'Статус'),
      P ? h('th', null, 'Перцептивный статус') : null,
      ['R+', 'R-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд'].map(function (x) { return h('th', { class: 'c' }, x); }));
    var body = h('tbody');
    a.personal.forEach(function (p, i) {
      var ps2 = P ? A.perc.personal[i].status : null;
      body.appendChild(h('tr', null, h('td', { class: 'c' }, i + 1),
        h('td', { class: 'td-name' }, h('a', { href: '#/p/' + encodeURIComponent(proto.id) + '/person/' + encodeURIComponent(ps[i].id) }, ps[i].name)),
        h('td', null, App.statusBadge(p.status)),
        P ? h('td', { class: ps2 !== p.status ? 'mismatch' : '' }, App.statusBadge(ps2), ps2 !== p.status ? h('span', { class: 'sr' }, ' (не совпадает)') : null) : null,
        h('td', { class: 'c' }, p.Rp), h('td', { class: 'c' }, p.Rn),
        [p.CiPos, p.CiNeg, p.Ci, p.EPos, p.ENeg, p.E, p.Kud].map(function (x) { return h('td', { class: 'c num' }, fmt(x)); })));
    });
    var legend = h('ul', { class: 'legend-list small' }, ['CiPos', 'CiNeg', 'Ci', 'EPos', 'ENeg', 'E', 'Kud'].map(function (k) { return h('li', null, T.get('pidx.' + k)); }));
    return h('div', null,
      h('div', { class: 'table-scroll' }, h('table', { class: 'tbl' }, h('thead', null, head), body)),
      P ? h('p', { class: 'muted small' }, App.bw ? 'Перцептивный статус, отличающийся от реального, выделен штриховкой.' : 'Перцептивный статус, отличающийся от реального, выделен цветом.') : null,
      h('p', { class: 'muted small' }, 'R+ и R- - число полученных положительных и отрицательных выборов. Щёлкните по ФИО, чтобы открыть индивидуальный отчёт.'),
      legend);
  }

  function statusBlock(a, ps) {
    var items = calc.STATUS_ORDER.map(function (k) {
      return { key: k, label: calc.STATUS[k], value: a.statusCounts[k], color: SM.graph.STATUS_COLORS[k] };
    });
    var who = h('div', { class: 'pie-who' }, h('p', { class: 'muted small no-print' }, 'Щёлкните по сектору диаграммы или строке таблицы, чтобы увидеть участников.'));
    function show(key) {
      var idxs = []; a.personal.forEach(function (p, i) { if (p.status === key) idxs.push(i); });
      who.innerHTML = '';
      who.appendChild(h('div', { class: 'pie-who-box' }, h('b', null, calc.STATUS[key] + ': '), idxs.length ? nameList(ps, idxs) : 'нет'));
    }
    var tbl = h('table', { class: 'tbl tbl-compact' }, h('thead', null, h('tr', null, h('th', null, 'Статус'), h('th', { class: 'c' }, 'Человек'), h('th', { class: 'c' }, '%'))),
      h('tbody', null, items.map(function (it) {
        return h('tr', { class: 'clickable', onclick: function () { show(it.key); } },
          h('td', null, swatch(it.key), it.label),
          h('td', { class: 'c' }, it.value), h('td', { class: 'c' }, a.N ? Math.round(it.value / a.N * 100) : 0));
      })));
    var sv = statusVars(a);
    return h('div', null,
      h('div', { class: 'pie-row' }, h('div', { class: 'pie-box' }, SM.graph.pie(items, show, { bw: !!App.bw })), h('div', { class: 'pie-side' }, tbl, who)),
      h('p', null, 'Среднее число выборов на одного участника: положительных - ', h('b', null, fmt(a.meanPosMade)), ', отрицательных - ', h('b', null, fmt(a.meanNegMade)), '.'),
      h('h3', null, 'Как определяется статус'),
      h('ul', { class: 'legend-list' }, calc.STATUS_ORDER.map(function (k) {
        return h('li', null, swatch(k), T.get('status.' + k, sv));
      })));
  }

  function groupRows(a) {
    var g = a.group;
    var na = 'не рассчитывается';
    function val(k) {
      switch (k) {
        case 'Gg': return g.Gg === null ? na : fmt(g.Gg) + ' (max ' + fmt(g.Ggmax) + ')';
        case 'largest': return g.largest === null ? na : fmt(g.largest) + ' (' + g.componentsCount + ' ' + plural(g.componentsCount, 'часть', 'части', 'частей') + ')';
        default: return g[k] === null ? na : fmt(g[k]);
      }
    }
    var vars = {
      Gg: { classic: fmt(g.GgClassic) }, Kg: { classic: fmt(g.KgClassic) }, largest: { count: g.componentsCount }
    };
    return calc.GROUP_INDEX_KEYS.map(function (k) {
      return { key: k, name: T.get('gname.' + k), text: val(k), value: g[k], desc: T.get('gidx.' + k, vars[k] || {}),
        extra: k === 'Gg' ? 'max ' + fmt(g.Ggmax) : k === 'largest' ? 'частей: ' + g.componentsCount : '' };
    });
  }
  function groupTable(a) {
    return h('div', { class: 'table-scroll' }, h('table', { class: 'tbl gidx' },
      h('thead', null, h('tr', null, h('th', { class: 'c' }, '№'), h('th', null, 'Индекс'), h('th', { class: 'c' }, 'Значение'), h('th', null, 'Что показывает'))),
      h('tbody', null, groupRows(a).map(function (r, i) {
        return h('tr', null, h('td', { class: 'c' }, i + 1), h('td', { class: 'gname' }, r.name),
          h('td', { class: 'c num strong nowrap' }, r.text), h('td', { class: 'small' }, r.desc));
      }))));
  }

  // ---------- Интерпретация ----------
  function interpData(A, proto) {
    var a = A.main, ps = proto.participants, N = a.N, c = a.counts, out = [];
    var idxWhere = function (f) { var r = []; a.personal.forEach(function (p, i) { if (f(p, i)) r.push(i); }); return r; };
    var pct = function (x) { return N ? Math.round(x / N * 100) : 0; };
    out.push(T.get('interp.intro', { name: proto.name, N: N }));
    var k = a.components.length;
    if (k <= 1) out.push(T.get('interp.connected', { N: N }));
    else out.push(T.get('interp.split', { k: k, nmax: a.Nmax, N: N, pct: pct(a.Nmax),
      multi: a.components.filter(function (x) { return x.length > 1; }).length,
      single: a.components.filter(function (x) { return x.length === 1; }).length }));
    if (c.noRecvPos > 0) out.push(T.get('interp.noRecv', { n: c.noRecvPos, names: nameList(ps, idxWhere(function (p) { return p.Rp === 0; })), chose: c.noRecvPosButChose, noTies: c.noPosTies }));
    else out.push(T.get('interp.allRecv'));
    if (c.noMutualPos > 0) out.push(T.get('interp.noMutual', { n: c.noMutualPos, N: N, names: nameList(ps, idxWhere(function (p) { return !p.mutualPos; })) }));
    else out.push(T.get('interp.allMutual'));
    if (a.Ln === 0) out.push(T.get('interp.noNeg'));
    else {
      if (a.Mn > 0) out.push(T.get('interp.mutNeg', { n: a.Mn, pairs: a.mutNeg.map(function (p) { return pairText(ps, p); }).join('; ') }));
      else out.push(T.get('interp.negNoMutual'));
      out.push(T.get('interp.negSpread', { n: c.gotNeg, pct: pct(c.gotNeg), vn: a.Vn }));
    }
    if (c.onlyNeg > 0) out.push(T.get('interp.onlyNeg', { n: c.onlyNeg, names: nameList(ps, idxWhere(function (p) { return p.Rn > 0 && p.Rp === 0; })) }));
    if (a.Q > 0) out.push(T.get('interp.paradox', { n: a.Q, pairs: a.paradox.map(function (p) { return ps[p[0]].name + ' (+) → ' + ps[p[1]].name + ' (-)'; }).join('; ') }));
    if (A.perc) {
      var diff = 0; a.personal.forEach(function (p, i) { if (p.status !== A.perc.personal[i].status) diff++; });
      out.push(T.get('interp.perc', { pmp: A.perc.Mp, mp: a.Mp, diff: diff, N: N,
        pneg: A.perc.counts.gotNeg, pvn: A.perc.Vn, ponly: A.perc.counts.onlyNeg }));
    }
    // Рекомендации
    return { paras: out, recs: calc.recommendations(a).map(function (r) { return T.get(r); }), disclaimer: T.get('interp.disclaimer') };
  }
  function interpretation(A, proto) {
    var d = interpData(A, proto);
    return h('div', { class: 'prose' },
      d.paras.map(function (t) { return h('p', null, t); }),
      d.recs.length ? [h('h3', null, 'Рекомендации'),
        h('ol', null, d.recs.map(function (r) { return h('li', null, r); }))] : null,
      h('p', { class: 'disclaimer' }, d.disclaimer));
  }

  // ---------- Социограммы ----------
  function edgesFor(a, ps, sign, opts) {
    opts = opts || {};
    var out = [], N = a.N;
    for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) {
      var x = a.M[i][j], y = a.M[j][i];
      var A = ps[i].id, B = ps[j].id;
      if (opts.only !== undefined && i !== opts.only && j !== opts.only) continue;
      if (x === sign && y === sign) out.push({ from: A, to: B, sign: sign, mutual: true });
      else if (!opts.mutualOnly) {
        if (x === sign) out.push({ from: A, to: B, sign: sign, mutual: false });
        if (y === sign) out.push({ from: B, to: A, sign: sign, mutual: false });
      }
    }
    return out;
  }
  function graphNodes(a, ps, filterIds) {
    var list = [];
    ps.forEach(function (p, i) {
      if (filterIds && !filterIds[p.id]) return;
      list.push({ id: p.id, name: p.name, photo: p.photo, status: a.personal[i].status });
    });
    return list;
  }
  function graph(proto, key, nodes, edges, extra) {
    proto.layouts = proto.layouts || {};
    var safe = proto.name.replace(/[\\/:*?"<>|]+/g, '_');
    return SM.graph.sociogram(Object.assign({
      nodes: nodes, edges: edges, layout: proto.layouts[key] || null, bw: !!App.bw,
      fileName: safe + ' - ' + (extra && extra.title || key),
      onSaveLayout: function (lay) {
        if (lay) proto.layouts[key] = lay; else delete proto.layouts[key];
        App.save(proto).then(function () { if (!lay) U.toast('Узлы возвращены на автоматические места'); });
      }
    }, extra || {}));
  }
  /* mode: 'single' - граф одного знака со стрелками (поясняем только взаимные связи);
     'mutual' - только взаимные связи одного знака (линии не поясняем);
     'all' - общий граф взаимных выборов (поясняем + и -). sign - знак для 'single'. */
  function graphLegend(mode, sign) {
    var negCls = 'lg-line neg dashed';
    var lines = mode === 'all'
      ? [h('span', { class: 'lg-item' }, h('i', { class: 'lg-line pos thick' }), 'взаимно-положительный выбор'),
        h('span', { class: 'lg-item' }, h('i', { class: negCls + ' thick' }), 'взаимно-отрицательный выбор (пунктир)')]
      : mode === 'single'
        ? [h('span', { class: 'lg-item' }, h('i', { class: (sign < 0 ? 'lg-line neg' + (App.bw ? ' dashed' : '') : 'lg-line pos') + ' thick' }), 'взаимный выбор (толще, стрелки с двух сторон)')]
        : [];
    return h('div', { class: 'graph-legend small' },
      lines.length ? h('div', { class: 'lg-row' }, lines) : null,
      h('div', { class: 'lg-row' }, (App.bw ? 'Вид обводки' : 'Цвет обводки') + ' - статус: ', calc.STATUS_ORDER.map(function (k) {
        return h('span', { class: 'lg-st' }, swatch(k, 'ring'), calc.STATUS[k]);
      })));
  }

  // ---------- Общий отчёт ----------
  function general(container, proto) {
    if (!guard(container, proto)) return;
    var A = calc.analyzeProtocol(proto), a = A.main, ps = proto.participants;
    container.appendChild(section('Социоматрица', h('div', null,
      h('p', { class: 'muted small' }, 'Строка - кто выбирает, столбец - кого выбрали. Итоговые строки внизу - полученные выборы.'),
      matrixTable(a, ps)), '', function () { return mMatrix(a, ps); }));
    if (A.perc) container.appendChild(section('Перцептивная социоматрица', matrixTable(A.perc, ps), '', function () { return mMatrix(A.perc, ps); }));
    container.appendChild(section('Пары', pairsBlock(A, ps), '', function () { return mPairs(A, ps); }));
    container.appendChild(section('Персональные индексы', personalTable(A, proto), '', function () { return mPersonal(A, ps); }));
    container.appendChild(section('Статусы в группе', statusBlock(a, ps), 'avoid-break', function () { return mStatus(a, ps); }));
    container.appendChild(section('Групповые индексы', groupTable(a), '', function () { return mGroup(a); }));
    if (A.perc) container.appendChild(section('Групповые индексы по перцептивным выборам', groupTable(A.perc), '', function () { return mGroup(A.perc); }));
    container.appendChild(section('Интерпретация и рекомендации', interpretation(A, proto)));
    container.appendChild(section('Социограмма положительных выборов', h('div', null,
      graph(proto, 'pos', graphNodes(a, ps), edgesFor(a, ps, 1), { title: 'положительные выборы' }), graphLegend('single', 1)), 'graph-sec'));
    container.appendChild(section('Социограмма отрицательных выборов', h('div', null,
      graph(proto, 'neg', graphNodes(a, ps), edgesFor(a, ps, -1), { title: 'отрицательные выборы' }), graphLegend('single', -1)), 'graph-sec'));
  }

  // ---------- Индивидуальный отчёт ----------
  function person(container, proto, pid) {
    if (!guard(container, proto)) return;
    var A = calc.analyzeProtocol(proto), a = A.main, ps = proto.participants;
    var i = ps.findIndex(function (p) { return p.id === pid; });
    if (i < 0) i = 0;
    var me = ps[i], pr = a.personal[i];
    var sel = h('select', { class: 'input', 'aria-label': 'Участник' }, ps.map(function (p, k) {
      return h('option', { value: p.id, selected: k === i }, (k + 1) + '. ' + p.name + ' - ' + calc.STATUS[a.personal[k].status]);
    }));
    sel.addEventListener('change', function () { location.hash = '#/p/' + encodeURIComponent(proto.id) + '/person/' + encodeURIComponent(sel.value); });
    container.appendChild(h('div', { class: 'card person-pick no-print' }, h('label', { class: 'field' }, h('span', null, 'Участник'), sel)));

    function who(f) { var r = []; ps.forEach(function (p, k) { if (k !== i && f(k)) r.push(p.name); }); return r.length ? r.join(', ') : 'нет'; }
    var M = a.M;
    var percSt = A.perc ? A.perc.personal[i].status : null;
    var head = h('div', { class: 'person-head' },
      me.photo ? h('img', { src: me.photo, class: 'person-photo', alt: '' }) : h('div', { class: 'person-photo ph' }, (me.name || '?').charAt(0)),
      h('div', null, h('h2', { class: 'person-name' }, me.name),
        h('div', { class: 'row-gap' }, App.statusBadge(pr.status),
          A.perc ? h('span', { class: percSt !== pr.status ? 'mismatch-inline' : '' }, 'перцептивный: ', App.statusBadge(percSt)) : null),
        h('p', { class: 'small muted' }, T.get('status.' + pr.status, statusVars(a)))));
    var idxTbl = h('div', { class: 'table-scroll' }, h('table', { class: 'tbl tbl-compact' },
      h('thead', null, h('tr', null, ['R+', 'R-', 'S+', 'S-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд'].map(function (x) { return h('th', { class: 'c' }, x); }))),
      h('tbody', null, h('tr', null, [pr.Rp, pr.Rn, pr.Sp, pr.Sn].map(function (x) { return h('td', { class: 'c' }, x); }),
        [pr.CiPos, pr.CiNeg, pr.Ci, pr.EPos, pr.ENeg, pr.E, pr.Kud].map(function (x) { return h('td', { class: 'c num' }, fmt(x)); })))));
    var dl = h('dl', { class: 'facts' },
      h('dt', null, 'Выбрал(а) положительно'), h('dd', null, who(function (k) { return M[i][k] === 1; })),
      h('dt', null, 'Выбрал(а) отрицательно'), h('dd', null, who(function (k) { return M[i][k] === -1; })),
      h('dt', null, 'Получил(а) положительные от'), h('dd', null, who(function (k) { return M[k][i] === 1; })),
      h('dt', null, 'Получил(а) отрицательные от'), h('dd', null, who(function (k) { return M[k][i] === -1; })),
      h('dt', null, 'Взаимные положительные'), h('dd', null, who(function (k) { return M[k][i] === 1 && M[i][k] === 1; })),
      h('dt', null, 'Взаимные отрицательные'), h('dd', null, who(function (k) { return M[k][i] === -1 && M[i][k] === -1; })));
    var facts = [['Выбрал(а) положительно', function (k) { return M[i][k] === 1; }], ['Выбрал(а) отрицательно', function (k) { return M[i][k] === -1; }],
      ['Получил(а) положительные от', function (k) { return M[k][i] === 1; }], ['Получил(а) отрицательные от', function (k) { return M[k][i] === -1; }],
      ['Взаимные положительные', function (k) { return M[k][i] === 1 && M[i][k] === 1; }], ['Взаимные отрицательные', function (k) { return M[k][i] === -1 && M[i][k] === -1; }]];
    container.appendChild(section('Индексы участника', h('div', null, head, idxTbl, dl,
      h('ul', { class: 'legend-list small' }, ['CiPos', 'CiNeg', 'Ci', 'EPos', 'ENeg', 'E', 'Kud'].map(function (k) { return h('li', null, T.get('pidx.' + k)); }))), 'avoid-break', function () {
      return [{ title: me.name + ' - ' + calc.STATUS[pr.status], head: ['R+', 'R-', 'S+', 'S-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд'].map(function (x) { return { t: x, align: 'c' }; }),
        rows: [[pr.Rp, pr.Rn, pr.Sp, pr.Sn].map(function (x) { return { t: x, align: 'c' }; }).concat([pr.CiPos, pr.CiNeg, pr.Ci, pr.EPos, pr.ENeg, pr.E, pr.Kud].map(function (x) { return { t: fmt(x), align: 'c' }; }))] },
        { head: null, rows: facts.map(function (f) { return [{ t: f[0], kind: 'bold' }, who(f[1])]; }) }];
    }));

    function ego(sign) {
      var eg = calc.egoEdges(a.M, i, sign), ids = {};
      eg.nodes.forEach(function (k) { ids[ps[k].id] = true; });
      var edges = eg.edges.map(function (e) { return { from: ps[e.from].id, to: ps[e.to].id, sign: sign, mutual: e.mutual }; });
      return graph(proto, 'ego' + (sign > 0 ? 'pos-' : 'neg-') + me.id, graphNodes(a, ps, ids), edges,
        { title: me.name + (sign > 0 ? ' - положительные' : ' - отрицательные') });
    }
    container.appendChild(section('Социограмма положительных выборов участника', h('div', null, ego(1), graphLegend('single', 1)), 'graph-sec'));
    container.appendChild(section('Социограмма отрицательных выборов участника', h('div', null, ego(-1), graphLegend('single', -1)), 'graph-sec'));
  }

  // ---------- Взаимные выборы ----------
  function mutual(container, proto) {
    if (!guard(container, proto)) return;
    var A = calc.analyzeProtocol(proto), a = A.main, ps = proto.participants;
    var pos = edgesFor(a, ps, 1, { mutualOnly: true }), neg = edgesFor(a, ps, -1, { mutualOnly: true });
    container.appendChild(section('Взаимно-положительные выборы (' + pos.length + ')', h('div', null,
      graph(proto, 'mutpos', graphNodes(a, ps), pos, { title: 'взаимно-положительные', emptyText: 'Нет взаимных положительных выборов.' }), graphLegend('mutual')), 'graph-sec'));
    container.appendChild(section('Взаимно-отрицательные выборы (' + neg.length + ')', h('div', null,
      graph(proto, 'mutneg', graphNodes(a, ps), neg, { title: 'взаимно-отрицательные' }), graphLegend('mutual')), 'graph-sec'));
    container.appendChild(section('Общая социограмма взаимных выборов', h('div', null,
      h('p', { class: 'muted small' }, 'Отрицательные связи показаны пунктиром, чтобы их было видно и при чёрно-белой печати.'),
      graph(proto, 'mutall', graphNodes(a, ps), pos.concat(neg), { title: 'взаимные выборы', dashedNegative: true }), graphLegend('all')), 'graph-sec'));
  }


  // =================== Экспорт в Word и Excel ===================
  function safeName(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'отчёт'; }
  function pairsOf(A, ps) {
    var a = A.main, out = [];
    a.mutPos.forEach(function (p) { out.push(['Взаимно-положительная', ps[p[0]].name, ps[p[1]].name]); });
    a.mutNeg.forEach(function (p) { out.push(['Взаимно-отрицательная', ps[p[0]].name, ps[p[1]].name]); });
    a.paradox.forEach(function (p) { out.push(['Парадоксальная (+ первым, - в ответ)', ps[p[0]].name, ps[p[1]].name]); });
    if (A.perc) {
      A.perc.mutPos.forEach(function (p) { out.push(['Взаимно-положительная перцептивная', ps[p[0]].name, ps[p[1]].name]); });
      A.perc.paradox.forEach(function (p) { out.push(['Парадоксальная перцептивная', ps[p[0]].name, ps[p[1]].name]); });
    }
    return out;
  }
  function mutualCounts(a) {
    var mp = [], mn = [], i;
    for (i = 0; i < a.N; i++) { mp.push(0); mn.push(0); }
    a.mutPos.forEach(function (p) { mp[p[0]]++; mp[p[1]]++; });
    a.mutNeg.forEach(function (p) { mn[p[0]]++; mn[p[1]]++; });
    return { mp: mp, mn: mn };
  }

  // ---------- Excel ----------
  // Цвета и узоры статусов для диаграммы Excel
  var XL_COLORS = { star: '7C3AED', preferred: '2563EB', accepted: '0D9488', neglected: 'D97706', rejected: 'DC2626', isolated: '6B7280' };
  var XL_PATTERNS = { star: { color: '111111' }, preferred: { pattern: 'wdUpDiag' }, accepted: { pattern: 'pct20' }, neglected: { pattern: 'narHorz' }, rejected: { pattern: 'smGrid' }, isolated: { color: 'FFFFFF' } };
  // Социограммы для Excel: строим отчёты во временном невидимом блоке (с сохранённой раскладкой)
  function offscreenGraphs(proto) {
    var box = h('div', { style: 'position:absolute;left:-10000px;top:0;width:1000px', 'aria-hidden': 'true' });
    document.body.appendChild(box);
    var g1 = h('div'), g2 = h('div');
    box.appendChild(g1); box.appendChild(g2);
    general(g1, proto); mutual(g2, proto);
    var wraps = Array.prototype.slice.call(g1.querySelectorAll('.sgram')).concat(Array.prototype.slice.call(g2.querySelectorAll('.sgram')));
    return Promise.all(wraps.map(function (w) { return w._png ? w._png() : null; }))
      .then(function (r) { box.remove(); return r; }, function (e) { box.remove(); throw e; });
  }
  function exportXlsx(proto) {
    var A = calc.analyzeProtocol(proto), a = A.main, ps = proto.participants, N = a.N, X = SM.exporter, BWX = !!App.bw;
    if (ps.length < 2) { U.toast('Для выгрузки нужно хотя бы два участника.', 'warn'); return; }
    U.toast('Готовлю файл Excel...');
    var r2 = function (x) { return x === null || x === undefined || !isFinite(x) ? 'не рассчитывается' : { v: calc.round2(x), s: 'num' }; };
    function choicesSheet(name, an) {
      var rows = [[{ v: '№', s: 'h' }, { v: 'ФИО', s: 'h' }].concat(ps.map(function (p, j) { return { v: j + 1, s: 'h' }; }))];
      an.M.forEach(function (row, i) {
        rows.push([i + 1, ps[i].name].concat(row.map(function (v, j) { return i === j ? '' : v === 1 ? '+' : v === -1 ? '-' : ''; })));
      });
      return { name: name, rows: rows, widths: [5, 28].concat(ps.map(function () { return 4; })), freeze: { row: 1, col: 2 } };
    }
    function matrixSheet(name, an) {
      var sh = choicesSheet(name, an), mc = mutualCounts(an);
      sh.rows = sh.rows.map(function (row, i) {
        if (!i) return row;
        return row.map(function (c, j) { return j > 1 && c === '+' ? { v: '+', s: BWX ? 'posbw' : 'pos' } : j > 1 && c === '-' ? { v: '-', s: BWX ? 'negbw' : 'neg' } : c; });
      });
      var Rp = an.personal.map(function (p) { return p.Rp; }), Rn = an.personal.map(function (p) { return p.Rn; });
      sh.rows.push([]);
      [['Положительные', Rp], ['Отрицательные', Rn], ['Всего', Rp.map(function (x, k) { return x + Rn[k]; })],
        ['Всего взаимно-положительных', mc.mp], ['Всего взаимно-отрицательных', mc.mn]].forEach(function (f) {
        sh.rows.push(['', { v: f[0], s: 'b' }].concat(f[1]));
      });
      return sh;
    }
    var sheets = [choicesSheet('Выборы', a)];
    if (A.perc) sheets.push(choicesSheet('Перцептивные выборы', A.perc));
    sheets.push(matrixSheet('Социоматрица', a));
    if (A.perc) sheets.push(matrixSheet('Перцептивная социоматрица', A.perc));
    var ph = ['№', 'ФИО', 'Статус'].concat(A.perc ? ['Перцептивный статус'] : [], ['R+', 'R-', 'S+', 'S-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд']);
    var prow = [ph.map(function (x) { return { v: x, s: 'h' }; })];
    a.personal.forEach(function (p, i) {
      prow.push([i + 1, ps[i].name, calc.STATUS[p.status]].concat(A.perc ? [calc.STATUS[A.perc.personal[i].status]] : [],
        [p.Rp, p.Rn, p.Sp, p.Sn], [p.CiPos, p.CiNeg, p.Ci, p.EPos, p.ENeg, p.E, p.Kud].map(r2)));
    });
    sheets.push({ name: 'Персональные индексы', rows: prow, widths: [5, 28, 16].concat(A.perc ? [20] : [], [6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7]), freeze: { row: 1, col: 2 } });
    var gr = groupRows(a), gp = A.perc ? groupRows(A.perc) : null;
    var grows = [['№', 'Индекс', 'Значение', 'Дополнительно'].concat(gp ? ['Перцептивные', 'Дополнительно (перц.)'] : [], ['Что показывает']).map(function (x) { return { v: x, s: 'h' }; })];
    gr.forEach(function (r, i) {
      grows.push([i + 1, r.name, r2(r.value), r.extra].concat(gp ? [r2(gp[i].value), gp[i].extra] : [], [{ v: r.desc, s: 'wrap' }]));
    });
    sheets.push({ name: 'Групповые индексы', rows: grows, widths: [5, 38, 12, 14].concat(gp ? [13, 18] : [], [80]), freeze: { row: 1, col: 0 } });
    var pr = [['Тип пары', 'Участник 1', 'Участник 2'].map(function (x) { return { v: x, s: 'h' }; })].concat(pairsOf(A, ps));
    sheets.push({ name: 'Пары', rows: pr, widths: [36, 28, 28] });
    var srows = [['Статус', 'Человек', '%', 'Участники'].map(function (x) { return { v: x, s: 'h' }; })];
    calc.STATUS_ORDER.forEach(function (k) {
      var names = []; a.personal.forEach(function (p, i) { if (p.status === k) names.push(ps[i].name); });
      srows.push([calc.STATUS[k], a.statusCounts[k], N ? Math.round(a.statusCounts[k] / N * 100) : 0, { v: names.join(', '), s: 'wrap' }]);
    });
    srows.push([]);
    srows.push(['Среднее число положительных выборов', r2(a.meanPosMade)]);
    srows.push(['Среднее число отрицательных выборов', r2(a.meanNegMade)]);
    sheets.push({ name: 'Статусы', rows: srows, widths: [38, 10, 7, 80], drawings: [{
      type: 'chart', from: { col: 0, row: 12 }, to: { col: 3, row: 32 },
      chart: { title: 'Статусы в группе', series: 'Человек', catRange: '$A$2:$A$7', valRange: '$B$2:$B$7',
        cats: calc.STATUS_ORDER.map(function (k) { return calc.STATUS[k]; }),
        vals: calc.STATUS_ORDER.map(function (k) { return a.statusCounts[k]; }),
        fills: calc.STATUS_ORDER.map(function (k) { return BWX ? XL_PATTERNS[k] : { color: XL_COLORS[k] }; }),
        line: BWX ? '111111' : 'FFFFFF' } }] });
    var d = interpData(A, proto), irows = [[{ v: 'Интерпретация', s: 'b' }]];
    d.paras.forEach(function (t) { irows.push([{ v: t, s: 'wrap' }]); });
    if (d.recs.length) { irows.push([]); irows.push([{ v: 'Рекомендации', s: 'b' }]); d.recs.forEach(function (t, i) { irows.push([{ v: (i + 1) + '. ' + t, s: 'wrap' }]); }); }
    irows.push([]); irows.push([{ v: d.disclaimer, s: 'wrap' }]);
    sheets.push({ name: 'Интерпретация', rows: irows, widths: [120] });
    return offscreenGraphs(proto).then(function (imgs) {
      var titles = ['Социограмма положительных выборов', 'Социограмма отрицательных выборов', 'Взаимно-положительные выборы',
        'Взаимно-отрицательные выборы', 'Общая социограмма взаимных выборов (отрицательные - пунктир)'];
      var rows = [], drawings = [], r = 0;
      imgs.forEach(function (im, k) {
        if (!im) return;
        rows[r] = [{ v: titles[k], s: 'title' }];
        var hpx = Math.round(620 * im.h / im.w);
        drawings.push({ type: 'image', blob: im.blob, w: im.w, h: im.h, widthPx: 620, from: { col: 0, row: r + 1 } });
        r += Math.ceil(hpx / 20) + 3;
      });
      rows[r] = [{ v: '' + (BWX ? 'Обводка узла - статус: ' + calc.STATUS_ORDER.map(function (k) { return calc.STATUS[k].toLowerCase() + ' - ' + BW_RING_DESC[k]; }).join('; ') + '.' : 'Цвет обводки узла - статус.'), s: 'wrap' }];
      for (var i = 0; i < r; i++) if (!rows[i]) rows[i] = [];
      sheets.push({ name: 'Социограммы', rows: rows, widths: [100], drawings: drawings });
      return X.xlsx(sheets);
    }).then(function (blob) {
      U.download(blob, safeName(proto.name) + ' - данные.xlsx');
      U.toast('Файл Excel сохранён. Лист «Выборы» можно загрузить обратно как файл с выборами.');
    }).catch(function (e) { U.toast('Не удалось сделать файл Excel: ' + e.message, 'error'); });
  }

  // ---------- Word ----------
  function docStyle(bw) {
    return {
      pos: bw ? null : { shade: 'E3F6E9' },
      neg: bw ? null : { shade: 'FDECEC' },
      self: bw ? { shade: 'DCDCDC' } : { shade: 'EEEEEE' },
      mismatch: bw ? { pattern: 'pct10' } : { shade: 'FFF3D6' },
      disc: bw ? { shade: 'F2F2F2', border: '000000' } : { shade: 'F0F9DC', border: 'A1C42C' }
    };
  }
  function docHeader(doc, proto, title) {
    doc.p([{ t: 'Linx', b: true }, { t: ' - социометрия', color: '666666' }], { spacing: 60, run: { size: 9 } });
    doc.h1(title || proto.name);
    doc.p('Участников: ' + proto.participants.length + '. Дата протокола: ' + U.fmtDate(proto.created) + '. Отчёт сформирован ' + U.fmtDateTime(new Date().toISOString()) + '.' + (App.bw ? ' Чёрно-белая версия.' : ''), { run: { color: '555555', size: 9 } });
  }
  function docMatrix(doc, an, ps, st) {
    var N = an.N, mc = mutualCounts(an), size = N > 20 ? 7 : N > 12 ? 8 : 9;
    var rows = [[{ t: '№', align: 'center' }, 'ФИО'].concat(ps.map(function (p, j) { return { t: String(j + 1), align: 'center' }; }))];
    an.M.forEach(function (row, i) {
      rows.push([{ t: String(i + 1), align: 'center' }, ps[i].name].concat(row.map(function (v, j) {
        if (i === j) return Object.assign({ t: '' }, st.self);
        var c = { t: v === 1 ? '+' : v === -1 ? '-' : '', align: 'center', b: !!v };
        return Object.assign(c, v === 1 ? st.pos : v === -1 ? st.neg : null);
      })));
    });
    var Rp = an.personal.map(function (p) { return p.Rp; }), Rn = an.personal.map(function (p) { return p.Rn; });
    [['Положительные', Rp], ['Отрицательные', Rn], ['Всего', Rp.map(function (x, k) { return x + Rn[k]; })],
      ['Всего взаимно-положительных', mc.mp], ['Всего взаимно-отрицательных', mc.mn]].forEach(function (f) {
      rows.push([{ t: f[0], span: 2, b: f[0] === 'Всего' }].concat(f[1].map(function (x) { return { t: String(x), align: 'center', b: f[0] === 'Всего' }; })));
    });
    var nameW = N > 20 ? 16 : N > 12 ? 20 : 24;
    // ширина: № и ФИО фиксированы, клетки по ~0,9 см; на большую группу - во всю страницу
    var cell = 520, wNum = 450, wName = N > 20 ? 2300 : 2900;
    var total = Math.min(doc.contentW, wNum + wName + N * cell);
    var rest = (total - wNum - wName) / N;
    doc.table(rows, { header: 1, widthsTw: [wNum, wName].concat(ps.map(function () { return rest; })), size: size });
  }
  function docLegendGraph(doc, mode) {
    var bw = !!App.bw;
    var line = mode === 'all' ? 'Сплошная линия - взаимно-положительный выбор, пунктир - взаимно-отрицательный.'
      : mode === 'mutual' ? '' : 'Стрелка - направление выбора. Толстая линия со стрелками с двух сторон - взаимный выбор.';
    if (line) doc.p(line, { run: { size: 9, color: '444444' }, spacing: 40 });
    doc.p((bw ? 'Обводка узла показывает статус: ' : 'Цвет обводки показывает статус: ') + calc.STATUS_ORDER.map(function (k) {
      return calc.STATUS[k].toLowerCase() + ' - ' + (bw ? BW_RING_DESC[k] : COLOR_DESC[k]);
    }).join('; ') + '.', { run: { size: 9, color: '444444' } });
  }
  function graphImages(container) {
    return Promise.all(Array.prototype.map.call(container.querySelectorAll('.sgram'), function (w) { return w._png ? w._png() : null; }));
  }

  function exportDocx(view, proto, container, pid) {
    var X = SM.exporter, ps = proto.participants;
    if (ps.length < 2) { U.toast('Для отчёта нужно хотя бы два участника.', 'warn'); return; }
    var A = calc.analyzeProtocol(proto), a = A.main, st = docStyle(!!App.bw);
    var doc = new X.Doc({ landscape: view === 'report' && a.N > 14 });
    U.toast('Готовлю документ Word...');
    var pieSvg = container.querySelector('.pie-svg');
    var icons = Promise.all(calc.STATUS_ORDER.map(function (k) {
      return SM.graph.renderPng(SM.graph.statusSwatch(k, !!App.bw, 'fill'), { x: 0, y: 0, w: 16, h: 16 }, 64);
    }));
    return Promise.all([graphImages(container), pieSvg && pieSvg._png ? pieSvg._png() : null, icons]).then(function (res) {
      var imgs = res[0], pieImg = res[1], icon = {}, fname;
      calc.STATUS_ORDER.forEach(function (k, i) { icon[k] = res[2][i]; });
      if (view === 'report') {
        docHeader(doc, proto);
        doc.h2('Социоматрица');
        doc.p('Строка - кто выбирает, столбец - кого выбрали. Итоговые строки внизу - полученные выборы.', { run: { size: 9, color: '555555' } });
        docMatrix(doc, a, ps, st);
        if (A.perc) { doc.h2('Перцептивная социоматрица'); docMatrix(doc, A.perc, ps, st); }
        doc.h2('Пары');
        var groups = [['Взаимно-положительные', a.mutPos, ' - '], ['Взаимно-отрицательные', a.mutNeg, ' - '], ['Парадоксальные (+ в одну сторону, - в другую)', a.paradox, ' (+) → ']];
        if (A.perc) groups.push(['Взаимно-положительные перцептивные', A.perc.mutPos, ' - '], ['Парадоксальные перцептивные', A.perc.paradox, ' (+p) → ']);
        groups.forEach(function (g) {
          doc.h3(g[0] + ' (' + g[1].length + ')');
          if (!g[1].length) doc.p('нет', { run: { color: '777777' } });
          g[1].forEach(function (p) { doc.item('•', ps[p[0]].name + g[2] + ps[p[1]].name + (g[2].indexOf('+p') >= 0 ? ' (-p)' : g[2].indexOf('→') >= 0 ? ' (-)' : '')); });
        });
        doc.h2('Персональные индексы');
        var hd = ['№', 'ФИО', 'Статус'].concat(A.perc ? ['Перц. статус'] : [], ['R+', 'R-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд']);
        var rows = [hd.map(function (x, i) { return { t: x, align: i > 2 ? 'center' : null }; })];
        a.personal.forEach(function (p, i) {
          var pst = A.perc ? A.perc.personal[i].status : null;
          rows.push([{ t: String(i + 1), align: 'center' }, ps[i].name, calc.STATUS[p.status]].concat(
            A.perc ? [Object.assign({ t: calc.STATUS[pst] }, pst !== p.status ? st.mismatch : null)] : [],
            [p.Rp, p.Rn].map(function (x) { return { t: String(x), align: 'center' }; }),
            [p.CiPos, p.CiNeg, p.Ci, p.EPos, p.ENeg, p.E, p.Kud].map(function (x) { return { t: fmt(x), align: 'center' }; })));
        });
        doc.table(rows, { header: 1, widths: [3, 20, 13].concat(A.perc ? [13] : [], [5, 5, 6, 6, 6, 6, 6, 6, 6]), size: 9 });
        ['CiPos', 'CiNeg', 'Ci', 'EPos', 'ENeg', 'E', 'Kud'].forEach(function (k) { doc.p(T.get('pidx.' + k), { run: { size: 9, color: '444444' }, spacing: 20 }); });
        doc.h2('Статусы в группе');
        if (pieImg) doc.image(pieImg, 0.4);
        var srows = [[{ t: 'Статус' }, { t: 'Обозначение на диаграмме' }, { t: 'Человек', align: 'center' }, { t: '%', align: 'center' }, { t: 'Участники' }]];
        calc.STATUS_ORDER.forEach(function (k) {
          var names = []; a.personal.forEach(function (p, i) { if (p.status === k) names.push(ps[i].name); });
          srows.push([calc.STATUS[k], { t: App.bw ? BW_FILL_DESC[k] : COLOR_DESC[k], icon: icon[k] }, { t: String(a.statusCounts[k]), align: 'center' },
            { t: String(a.N ? Math.round(a.statusCounts[k] / a.N * 100) : 0), align: 'center' }, names.join(', ')]);
        });
        doc.table(srows, { header: 1, widths: [15, 27, 9, 6, 43], size: 9 });
        doc.p('Среднее число выборов на одного участника: положительных - ' + fmt(a.meanPosMade) + ', отрицательных - ' + fmt(a.meanNegMade) + '.');
        doc.h3('Как определяется статус');
        var sv = statusVars(a);
        calc.STATUS_ORDER.forEach(function (k) { doc.item('•', T.get('status.' + k, sv)); });
        function gTable(an) {
          var r = [[{ t: '№', align: 'center' }, 'Индекс', { t: 'Значение', align: 'center' }, 'Что показывает']];
          groupRows(an).forEach(function (g, i) { r.push([{ t: String(i + 1), align: 'center' }, { t: g.name, b: true }, { t: g.text, align: 'center', b: true }, { t: g.desc, size: 8 }]); });
          doc.table(r, { header: 1, widths: [4, 26, 14, 56], size: 9 });
        }
        doc.h2('Групповые индексы'); gTable(a);
        if (A.perc) { doc.h2('Групповые индексы по перцептивным выборам'); gTable(A.perc); }
        doc.h2('Интерпретация и рекомендации');
        var d = interpData(A, proto);
        d.paras.forEach(function (t) { doc.p(t); });
        if (d.recs.length) { doc.h3('Рекомендации'); d.recs.forEach(function (t, i) { doc.item((i + 1) + '.', t); }); }
        doc.p(d.disclaimer, { shade: st.disc.shade, border: st.disc.border });
        if (imgs[0]) { doc.h2('Социограмма положительных выборов', { pageBreak: true }); doc.image(imgs[0]); docLegendGraph(doc, 'single'); }
        if (imgs[1]) { doc.h2('Социограмма отрицательных выборов', { pageBreak: true }); doc.image(imgs[1]); docLegendGraph(doc, 'single'); }
        fname = safeName(proto.name) + ' - отчёт.docx';
      } else if (view === 'person') {
        var i = ps.findIndex(function (p) { return p.id === pid; }); if (i < 0) i = 0;
        var me = ps[i], pr = a.personal[i], M = a.M;
        docHeader(doc, proto, me.name);
        doc.p([{ t: 'Протокол: ' }, { t: proto.name, b: true }, { t: '. Статус: ' }, { t: calc.STATUS[pr.status], b: true },
          A.perc ? { t: '. Перцептивный статус: ' + calc.STATUS[A.perc.personal[i].status] } : null, { t: '.' }]);
        doc.p(T.get('status.' + pr.status, statusVars(a)), { run: { color: '444444' } });
        doc.h2('Индексы участника');
        var hdr = ['R+', 'R-', 'S+', 'S-', 'Ci+', 'Ci-', 'Ci', 'E+', 'E-', 'E', 'Куд'];
        doc.table([hdr.map(function (x) { return { t: x, align: 'center' }; }),
          [pr.Rp, pr.Rn, pr.Sp, pr.Sn].map(function (x) { return { t: String(x), align: 'center' }; }).concat(
            [pr.CiPos, pr.CiNeg, pr.Ci, pr.EPos, pr.ENeg, pr.E, pr.Kud].map(function (x) { return { t: fmt(x), align: 'center' }; }))], { header: 1, size: 10 });
        var who = function (f) { var r = []; ps.forEach(function (p, k) { if (k !== i && f(k)) r.push(p.name); }); return r.length ? r.join(', ') : 'нет'; };
        doc.table([
          ['Выбрал(а) положительно', who(function (k) { return M[i][k] === 1; })],
          ['Выбрал(а) отрицательно', who(function (k) { return M[i][k] === -1; })],
          ['Получил(а) положительные от', who(function (k) { return M[k][i] === 1; })],
          ['Получил(а) отрицательные от', who(function (k) { return M[k][i] === -1; })],
          ['Взаимные положительные', who(function (k) { return M[k][i] === 1 && M[i][k] === 1; })],
          ['Взаимные отрицательные', who(function (k) { return M[k][i] === -1 && M[i][k] === -1; })]
        ].map(function (r) { return [{ t: r[0], b: true }, r[1]]; }), { widths: [30, 70], size: 10 });
        ['CiPos', 'CiNeg', 'Ci', 'EPos', 'ENeg', 'E', 'Kud'].forEach(function (k) { doc.p(T.get('pidx.' + k), { run: { size: 9, color: '444444' }, spacing: 20 }); });
        if (imgs[0]) { doc.h2('Социограмма положительных выборов участника', { pageBreak: true }); doc.image(imgs[0]); docLegendGraph(doc, 'single'); }
        if (imgs[1]) { doc.h2('Социограмма отрицательных выборов участника', { pageBreak: true }); doc.image(imgs[1]); docLegendGraph(doc, 'single'); }
        fname = safeName(proto.name) + ' - ' + safeName(me.name) + '.docx';
      } else {
        docHeader(doc, proto, proto.name + ': взаимные выборы');
        var titles = ['Взаимно-положительные выборы', 'Взаимно-отрицательные выборы', 'Общая социограмма взаимных выборов'];
        imgs.forEach(function (im, k) {
          if (!im) return;
          doc.h2(titles[k], { pageBreak: k > 0 });
          doc.image(im); docLegendGraph(doc, k === 2 ? 'all' : 'mutual');
        });
        fname = safeName(proto.name) + ' - взаимные выборы.docx';
      }
      return doc.build().then(function (blob) { U.download(blob, fname); U.toast('Документ Word сохранён'); });
    }).catch(function (e) { U.toast('Не удалось сделать документ: ' + e.message, 'error'); });
  }

  SM.report = { general: general, person: person, mutual: mutual, exportDocx: exportDocx, exportXlsx: exportXlsx };
})(window);
