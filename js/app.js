// App — initialization, routing, event binding

const App = {
  init() {
    // Set app height for iOS
    this.setAppHeight();
    window.addEventListener('resize', () => this.setAppHeight());

    // Init modules
    Theme.init();
    Chat.init();

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

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchScreen(tab.dataset.screen));
    });

    // Settings
    document.getElementById('btnSettings').addEventListener('click', () => this.toggleSettings(true));
    document.getElementById('btnCloseSettings').addEventListener('click', () => this.toggleSettings(false));
    document.getElementById('btnFont').addEventListener('click', () => Theme.toggleFont());
    document.getElementById('btnExport').addEventListener('click', () => Storage.exportAll());
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

  switchScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.screen === name);
    });
  },

  toggleSettings(show) {
    document.getElementById('settings-panel').classList.toggle('hidden', !show);
  }
};

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Start
window.addEventListener('load', () => App.init());
