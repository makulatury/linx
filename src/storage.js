/* Слой хранения. Интерфейс один, движок подменяемый:
   - по умолчанию IndexedDB в браузере;
   - если окно предоставляет window.smNativeStore (нативная обёртка, например Tauri),
     используется он (те же методы, возвращают Promise).
   Методы: listProtocols, getProtocol, putProtocol, deleteProtocol,
           getSetting, putSetting, exportAll, importAll. */
(function (root) {
  'use strict';
  var DB_NAME = 'sociometry-offline';
  var DB_VER = 1;

  function req2p(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function IdbBackend() {
    var dbp = null;
    function db() {
      if (!dbp) {
        dbp = new Promise(function (res, rej) {
          var r = indexedDB.open(DB_NAME, DB_VER);
          r.onupgradeneeded = function () {
            var d = r.result;
            if (!d.objectStoreNames.contains('protocols')) d.createObjectStore('protocols', { keyPath: 'id' });
            if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
          };
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { rej(r.error); };
        });
      }
      return dbp;
    }
    function tx(store, mode, fn) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(store, mode), s = t.objectStore(store), out;
          Promise.resolve(fn(s)).then(function (v) { out = v; });
          t.oncomplete = function () { res(out); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error); };
        });
      });
    }
    this.listProtocols = function () { return tx('protocols', 'readonly', function (s) { return req2p(s.getAll()); }); };
    this.getProtocol = function (id) { return tx('protocols', 'readonly', function (s) { return req2p(s.get(id)); }); };
    this.putProtocol = function (p) { return tx('protocols', 'readwrite', function (s) { return req2p(s.put(p)); }); };
    this.deleteProtocol = function (id) { return tx('protocols', 'readwrite', function (s) { return req2p(s.delete(id)); }); };
    this.getSetting = function (key) {
      return tx('settings', 'readonly', function (s) { return req2p(s.get(key)); })
        .then(function (r) { return r ? r.value : undefined; });
    };
    this.putSetting = function (key, value) {
      return tx('settings', 'readwrite', function (s) { return req2p(s.put({ key: key, value: value })); });
    };
    this.clearProtocols = function () { return tx('protocols', 'readwrite', function (s) { return req2p(s.clear()); }); };
  }

  var backend = root.smNativeStore || new IdbBackend();

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
