/* Слой хранения. База хранится программой на диске (window.smNativeStore из native.js).
   Методы движка: listProtocols, getProtocol, putProtocol, deleteProtocol, clearProtocols,
                  getSetting, putSetting (все возвращают Promise).
   Здесь же - выгрузка и загрузка всей базы одним файлом (exportAll, importAll). */
(function (root) {
  'use strict';
  function missing() { return Promise.reject(new Error('Хранилище недоступно: откройте программу Linx.')); }
  var backend = root.smNativeStore || {
    listProtocols: missing, getProtocol: missing, putProtocol: missing, deleteProtocol: missing,
    clearProtocols: missing, getSetting: missing, putSetting: missing
  };

  var FORMAT = 'sociometry-offline-db';

  var Store = {
    backend: backend,
    listProtocols: function () { return backend.listProtocols(); },
    getProtocol: function (id) { return backend.getProtocol(id); },
    putProtocol: function (p) { p.updated = new Date().toISOString(); return backend.putProtocol(p); },
    deleteProtocol: function (id) { return backend.deleteProtocol(id); },
    getSetting: function (k) { return backend.getSetting(k); },
    putSetting: function (k, v) { return backend.putSetting(k, v); },

    // Вся база одним объектом (протоколы с фото + пользовательские тексты)
    exportAll: function () {
      return Promise.all([backend.listProtocols(), backend.getSetting('texts')]).then(function (r) {
        return { format: FORMAT, version: 1, exported: new Date().toISOString(), protocols: r[0], texts: r[1] || {} };
      });
    },
    // mode: 'merge' - добавить/обновить по id; 'replace' - заменить всё
    importAll: function (data, mode) {
      if (!data || data.format !== FORMAT || !Array.isArray(data.protocols))
        return Promise.reject(new Error('Файл не похож на резервную копию базы социометрии.'));
      var start = mode === 'replace' ? backend.clearProtocols() : Promise.resolve();
      return start.then(function () {
        return data.protocols.reduce(function (p, proto) {
          return p.then(function () { return backend.putProtocol(proto); });
        }, Promise.resolve());
      }).then(function () {
        if (data.texts && (mode === 'replace' || Object.keys(data.texts).length))
          return backend.getSetting('texts').then(function (cur) {
            var merged = mode === 'replace' ? data.texts : Object.assign({}, cur || {}, data.texts);
            return backend.putSetting('texts', merged);
          });
      }).then(function () { return data.protocols.length; });
    }
  };

  root.SM = root.SM || {};
  root.SM.store = Store;
})(window);
