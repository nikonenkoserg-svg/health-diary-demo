// Storage module — all data lives on user's device

const Storage = {
  KEYS: {
    chat: 'hd_chat',
    profile: 'hd_profile',
    entries: 'hd_entries',
    settings: 'hd_settings'
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
    return this.get(this.KEYS.settings) || { theme: 'dark', fontLarge: false };
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
