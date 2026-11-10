/* Социограммы и круговая диаграмма на собственном SVG. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var uid = 0;
  var COLORS = { pos: '#15803d', neg: '#dc2626' };
  var STATUS_COLORS = {
    star: '#7c3aed', preferred: '#2563eb', accepted: '#0d9488',
    neglected: '#d97706', rejected: '#dc2626', isolated: '#6b7280'
  };
  var R0 = 28, RMAX = 40; // радиус узла: обычный и предельный для длинных имён

  // Ширина текста в пикселях (через canvas; без него - грубая оценка)
  var mctx = null;
  function textWidth(str, size, bold) {
    try {
      if (!mctx) mctx = document.createElement('canvas').getContext('2d');
      mctx.font = (bold ? '600 ' : '400 ') + size + 'px "Segoe UI", Arial, sans-serif';
      return mctx.measureText(str).width;
    } catch (e) { return str.length * size * 0.6; }
  }
  // Подпись внутри круга: строки, их ширина при 10px и вертикальный размах
  function labelBox(name) {
    var ls = splitName(name);
    var w = Math.max.apply(null, ls.map(function (ln, i) { return textWidth(ln, 10, !i); }));
    return { lines: ls, w: w, ymax: ls.length === 1 ? 8 : 12 };
  }
  // Общий радиус узлов социограммы: растёт под самое длинное имя (до RMAX)
  function nodeRadius(nodes) {
    // в большой группе круги меньше, чтобы они не наползали друг на друга (длинное имя тогда мельче или обрезается)
    var n = nodes.length, rmax = n > 30 ? 32 : n > 20 ? 36 : RMAX;
    var r = R0;
    nodes.forEach(function (n) {
      if (n.photo) return;
      var b = labelBox(n.name);
      r = Math.max(r, Math.sqrt(Math.pow(b.w / 2 + 4, 2) + b.ymax * b.ymax));
    });
    return Math.min(rmax, Math.ceil(r));
  }

  /* Чёрно-белый режим. Статус в ЧБ кодируется:
     - в круговой диаграмме и легендах - штриховкой (как узоры заливки в Word);
     - на социограммах - видом обводки узла. */
  var BW_PATTERNS = {
    star: { type: 'solid' },
    preferred: { type: 'diag' },
    accepted: { type: 'dots' },
    neglected: { type: 'horiz' },
    rejected: { type: 'cross' },
    isolated: { type: 'empty' }
  };
  // Обводка узла в ЧБ: для узла (радиус 31) и для значка в легенде (радиус 11) - отдельно,
  // чтобы рисунок оставался различимым и в маленьком размере
  var BW_RINGS = {
    star: { w: 4, dash: null, double: true },
    preferred: { w: 4, dash: null },
    accepted: { w: 1.3, dash: null },
    neglected: { w: 3, dash: '12 7' },
    rejected: { w: 4.5, dash: '0.1 7.5' },
    isolated: { w: 1.3, dash: null, color: '#8c8c8c' }
  };
  var BW_SWATCH = {
    star: { w: 2.4, dash: null, double: true },
    preferred: { w: 2.8, dash: null },
    accepted: { w: 1, dash: null },
    neglected: { w: 2.2, dash: '5.5 3.2' },
    rejected: { w: 3.3, dash: '0.1 4.4' },
    isolated: { w: 1, dash: null, color: '#8c8c8c' }
  };
  // Узоры заливки для ЧБ (добавляются в <defs>); возвращает id по ключу статуса
  function addBwPatterns(defs, prefix) {
    Object.keys(BW_PATTERNS).forEach(function (k) {
      var t = BW_PATTERNS[k].type, id = prefix + '-pt-' + k;
      var p = el('pattern', { id: id, patternUnits: 'userSpaceOnUse', width: 8, height: 8 }, defs);
      el('rect', { width: 8, height: 8, fill: t === 'solid' ? '#111' : '#fff' }, p);
      var st = { stroke: '#111', 'stroke-width': 1.6 };
      if (t === 'diag') el('path', Object.assign({ d: 'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6' }, st), p);
      if (t === 'cross') { el('path', Object.assign({ d: 'M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6' }, st), p); el('path', Object.assign({ d: 'M-2,6 L2,10 M0,0 L8,8 M6,-2 L10,2' }, st), p); }
      if (t === 'horiz') el('path', Object.assign({ d: 'M0,2 L8,2 M0,6 L8,6' }, st), p);
      if (t === 'dots') { el('circle', { cx: 2, cy: 2, r: 1.3, fill: '#111' }, p); el('circle', { cx: 6, cy: 6, r: 1.3, fill: '#111' }, p); }
    });
    return function (k) { return 'url(#' + prefix + '-pt-' + k + ')'; };
  }
  // Маленький значок статуса для легенд: kind 'fill' - заливка/штриховка, 'ring' - обводка узла
  function statusSwatch(k, bw, kind) {
    var id = 'sw' + (++uid);
    if (kind === 'ring') {
      var sr = el('svg', { viewBox: '-15 -15 30 30', width: 22, height: 22, class: 'swatch swatch-ring', 'aria-hidden': 'true' });
      var rg = bw ? BW_SWATCH[k] : { w: 3, dash: null };
      el('circle', { r: 11, fill: bw ? '#fff' : '#e5e7eb', stroke: bw ? (rg.color || '#111') : STATUS_COLORS[k], 'stroke-width': rg.w, 'stroke-dasharray': rg.dash, 'stroke-linecap': 'round' }, sr);
      if (bw && rg.double) el('circle', { r: 6.6, fill: 'none', stroke: '#111', 'stroke-width': 1.2 }, sr);
      return sr;
    }
    var s = el('svg', { viewBox: '0 0 16 16', width: 18, height: 18, class: 'swatch', 'aria-hidden': 'true' });
    if (bw) {
      var defs = el('defs', null, s), url = addBwPatterns(defs, id);
      el('rect', { x: 1, y: 1, width: 14, height: 14, rx: 2, fill: url(k), stroke: '#111', 'stroke-width': 1 }, s);
    } else {
      el('rect', { x: 1, y: 1, width: 14, height: 14, rx: 3, fill: STATUS_COLORS[k] }, s);
    }
    return s;
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(e);
    return e;
  }

  // Детерминированная силовая раскладка (Фрюхтерман - Рейнгольд + притяжение к центру)
  function forceLayout(nodes, edges, W, H, R) {
    var n = nodes.length, pos = {}, i, j, it;
    if (!n) return pos;
    var cx = W / 2, cy = H / 2, rad = Math.min(W, H) * 0.38;
    nodes.forEach(function (nd, k) {
      var a = 2 * Math.PI * k / n - Math.PI / 2;
      pos[nd.id] = { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
    });
    if (n === 1) return pos;
    var area = W * H, kk = Math.sqrt(area / n) * 0.75, t = W / 8;
    var pairs = {};
    edges.forEach(function (e) { pairs[e.from + '|' + e.to] = true; });
    var ids = nodes.map(function (x) { return x.id; });
    for (it = 0; it < 400; it++) {
      var disp = {};
      ids.forEach(function (id) { disp[id] = { x: 0, y: 0 }; });
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var a1 = pos[ids[i]], b1 = pos[ids[j]];
        var dx = a1.x - b1.x, dy = a1.y - b1.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var f = kk * kk / d;
        disp[ids[i]].x += dx / d * f; disp[ids[i]].y += dy / d * f;
        disp[ids[j]].x -= dx / d * f; disp[ids[j]].y -= dy / d * f;
      }
      edges.forEach(function (e) {
        var a2 = pos[e.from], b2 = pos[e.to];
        if (!a2 || !b2) return;
        var dx2 = a2.x - b2.x, dy2 = a2.y - b2.y, d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.01;
        var f2 = d2 * d2 / kk * (e.sign > 0 ? 1 : 0.4);
        disp[e.from].x -= dx2 / d2 * f2; disp[e.from].y -= dy2 / d2 * f2;
        disp[e.to].x += dx2 / d2 * f2; disp[e.to].y += dy2 / d2 * f2;
      });
      ids.forEach(function (id) {
        var p = pos[id], dd = disp[id];
        dd.x += (cx - p.x) * 0.4; dd.y += (cy - p.y) * 0.4;
        var len = Math.sqrt(dd.x * dd.x + dd.y * dd.y) || 0.01;
        p.x += dd.x / len * Math.min(len, t); p.y += dd.y / len * Math.min(len, t);
        p.x = Math.max(R + 30, Math.min(W - R - 30, p.x));
        p.y = Math.max(R + 20, Math.min(H - R - 40, p.y));
      });
      t = Math.max(t * 0.985, 0.5);
    }
    // Расталкиваем узлы, которые всё-таки легли друг на друга (часто в большой группе
    // и у узлов без связей, прижатых к краю)
    var minD = 2 * R + 14;
    for (it = 0; it < 300; it++) {
      var moved = false;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var p1 = pos[ids[i]], p2 = pos[ids[j]];
        var ex = p2.x - p1.x, ey = p2.y - p1.y, ed = Math.sqrt(ex * ex + ey * ey);
        if (ed >= minD) continue;
        if (ed < 0.01) { var ang = (i * 7 + j * 13) % 360 * Math.PI / 180; ex = Math.cos(ang); ey = Math.sin(ang); ed = 1; }
        var push = (minD - ed) / 2 + 0.5;
        p1.x -= ex / ed * push; p1.y -= ey / ed * push;
        p2.x += ex / ed * push; p2.y += ey / ed * push;
        moved = true;
      }
      ids.forEach(function (id) {
        var p = pos[id];
        p.x = Math.max(R + 30, Math.min(W - R - 30, p.x));
        p.y = Math.max(R + 20, Math.min(H - R - 40, p.y));
      });
      if (!moved) break;
    }
    return pos;
  }

  function splitName(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (parts.length <= 1) return [parts[0] || ''];
    return [parts[0], parts.slice(1).join(' ')];
  }
  function clip(s, max) { return s.length > max ? s.slice(0, max - 1) + '…' : s; }

  /* opts: nodes [{id,name,photo,status}], edges [{from,to,sign,mutual}],
     layout {id:[x,y]} | null, dashedNegative, onSaveLayout(layout), fileName, emptyText */
  function sociogram(opts) {
    var id = 'sg' + (++uid);
    var wrap = document.createElement('div');
    wrap.className = 'sgram';
    var bar = document.createElement('div');
    bar.className = 'sgram-bar no-print';
    wrap.appendChild(bar);
    function btn(label, fn, title) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', fn); bar.appendChild(b); return b;
    }
    var W = 800, H = 560;
    var svg = el('svg', { xmlns: NS, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'Segoe UI, Arial, sans-serif', role: 'img' });
    svg.classList.add('sgram-svg');
    wrap.appendChild(svg);

    var nodes = opts.nodes, edges = opts.edges;
    if (!nodes.length) {
      var empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = opts.emptyText || 'Нет данных.';
      wrap.replaceChild(empty, svg); bar.remove(); return wrap;
    }

    var defs = el('defs', null, svg);
    var BW = !!opts.bw;
    var EC = BW ? { pos: '#111', neg: '#111' } : COLORS;
    if (BW) {
      var gf = el('filter', { id: id + '-gray' }, defs);
      el('feColorMatrix', { type: 'saturate', values: '0' }, gf);
    }
    ['pos', 'neg'].forEach(function (k) {
      var m = el('marker', { id: id + '-end-' + k, viewBox: '0 0 10 10', refX: 0, refY: 5, markerWidth: 11, markerHeight: 11, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', fill: EC[k] }, m);
      var m2 = el('marker', { id: id + '-start-' + k, viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 11, markerHeight: 11, markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
      el('path', { d: 'M10,0 L0,5 L10,10 z', fill: EC[k] }, m2);
    });
    var bg = el('rect', { x: -5000, y: -5000, width: 10000, height: 10000, fill: '#ffffff' }, svg);
    var gEdges = el('g', null, svg), gNodes = el('g', null, svg);

    var pos = {};
    var R = nodeRadius(nodes);
    var auto = forceLayout(nodes, edges, W, H, R);
    nodes.forEach(function (n) {
      var saved = opts.layout && opts.layout[n.id];
      pos[n.id] = saved ? { x: saved[0], y: saved[1] } : { x: auto[n.id].x, y: auto[n.id].y };
    });

    var edgeEls = edges.map(function (e) {
      var k = e.sign > 0 ? 'pos' : 'neg';
      var line = el('line', {
        stroke: EC[k], 'stroke-width': e.mutual ? 3.2 : 1.5,
        'stroke-dasharray': (e.sign < 0 && (opts.dashedNegative || BW)) ? '7 5' : null,
        'marker-end': 'url(#' + id + '-end-' + k + ')',
        'marker-start': e.mutual ? 'url(#' + id + '-start-' + k + ')' : null,
        'stroke-linecap': 'butt'
      }, gEdges);
      return { e: e, line: line };
    });

    var nodeEls = {};
    nodes.forEach(function (n) {
      var g = el('g', { cursor: 'grab' }, gNodes);
      var rs = BW ? (BW_RINGS[n.status] || BW_RINGS.accepted) : { w: 3, dash: null };
      var ring = BW ? (rs.color || '#111') : (STATUS_COLORS[n.status] || '#9ca3af');
      var ringAttrs = function (fill) { return { r: R + 3, fill: fill, stroke: ring, 'stroke-width': rs.w, 'stroke-dasharray': rs.dash, 'stroke-linecap': 'round' }; };
      var inner = function () { if (BW && rs.double) el('circle', { r: R - 3, fill: 'none', stroke: '#111', 'stroke-width': 1.6 }, g); };
      var title = el('title', null, g); title.textContent = n.name;
      if (n.photo) {
        var cp = el('clipPath', { id: id + '-c-' + n.id }, defs);
        el('circle', { cx: 0, cy: 0, r: R }, cp);
        el('circle', ringAttrs('#fff'), g);
        el('image', { href: n.photo, x: -R, y: -R, width: 2 * R, height: 2 * R, 'clip-path': 'url(#' + id + '-c-' + n.id + ')', preserveAspectRatio: 'xMidYMid slice', filter: BW ? 'url(#' + id + '-gray)' : null }, g);
        inner();
        var lines = splitName(n.name);
        lines.forEach(function (ln, i) {
          var t = el('text', { y: R + 16 + i * 13, 'text-anchor': 'middle', 'font-size': 11.5, fill: '#111827', 'font-weight': i ? 400 : 600, 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3 }, g);
          t.textContent = clip(ln, 18);
        });
      } else {
        el('circle', ringAttrs(BW ? '#fff' : '#e5e7eb'), g);
        inner();
        // Если имя не влезает даже в увеличенный круг - уменьшаем шрифт (не мельче 8px), остаток обрезаем
        var lb = labelBox(n.name), ls = lb.lines;
        var room = 2 * (Math.sqrt(Math.max(0, R * R - lb.ymax * lb.ymax)) - 4);
        var fs = Math.max(8, Math.min(10, 10 * room / (lb.w || 1)));
        var k = fs / 10;
        ls.forEach(function (ln, i) {
          var t2 = el('text', { y: ((ls.length === 1 ? 4 : -2 + i * 12) * k).toFixed(1), 'text-anchor': 'middle', 'font-size': fs.toFixed(2), fill: '#111827', 'font-weight': i ? 400 : 600 }, g);
          var s = ln;
          while (s.length > 2 && textWidth(s + (s === ln ? '' : '…'), fs, !i) > room) s = s.slice(0, -1);
          t2.textContent = s === ln ? ln : s + '…';
        });
      }
      nodeEls[n.id] = g;
    });

    function redraw() {
      nodes.forEach(function (n) { nodeEls[n.id].setAttribute('transform', 'translate(' + pos[n.id].x.toFixed(1) + ',' + pos[n.id].y.toFixed(1) + ')'); });
      edgeEls.forEach(function (o) {
        var a = pos[o.e.from], b = pos[o.e.to];
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        // остриё стрелки - с зазором от обводки узла; линия кончается у основания наконечника
        var gap = R + 10, head = 11;
        var s0 = o.e.mutual ? gap + head : R + 7, s1 = gap + head;
        if (d < s0 + s1 + 4) { var k = d / (s0 + s1 + 4); s0 *= k; s1 *= k; }
        var x1 = a.x + dx / d * s0, y1 = a.y + dy / d * s0;
        var x2 = b.x - dx / d * s1, y2 = b.y - dy / d * s1;
        o.line.setAttribute('x1', x1.toFixed(1)); o.line.setAttribute('y1', y1.toFixed(1));
        o.line.setAttribute('x2', x2.toFixed(1)); o.line.setAttribute('y2', y2.toFixed(1));
      });
    }

    // Вид: viewBox
    var vb = { x: 0, y: 0, w: W, h: H };
    function fit() {
      var xs = [], ys = [];
      nodes.forEach(function (n) { xs.push(pos[n.id].x); ys.push(pos[n.id].y); });
      var m = R + 40;
      var minX = Math.min.apply(null, xs) - m, maxX = Math.max.apply(null, xs) + m;
      var minY = Math.min.apply(null, ys) - m, maxY = Math.max.apply(null, ys) + m + 20;
      // Не увеличивать сильнее обычного масштаба (иначе один-два узла раздуваются на всё поле)
      // и держать узлы по центру, если поле шире, чем они занимают
      var w = Math.max(maxX - minX, W * 0.75), h = Math.max(maxY - minY, H * 0.75);
      minX = (minX + maxX - w) / 2; minY = (minY + maxY - h) / 2;
      var ratio = W / H;
      if (w / h > ratio) { var nh = w / ratio; minY -= (nh - h) / 2; h = nh; } else { var nw = h * ratio; minX -= (nw - w) / 2; w = nw; }
      vb = { x: minX, y: minY, w: w, h: h }; fitW = w; applyVb();
    }
    var fitW = W, zoomBtn = null;
    function applyVb() {
      svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map(function (v) { return v.toFixed(1); }).join(' '));
      if (zoomBtn) {
        var pct = Math.round(fitW / vb.w * 100);
        zoomBtn.lastChild.textContent = pct + '%';
        zoomBtn.classList.toggle('zoom-off', pct !== 100);
        zoomBtn.title = pct === 100 ? 'Масштаб 100%: весь граф в рамке' : 'Вернуть масштаб 100% (весь граф в рамке)';
      }
    }
    function toSvg(evt) {
      var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    svg.addEventListener('wheel', function (evt) {
      evt.preventDefault();
      var p = toSvg(evt), k = evt.deltaY > 0 ? 1.12 : 1 / 1.12;
      vb.x = p.x - (p.x - vb.x) * k; vb.y = p.y - (p.y - vb.y) * k; vb.w *= k; vb.h *= k; applyVb();
    }, { passive: false });

    var drag = null;
    nodes.forEach(function (n) {
      nodeEls[n.id].addEventListener('pointerdown', function (evt) {
        evt.stopPropagation(); evt.preventDefault();
        var p = toSvg(evt);
        drag = { id: n.id, dx: pos[n.id].x - p.x, dy: pos[n.id].y - p.y };
        svg.setPointerCapture(evt.pointerId);
        nodeEls[n.id].setAttribute('cursor', 'grabbing');
      });
    });
    svg.addEventListener('pointerdown', function (evt) {
      if (drag) return;
      drag = { pan: true, sx: evt.clientX, sy: evt.clientY, vx: vb.x, vy: vb.y, scale: vb.w / svg.getBoundingClientRect().width };
      svg.setPointerCapture(evt.pointerId);
    });
    svg.addEventListener('pointermove', function (evt) {
      if (!drag) return;
      if (drag.pan) {
        vb.x = drag.vx - (evt.clientX - drag.sx) * drag.scale; vb.y = drag.vy - (evt.clientY - drag.sy) * drag.scale; applyVb();
      } else {
        var p = toSvg(evt); pos[drag.id].x = p.x + drag.dx; pos[drag.id].y = p.y + drag.dy; moved = true; redraw();
      }
    });
    var moved = false, custom = !!opts.layout, resetBtn = null;
    function saveLayout() {
      if (!opts.onSaveLayout) return;
      var lay = {};
      nodes.forEach(function (n) { lay[n.id] = [Math.round(pos[n.id].x), Math.round(pos[n.id].y)]; });
      opts.onSaveLayout(lay);
      custom = true; if (resetBtn) resetBtn.hidden = false;
    }
    function endDrag() {
      if (drag && drag.id) { nodeEls[drag.id].setAttribute('cursor', 'grab'); if (moved) saveLayout(); }
      drag = null; moved = false;
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    // Индикатор масштаба: показывает текущий %, по нажатию возвращает 100% (весь граф в рамке)
    zoomBtn = btn('', fit, '');
    zoomBtn.classList.add('zoom-btn');
    zoomBtn.setAttribute('aria-label', 'Масштаб; нажмите, чтобы вернуть 100%');
    zoomBtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg><span>100%</span>';
    btn('Скачать PNG', function () { downloadPng(svg, vb, opts.fileName || 'sociogram'); });
    btn('Копировать', function () {
      // ClipboardItem принимает Promise - так браузер не теряет «жест пользователя», пока рисуется картинка
      var U = root.SM.util;
      var png = renderPng(svg, vb).then(function (r) { return r.blob; });
      var job = (navigator.clipboard && window.ClipboardItem)
        ? navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        : png.then(U.copyImage);
      job.then(function () { U.toast('Социограмма скопирована - вставьте её в Word, Excel или сообщение (' + U.pasteKey + ')'); })
        .catch(function (e) { U.toast('Не удалось скопировать: ' + (e && e.message || e) + '. Используйте «Скачать PNG».', 'error'); });
    }, 'Скопировать картинку в буфер обмена');
    if (opts.onSaveLayout) {
      // Раскладка сохраняется сама после перетаскивания узла; кнопка видна, только если узлы двигали
      resetBtn = btn('Сбросить раскладку', function () {
        nodes.forEach(function (n) { pos[n.id] = { x: auto[n.id].x, y: auto[n.id].y }; });
        redraw(); opts.onSaveLayout(null);
        custom = false; resetBtn.hidden = true;
      }, 'Вернуть узлы на автоматические места');
      resetBtn.hidden = !custom;
    }
    var hint = document.createElement('span');
    hint.className = 'muted small'; hint.textContent = 'Узлы можно перетаскивать - положение запоминается. Колесо мыши - масштаб, фон - сдвиг.';
    bar.appendChild(hint);

    redraw(); fit();
    void bg;
    wrap._png = function () {
      // Подпись под фото бывает шире круга - учитываем её, чтобы крайние узлы не обрезались
      var xl = [], xr = [], ys = [];
      nodes.forEach(function (n) {
        var hw = R + 24;
        if (n.photo) splitName(n.name).forEach(function (ln, i) { hw = Math.max(hw, textWidth(clip(ln, 18), 11.5, !i) / 2 + 10); });
        xl.push(pos[n.id].x - hw); xr.push(pos[n.id].x + hw); ys.push(pos[n.id].y);
      });
      var x0 = Math.min.apply(null, xl), x1 = Math.max.apply(null, xr);
      var y0 = Math.min.apply(null, ys) - R - 16, y1 = Math.max.apply(null, ys) + R + 40;
      return renderPng(svg, { x: x0, y: y0, w: Math.max(x1 - x0, 200), h: Math.max(y1 - y0, 150) });
    };
    return wrap;
  }

  // SVG -> PNG (Blob) в заданной области просмотра
  function renderPng(svg, vb, minWidth) {
    return new Promise(function (resolve, reject) {
      var scale = Math.max(2, (minWidth || 1600) / vb.w);
      var W2 = Math.round(vb.w * scale), H2 = Math.round(vb.h * scale);
      var clone = svg.cloneNode(true);
      clone.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' '));
      clone.setAttribute('width', W2); clone.setAttribute('height', H2);
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', NS);
      var str = new XMLSerializer().serializeToString(clone);
      var url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = W2; c.height = H2;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W2, H2);
        ctx.drawImage(img, 0, 0, W2, H2);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) { resolve({ blob: blob, w: W2, h: H2, ratio: vb.h / vb.w }); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось построить картинку.')); };
      img.src = url;
    });
  }
  function downloadPng(svg, vb, name) {
    renderPng(svg, vb).then(function (r) { root.SM.util.download(r.blob, name + '.png'); })
      .catch(function (e) { alert(e.message); });
  }

  /* Круговая диаграмма. items: [{key,label,value,color}], onClick(key), opts {bw} */
  function pie(items, onClick, opts) {
    opts = opts || {};
    var total = items.reduce(function (s, x) { return s + x.value; }, 0);
    var svg = el('svg', { xmlns: NS, viewBox: '-110 -110 220 220', class: 'pie-svg', role: 'img', 'font-family': 'Segoe UI, Arial, sans-serif' });
    var fillOf = function (it) { return it.color; };
    if (opts.bw) { var defs = el('defs', null, svg); var url = addBwPatterns(defs, 'pie' + (++uid)); fillOf = function (it) { return url(it.key); }; }
    svg._png = function () { return renderPng(svg, { x: -110, y: -110, w: 220, h: 220 }, 800); };
    if (!total) { el('circle', { r: 100, fill: '#f3f4f6' }, svg); return svg; }
    var a0 = -Math.PI / 2, labels = [];
    items.forEach(function (it) {
      if (!it.value) return;
      var frac = it.value / total, a1 = a0 + frac * 2 * Math.PI, shape;
      var sAttrs = { fill: fillOf(it), stroke: opts.bw ? '#111' : '#fff', 'stroke-width': 1.5 };
      if (frac >= 0.9999) shape = el('circle', Object.assign({ r: 100 }, sAttrs), svg);
      else {
        var large = frac > 0.5 ? 1 : 0;
        var d = 'M0,0 L' + (100 * Math.cos(a0)).toFixed(2) + ',' + (100 * Math.sin(a0)).toFixed(2) +
          ' A100,100 0 ' + large + ' 1 ' + (100 * Math.cos(a1)).toFixed(2) + ',' + (100 * Math.sin(a1)).toFixed(2) + ' Z';
        shape = el('path', Object.assign({ d: d }, sAttrs), svg);
      }
      shape.setAttribute('cursor', 'pointer');
      var t = el('title', null, shape); t.textContent = it.label + ': ' + it.value;
      shape.addEventListener('click', function () { onClick && onClick(it.key); });
      var mid = (a0 + a1) / 2;
      if (frac >= 0.9999) labels.push({ x: 0, y: 0, v: it.value });
      else if (frac > 0.06) labels.push({ x: 64 * Math.cos(mid), y: 64 * Math.sin(mid), v: it.value });
      a0 = a1;
    });
    labels.forEach(function (lb) {
      if (opts.bw) el('circle', { cx: lb.x.toFixed(1), cy: lb.y.toFixed(1), r: 13, fill: '#fff', stroke: '#111', 'stroke-width': 1.2, 'pointer-events': 'none' }, svg);
      var tx = el('text', { x: lb.x.toFixed(1), y: (lb.y + 5).toFixed(1), 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: opts.bw ? '#111' : '#fff', 'pointer-events': 'none' }, svg);
      tx.textContent = lb.v;
    });
    return svg;
  }

  root.SM = root.SM || {};
  root.SM.graph = { sociogram: sociogram, pie: pie, statusSwatch: statusSwatch, renderPng: renderPng, STATUS_COLORS: STATUS_COLORS, COLORS: COLORS, BW_RINGS: BW_RINGS };
})(window);
