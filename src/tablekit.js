/* Таблицы отчёта как данные: вставка в буфер (HTML + текст) и картинка PNG.
   Модель: { title, head: [cell], rows: [[cell]] }
   cell: строка | число | { t, kind: 'pos'|'neg'|'self'|'bold', align: 'c', span } */
(function (root) {
  'use strict';

  function norm(c) {
    if (c === null || c === undefined) return { t: '' };
    if (typeof c !== 'object') return { t: String(c) };
    return Object.assign({}, c, { t: c.t === undefined || c.t === null ? '' : String(c.t) });
  }
  function palette(bw) {
    return bw
      ? { head: '#e6e6e6', pos: '#ffffff', neg: '#ffffff', self: '#dcdcdc', border: '#8c8c8c', text: '#000000', posText: '#000000', negText: '#000000' }
      : { head: '#eef3e0', pos: '#e3f6e9', neg: '#fdecec', self: '#eeeeee', border: '#b5b5b5', text: '#1c2430', posText: '#15803d', negText: '#dc2626' };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // HTML с встроенными стилями: Word и Excel вставляют его как обычную таблицу
  function toHtml(models, bw) {
    var P = palette(bw);
    return models.map(function (m) {
      var td = function (c, isHead) {
        c = norm(c);
        var bg = isHead ? P.head : c.kind === 'pos' ? P.pos : c.kind === 'neg' ? P.neg : c.kind === 'self' ? P.self : '#ffffff';
        var color = c.kind === 'pos' ? P.posText : c.kind === 'neg' ? P.negText : P.text;
        var st = 'border:1px solid ' + P.border + ';padding:3px 7px;background:' + bg + ';color:' + color + ';font-family:Calibri,Arial,sans-serif;font-size:10pt;vertical-align:middle;' +
          (c.align === 'c' ? 'text-align:center;' : '') + (isHead || c.kind === 'bold' || c.kind === 'pos' || c.kind === 'neg' ? 'font-weight:bold;' : '');
        var tag = isHead ? 'th' : 'td';
        return '<' + tag + (c.span ? ' colspan="' + c.span + '"' : '') + ' style="' + st + '">' + esc(c.t) + '</' + tag + '>';
      };
      return (m.title ? '<p style="font-family:Calibri,Arial,sans-serif;font-size:12pt;font-weight:bold;margin:6pt 0 4pt">' + esc(m.title) + '</p>' : '') +
        '<table style="border-collapse:collapse">' +
        (m.head ? '<tr>' + m.head.map(function (c) { return td(c, true); }).join('') + '</tr>' : '') +
        m.rows.map(function (r) { return '<tr>' + r.map(function (c) { return td(c, false); }).join('') + '</tr>'; }).join('') +
        '</table>';
    }).join('<br>');
  }
  // Текст с табуляцией (на случай вставки в блокнот)
  function toText(models) {
    return models.map(function (m) {
      var line = function (r) {
        var out = [];
        r.forEach(function (c) { c = norm(c); out.push(c.t.replace(/\s+/g, ' ')); for (var k = 1; k < (c.span || 1); k++) out.push(''); });
        return out.join('\t');
      };
      return (m.title ? m.title + '\n' : '') + (m.head ? line(m.head) + '\n' : '') + m.rows.map(line).join('\n');
    }).join('\n\n');
  }

  // Картинка: рисуем таблицу на холсте, с переносом длинного текста
  function toPng(models, bw) {
    var P = palette(bw), S = 2, FONT = '13px "Segoe UI", Arial, sans-serif', BOLD = '600 13px "Segoe UI", Arial, sans-serif';
    var PADX = 8, PADY = 5, LH = 18, MAXW = 380;
    var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    function wrap(text, w, font) {
      ctx.font = font;
      var words = text.split(/\s+/), lines = [], cur = '';
      words.forEach(function (wd) {
        var t = cur ? cur + ' ' + wd : wd;
        if (ctx.measureText(t).width > w && cur) { lines.push(cur); cur = wd; } else cur = t;
      });
      lines.push(cur);
      return lines;
    }
    // разметка каждой таблицы
    var layouts = models.map(function (m) {
      var all = (m.head ? [m.head] : []).concat(m.rows).map(function (r, ri) { return { cells: r.map(norm), head: !!m.head && ri === 0 }; });
      var ncol = 0;
      all.forEach(function (r) { var n = 0; r.cells.forEach(function (c) { n += c.span || 1; }); ncol = Math.max(ncol, n); });
      var widths = []; for (var i = 0; i < ncol; i++) widths.push(24);
      all.forEach(function (r) {
        var ci = 0;
        r.cells.forEach(function (c) {
          if ((c.span || 1) === 1) {
            ctx.font = r.head || c.kind ? BOLD : FONT;
            widths[ci] = Math.max(widths[ci], Math.min(MAXW, Math.ceil(ctx.measureText(c.t).width) + 2 * PADX));
          }
          ci += c.span || 1;
        });
      });
      var heights = all.map(function (r) {
        var ci = 0, mx = 1;
        r.cells.forEach(function (c) {
          var w = 0; for (var k = 0; k < (c.span || 1); k++) w += widths[ci + k];
          c._w = w; c._x = ci; ci += c.span || 1;
          c._lines = wrap(c.t, w - 2 * PADX, r.head || c.kind ? BOLD : FONT);
          mx = Math.max(mx, c._lines.length);
        });
        return mx * LH + 2 * PADY;
      });
      var W = widths.reduce(function (s, x) { return s + x; }, 0), H = heights.reduce(function (s, x) { return s + x; }, 0);
      return { m: m, all: all, widths: widths, heights: heights, W: W, H: H, titleH: m.title ? 28 : 0 };
    });
    var M = 12, GAP = 18;
    var totalW = Math.max.apply(null, layouts.map(function (l) { return l.W; })) + 2 * M;
    var totalH = layouts.reduce(function (s, l) { return s + l.H + l.titleH; }, 0) + GAP * (layouts.length - 1) + 2 * M;
    cv.width = totalW * S; cv.height = totalH * S;
    ctx.scale(S, S);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, totalW, totalH);
    ctx.textBaseline = 'middle';
    var y = M;
    layouts.forEach(function (L) {
      if (L.m.title) { ctx.font = '600 15px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.fillText(L.m.title, M, y + 11); y += L.titleH; }
      var xs = [M]; L.widths.forEach(function (w, i) { xs.push(xs[i] + w); });
      L.all.forEach(function (r, ri) {
        var hgt = L.heights[ri];
        r.cells.forEach(function (c) {
          var x = xs[c._x];
          ctx.fillStyle = r.head ? P.head : c.kind === 'pos' ? P.pos : c.kind === 'neg' ? P.neg : c.kind === 'self' ? P.self : '#fff';
          ctx.fillRect(x, y, c._w, hgt);
          ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, c._w, hgt);
          ctx.fillStyle = c.kind === 'pos' ? P.posText : c.kind === 'neg' ? P.negText : P.text;
          ctx.font = r.head || c.kind ? BOLD : FONT;
          ctx.textAlign = c.align === 'c' ? 'center' : 'left';
          var tx = c.align === 'c' ? x + c._w / 2 : x + PADX;
          var ty = y + hgt / 2 - (c._lines.length - 1) * LH / 2;
          c._lines.forEach(function (ln, k) { ctx.fillText(ln, tx, ty + k * LH); });
        });
        y += hgt;
      });
      y += GAP;
    });
    return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
  }

  root.SM = root.SM || {};
  root.SM.tablekit = { toHtml: toHtml, toText: toText, toPng: toPng };
})(window);
