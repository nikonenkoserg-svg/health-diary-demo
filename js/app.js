// App — initialization, routing, event binding

const APP_VERSION = 'v50';

const App = {
  init() {
    // Set app height for iOS
    this.setAppHeight();
    window.addEventListener('resize', () => this.setAppHeight());

    // Init modules
    Theme.init();
    Chat.init();
    if (typeof Chart !== "undefined") Chart.initPanel();

    // Bind events
    this.bindEvents();
  },

  setAppHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  },

  bindEvents() {
    // Send
    const input = document.getElementById('input');
    const btnSend = document.getElementById('btnSend');

    input.addEventListener('input', () => {
      // Auto-grow
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      // Enable/disable send
      btnSend.disabled = !input.value.trim();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    btnSend.addEventListener('click', () => this.handleSend());

    // Voice
    document.getElementById('btnMic').addEventListener('click', () => Voice.toggle());

    // Theme
    document.getElementById('btnTheme').addEventListener('click', () => Theme.toggle());
    const btnProfile = document.getElementById('btnProfile');
    if (btnProfile && typeof ProfileOverlay !== 'undefined') {
      btnProfile.addEventListener('click', () => ProfileOverlay.open());
    }

    // Settings
    document.getElementById('btnSettings').addEventListener('click', () => this.toggleSettings(true));
    document.getElementById('btnCloseSettings').addEventListener('click', () => this.toggleSettings(false));
    document.getElementById('btnFont').addEventListener('click', () => Theme.toggleFont());

    // Часовой пояс
    const updateTzLabel = () => {
      const btn = document.getElementById('btnTimezone');
      if (btn && typeof Time !== 'undefined') {
        const tp = Time.nowParts();
        const label = Time.tzLabel();
        btn.textContent = label.split('/').pop().replace(/_/g, ' ') + ' · ' + tp.hour + ':' + String(tp.minute).padStart(2, '0');
        btn.title = label + ' — сейчас ' + tp.hour + ':' + String(tp.minute).padStart(2, '0');
      }
    };
    updateTzLabel();
    // Версия приложения
    const verEl = document.getElementById('settingsVersion');
    if (verEl) verEl.textContent = APP_VERSION;
    // Кнопка принудительного сброса кеша
    const forceBtn = document.getElementById('btnForceUpdate');
    if (forceBtn) {
      forceBtn.addEventListener('click', async () => {
        if (!window.confirm('Сбросить кеш приложения и перезагрузиться?')) return;
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
          }
        } catch (e) { console.error('Cache reset error:', e); }
        window.location.reload();
      });
    }
    document.getElementById('btnTimezone').addEventListener('click', () => {
      const cur = (typeof Time !== 'undefined') ? Time.getTz() : 'UTC';
      const v = window.prompt('IANA часовой пояс (например, America/Sao_Paulo или Europe/Paris):', cur);
      if (v && v.trim()) {
        const clean = v.trim();
        // Проверяем что IANA-строка валидна
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: clean });
          Time.setTz(clean);
          updateTzLabel();
          if (typeof Chat !== 'undefined' && Chat.chatData && Chat.chatData.dayLog) {
            // Перерисовать график с новой tz
            if (typeof Chart !== 'undefined') Chart.updatePanel();
          }
        } catch {
          window.alert('Неверный часовой пояс. Пример: Europe/Paris, America/Sao_Paulo');
        }
      }
    });
    document.getElementById('btnExport').addEventListener('click', () => Storage.exportAll());
    document.getElementById('btnCopyChat').addEventListener('click', () => {
      const chat = Storage.getChat();
      const text = (chat.messages || []).map(m => {
        const who = m.role === 'user' ? 'Я' : 'Ассистент';
        return who + ': ' + m.content;
      }).join('\n\n');
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btnCopyChat');
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = '📋', 1500);
      }).catch(() => {
        // Fallback for iOS
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const btn = document.getElementById('btnCopyChat');
        btn.textContent = '✅';
        setTimeout(() => btn.textContent = '📋', 1500);
      });
    });
    document.getElementById('btnImport').addEventListener('click', () => {
      document.getElementById('fileImport').click();
    });
    document.getElementById('fileImport').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await Storage.importAll(file);
        window.location.reload();
      } catch (err) {
        alert(err);
      }
    });
    document.getElementById('btnClear').addEventListener('click', () => {
      if (confirm('Удалить все данные? Это нельзя отменить.')) {
        Storage.clearAll();
        window.location.reload();
      }
    });

    // Settings panel — close on backdrop click
    document.getElementById('settings-panel').addEventListener('click', (e) => {
      if (e.target.id === 'settings-panel') this.toggleSettings(false);
    });

    // Safari bfcache
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) window.location.reload();
    });
  },

  handleSend() {
    const input = document.getElementById('input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('btnSend').disabled = true;
    Chat.send(text);
  },

  toggleSettings(show) {
    document.getElementById('settings-panel').classList.toggle('hidden', !show);
  }
};

// Service Worker — авто-перезагрузка при обновлении
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('/sw.js');
}

// Start
window.addEventListener('load', () => App.init());
