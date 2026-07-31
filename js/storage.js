// Storage module — all data lives on user's device

const Storage = {
  KEYS: {
    chat: 'hd_chat',
    profile: 'hd_profile',
    entries: 'hd_entries',
    settings: 'hd_settings',
    glucose: 'hd_glucose',
    food: 'hd_food'
  },

  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('Storage write failed:', e); }
  },

  // Chat
  getChat() {
    return this.get(this.KEYS.chat) || {
      messages: [],
      state: 'init',
      userMsgCount: 0,
      questionCount: 0
    };
  },
  saveChat(data) { this.set(this.KEYS.chat, data); },

  // Profile
  getProfile() { return this.get(this.KEYS.profile) || {}; },
  saveProfile(data) { this.set(this.KEYS.profile, data); },

  // Glucose log: [{value, type, time, source, raw}]
  getGlucoseLog() { return this.get(this.KEYS.glucose) || []; },
  addGlucose(entry) {
    const log = this.getGlucoseLog();
    // Дедуп замеров-призраков (БАГ-2): пересланное сообщение или «я же написал 5,9»
    // не должны заводить НОВЫЙ замер. Дубль = то же значение+тип+день в узком окне
    // времени (<=20 мин). Разные реальные замеры (другой тип/далеко во времени) — целы.
    if (this._isDuplicateGlucose(log, entry)) return false;
    log.push(entry);
    this.set(this.KEYS.glucose, log);
    return true;
  },
  _isDuplicateGlucose(log, e) {
    const WINDOW_MS = 20 * 60 * 1000;
    const eType = e.type || 'random';
    for (let i = log.length - 1; i >= 0; i--) {
      const p = log[i];
      if (p.value !== e.value) continue;
      if ((p.type || 'random') !== eType) continue;
      const sameDay = (p.dateISO && e.dateISO)
        ? p.dateISO === e.dateISO
        : Math.abs((p.time || 0) - (e.time || 0)) < 24 * 60 * 60 * 1000;
      if (!sameDay) continue;
      let close;
      if (p.localMinute != null && e.localMinute != null && p.dateISO && p.dateISO === e.dateISO) {
        close = Math.abs(p.localMinute - e.localMinute) <= 20;
      } else {
        close = Math.abs((p.time || 0) - (e.time || 0)) <= WINDOW_MS;
      }
      if (close) return true;
    }
    return false;
  },
  // Привязать точное время к ранее сохранённому замеру (пациент назвал его позже).
  // minute — минута суток в поясе пациента; dateISO — его локальная дата.
  setGlucoseTime(idx, minute, dateISO) {
    const log = this.getGlucoseLog();
    if (idx < 0 || idx >= log.length) return false;
    const e = log[idx];
    e.localMinute = minute;
    if (dateISO) e.dateISO = dateISO;
    e.timeCertain = true;
    // Время появилось задним числом — пересчитать уровень достоверности,
    // иначе он замёрз на значении из момента создания (баг: точка на оси, но
    // помечена как «без времени»). recalled не поднимаем — память ненадёжна.
    if (!e.recalled) {
      const hasContext = e.type && e.type !== 'random';
      e.confidence = hasContext ? 'full' : 'partial';
    }
    if (e.dateISO) {
      const [y, mo, d] = e.dateISO.split('-').map(Number);
      const dt = new Date(y, mo - 1, d);
      dt.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      e.time = dt.getTime();
    }
    this.set(this.KEYS.glucose, log);
    return true;
  },

  // Food log: [{time, foods, kcal, peakEstimate, certain}]
  getFoodLog() { return this.get(this.KEYS.food) || []; },
  addFood(entry) {
    const log = this.getFoodLog();
    log.push(entry);
    this.set(this.KEYS.food, log);
  },

  // Diary entries
  getEntries() { return this.get(this.KEYS.entries) || []; },
  addEntry(entry) {
    const entries = this.getEntries();
    entry.timestamp = Date.now();
    entries.push(entry);
    this.set(this.KEYS.entries, entries);
  },

  // Settings
  getSettings() {
    return this.get(this.KEYS.settings) || { theme: 'light', fontLarge: false };
  },
  saveSettings(data) { this.set(this.KEYS.settings, data); },

  // Export all data as JSON
  exportAll() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      chat: this.getChat(),
      profile: this.getProfile(),
      entries: this.getEntries(),
      settings: this.getSettings()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Import from JSON file
  importAll(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.version) { reject('Неверный формат файла'); return; }
          if (data.chat) this.saveChat(data.chat);
          if (data.profile) this.saveProfile(data.profile);
          if (data.entries) this.set(this.KEYS.entries, data.entries);
          if (data.settings) this.saveSettings(data.settings);
          resolve(data);
        } catch { reject('Ошибка чтения файла'); }
      };
      reader.onerror = () => reject('Ошибка чтения файла');
      reader.readAsText(file);
    });
  },

  // Clear everything
  clearAll() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  }
};
