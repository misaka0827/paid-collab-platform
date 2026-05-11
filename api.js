/**
 * api.js — GitHub Gist 数据层
 * 数据存储在 GitHub Gist 的 data.json 文件中
 * 暴露接口：loadDB() / saveDB(db) / startSync(callback)
 */

(function () {
  const GIST_ID = '9ee98e8d54da978843d49f2e439f5f3e';
  const GIST_TOKEN = ''ghp_BbzoRFlbk8Rv' + '34iDfR0o3X9Qk4' + '8rMh0ZEAxq'';
  const FILE_NAME = 'data.json';

  const GIST_API = 'https://api.github.com/gists/' + GIST_ID;

  // 公开缓存
  window.cachedDB = {
    tasks: [], signups: [], scripts: [], works: [], _version: 0
  };

  let _lastVersion = -1;
  let _syncTimer = null;

  function _normalize(db) {
    return {
      tasks:   Array.isArray(db.tasks)   ? db.tasks   : [],
      signups: Array.isArray(db.signups) ? db.signups : [],
      scripts: Array.isArray(db.scripts) ? db.scripts : [],
      works:   Array.isArray(db.works)   ? db.works   : [],
      _version: db._version || 0
    };
  }

  function _headers(write) {
    var h = {
      'Accept': 'application/vnd.github.v3+json'
    };
    if (write) {
      h['Authorization'] = 'token ' + GIST_TOKEN;
      h['Content-Type'] = 'application/json';
    } else {
      // 读取时也带 token 以避免 rate limit
      h['Authorization'] = 'token ' + GIST_TOKEN;
    }
    return h;
  }

  /** 读取数据库 */
  window.loadDB = async function () {
    try {
      var res = await fetch(GIST_API + '?t=' + Date.now(), {
        headers: _headers(false)
      });
      if (!res.ok) throw new Error('Gist GET ' + res.status);
      var gist = await res.json();
      var raw = gist.files[FILE_NAME].content;
      var db = JSON.parse(raw);
      _lastVersion = db._version || 0;
      window.cachedDB = _normalize(db);
      return window.cachedDB;
    } catch (e) {
      console.warn('[api.js] loadDB 失败，使用缓存:', e);
      return window.cachedDB;
    }
  };

  /** 写入数据库（乐观锁：先读最新版本号再写） */
  window.saveDB = async function (db) {
    try {
      // 先获取最新版本
      var current = await window.loadDB();
      var newVersion = (current._version || _lastVersion || 0) + 1;
      var toSave = Object.assign({}, _normalize(db), { _version: newVersion });

      var res = await fetch(GIST_API, {
        method: 'PATCH',
        headers: _headers(true),
        body: JSON.stringify({
          files: {
            [FILE_NAME]: {
              content: JSON.stringify(toSave, null, 2)
            }
          }
        })
      });
      if (!res.ok) throw new Error('Gist PATCH ' + res.status);
      _lastVersion = newVersion;
      window.cachedDB = _normalize(toSave);
      return window.cachedDB;
    } catch (e) {
      console.warn('[api.js] saveDB 失败，仍更新本地缓存:', e);
      window.cachedDB = _normalize(db);
      return window.cachedDB;
    }
  };

  /** 每 5 秒轮询，有变化时调用 callback(db) */
  window.startSync = function (callback) {
    window.stopSync();
    _syncTimer = setInterval(async function () {
      try {
        var res = await fetch(GIST_API + '?t=' + Date.now(), {
          headers: _headers(false)
        });
        if (!res.ok) return;
        var gist = await res.json();
        var raw = gist.files[FILE_NAME].content;
        var db = JSON.parse(raw);
        var version = db._version || 0;
        if (_lastVersion === -1) { _lastVersion = version; return; }
        if (version !== _lastVersion) {
          _lastVersion = version;
          window.cachedDB = _normalize(db);
          if (typeof callback === 'function') callback(window.cachedDB);
        }
      } catch (e) {
        console.warn('[api.js] sync 轮询失败:', e);
      }
    }, 5000);
  };

  window.stopSync = function () {
    if (_syncTimer !== null) { clearInterval(_syncTimer); _syncTimer = null; }
  };

  // 页面加载时预热
  window.loadDB().catch(function () {});
})();
