/* Мелкие помощники интерфейса. */
(function (root) {
  'use strict';

  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(e, x); }); return; }
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    function p(n) { return n < 10 ? '0' + n : n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    function p(n) { return n < 10 ? '0' + n : n; }
    return fmtDate(iso) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function toast(msg, kind) {
    var box = document.getElementById('toasts');
    var t = h('div', { class: 'toast ' + (kind || '') }, msg);
    box.appendChild(t);
    setTimeout(function () { t.classList.add('hide'); }, 2800);
    setTimeout(function () { t.remove(); }, 3300);
  }

  // Модальное окно. buttons: [{label, kind, value}] -> Promise(value)
  function modal(title, body, buttons) {
    return new Promise(function (resolve) {
      var back = h('div', { class: 'modal-back' });
      function close(v) { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') close(null); }
      var foot = h('div', { class: 'modal-foot' }, (buttons || [{ label: 'OK', kind: 'primary', value: true }]).map(function (b) {
        return h('button', {
          type: 'button', class: 'btn ' + (b.kind ? 'btn-' + b.kind : ''),
          onclick: function (ev) {
            if (b.action) {
              var btnEl = ev.currentTarget; btnEl.disabled = true;
              Promise.resolve(b.action()).then(function (ok) {
                btnEl.disabled = false;
                if (ok) close(ok);
              });
              return;
            }
            close(b.value);
          }
        }, b.label);
      }));
      var box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'modal-head' }, h('h2', null, title),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Закрыть', onclick: function () { close(null); } }, '×')),
        h('div', { class: 'modal-body' }, body), foot);
      back.appendChild(box);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      var f = box.querySelector('input:not([type=radio]):not([type=checkbox]),textarea,select');
      if (f) f.focus();
    });
  }
  function confirmBox(title, text, okLabel) {
    return modal(title, h('p', null, text), [
      { label: 'Отмена', value: false },
      { label: okLabel || 'Удалить', kind: 'danger', value: true }
    ]);
  }

  // Фото: уменьшить до квадрата 240px, JPEG
  function readPhoto(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var S = 240, c = document.createElement('canvas'); c.width = S; c.height = S;
        var s = Math.min(img.width, img.height);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение.')); };
      img.src = url;
    });
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var inp = h('input', { type: 'file', accept: accept, style: 'display:none' });
      inp.addEventListener('change', function () { resolve(inp.files[0] || null); inp.remove(); });
      document.body.appendChild(inp); inp.click();
    });
  }

  // Буфер обмена: таблица (HTML + текст) и картинка
  function copyRich(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]).catch(function () { return copyFallback(html); });
    }
    return copyFallback(html);
  }
  function copyFallback(html) {
    return new Promise(function (resolve, reject) {
      var box = h('div', { contenteditable: 'true', style: 'position:fixed;left:-9999px;top:0', html: html });
      document.body.appendChild(box);
      var r = document.createRange(); r.selectNodeContents(box);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      sel.removeAllRanges(); box.remove();
      ok ? resolve() : reject(new Error('Браузер не дал доступ к буферу обмена.'));
    });
  }
  function copyImage(blob) {
    if (!navigator.clipboard || !window.ClipboardItem) return Promise.reject(new Error('Браузер не умеет копировать картинки. Используйте «Скачать PNG».'));
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }

  root.SM = root.SM || {};
  root.SM.util = {
    h: h, uid: uid, download: download, fmtDate: fmtDate, fmtDateTime: fmtDateTime, toast: toast,
    modal: modal, confirmBox: confirmBox, readPhoto: readPhoto, pickFile: pickFile, debounce: debounce,
    copyRich: copyRich, copyImage: copyImage
  };
})(window);
