/* Ядро приложения: маршруты, рабочий стол, создание протокола, резервные копии. */
(function (root) {
  'use strict';
  var SM = root.SM, h = SM.util.h, U = SM.util, calc = SM.calc;

  var App = SM.app = {};

  App.newProtocol = function (name) {
    var now = new Date().toISOString();
    return { id: U.uid(), name: name, created: now, updated: now, perceptive: false,
      participants: [], choices: {}, pchoices: {}, layouts: {} };
  };
  App.hasChoices = function (proto, pid) {
    var any = function (map) {
      if (!map) return false;
      if (pid) return map[pid] && Object.keys(map[pid]).some(function (k) { return map[pid][k]; });
      return Object.keys(map).some(function (f) { return Object.keys(map[f] || {}).some(function (k) { return map[f][k]; }); });
    };
    return any(proto.choices) || (proto.perceptive && any(proto.pchoices));
  };
  App.save = function (proto) { return SM.store.putProtocol(proto); };
  App.statusBadge = function (key, extra) {
    return h('span', { class: 'badge st-' + key + (extra ? ' ' + extra : '') }, calc.STATUS[key]);
  };

  // ---------- Логотип «Тройка»: три человека, одна связь взаимная (толще) ----------
  var LOGO_SVG = '<svg viewBox="0 0 104 104" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect width="104" height="104" rx="24" fill="#a1c42c"/>' +
    '<g stroke="#1f3a0c" stroke-linecap="round"><line x1="52" y1="28" x2="28" y2="74" stroke-width="8"/>' +
    '<line x1="52" y1="28" x2="76" y2="74" stroke-width="3.5"/><line x1="28" y1="74" x2="76" y2="74" stroke-width="3.5"/></g>' +
    '<g fill="#1f3a0c"><circle cx="52" cy="28" r="10"/><circle cx="28" cy="74" r="10"/><circle cx="76" cy="74" r="10"/></g></svg>';
  App.logo = function (cls) { return h('span', { class: cls || 'brand-mark', html: LOGO_SVG }); };

  // ---------- Каркас ----------
  var main;
  function shell() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    var nav = h('header', { class: 'topbar no-print' },
      h('a', { class: 'brand', href: '#/' }, App.logo(), 'Linx'),
      h('nav', { class: 'topnav' },
        h('a', { href: '#/', 'data-nav': 'home' }, 'Протоколы'),
        h('a', { href: '#/texts', 'data-nav': 'texts' }, 'Тексты отчёта'),
        h('a', { href: '#/help', 'data-nav': 'help' }, 'Справка')));
    main = h('main', { id: 'main' });
    app.appendChild(nav); app.appendChild(main);
    app.appendChild(h('div', { id: 'toasts', class: 'no-print' }));
  }

  function setNav(key) {
    document.querySelectorAll('.topnav a').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === key); });
  }

  App.route = function () {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
    main.innerHTML = '';
    window.scrollTo(0, 0);
    document.body.classList.toggle('bw', !!App.bw && parts[0] === 'p' && !!parts[2] && parts[2] !== 'edit');
    if (!parts.length) { setNav('home'); return desktop(); }
    if (parts[0] === 'texts') { setNav('texts'); return SM.textsView(main); }
    if (parts[0] === 'help') { setNav('help'); return help(); }
    if (parts[0] === 'p' && parts[1]) {
      setNav('home');
      return SM.store.getProtocol(parts[1]).then(function (proto) {
        if (!proto) { main.appendChild(h('div', { class: 'card' }, h('p', null, 'Протокол не найден.'), h('a', { href: '#/' }, 'К списку'))); return; }
        var view = parts[2] || 'edit';
        main.appendChild(protoHeader(proto, view));
        var body = h('div', { class: 'proto-body' });
        main.appendChild(body);
        if (view === 'report') return SM.report.general(body, proto);
        if (view === 'brief') return SM.report.brief(body, proto);
        if (view === 'person') return SM.report.person(body, proto, parts[3]);
        if (view === 'mutual') return SM.report.mutual(body, proto);
        return SM.editor(body, proto);
      });
    }
    location.hash = '#/';
  };

  // Переключатель ЧБ и кнопки экспорта (общие для всех отчётов)
  App.bw = (function () { try { return localStorage.getItem('links-bw') === '1'; } catch (e) { return false; } })();
  function reportActions(proto, view) {
    var bw = h('input', { type: 'checkbox', checked: App.bw, role: 'switch', 'aria-label': 'Чёрно-белый режим' });
    bw.addEventListener('change', function () {
      App.bw = bw.checked;
      try { localStorage.setItem('links-bw', App.bw ? '1' : '0'); } catch (e) { /* без сохранения */ }
      var y = window.scrollY; App.route(); setTimeout(function () { window.scrollTo(0, y); }, 50);
    });
    var pid = function () { return decodeURIComponent((location.hash.split('/')[4] || '')); };
    return h('div', { class: 'report-actions no-print' },
      h('label', { class: 'switch', title: 'Чёрно-белая версия для печати: вместо цвета - штриховки, пунктиры и разные обводки' }, bw, h('span', { class: 'switch-track' }), 'Ч/Б'),
      h('button', { type: 'button', class: 'btn', title: 'Скачать отчёт в формате Word (.docx) - его можно редактировать', onclick: function () {
        SM.report.exportDocx(view, proto, document.querySelector('.proto-body'), pid());
      } }, 'Word'),
      h('button', { type: 'button', class: 'btn', title: 'Скачать все данные в Excel (.xlsx): выборы, индексы, пары, статусы', onclick: function () { SM.report.exportXlsx(proto); } }, 'Excel'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { window.print(); }, title: 'Печать или сохранение в PDF через окно печати' }, 'Печать / PDF'));
  }

  function protoHeader(proto, view) {
    var tabs = [['edit', 'Протокол'], ['report', 'Общий отчёт'], ['brief', 'Краткий отчёт'], ['person', 'Индивидуальный отчёт'], ['mutual', 'Взаимные выборы']];
    var base = '#/p/' + encodeURIComponent(proto.id);
    return h('div', { class: 'proto-head' + (view === 'brief' ? ' brief-head' : '') },
      h('div', { class: 'print-only print-brand' }, App.logo('print-logo'), h('b', null, 'Linx'), h('span', { class: 'muted' }, ' - социометрия')),
      h('div', { class: 'crumbs no-print' }, h('a', { href: '#/' }, '← Все протоколы')),
      h('div', { class: 'proto-title-row' },
        h('h1', { class: 'proto-title' }, proto.name),
        view !== 'edit' ? reportActions(proto, view) : null),
      h('div', { class: 'print-only muted' }, 'Участников: ' + proto.participants.length + '. Дата протокола: ' + U.fmtDate(proto.created) + '. Отчёт сформирован ' + U.fmtDateTime(new Date().toISOString()) + '.'),
      h('nav', { class: 'tabs no-print' }, tabs.map(function (t) {
        return h('a', { href: base + (t[0] === 'edit' ? '' : '/' + t[0]), class: view === t[0] ? 'active' : '' }, t[1]);
      })));
  }

  // ---------- Рабочий стол ----------
  var filters = { q: '', from: '', to: '', unfilled: false, empty: false, perc: false };

  function desktop() {
    var listBox = h('div', { class: 'proto-list' });
    var countBox = h('span', { class: 'muted' });
    var all = [];
    function inp(key, type, attrs) {
      var e = h('input', Object.assign({ type: type }, attrs || {}));
      if (type === 'checkbox') { e.checked = filters[key]; e.addEventListener('change', function () { filters[key] = e.checked; draw(); }); }
      else { e.value = filters[key]; e.addEventListener('input', function () { filters[key] = e.value; draw(); }); }
      return e;
    }
    main.appendChild(h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Протоколы социометрии'),
        h('p', { class: 'muted' }, 'Данные сохраняются автоматически, только на этом компьютере. Резервная копия и перенос на другой ПК - в разделе «Справка».')),
      h('div', { class: 'page-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: createDialog }, '+ Новая социометрия'))));
    main.appendChild(h('div', { class: 'filters card' },
      h('label', { class: 'f-search' }, h('span', null, 'Поиск'), inp('q', 'search', { placeholder: 'Название протокола' })),
      h('label', null, h('span', null, 'Создан с'), inp('from', 'date')),
      h('label', null, h('span', null, 'по'), inp('to', 'date')),
      h('div', { class: 'f-checks' },
        h('label', { class: 'check' }, inp('unfilled', 'checkbox'), 'только незаполненные'),
        h('label', { class: 'check' }, inp('empty', 'checkbox'), 'только без участников'),
        h('label', { class: 'check' }, inp('perc', 'checkbox'), 'с перцептивными выборами'))));
    main.appendChild(h('div', { class: 'list-head' }, countBox));
    main.appendChild(listBox);

    function draw() {
      var q = filters.q.trim().toLowerCase();
      var items = all.filter(function (p) {
        if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
        var d = (p.created || '').slice(0, 10);
        if (filters.from && d < filters.from) return false;
        if (filters.to && d > filters.to) return false;
        if (filters.unfilled && App.hasChoices(p)) return false;
        if (filters.empty && p.participants.length) return false;
        if (filters.perc && !p.perceptive) return false;
        return true;
      });
      countBox.textContent = all.length ? ('Показано ' + items.length + ' из ' + all.length) : '';
      listBox.innerHTML = '';
      if (!all.length) {
        listBox.appendChild(h('div', { class: 'empty card' },
          h('h2', null, 'Пока нет ни одного протокола'),
          h('p', { class: 'muted' }, 'Создайте новую социометрию или загрузите базу из файла. Чтобы посмотреть, как выглядит отчёт, можно добавить пример.'),
          h('div', { class: 'row-gap' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: createDialog }, '+ Новая социометрия'),
            h('button', { type: 'button', class: 'btn', onclick: addSample }, 'Добавить пример'))));
        return;
      }
      if (!items.length) { listBox.appendChild(h('p', { class: 'muted' }, 'Ничего не найдено по выбранным условиям.')); return; }
      items.forEach(function (p) { listBox.appendChild(card(p)); });
    }

    function card(p) {
      var filled = App.hasChoices(p);
      var g = null;
      if (p.participants.length > 1 && filled) g = calc.analyze(calc.buildMatrix(p.participants, p.choices)).group;
      var link = '#/p/' + encodeURIComponent(p.id);
      return h('article', { class: 'pcard card' },
        h('div', { class: 'pcard-main' },
          h('a', { class: 'pcard-title', href: link }, p.name),
          h('div', { class: 'pcard-meta' },
            h('span', null, 'Создан ' + U.fmtDate(p.created)),
            h('span', null, p.participants.length + ' ' + SM.texts.plural(p.participants.length, ['участник', 'участника', 'участников'])),
            !filled ? h('span', { class: 'badge badge-warn' }, 'не заполнялось') : null,
            p.perceptive ? h('span', { class: 'badge badge-info' }, 'перцептивные') : null),
          g ? h('div', { class: 'pcard-idx' },
            idx('Ag', calc.fmt(g.Ag)), idx('Gg (max)', calc.fmt(g.Gg) + ' (' + calc.fmt(g.Ggmax) + ')'),
            idx('U', calc.fmt(g.U)), idx('Kg', calc.fmt(g.Kg)), idx('R-', g.Rneg === null ? 'н/р' : calc.fmt(g.Rneg))) : null),
        h('div', { class: 'pcard-actions' },
          h('a', { class: 'btn btn-sm', href: link }, 'Открыть'),
          filled ? h('a', { class: 'btn btn-sm', href: link + '/report' }, 'Отчёт') : null,
          h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { duplicate(p); } }, 'Дублировать'),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger-ghost', onclick: function () { remove(p); } }, 'Удалить')));
    }
    function idx(k, v) { return h('span', { class: 'mini-idx' }, h('b', null, k), ' ', v); }

    function duplicate(p) {
      var c = JSON.parse(JSON.stringify(p));
      c.id = U.uid(); c.name = p.name + ' (копия)'; c.created = new Date().toISOString();
      App.save(c).then(function () { U.toast('Копия создана'); load(); });
    }
    function remove(p) {
      U.confirmBox('Удалить протокол?', 'Протокол «' + p.name + '» будет удалён без возможности восстановления (если нет резервной копии базы).')
        .then(function (ok) { if (ok) SM.store.deleteProtocol(p.id).then(function () { U.toast('Протокол удалён'); load(); }); });
    }
    function addSample() {
      var s = SM.fixtures.group3(), p = App.newProtocol(s.name);
      p.participants = s.participants; p.choices = s.choices;
      App.save(p).then(load);
    }
    function load() {
      SM.store.listProtocols().then(function (list) {
        all = list.sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
        draw();
      });
    }
    load();
  }

  // ---------- Создание ----------
  function createDialog() {
    SM.store.listProtocols().then(function (list) {
      var nameInp = h('input', { type: 'text', class: 'input', placeholder: 'Например, отдел продаж, сентябрь 2026' });
      var mode = 'later';
      var fileInp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt' });
      var hasChoices = h('input', { type: 'checkbox' });
      var copySel = h('select', { class: 'input' }, list.filter(function (p) { return p.participants.length; }).map(function (p) {
        return h('option', { value: p.id }, p.name + ' (' + p.participants.length + ')');
      }));
      var pasteArea = h('textarea', { class: 'input', rows: 7, placeholder: 'Иванов Иван\nПетрова Мария\n...' });
      var perc = h('input', { type: 'checkbox' });
      var err = h('div', { class: 'form-error' });
      function opt(val, label, extra) {
        var r = h('input', { type: 'radio', name: 'src', value: val, checked: val === mode });
        r.addEventListener('change', function () { mode = val; sync(); });
        return h('div', { class: 'src-opt', dataset: { v: val } }, h('label', { class: 'check' }, r, label), extra ? h('div', { class: 'src-extra' }, extra) : null);
      }
      var body = h('div', { class: 'form' },
        h('label', { class: 'field' }, h('span', null, 'Название *'), nameInp),
        h('div', { class: 'field' }, h('span', null, 'Список участников'),
          opt('later', 'Добавить участников позже'),
          opt('paste', 'Вставить список (по одному ФИО в строке)', pasteArea),
          opt('file', 'Загрузить из файла XLSX или CSV', h('div', null, fileInp,
            h('label', { class: 'check' }, hasChoices, 'Файл уже содержит выборы'),
            h('p', { class: 'muted small' }, 'Список: одна колонка с ФИО (можно с колонкой номеров). Файл с выборами: № | ФИО | 1 | 2 | ..., в клетках «+» или «-». Старый формат XLS нужно пересохранить в XLSX.'))),
          copySel.options.length ? opt('copy', 'Скопировать список из протокола (вместе с фото)', copySel) : null),
        h('label', { class: 'check' }, perc, 'Нужны перцептивные выборы (p)'),
        err);
      function sync() {
        body.querySelectorAll('.src-opt').forEach(function (o) { o.classList.toggle('on', o.dataset.v === mode); });
      }
      sync();
      function build() {
        err.textContent = '';
        var name = nameInp.value.trim();
        if (!name) { err.textContent = 'Укажите название.'; nameInp.focus(); return Promise.resolve(null); }
        var p = App.newProtocol(name);
        p.perceptive = perc.checked;
        if (mode === 'paste') {
          pasteArea.value.split(/\r?\n/).map(function (s) { return s.replace(/^\s*\d+[.)]?\s+/, '').trim(); }).filter(Boolean)
            .forEach(function (n) { p.participants.push({ id: U.uid(), name: n, photo: null }); });
          return Promise.resolve(p);
        }
        if (mode === 'copy') {
          var src = list.filter(function (x) { return x.id === copySel.value; })[0];
          if (src) src.participants.forEach(function (x) { p.participants.push({ id: U.uid(), name: x.name, photo: x.photo || null }); });
          return Promise.resolve(p);
        }
        if (mode === 'file') {
          var f = fileInp.files[0];
          if (!f) { err.textContent = 'Выберите файл.'; return Promise.resolve(null); }
          return SM.importers.readRows(f).then(function (rows) {
            if (hasChoices.checked) {
              var r = SM.importers.rowsToChoices(rows);
              if (!r.names.length) throw new Error('В файле не найдено участников.');
              r.names.forEach(function (n) { p.participants.push({ id: U.uid(), name: n || 'Без имени', photo: null }); });
              r.matrix.forEach(function (row, i) {
                row.forEach(function (v, j) {
                  if (!v) return;
                  var a = p.participants[i].id, b = p.participants[j].id;
                  (p.choices[a] = p.choices[a] || {})[b] = v;
                });
              });
              if (r.warnings.length) U.toast('Есть замечания к файлу: ' + r.warnings.length + '. Первое: ' + r.warnings[0], 'warn');
            } else {
              var names = SM.importers.rowsToNames(rows);
              if (!names.length) throw new Error('В файле не найдено ни одного ФИО.');
              names.forEach(function (n) { p.participants.push({ id: U.uid(), name: n, photo: null }); });
            }
            return p;
          }).catch(function (e) { err.textContent = e.message; return null; });
        }
        return Promise.resolve(p);
      }
      // Окно не закрывается, пока данные не прошли проверку
      U.modal('Новая социометрия', body, [
        { label: 'Отмена', value: null },
        { label: 'Создать', kind: 'primary', action: function () {
          return build().then(function (p) { return p ? App.save(p).then(function () { return p; }) : null; });
        } }
      ]).then(function (p) {
        if (p) location.hash = '#/p/' + encodeURIComponent(p.id);
      });
    });
  }

  // ---------- Резервные копии ----------
  function exportDb() {
    SM.store.exportAll().then(function (data) {
      var d = new Date().toISOString().slice(0, 10);
      return Promise.resolve(U.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'Linx-база-' + d + '.json')).then(function (ok) {
        if (ok !== false) U.toast('Файл базы сохранён: протоколов ' + data.protocols.length);
      });
    });
  }
  function importDb() {
    U.pickFile('.json,application/json').then(function (f) {
      if (!f) return;
      f.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) { U.toast('Это не файл базы (не JSON).', 'error'); return; }
        if (!data || !Array.isArray(data.protocols)) { U.toast('Файл не похож на базу социометрии.', 'error'); return; }
        U.modal('Загрузка базы', h('div', null,
          h('p', null, 'В файле протоколов: ' + data.protocols.length + (data.exported ? ' (сохранён ' + U.fmtDateTime(data.exported) + ')' : '') + '.'),
          h('p', { class: 'muted' }, '«Добавить» - протоколы из файла добавятся к имеющимся (совпадающие заменятся версией из файла). «Заменить всё» - текущая база будет удалена.')),
        [{ label: 'Отмена', value: null }, { label: 'Заменить всё', kind: 'danger', value: 'replace' }, { label: 'Добавить', kind: 'primary', value: 'merge' }])
          .then(function (mode) {
            if (!mode) return;
            SM.store.importAll(data, mode).then(function (n) {
              return SM.texts.load().then(function () { U.toast('Загружено протоколов: ' + n); App.route(); });
            }).catch(function (e) { U.toast(e.message, 'error'); });
          });
      });
    });
  }

  function help() {
    var S = function (t) { return h('h2', null, t); }, P = function (t) { return h('p', null, t); };
    main.appendChild(h('div', { class: 'card prose' },
      h('h1', null, 'Справка'),
      S('Как работать'),
      h('ol', null,
        h('li', null, 'Создайте социометрию: введите название и список участников (вручную, из файла XLSX/CSV или из другого протокола).'),
        h('li', null, 'На вкладке «Протокол» отметьте «изменить» у участника и проставьте, кого он выбрал положительно (+) и отрицательно (-). Можно вводить всё сразу в режиме «Матрица».'),
        h('li', null, 'Откройте «Общий отчёт», «Индивидуальный отчёт» или «Взаимные выборы». Для PDF нажмите «Печать / PDF» и выберите «Сохранить как PDF».')),
      S('Где хранятся данные'),
      P(SM.nativeDataText ? SM.nativeDataText() : ''),
      h('div', { class: 'page-actions' },
        h('button', { type: 'button', class: 'btn', onclick: exportDb, title: 'Скачать всю базу (протоколы, фото, тексты) одним файлом' }, 'Сохранить базу в файл'),
        h('button', { type: 'button', class: 'btn', onclick: importDb, title: 'Загрузить базу из ранее сохранённого файла' }, 'Загрузить из файла')),
      S('Формулы'),
      P('Персональные индексы: Ci+ = R+/(N-1), Ci- = R-/(N-1), Ci = (R+ - R-)/(N-1), E+ = S+/(N-1), E- = S-/(N-1), E = (S+ + S-)/(N-1), Куд = R+/S+. R - полученные выборы, S - сделанные.'),
      P('Статусы определяются по числу полученных положительных выборов относительно среднего по группе (пороги - округлённые 2, 1.5 и 0.5 среднего) и по соотношению отрицательных выборов. Пороги для конкретной группы видны в легенде отчёта.'),
      P('Групповые индексы Gg и Kg считаются по числу участников, имеющих взаимные связи, делённому на число возможных пар; классический вариант через число пар показан в пояснении. Все значения округляются до двух знаков.'),
      S('Тексты'),
      P('Все пояснения, легенда, интерпретация и рекомендации редактируются в разделе «Тексты отчёта». В фигурных скобках - подстановки: {N} заменится числом, {N:участник|участника|участников} - словом в нужном падеже.'),
      aboutBlock(S, P)));
  }

  // ---------- О программе ----------
  var REPO = 'https://github.com/makulatury/linx';
  function aboutBlock(S, P) {
    var box = h('div', { class: 'about' });
    if (!SM.nativeAbout) return box;
    SM.nativeAbout().then(function (a) {
      var comps = a.components, counts = {};
      // Отдельные лицензии из выражений вида «MIT OR Apache-2.0», «MIT/Apache-2.0»
      comps.forEach(function (c) {
        c.license.split(/\s+OR\s+|\s+AND\s+|\s*\/\s*|[()]/).map(function (x) { return x.trim(); }).filter(Boolean)
          .forEach(function (x) { if (!/^см\.|^не указана/.test(x)) counts[x] = (counts[x] || 0) + 1; });
      });
      var lic = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; });
      var tauri = comps.filter(function (c) { return c.name === 'tauri'; })[0];
      var link = h('a', { href: REPO, onclick: function (e) { e.preventDefault(); SM.openUrl(REPO).catch(function () { U.toast('Не удалось открыть ссылку', 'error'); }); } }, REPO);
      var full = h('pre', { class: 'about-text' }, 'Загрузка...');
      var fullBox = h('details', null, h('summary', null, 'Тексты лицензий сторонних компонентов'), full);
      fullBox.addEventListener('toggle', function () {
        if (fullBox.open && !full.dataset.loaded) SM.nativeThirdPartyText().then(function (t) { full.textContent = t; full.dataset.loaded = '1'; });
      });
      box.appendChild(h('div', null,
        S('О программе'),
        P('Linx, версия ' + a.version + '. © 2026 makulatury.'),
        h('p', null, 'Распространяется по лицензии MIT. Исходный код: ', link, '.'),
        h('details', null, h('summary', null, 'Текст лицензии MIT'), h('pre', { class: 'about-text' }, a.license)),
        P('Программа предоставляется «как есть», без каких-либо гарантий.'),
        P('Результаты отчёта не являются психологическим диагнозом и не заменяют профессиональную оценку.'),
        S('Использованные компоненты'),
        P('Программа построена на Tauri' + (tauri ? ' ' + tauri.version + ' (' + tauri.license + ')' : '') + ' и использует ' + comps.length +
          ' библиотек на Rust. Все они распространяются по свободным лицензиям: ' + lic.join(', ') + '. Окно программы показывает системный компонент Microsoft Edge WebView2.'),
        P('Тексты лицензий также лежат рядом с программой в файле THIRD-PARTY-LICENSES.txt.'),
        h('details', null, h('summary', null, 'Список компонентов'),
          h('div', { class: 'table-scroll' }, h('table', { class: 'tbl' },
            h('thead', null, h('tr', null, h('th', null, 'Компонент'), h('th', null, 'Версия'), h('th', null, 'Лицензия'))),
            h('tbody', null, comps.map(function (c) { return h('tr', null, h('td', null, c.name), h('td', null, c.version), h('td', null, c.license)); }))))),
        fullBox));
    }).catch(function () {});
    return box;
  }

  // ---------- Запуск ----------
  function start() {
    shell();
    if (!window.smNativeStore) {
      main.appendChild(h('div', { class: 'card' }, 'Этот файл - часть программы Linx и работает только внутри неё. Запустите Linx.exe.'));
      return;
    }
    SM.texts.load().then(function () {
      window.addEventListener('hashchange', App.route);
      App.route();
    }).catch(function (e) {
      main.appendChild(h('div', { class: 'card' }, 'Не удалось открыть хранилище: ' + e.message));
    });
  }
  App.start = start;
})(window);
