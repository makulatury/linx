/* Мост к настольной программе (Tauri). В обычном браузере ничего не делает.
   В программе:
   - window.smNativeStore - хранение базы в файлах на диске (папка данных программы);
   - SM.util.download - сохранение файлов через системное окно «Сохранить как». */
(function (root) {
  'use strict';
  var T = root.__TAURI__;
  if (!T || !T.core) return;
  var invoke = T.core.invoke;

  root.smNativeStore = {
    listProtocols: function () { return invoke('store_list'); },
    getProtocol: function (id) { return invoke('store_get', { id: id }).then(function (p) { return p === null ? undefined : p; }); },
    putProtocol: function (p) { return invoke('store_put', { protocol: p }); },
    deleteProtocol: function (id) { return invoke('store_delete', { id: id }); },
    clearProtocols: function () { return invoke('store_clear'); },
    getSetting: function (key) { return invoke('setting_get', { key: key }).then(function (v) { return v === null ? undefined : v; }); },
    putSetting: function (key, value) { return invoke('setting_put', { key: key, value: value === undefined ? null : value }); }
  };

  var FILTERS = {
    png: { name: 'Изображение PNG', extensions: ['png'] },
    docx: { name: 'Документ Word', extensions: ['docx'] },
    xlsx: { name: 'Книга Excel', extensions: ['xlsx'] },
    json: { name: 'Файл базы', extensions: ['json'] }
  };

  function nativeDownload(blob, name) {
    var ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1];
    var f = ext && FILTERS[ext.toLowerCase()];
    return T.dialog.save({ defaultPath: name, filters: f ? [f] : [] }).then(function (path) {
      if (!path) return false;
      return blob.arrayBuffer().then(function (buf) {
        return invoke('save_file', new Uint8Array(buf), { headers: { 'x-path': encodeURIComponent(path) } });
      }).then(function () { return true; });
    }).catch(function (e) {
      var U = root.SM && root.SM.util;
      var msg = 'Не удалось сохранить файл: ' + (e && e.message || e);
      if (U && U.toast) U.toast(msg, 'error'); else alert(msg);
      return false;
    });
  }

  // Возвращает Promise<true|false>: false - пользователь отменил сохранение или произошла ошибка.
  // util.js уже загружен (этот файл подключается сразу после него)
  if (root.SM && root.SM.util) root.SM.util.download = nativeDownload;
  root.SM = root.SM || {};
  root.SM.native = true;

  // Где лежит база: папка «Linx-данные» рядом с программой (переносная версия) или папка пользователя.
  // Текст для справки; до ответа программы - общий вариант.
  var info = null;
  root.SM.nativeDataText = function () {
    var tail = ' Интернет не нужен. Регулярно нажимайте «Сохранить базу в файл» - это резервная копия. Этот же файл переносит базу на другой компьютер: там откройте программу и нажмите «Загрузить из файла».';
    if (!info) return 'Все протоколы, фото и ваши тексты хранятся на этом компьютере в папке данных программы.' + tail;
    if (info.portable) return 'Это переносная версия: все протоколы, фото и ваши тексты хранятся в папке «Linx-данные» рядом с программой (' + info.dir + '). Программу можно переносить вместе с этой папкой, например на флешке.' + tail;
    return 'Все протоколы, фото и ваши тексты хранятся на этом компьютере в папке ' + info.dir + '.' + tail;
  };
  invoke('data_info').then(function (i) {
    info = i;
    if (!i.warning) return;
    // Показать, когда интерфейс уже построен
    var show = function () {
      var U = root.SM.util;
      U.modal('Папка для базы недоступна', U.h('p', null, i.warning), [{ label: 'Понятно', kind: 'primary', value: true }]);
    };
    if (document.readyState === 'complete') setTimeout(show, 300);
    else root.addEventListener('load', function () { setTimeout(show, 300); });
  }).catch(function () {});
})(window);
