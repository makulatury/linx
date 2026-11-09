/* Экспорт в DOCX и XLSX без внешних библиотек: свой zip (без сжатия) + разметка Office Open XML. */
(function (root) {
  'use strict';

  // ---------- ZIP (метод store) ----------
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  var enc = new TextEncoder();
  // files: [{name, data: string | Uint8Array}] -> Blob
  function zip(files, mime) {
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cSize = central.reduce(function (s, x) { return s + x.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: mime || 'application/zip' });
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // ---------- XLSX ----------
  var X_STYLE = { h: 1, num: 2, b: 3, wrap: 4, pos: 5, neg: 6, posbw: 7, negbw: 8, title: 9 };
  function colName(i) { var s = ''; i++; while (i) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetXml(sh) {
    var cols = '';
    if (sh.widths) cols = '<cols>' + sh.widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
    var rows = sh.rows.map(function (row, r) {
      var cells = (row || []).map(function (c, ci) {
        if (c === null || c === undefined || c === '') return '';
        var v = c, s = 0;
        if (typeof c === 'object') { v = c.v; s = X_STYLE[c.s] || 0; }
        if (v === null || v === undefined) v = '';
        var ref = colName(ci) + (r + 1), sa = s ? ' s="' + s + '"' : '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (r + 1) + '">' + cells + '</row>';
    }).join('');
    var pane = sh.freeze ? '<sheetViews><sheetView workbookViewId="0"><pane xSplit="' + (sh.freeze.col || 0) + '" ySplit="' + (sh.freeze.row || 0) + '" topLeftCell="' + colName(sh.freeze.col || 0) + ((sh.freeze.row || 0) + 1) + '" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>' : '';
    return XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      pane + cols + '<sheetData>' + rows + '</sheetData>' + (sh.drawings && sh.drawings.length ? '<drawing r:id="rIdDr"/>' : '') + '</worksheet>';
  }
  function safeSheetName(n, used) {
    var s = String(n).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Лист';
    var base = s, k = 2;
    while (used[s]) s = base.slice(0, 28) + ' ' + (k++);
    used[s] = 1; return s;
  }
  // sheets: [{name, rows: [[cell]], widths: [chars], freeze}] ; cell: string | number | {v, s:'h'|'num'|'b'|'wrap'|'pos'|'neg'}
  var DR_NS = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"';
  function anchorFrom(f) { return '<xdr:from><xdr:col>' + f.col + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + f.row + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'; }
  function spFill(f) {
    if (!f) return '';
    if (f.pattern) return '<a:pattFill prst="' + f.pattern + '"><a:fgClr><a:srgbClr val="' + (f.fg || '111111') + '"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>';
    return '<a:solidFill><a:srgbClr val="' + f.color + '"/></a:solidFill>';
  }
  // Круговая диаграмма Excel: ch = {title, sheet, catRange, valRange, cats[], vals[], fills[], line}
  function pieChartXml(ch) {
    var q = "'" + ch.sheet.replace(/'/g, "''") + "'!";
    var pts = ch.fills.map(function (f, i) {
      return '<c:dPt><c:idx val="' + i + '"/><c:bubble3D val="0"/><c:spPr>' + spFill(f) + '<a:ln w="12700"><a:solidFill><a:srgbClr val="' + (ch.line || 'FFFFFF') + '"/></a:solidFill></a:ln></c:spPr></c:dPt>';
    }).join('');
    return XML + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="ru-RU" sz="1400" b="1"/><a:t>' + esc(ch.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' +
      '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>' + esc(ch.series || 'Человек') + '</c:v></c:tx>' + pts +
      '<c:dLbls>' + ch.vals.map(function (v, i) { return v ? '' : '<c:dLbl><c:idx val="' + i + '"/><c:delete val="1"/></c:dLbl>'; }).join('') + '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="808080"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"><a:solidFill><a:srgbClr val="111111"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="ru-RU"/></a:p></c:txPr>' +
      '<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>' +
      '<c:cat><c:strRef><c:f>' + q + ch.catRange + '</c:f><c:strCache><c:ptCount val="' + ch.cats.length + '"/>' +
      ch.cats.map(function (c, i) { return '<c:pt idx="' + i + '"><c:v>' + esc(c) + '</c:v></c:pt>'; }).join('') + '</c:strCache></c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>' + q + ch.valRange + '</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + ch.vals.length + '"/>' +
      ch.vals.map(function (v, i) { return '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>'; }).join('') + '</c:numCache></c:numRef></c:val>' +
      '</c:ser><c:firstSliceAng val="0"/></c:pieChart></c:plotArea><c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
      '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:chartSpace>';
  }

  /* drawings листа: [{type:'chart', chart, from:{col,row}, to:{col,row}} | {type:'image', blob, w, h, widthPx, from:{col,row}}] */
  function xlsx(sheets) {
    var used = {};
    sheets.forEach(function (s) { s.name = safeSheetName(s.name, used); });
    var files = [];
    files.push({ name: '[Content_Types].xml', data: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '</Types>' });
    files.push({ name: '_rels/.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', data: XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    files.push({ name: 'xl/styles.xml', data: XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
      '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF3E0"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F6E9"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="lightGray"><fgColor rgb="FF707070"/><bgColor rgb="FFFFFFFF"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) }); });
    // рисунки и диаграммы
    var imgJobs = [], nChart = 0, nImg = 0, extraTypes = '';
    sheets.forEach(function (s, si) {
      if (!s.drawings || !s.drawings.length) return;
      var dn = si + 1, rels = [], parts = [];
      files.push({ name: 'xl/worksheets/_rels/sheet' + dn + '.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + dn + '.xml"/></Relationships>' });
      extraTypes += '<Override PartName="/xl/drawings/drawing' + dn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
      s.drawings.forEach(function (d, k) {
        var rid = 'rId' + (k + 1), objId = k + 2;
        if (d.type === 'chart') {
          var cn = ++nChart;
          files.push({ name: 'xl/charts/chart' + cn + '.xml', data: pieChartXml(Object.assign({ sheet: s.name }, d.chart)) });
          extraTypes += '<Override PartName="/xl/charts/chart' + cn + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
          rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + cn + '.xml"/>');
          parts.push('<xdr:twoCellAnchor>' + anchorFrom(d.from) + '<xdr:to><xdr:col>' + d.to.col + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + d.to.row + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
            '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + objId + '" name="Диаграмма ' + cn + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
            '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="' + rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>');
        } else {
          var im = ++nImg, wpx = d.widthPx || 900, cx = wpx * 9525, cy = Math.round(wpx * d.h / d.w) * 9525;
          imgJobs.push({ n: im, blob: d.blob });
          rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + im + '.png"/>');
          parts.push('<xdr:oneCellAnchor>' + anchorFrom(d.from) + '<xdr:ext cx="' + cx + '" cy="' + cy + '"/>' +
            '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + objId + '" name="Рисунок ' + im + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
            '<xdr:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
            '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>');
        }
      });
      files.push({ name: 'xl/drawings/drawing' + dn + '.xml', data: XML + '<xdr:wsDr ' + DR_NS + '>' + parts.join('') + '</xdr:wsDr>' });
      files.push({ name: 'xl/drawings/_rels/drawing' + dn + '.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>' });
    });
    files[0].data = files[0].data.replace('</Types>', (nImg ? '<Default Extension="png" ContentType="image/png"/>' : '') + extraTypes + '</Types>');
    return Promise.all(imgJobs.map(function (j) { return j.blob.arrayBuffer(); })).then(function (bufs) {
      bufs.forEach(function (b, i) { files.push({ name: 'xl/media/image' + imgJobs[i].n + '.png', data: new Uint8Array(b) }); });
      return zip(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  }

  // ---------- DOCX ----------
  var EMU_PER_TWIP = 635;
  function Doc(opts) {
    opts = opts || {};
    this.landscape = !!opts.landscape;
    this.body = [];
    this.images = [];
    this.pageW = this.landscape ? 16838 : 11906;
    this.pageH = this.landscape ? 11906 : 16838;
    this.margin = 1000;
    this.contentW = this.pageW - 2 * this.margin;
  }
  function runs(content, base) {
    base = base || {};
    var list = Array.isArray(content) ? content : [content];
    return list.map(function (r) {
      if (r === null || r === undefined) return '';
      if (typeof r !== 'object') r = { t: r };
      var o = Object.assign({}, base, r);
      var pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.size ? '<w:sz w:val="' + o.size * 2 + '"/><w:szCs w:val="' + o.size * 2 + '"/>' : '');
      return '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(o.t) + '</w:t></w:r>';
    }).join('');
  }
  Doc.prototype.para = function (content, o) {
    o = o || {};
    var ppr = (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '') + (o.keepNext ? '<w:keepNext/>' : '') +
      (o.pageBreak ? '<w:pageBreakBefore/>' : '') + (o.ind ? '<w:ind w:left="' + o.ind + '" w:hanging="' + (o.hanging || 0) + '"/>' : '') +
      (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') +
      (o.border ? '<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="' + o.border + '"/></w:pBdr>' : '') +
      (o.spacing !== undefined ? '<w:spacing w:before="0" w:after="' + o.spacing + '"/>' : '') + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '');
    this.body.push('<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + runs(content, o.run) + '</w:p>');
    return this;
  };
  Doc.prototype.h1 = function (t, o) { return this.para(t, Object.assign({ style: 'Heading1' }, o || {})); };
  Doc.prototype.h2 = function (t, o) { return this.para(t, Object.assign({ style: 'Heading2', keepNext: true }, o || {})); };
  Doc.prototype.h3 = function (t, o) { return this.para(t, Object.assign({ style: 'Heading3', keepNext: true }, o || {})); };
  Doc.prototype.p = function (t, o) { return this.para(t, o); };
  Doc.prototype.item = function (marker, t) { return this.para([marker + ' ', t], { ind: 360, hanging: 360, spacing: 60 }); };
  /* rows: [[cell]] ; cell: string | {t, b, align, shade, pattern, color, span, size}
     o: {header: число строк заголовка, widths: [доли или twips], size: кегль, bw} */
  Doc.prototype.table = function (rows, o) {
    o = o || {};
    var self = this, ncols = 0;
    rows.forEach(function (r) { var n = 0; r.forEach(function (c) { n += (c && c.span) || 1; }); ncols = Math.max(ncols, n); });
    var widths = o.widths || [];
    var total = self.contentW, w = [], i;
    if (o.widthsTw) { w = o.widthsTw.map(function (x) { return Math.floor(x); }); }
    else {
    if (widths.length === ncols) {
      var sum = widths.reduce(function (s, x) { return s + x; }, 0);
      for (i = 0; i < ncols; i++) w.push(Math.floor(widths[i] / sum * total));
    } else for (i = 0; i < ncols; i++) w.push(Math.floor(total / ncols));
    }
    var size = o.size || 10;
    var xmlRows = rows.map(function (r, ri) {
      var isHead = ri < (o.header || 0), ci = 0;
      var cells = r.map(function (c) {
        if (c === null || c === undefined) c = '';
        if (typeof c !== 'object') c = { t: c };
        var span = c.span || 1, cw = 0;
        for (var k = 0; k < span; k++) cw += w[ci + k] || 0;
        ci += span;
        var shade = '';
        if (c.pattern) shade = '<w:shd w:val="' + c.pattern + '" w:color="' + (c.patColor || '000000') + '" w:fill="FFFFFF"/>';
        else if (c.shade) shade = '<w:shd w:val="clear" w:color="auto" w:fill="' + c.shade + '"/>';
        else if (isHead) shade = '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>';
        var tcPr = '<w:tcW w:w="' + cw + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') + shade + '<w:vAlign w:val="center"/>';
        var lines = String(c.t === undefined ? '' : c.t).split('\n');
        var paras = lines.map(function (ln, li) {
          return '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>' + (c.align ? '<w:jc w:val="' + c.align + '"/>' : '') + '</w:pPr>' +
            (c.icon && !li ? self.imageRun(c.icon, c.iconPt || 11) : '') +
            runs(ln, { b: c.b || isHead, size: c.size || size, color: c.color }) + '</w:p>';
        }).join('');
        return '<w:tc><w:tcPr>' + tcPr + '</w:tcPr>' + paras + '</w:tc>';
      }).join('');
      return '<w:tr>' + (isHead ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>') + cells + '</w:tr>';
    }).join('');
    var b = function (side) { return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/>'; };
    this.body.push('<w:tbl><w:tblPr><w:tblW w:w="' + w.reduce(function (s, x) { return s + x; }, 0) + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('') +
      '</w:tblBorders><w:tblCellMar><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      w.map(function (x) { return '<w:gridCol w:w="' + x + '"/>'; }).join('') + '</w:tblGrid>' + xmlRows + '</w:tbl>');
    this.para('', { spacing: 80 });
    return this;
  };
  // img: {blob, w, h} (из renderPng); maxW - доля ширины страницы
  // Встроенный рисунок как фрагмент строки (для значков в таблицах); размер в пунктах
  Doc.prototype.imageRun = function (img, pt) {
    var n = this.images.length + 1, emu = Math.round(pt * 12700);
    this.images.push(img.blob);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + emu + '" cy="' + emu + '"/><wp:docPr id="' + n + '" name="Значок ' + n + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + n + '" name="icon' + n + '.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdImg' + n + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emu + '" cy="' + emu + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t xml:space="preserve">  </w:t></w:r>';
  };
  Doc.prototype.image = function (img, maxW) {
    var n = this.images.length + 1;
    var widthEmu = Math.round(this.contentW * (maxW || 1) * EMU_PER_TWIP);
    var heightEmu = Math.round(widthEmu * img.h / img.w);
    var maxH = Math.round((this.pageH - 2 * this.margin - 1200) * EMU_PER_TWIP);
    if (heightEmu > maxH) { widthEmu = Math.round(widthEmu * maxH / heightEmu); heightEmu = maxH; }
    this.images.push(img.blob);
    this.body.push('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + widthEmu + '" cy="' + heightEmu + '"/><wp:docPr id="' + n + '" name="Рисунок ' + n + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + n + '" name="image' + n + '.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdImg' + n + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + widthEmu + '" cy="' + heightEmu + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>');
    return this;
  };
  Doc.prototype.pageBreak = function () { this.body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); return this; };
  Doc.prototype.build = function () {
    var self = this;
    return Promise.all(this.images.map(function (b) { return b.arrayBuffer(); })).then(function (bufs) {
      var sect = '<w:sectPr><w:pgSz w:w="' + self.pageW + '" w:h="' + self.pageH + '"' + (self.landscape ? ' w:orient="landscape"' : '') + '/>' +
        '<w:pgMar w:top="' + self.margin + '" w:right="' + self.margin + '" w:bottom="' + self.margin + '" w:left="' + self.margin + '" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
      var doc = XML + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
        '<w:body>' + self.body.join('') + sect + '</w:body></w:document>';
      var heading = function (id, name, size, before) {
        return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
          '<w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="100"/><w:outlineLvl w:val="' + (id.slice(-1) - 1) + '"/></w:pPr><w:rPr><w:b/><w:sz w:val="' + size * 2 + '"/><w:szCs w:val="' + size * 2 + '"/></w:rPr></w:style>';
      };
      var styles = XML + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>' +
        '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
        heading('Heading1', 'heading 1', 18, 0) + heading('Heading2', 'heading 2', 14, 280) + heading('Heading3', 'heading 3', 12, 160) +
        '</w:styles>';
      var files = [
        { name: '[Content_Types].xml', data: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
        { name: '_rels/.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
        { name: 'word/_rels/document.xml.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          bufs.map(function (b, i) { return '<Relationship Id="rIdImg' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + (i + 1) + '.png"/>'; }).join('') +
          '</Relationships>' },
        { name: 'word/document.xml', data: doc },
        { name: 'word/styles.xml', data: styles }
      ];
      bufs.forEach(function (b, i) { files.push({ name: 'word/media/image' + (i + 1) + '.png', data: new Uint8Array(b) }); });
      return zip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  };

  root.SM = root.SM || {};
  root.SM.exporter = { zip: zip, xlsx: xlsx, Doc: Doc, crc32: crc32 };
})(window);
