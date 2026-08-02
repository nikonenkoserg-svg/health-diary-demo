// App — initialization, routing, event binding

const APP_VERSION = 'v50';

const App = {
  init() {
    // ?reset=1 обрабатывается синхронно в <head> (до Sync.pull) — см. index.html.

    // Set app height for iOS
    this.setAppHeight();
    window.addEventListener('resize', () => this.setAppHeight());

    // Подстраховка: если регион уже в анкете, но tzOverride отсутствует — выставить
    try {
      if (typeof Time !== 'undefined' && typeof ProfileStore !== 'undefined') {
        const region = ProfileStore.get && ProfileStore.get('anketa', 'region');
        if (region && !Time.getTz()) {
          const tz = Time.regionToTz(region);
          if (tz) Time.setTz(tz);
        }
      }
    } catch (e) { console.warn('[tz init from region]', e); }

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
    const btnCopy = document.getElementById('btnCopyChat');
    // Снимок выделения ДО того, как тап по кнопке его сбросит (iOS схлопывает
    // выделение на touchstart). Читаем текущее состояние безусловно — так снимок
    // отражает реальное намерение (в т.ч. пустое, если ничего не выделено).
    let copySelSnapshot = '';
    const snapSelection = () => {
      copySelSnapshot = (window.getSelection && window.getSelection().toString() || '').trim();
    };
    btnCopy.addEventListener('pointerdown', snapSelection, { capture: true });
    btnCopy.addEventListener('touchstart', snapSelection, { capture: true });
    const flashCopied = () => {
      btnCopy.textContent = '✅';
      setTimeout(() => btnCopy.textContent = '📋', 1500);
    };
    const legacyCopy = (text) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
      flashCopied();
    };
    const putToClipboard = (text) => {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(flashCopied).catch(() => legacyCopy(text));
      } else {
        legacyCopy(text);
      }
    };
    btnCopy.addEventListener('click', () => {
      // Есть выделение (в т.ч. через несколько сообщений) → копируем РОВНО его,
      // не полагаясь на системную плашку, которая на 2+ пузырях хватает весь чат.
      const sel = copySelSnapshot || ((window.getSelection && window.getSelection().toString() || '').trim());
      if (sel) { putToClipboard(sel); copySelSnapshot = ''; return; }
      // Ничего не выделено → окно выбора дня (внутри есть «Весь чат целиком»).
      copySelSnapshot = '';
      App._openCopyDayModal();
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
  },

  // ===== Копирование по дням =====
  _copyToClipboard(text, onDone) {
    if (!text) return;
    const done = () => { if (onDone) onDone(); };
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta); done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(legacy);
    } else { legacy(); }
  },

  // Локальная дата сообщения в поясе-якоре пациента (как режем замеры).
  _msgDateISO(m) {
    if (!m || !m.ts) return null;
    if (typeof Time !== 'undefined' && Time.partsForTs) return Time.partsForTs(m.ts).dateISO;
    const d = new Date(m.ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },

  _messagesText(list) {
    return list
      .filter(m => m.content && m.content !== '[график]')
      .map(m => (m.role === 'user' ? 'Я' : 'Ассистент') + ': ' + m.content)
      .join('\n\n');
  },

  // «31.07.2026» → «2026-07-31» (null если не дата)
  _parseRuDate(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return y + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  },

  _todayRu() {
    const iso = (typeof Time !== 'undefined' && Time.nowParts) ? Time.nowParts().dateISO
      : new Date().toISOString().slice(0,10);
    const [y,mo,d] = iso.split('-');
    return d + '.' + mo + '.' + y;
  },

  _openCopyDayModal() {
    const messages = (Storage.getChat().messages) || [];
    const prev = document.getElementById('copyDayOverlay');
    if (prev) prev.remove();

    const ov = document.createElement('div');
    ov.id = 'copyDayOverlay';
    ov.className = 'copyday-overlay';
    ov.innerHTML =
      '<div class="copyday-card">' +
        '<div class="copyday-title">Скопировать день</div>' +
        '<label class="copyday-label" for="copyDayInput">Дата (ДД.ММ.ГГГГ)</label>' +
        '<div class="copyday-row">' +
          '<input id="copyDayInput" class="copyday-input" inputmode="numeric" autocomplete="off" placeholder="дд.мм.гггг" maxlength="10">' +
          '<button id="copyDayTake" class="copyday-take">Взять</button>' +
        '</div>' +
        '<div id="copyDayInfo" class="copyday-info"></div>' +
        '<button id="copyDayAll" class="copyday-all">Весь чат целиком</button>' +
        '<button id="copyDayClose" class="copyday-close">Закрыть</button>' +
      '</div>';
    document.body.appendChild(ov);

    const input = ov.querySelector('#copyDayInput');
    const info = ov.querySelector('#copyDayInfo');
    const close = () => ov.remove();

    const countFor = (dateISO) => messages.filter(m =>
      this._msgDateISO(m) === dateISO && m.content && m.content !== '[график]').length;

    const refreshInfo = () => {
      const iso = this._parseRuDate(input.value);
      if (!iso) { info.textContent = ''; info.className = 'copyday-info'; return; }
      const n = countFor(iso);
      if (n > 0) { info.textContent = '✓ за ' + input.value.slice(0,5) + ' — ' + n + ' сообщ.'; info.className = 'copyday-info ok'; }
      else { info.textContent = 'за эту дату записей нет'; info.className = 'copyday-info empty'; }
    };

    // Маска: только цифры, точки после дня и месяца.
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0,8);
      if (v.length > 4) v = v.slice(0,2) + '.' + v.slice(2,4) + '.' + v.slice(4);
      else if (v.length > 2) v = v.slice(0,2) + '.' + v.slice(2);
      input.value = v;
      refreshInfo();
    });

    const take = () => {
      const iso = this._parseRuDate(input.value);
      if (!iso) { info.textContent = 'неверная дата (пример: 31.07.2026)'; info.className = 'copyday-info empty'; return; }
      const day = messages.filter(m => this._msgDateISO(m) === iso);
      if (!day.length) { info.textContent = 'за эту дату записей нет'; info.className = 'copyday-info empty'; return; }
      const text = 'День ' + input.value + '\n\n' + this._messagesText(day);
      this._copyToClipboard(text, () => { info.textContent = '✓ скопировано: ' + day.length + ' сообщ.'; info.className = 'copyday-info ok'; setTimeout(close, 900); });
    };

    ov.querySelector('#copyDayTake').addEventListener('click', take);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); take(); } });

    ov.querySelector('#copyDayAll').addEventListener('click', () => {
      const text = this._messagesText(messages);
      this._copyToClipboard(text, () => { info.textContent = '✓ скопирован весь чат'; info.className = 'copyday-info ok'; setTimeout(close, 900); });
    });

    ov.querySelector('#copyDayClose').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    input.value = this._todayRu();
    refreshInfo();
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
