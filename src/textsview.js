/* Раздел «Тексты отчёта»: правка шаблонов. */
(function (root) {
  'use strict';
  var SM = root.SM, h = SM.util.h, U = SM.util, T = SM.texts;

  SM.textsView = function (main) {
    var active = T.GROUPS[0].id;
    var body = h('div', { class: 'texts-body' });
    var side = h('nav', { class: 'texts-nav' });
    main.appendChild(h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Тексты отчёта'),
        h('p', { class: 'muted' }, 'Здесь можно заменить любые формулировки отчёта своими. Изменения сохраняются автоматически и попадают в файл базы. В фигурных скобках - подстановки: {N} заменится числом, а {N:участник|участника|участников} - словом в нужной форме.')),
      h('div', { class: 'page-actions' }, h('button', { type: 'button', class: 'btn btn-danger-ghost', onclick: function () {
        U.confirmBox('Вернуть все стандартные тексты?', 'Все ваши правки текстов будут удалены.', 'Вернуть').then(function (ok) {
          if (ok) T.reset().then(function () { U.toast('Стандартные тексты восстановлены'); draw(); });
        });
      } }, 'Вернуть все стандартные'))));
    main.appendChild(h('div', { class: 'texts-layout' }, side, body));

    function draw() {
      side.innerHTML = '';
      T.GROUPS.forEach(function (g) {
        var n = Object.keys(T.DEFS).filter(function (k) { return T.DEFS[k][0] === g.id && T.isCustom(k); }).length;
        side.appendChild(h('button', { type: 'button', class: 'texts-tab' + (g.id === active ? ' on' : ''), onclick: function () { active = g.id; draw(); } },
          g.title, n ? h('span', { class: 'badge badge-info' }, n) : null));
      });
      body.innerHTML = '';
      Object.keys(T.DEFS).filter(function (k) { return T.DEFS[k][0] === active; }).forEach(function (k) {
        var def = T.DEFS[k];
        var ta = h('textarea', { class: 'input', rows: Math.max(2, Math.ceil(T.raw(k).length / 90)) });
        ta.value = T.raw(k);
        var mark = h('span', { class: 'badge badge-info' + (T.isCustom(k) ? '' : ' hidden') }, 'изменён');
        var saveIt = U.debounce(function () { T.set(k, ta.value).then(function () { mark.classList.toggle('hidden', !T.isCustom(k)); }); }, 400);
        ta.addEventListener('input', saveIt);
        body.appendChild(h('div', { class: 'card text-item' },
          h('div', { class: 'text-item-head' }, h('b', null, def[1]), mark,
            h('button', { type: 'button', class: 'btn btn-xs', onclick: function () {
              T.reset(k).then(function () { ta.value = T.raw(k); mark.classList.add('hidden'); });
            } }, 'стандартный текст')),
          ta,
          def[3] ? h('div', { class: 'muted small' }, 'Подстановки: ' + def[3]) : null));
      });
    }
    draw();
  };
})(window);
