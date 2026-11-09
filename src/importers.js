/* Импорт списков и выборов из CSV и XLSX. XLSX читается своим парсером zip
   (DecompressionStream 'deflate-raw'), без внешних библиотек. */
(function (root) {
  'use strict';

  // ---------- CSV ----------
  function decodeText(buf) {
    var bytes = new Uint8Array(buf);
    var txt = new TextDecoder('utf-8').decode(bytes);
    if (txt.indexOf('�') >= 0) {
      try { txt = new TextDecoder('windows-1251').decode(bytes); } catch (e) { /* оставить utf-8 */ }
    }
    return txt.replace(/^﻿/, '');
  }

  function parseCSV(text) {
    var firstLine = text.split(/\r?\n/)[0] || '';
    var cands = [';', '\t', ','], delim = ';', best = -1;
    cands.forEach(function (d) {
      var c = firstLine.split(d).length;
      if (c > best) { best = c; delim = d; }
    });
    var rows = [], row = [], cell = '', q = false, i = 0, ch;
    for (; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---------- ZIP ----------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined')
      return Promise.reject(new Error('Браузер не умеет распаковывать XLSX. Обновите Chrome или сохраните файл как CSV.'));
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([data]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function readZip(buf) {
    var b = new Uint8Array(buf), eocd = -1, i;
    for (i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Файл повреждён или это не XLSX.');
    var count = u16(b, eocd + 10), off = u32(b, eocd + 16), entries = {};
    var dec = new TextDecoder('utf-8');
    for (i = 0; i < count; i++) {
      if (u32(b, off) !== 0x02014b50) break;
      var method = u16(b, off + 10), csize = u32(b, off + 20);
      var nlen = u16(b, off + 28), xlen = u16(b, off + 30), clen = u16(b, off + 32);
      var lho = u32(b, off + 42);
      var name = dec.decode(b.subarray(off + 46, off + 46 + nlen));
      entries[name] = { method: method, csize: csize, lho: lho };
      off += 46 + nlen + xlen + clen;
    }
    function get(name) {
      var e = entries[name];
      if (!e) return Promise.resolve(null);
      var lnlen = u16(b, e.lho + 26), lxlen = u16(b, e.lho + 28);
      var start = e.lho + 30 + lnlen + lxlen;
      var data = b.subarray(start, start + e.csize);
      var p = e.method === 0 ? Promise.resolve(data) : e.method === 8 ? inflateRaw(data) :
        Promise.reject(new Error('Неподдерживаемое сжатие в XLSX.'));
      return p.then(function (d) { return dec.decode(d); });
    }
    return { names: Object.keys(entries), get: get };
  }

  // ---------- XLSX ----------
  function xml(text) { return new DOMParser().parseFromString(text, 'application/xml'); }
  function byTag(node, tag) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', tag)); }
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ''), n = 0;
    if (!m) return -1;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  function parseXLSX(buf) {
    var zip;
    try { zip = readZip(buf); } catch (e) { return Promise.reject(e); }
    var sheetPath = 'xl/worksheets/sheet1.xml';
    return Promise.all([zip.get('xl/workbook.xml'), zip.get('xl/_rels/workbook.xml.rels'), zip.get('xl/sharedStrings.xml')])
      .then(function (r) {
        if (r[0] && r[1]) {
          var wb = xml(r[0]), rels = xml(r[1]);
          var sheet = byTag(wb, 'sheet')[0];
          if (sheet) {
            var rid = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sheet.getAttribute('r:id');
            byTag(rels, 'Relationship').forEach(function (rel) {
              if (rel.getAttribute('Id') === rid) {
                var t = rel.getAttribute('Target');
                sheetPath = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
              }
            });
          }
        }
        var shared = [];
        if (r[2]) {
          byTag(xml(r[2]), 'si').forEach(function (si) {
            shared.push(byTag(si, 't').map(function (t) { return t.textContent; }).join(''));
          });
        }
        return zip.get(sheetPath).then(function (sx) {
          if (!sx) throw new Error('В файле XLSX не найден первый лист.');
          var rows = [];
          byTag(xml(sx), 'row').forEach(function (rowEl) {
            var rIdx = parseInt(rowEl.getAttribute('r'), 10) - 1;
            if (isNaN(rIdx)) rIdx = rows.length;
            var row = [];
            byTag(rowEl, 'c').forEach(function (c, k) {
              var ci = colIndex(c.getAttribute('r'));
              if (ci < 0) ci = k;
              var t = c.getAttribute('t'), v = byTag(c, 'v')[0], val = '';
              if (t === 's') val = v ? (shared[parseInt(v.textContent, 10)] || '') : '';
              else if (t === 'inlineStr') val = byTag(c, 't').map(function (x) { return x.textContent; }).join('');
              else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
              else val = v ? v.textContent : '';
              row[ci] = val;
            });
            for (var j = 0; j < row.length; j++) if (row[j] === undefined) row[j] = '';
            rows[rIdx] = row;
          });
          for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
          return rows;
        });
      });
  }

  // ---------- Общий вход ----------
  function readRows(file) {
    return file.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf.slice(0, 8));
      if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0)
        throw new Error('Это файл старого формата XLS. Откройте его в Excel и сохраните как «Книга Excel (*.xlsx)» или CSV, затем загрузите снова.');
      if (b[0] === 0x50 && b[1] === 0x4B) return parseXLSX(buf);
      return parseCSV(decodeText(buf));
    });
  }

  function clean(s) { return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim(); }
  var HEADER_RE = /^(№|n|no|#|фио|ф\.и\.о\.?|имя|фамилия|участник|ученик|список|name)/i;

  // Список ФИО: первая колонка с текстом (если первая колонка - номера, берём следующую)
  function rowsToNames(rows) {
    rows = rows.map(function (r) { return (r || []).map(clean); }).filter(function (r) { return r.some(Boolean); });
    if (!rows.length) return [];
    var col = 0, maxCols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    for (var c = 0; c < maxCols; c++) {
      var textual = rows.filter(function (r) { return r[c] && !/^\d+[.)]?$/.test(r[c]); }).length;
      if (textual >= Math.max(1, rows.length / 2)) { col = c; break; }
    }
    var names = rows.map(function (r) { return r[col] || ''; }).filter(Boolean);
    if (names.length && HEADER_RE.test(names[0])) names.shift();
    return names;
  }

  // Файл с выборами: № | ФИО | 1 | 2 | ... ; '+' / '-' в клетках
  function rowsToChoices(rows) {
    rows = rows.map(function (r) { return (r || []).map(clean); });
    var start = 0;
    while (start < rows.length && !rows[start].some(Boolean)) start++;
    var hasHeader = rows[start] && (HEADER_RE.test(rows[start][0] || '') || HEADER_RE.test(rows[start][1] || '') ||
      rows[start].slice(2).some(function (x) { return /^\d+$/.test(x); }) && !/[+\-−–]/.test(rows[start].join('')));
    var body = rows.slice(hasHeader ? start + 1 : start).filter(function (r) { return r.some(Boolean); });
    // ФИО во второй колонке, если первая - номер
    var nameCol = body.every(function (r) { return /^\d*[.)]?$/.test(r[0] || ''); }) ? 1 : 0;
    var firstChoice = nameCol + 1;
    var names = body.map(function (r) { return r[nameCol] || ''; });
    var n = names.length, matrix = [];
    var warnings = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < n; j++) {
        var v = (body[i][firstChoice + j] || '').replace(/\s/g, '');
        var val = 0;
        if (/^\+/.test(v)) val = 1;
        else if (/^[-−–—]/.test(v)) val = -1;
        else if (v) warnings.push('Строка ' + (i + 1) + ', колонка ' + (j + 1) + ': непонятное значение «' + v + '»');
        if (i === j && val) { warnings.push('Строка ' + (i + 1) + ': выбор самого себя пропущен'); val = 0; }
        row.push(val);
      }
      matrix.push(row);
    }
    return { names: names, matrix: matrix, warnings: warnings };
  }

  root.SM = root.SM || {};
  root.SM.importers = { readRows: readRows, rowsToNames: rowsToNames, rowsToChoices: rowsToChoices, parseCSV: parseCSV };
})(window);
