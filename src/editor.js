/* Редактор протокола: участники, выборы (списком и матрицей), фото. */
(function (root) {
  'use strict';
  var SM = root.SM, h = SM.util.h, U = SM.util, App = SM.app;

  SM.editor = function (container, proto) {
    var editing = null;          // id выбирающего
    var view = 'list';           // 'list' | 'matrix'
    var mkind = 'choices';       // для матрицы: 'choices' | 'pchoices'
    proto.choices = proto.choices || {}; proto.pchoices = proto.pchoices || {};

    function save() { return App.save(proto).catch(function (e) { U.toast('Не удалось сохранить: ' + e.message, 'error'); }); }
    function getC(kind, from, to) { return (proto[kind][from] || {})[to] || 0; }
    function setC(kind, from, to, v) {
      var m = proto[kind];
      m[from] = m[from] || {};
      if (v) m[from][to] = v; else delete m[from][to];
      save();
    }

    // ---- Настройки протокола ----
    var nameInp = h('input', { type: 'text', class: 'input', value: proto.name });
    nameInp.addEventListener('change', function () {
      var v = nameInp.value.trim();
      if (!v) { nameInp.value = proto.name; return; }
      proto.name = v; save();
      var t = document.querySelector('.proto-title'); if (t) t.textContent = v;
    });
    var percInp = h('input', { type: 'checkbox', checked: proto.perceptive });
    percInp.addEventListener('change', function () {
      proto.perceptive = percInp.checked; if (!proto.perceptive) mkind = 'choices';
      save(); drawTable();
    });
    var viewSw = h('div', { class: 'seg' },
      segBtn('list', 'Списком'), segBtn('matrix', 'Матрицей'));
    function segBtn(v, label) {
      return h('button', { type: 'button', class: 'seg-btn' + (view === v ? ' on' : ''), dataset: { v: v }, onclick: function () {
        view = v; editing = null;
        viewSw.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.v === view); });
        drawTable();
      } }, label);
    }
    container.appendChild(h('div', { class: 'card settings-row' },
      h('label', { class: 'field grow' }, h('span', null, 'Название протокола'), nameInp),
      h('label', { class: 'check' }, percInp, 'Нужны перцептивные выборы (p)'),
      h('div', { class: 'field' }, h('span', null, 'Ввод выборов'), viewSw)));

    var hint = h('p', { class: 'muted hint' });
    var tableBox = h('div', { class: 'card table-card' });
    container.appendChild(hint);
    container.appendChild(tableBox);

    function drawTable() {
      tableBox.innerHTML = '';
      if (!proto.participants.length) {
        hint.textContent = '';
        tableBox.appendChild(h('p', { class: 'muted' }, 'В протоколе пока нет участников. Добавьте их ниже.'));
        return;
      }
      if (view === 'matrix') return drawMatrix();
      hint.textContent = editing
        ? 'Сейчас заполняются выборы участника, выделенного серым. Отметьте для остальных «+», «-» или «без выбора». Изменения сохраняются сразу; снимите галочку «изменить», чтобы закончить.'
        : 'Отметьте «изменить» у участника, чтобы внести его выборы. Себя выбрать нельзя. Положительные выборы подсвечиваются зелёным, отрицательные - жёлтым.';
      var P = proto.perceptive;
      var head = h('tr', null, h('th', { class: 'c' }, 'изменить'), h('th', { class: 'c' }, '№'), h('th', { class: 'th-name' }, 'ФИО'),
        h('th', { class: 'c' }, '+'), h('th', { class: 'c' }, '-'), h('th', { class: 'c', title: 'Выбора нет (убрать поставленный + или -)' }, 'без выбора'),
        P ? [h('th', { class: 'c' }, '+p'), h('th', { class: 'c' }, '-p'), h('th', { class: 'c', title: 'Перцептивного выбора нет' }, 'без p')] : null,
        h('th', { class: 'c' }, 'выборы'), h('th', { class: 'c' }, 'фото'), h('th', null, ''));
      var tbody = h('tbody');
      proto.participants.forEach(function (p, i) { tbody.appendChild(row(p, i)); });
      tableBox.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'tbl editor-tbl' }, h('thead', null, head), tbody)));
    }

    function radios(kind, to, prefix) {
      var cur = getC(kind, editing, to);
      var name = prefix + '-' + to;
      return [1, -1, 0].map(function (v) {
        var r = h('input', { type: 'radio', name: name, checked: cur === v, 'aria-label': v === 1 ? 'положительный' : v === -1 ? 'отрицательный' : 'без выбора' });
        r.addEventListener('change', function () { setC(kind, editing, to, v); drawTable(); });
        return h('td', { class: 'c' }, r);
      });
    }

    function row(p, i) {
      var isEd = editing === p.id, other = editing && !isEd;
      var cls = isEd ? 'row-chooser' : '';
      if (other) {
        var v = getC('choices', editing, p.id);
        if (v === 1) cls = 'row-pos'; else if (v === -1) cls = 'row-neg';
      }
      var edBox = h('input', { type: 'checkbox', checked: isEd, 'aria-label': 'изменить выборы ' + p.name });
      edBox.addEventListener('change', function () { editing = edBox.checked ? p.id : null; drawTable(); });
      var nameCell;
      if (isEd) {
        var ni = h('input', { type: 'text', class: 'input input-sm', value: p.name });
        ni.addEventListener('change', function () { if (ni.value.trim()) { p.name = ni.value.trim(); save(); } });
        nameCell = h('td', null, ni);
      } else nameCell = h('td', { class: 'td-name' }, p.name);
      var choiceCells;
      if (other) {
        choiceCells = [radios('choices', p.id, 'c'), proto.perceptive ? radios('pchoices', p.id, 'p') : null];
      } else if (isEd) {
        choiceCells = h('td', { class: 'c muted small', colspan: proto.perceptive ? 6 : 3 }, 'выбирает');
      } else {
        var sp = 0, sn = 0, row1 = proto.choices[p.id] || {};
        Object.keys(row1).forEach(function (k) { if (row1[k] === 1) sp++; else if (row1[k] === -1) sn++; });
        choiceCells = [h('td', { class: 'c muted' }, sp || ''), h('td', { class: 'c muted' }, sn || ''), h('td'),
          proto.perceptive ? (function () {
            var pp = 0, pn = 0, r2 = proto.pchoices[p.id] || {};
            Object.keys(r2).forEach(function (k) { if (r2[k] === 1) pp++; else if (r2[k] === -1) pn++; });
            return [h('td', { class: 'c muted' }, pp || ''), h('td', { class: 'c muted' }, pn || ''), h('td')];
          })() : null];
      }
      var filled = App.hasChoices(proto, p.id);
      return h('tr', { class: cls },
        h('td', { class: 'c' }, edBox), h('td', { class: 'c' }, i + 1), nameCell, choiceCells,
        h('td', { class: 'c' }, filled ? h('span', { class: 'yes' }, 'да') : h('span', { class: 'muted' }, 'нет')),
        h('td', { class: 'c' }, photoCell(p)),
        h('td', { class: 'c' }, h('button', { type: 'button', class: 'icon-btn danger', title: 'Удалить участника', 'aria-label': 'Удалить участника', onclick: function () { removeP(p); } }, '×')));
    }

    function photoCell(p) {
      function pick() {
        U.pickFile('image/*').then(function (f) {
          if (!f) return;
          U.readPhoto(f).then(function (d) { p.photo = d; save(); drawTable(); }).catch(function (e) { U.toast(e.message, 'error'); });
        });
      }
      if (p.photo) return h('span', { class: 'photo-wrap' },
        h('img', { src: p.photo, class: 'thumb', alt: '', title: 'Заменить фото', onclick: pick }),
        h('button', { type: 'button', class: 'photo-del', title: 'Убрать фото', 'aria-label': 'Убрать фото', onclick: function () { p.photo = null; save(); drawTable(); } }, '×'));
      return h('button', { type: 'button', class: 'btn btn-xs', onclick: pick }, 'добавить');
    }

    function removeP(p) {
      U.confirmBox('Удалить участника?', '«' + p.name + '» и все выборы, связанные с ним, будут удалены из протокола.').then(function (ok) {
        if (!ok) return;
        proto.participants = proto.participants.filter(function (x) { return x.id !== p.id; });
        ['choices', 'pchoices'].forEach(function (k) {
          delete proto[k][p.id];
          Object.keys(proto[k]).forEach(function (f) { delete proto[k][f][p.id]; });
        });
        if (editing === p.id) editing = null;
        save(); drawTable();
      });
    }

    // ---- Ввод матрицей ----
    function drawMatrix() {
      var ps = proto.participants;
      hint.textContent = 'Строка - кто выбирает, столбец - кого. Щелчок по клетке меняет значение по кругу: пусто → «+» → «-» → пусто. С клавиатуры: «+», «-», Delete.';
      if (proto.perceptive) {
        tableBox.appendChild(h('div', { class: 'seg seg-sm' },
          ['choices', 'pchoices'].map(function (k) {
            return h('button', { type: 'button', class: 'seg-btn' + (mkind === k ? ' on' : ''), onclick: function () { mkind = k; drawTable(); } },
              k === 'choices' ? 'Обычные выборы' : 'Перцептивные выборы (p)');
          })));
      }
      var head = h('tr', null, h('th', { class: 'th-name' }, 'Кто выбирает \\ кого'),
        ps.map(function (p, j) { return h('th', { class: 'c mx-h', title: p.name }, j + 1); }),
        h('th', { class: 'c' }, '+'), h('th', { class: 'c' }, '-'));
      var tbody = h('tbody');
      ps.forEach(function (a, i) {
        var tr = h('tr', null, h('td', { class: 'td-name' }, (i + 1) + '. ' + a.name));
        var cntP = h('td', { class: 'c muted' }), cntN = h('td', { class: 'c muted' });
        function counts() {
          var r = proto[mkind][a.id] || {}, sp = 0, sn = 0;
          Object.keys(r).forEach(function (k) { if (r[k] === 1) sp++; else if (r[k] === -1) sn++; });
          cntP.textContent = sp || ''; cntN.textContent = sn || '';
        }
        ps.forEach(function (b, j) {
          if (i === j) { tr.appendChild(h('td', { class: 'mx-self' })); return; }
          var btn = h('button', { type: 'button', class: 'mx-cell', title: a.name + ' → ' + b.name });
          function paint() {
            var v = getC(mkind, a.id, b.id);
            btn.textContent = v === 1 ? '+' : v === -1 ? '-' : '';
            btn.className = 'mx-cell' + (v === 1 ? ' pos' : v === -1 ? ' neg' : '');
          }
          function setV(v) { setC(mkind, a.id, b.id, v); paint(); counts(); }
          btn.addEventListener('click', function () {
            var v = getC(mkind, a.id, b.id); setV(v === 0 ? 1 : v === 1 ? -1 : 0);
          });
          btn.addEventListener('keydown', function (e) {
            if (e.key === '+' || e.key === '=') { setV(1); e.preventDefault(); }
            else if (e.key === '-') { setV(-1); e.preventDefault(); }
            else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') { setV(0); e.preventDefault(); }
          });
          paint();
          tr.appendChild(h('td', { class: 'c mx-td' }, btn));
        });
        counts();
        tr.appendChild(cntP); tr.appendChild(cntN);
        tbody.appendChild(tr);
      });
      tableBox.appendChild(h('div', { class: 'table-scroll' }, h('table', { class: 'tbl matrix-input' }, h('thead', null, head), tbody)));
    }

    // ---- Добавление участников ----
    var addList = h('div', { class: 'add-list' });
    function addField() {
      var inp = h('input', { type: 'text', class: 'input', placeholder: 'Фамилия Имя' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addField().focus(); } });
      addList.appendChild(inp); return inp;
    }
    addField();
    function addNames(names) {
      names.forEach(function (n) { proto.participants.push({ id: U.uid(), name: n, photo: null }); });
      save(); drawTable();
      U.toast('Добавлено участников: ' + names.length);
    }
    container.appendChild(h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Добавить участников'),
      addList,
      h('div', { class: 'row-gap' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { addField().focus(); } }, '+ Ещё один'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          var names = Array.prototype.map.call(addList.querySelectorAll('input'), function (i) { return i.value.trim(); }).filter(Boolean);
          if (!names.length) { U.toast('Введите хотя бы одно ФИО', 'warn'); return; }
          addList.innerHTML = ''; addField();
          addNames(names);
        } }, 'Добавить'),
        h('span', { class: 'sep' }),
        h('button', { type: 'button', class: 'btn', onclick: function () {
          U.pickFile('.xlsx,.xls,.csv,.txt').then(function (f) {
            if (!f) return;
            SM.importers.readRows(f).then(function (rows) {
              var names = SM.importers.rowsToNames(rows);
              if (!names.length) throw new Error('В файле не найдено ни одного ФИО.');
              addNames(names);
            }).catch(function (e) { U.toast(e.message, 'error'); });
          });
        } }, 'Из файла XLSX / CSV'))));

    drawTable();
  };
})(window);
