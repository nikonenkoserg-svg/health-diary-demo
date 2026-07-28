// Sync — серверная память пациента (Supabase Storage через /api/sync).
// patient_id = хэш email: стабилен между устройствами и переживает чистку localStorage
// (заново ввёл тот же email → тот же бэкап). Ключ пациента наружу не светим — только хэш.
const Sync = {
  DEBOUNCE_MS: 6000,
  _timer: null,
  _dirty: false,

  // cyrb53 — маленький детерминированный хэш строки → hex-имя файла бэкапа.
  _hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return 'p' + n.toString(16);
  },

  _email() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getEmail) {
        const e = Auth.getEmail();
        return e ? String(e).trim().toLowerCase() : null;
      }
    } catch (_) {}
    return null;
  },

  patientId() {
    const e = this._email();
    return e ? this._hash(e) : null;
  },

  // все пользовательские блобы localStorage (hd_*), кроме служебной метки синхры
  // Не синхронизируем: служебную метку синхры, кэш векторов библиотеки (общий для всех,
  // ~87% объёма, пересобирается на устройстве) и лог отладки. Синкаем только личные данные.
  _SKIP: { hd_synced_at: 1, hd_lib_vec_cache: 1, hd_debug_log: 1 },
  _collect() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('hd_') === 0 && !this._SKIP[k]) out[k] = localStorage.getItem(k);
    }
    return out;
  },

  // Тянем бэкап с сервера. Если сервер свежее или локально пусто — подставляем и перезагружаемся.
  async pull(force) {
    if (!force && sessionStorage.getItem('hd_sync_pulled')) return false;
    const id = this.patientId();
    if (!id) return false;
    sessionStorage.setItem('hd_sync_pulled', '1');
    let server;
    try {
      const r = await fetch('/api/sync?id=' + id);
      if (r.status !== 200) return false;
      server = await r.json();
    } catch (_) { return false; }
    if (!server || !server.blobs) return false;
    const serverAt = +new Date(server.updated_at || 0);
    const localAt = +(localStorage.getItem('hd_synced_at') || 0);
    const localEmpty = !localStorage.getItem('hd_profile_v2') && !localStorage.getItem('hd_chat');
    if (localEmpty || serverAt > localAt) {
      Object.keys(server.blobs).forEach(k => { try { localStorage.setItem(k, server.blobs[k]); } catch (_) {} });
      localStorage.setItem('hd_synced_at', String(serverAt || Date.now()));
      location.reload();
      return true;
    }
    return false;
  },

  markDirty() {
    if (!this.patientId()) return;
    this._dirty = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), this.DEBOUNCE_MS);
  },

  async push() {
    const id = this.patientId();
    if (!id || !this._dirty) return;
    // Защита бэкапа: не пушим, пока в этой сессии не отработал pull (иначе свежая
    // сессия после сброса затрёт хороший серверный бэкап до восстановления).
    if (!sessionStorage.getItem('hd_sync_pulled')) { return; }
    // И не пишем пустоту поверх бэкапа.
    if (!localStorage.getItem('hd_profile_v2') && !localStorage.getItem('hd_chat')) { return; }
    this._dirty = false;
    const now = Date.now();
    const payload = { id: id, data: { blobs: this._collect(), updated_at: new Date(now).toISOString() } };
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) localStorage.setItem('hd_synced_at', String(now));
      else this._dirty = true;
    } catch (_) { this._dirty = true; }
  },

  // Перехват записей всех хранилищ → отмечаем dirty (дебаунс-пуш).
  _hook() {
    const wrap = (obj, m) => {
      if (!obj || typeof obj[m] !== 'function' || obj['_sync_' + m]) return;
      const orig = obj[m].bind(obj);
      obj[m] = function () { const r = orig.apply(null, arguments); try { Sync.markDirty(); } catch (_) {} return r; };
      obj['_sync_' + m] = true;
    };
    if (typeof Storage !== 'undefined') wrap(Storage, 'set');
    if (typeof ProfileStore !== 'undefined') wrap(ProfileStore, '_save');
    if (typeof PatientMemory !== 'undefined') wrap(PatientMemory, 'save');
  },

  init() {
    this._hook();
    this.pull();
    window.addEventListener('pagehide', () => { if (this._dirty) this.push(); });
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && this._dirty) this.push(); });
  }
};

if (typeof window !== 'undefined') {
  window.Sync = Sync;
  if (document.readyState !== 'loading') Sync.init();
  else window.addEventListener('DOMContentLoaded', () => Sync.init());
}
