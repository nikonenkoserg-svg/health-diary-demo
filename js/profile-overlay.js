// ProfileOverlay — UI просмотра и редактирования профиля.
// Два режима:
//  - openRequired(onSaved): первичное заполнение анкеты после регистрации.
//    Крестика нет, клик по фону не закрывает, кнопка Сохранить активна
//    только когда все обязательные поля заполнены. После сохранения —
//    onSaved() (Чат запускает первую реплику и переключает state).
//  - open(): обычный режим редактирования из меню. Крестик есть, клик
//    по фону закрывает, валидация мягкая.
//
// Обязательные поля анкеты: пол, возраст, рост, вес, диагноз, вредные привычки.
// Опциональные: хронические, аллергии, медикаменты, наследственность, регион.

const ProfileOverlay = {
  isOpen: false,
  _mode: 'edit',           // 'edit' | 'required'
  _onSaved: null,

  REQUIRED_FIELDS: ['sex','age','height','weight','diagnosis','bad_habits','region'],

  ANKETA_FIELDS: [
    { name: 'sex',         label: 'Пол',                          type: 'text',   required: true  },
    { name: 'age',         label: 'Возраст',                      type: 'number', required: true  },
    { name: 'height',      label: 'Рост (см)',                    type: 'number', required: true  },
    { name: 'weight',      label: 'Вес (кг)',                     type: 'number', required: true  },
    { name: 'diagnosis',   label: 'Диагноз (преддиабет/диабет/нет)', type: 'text',   required: true  },
    { name: 'bad_habits',  label: 'Вредные привычки (курение, алкоголь — или «нет»)', type: 'text', required: true },
    { name: 'chronic',     label: 'Хронические заболевания',      type: 'text',   required: false },
    { name: 'allergies',   label: 'Аллергии',                     type: 'text',   required: false },
    { name: 'medications', label: 'Медикаменты',                  type: 'text',   required: false },
    { name: 'heredity',    label: 'Наследственность',             type: 'text',   required: false },
    { name: 'region',      label: 'Регион (город/страна — для часового пояса)', type: 'text', required: true  }
  ],

  open() {
    if (this.isOpen) return;
    this._mode = 'edit';
    this._onSaved = null;
    this._render();
    document.body.style.overflow = 'hidden';
    this.isOpen = true;
  },

  openRequired(onSaved, onCancel) {
    if (this.isOpen) return;
    this._mode = 'required';
    this._onSaved = typeof onSaved === 'function' ? onSaved : null;
    this._onCancel = typeof onCancel === 'function' ? onCancel : null;
    this._render();
    document.body.style.overflow = 'hidden';
    this.isOpen = true;
  },

  close() {
    if (this._mode === 'required') return; // в required режиме закрыть нельзя
    this._doClose();
  },

  _doClose() {
    const el = document.getElementById('profile-overlay');
    if (el) el.remove();
    document.body.style.overflow = '';
    this.isOpen = false;
  },

  _render() {
    if (typeof ProfileStore === 'undefined') return;
    if (!ProfileStore._load() && typeof Storage !== 'undefined') {
      const legacy = Storage.getProfile && Storage.getProfile();
      if (legacy && Object.keys(legacy).length > 0) {
        ProfileStore.migrateFromLegacy(legacy);
      }
    }

    const required = this._mode === 'required';
    const root = document.createElement('div');
    root.id = 'profile-overlay';
    root.classList.toggle('profile-required', required);
    root.innerHTML = `
      <div class="profile-backdrop"></div>
      <div class="profile-modal">
        <div class="profile-header">
          <span>${required ? 'Анкета' : 'Мой профиль'}</span>
          ${required ? '' : '<button class="profile-close" aria-label="Закрыть">×</button>'}
        </div>
        <div class="profile-body">
          <section class="profile-section">
            ${required
              ? '<p class="profile-hint">Поля со <span class="profile-required-marker">*</span> обязательны. «Сохранить» станет активной, когда они заполнены.</p>'
              : '<h3>Анкета</h3><p class="profile-hint">Стабильные данные. Меняй, если что-то поменялось.</p>'}
            ${required ? `
            <div class="profile-bulk">
              <label class="profile-bulk-label">Можешь надиктовать или вставить блоком — разложу по полям</label>
              <textarea id="profile-bulk-text" rows="3" placeholder="Например: мужской, 53 года, рост 183, вес 77, Тбилиси, преддиабет, не курю, не пью"></textarea>
              <div class="profile-bulk-actions">
                <button class="profile-mic-btn" id="profile-mic-btn" type="button" aria-label="Записать голосом">🎙 Голос</button>
                <button class="profile-bulk-parse" id="profile-bulk-parse" type="button" disabled>Разобрать и заполнить</button>
              </div>
              <div class="profile-bulk-status" id="profile-bulk-status"></div>
            </div>` : ''}
            <div class="profile-fields" id="profile-anketa"></div>
          </section>
          ${required ? '' : `
          <section class="profile-section">
            <h3>Паттерны жизни</h3>
            <p class="profile-hint">Что Спутник знает о твоём режиме. Сейчас только просмотр — Спутник будет уточнять в диалоге.</p>
            <div class="profile-fields" id="profile-patterns"></div>
          </section>
          <section class="profile-section profile-danger-section">
            <button class="profile-danger-btn profile-danger-btn--soft" id="profile-clear-memory-btn">Сбросить память Спутника</button>
            <button class="profile-danger-btn" id="profile-reset-btn">Очистить все данные и начать заново</button>
          </section>`}
        </div>
      </div>
    `;
    document.body.appendChild(root);

    if (!required) {
      root.querySelector('.profile-backdrop').addEventListener('click', () => this.close());
      const closeBtn = root.querySelector('.profile-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      const resetBtn = root.querySelector('#profile-reset-btn');
      if (resetBtn) resetBtn.addEventListener('click', () => this._confirmReset());
      const clearMemBtn = root.querySelector('#profile-clear-memory-btn');
      if (clearMemBtn) clearMemBtn.addEventListener('click', () => {
        if (!confirm('Сбросить долгосрочную память Спутника? Профиль и история останутся, очистится только модель паттернов.')) return;
        if (typeof PatientMemory !== 'undefined') PatientMemory.clear();
        clearMemBtn.textContent = 'Память сброшена';
        setTimeout(() => { clearMemBtn.textContent = 'Сбросить память Спутника'; }, 2000);
      });
    }

    this._renderAnketa();
    if (!required) this._renderPatterns();
    this._refreshSaveButtonState();
    if (required) this._wireBulk();
  },

  _wireBulk() {
    const textarea = document.getElementById('profile-bulk-text');
    const parseBtn = document.getElementById('profile-bulk-parse');
    const micBtn = document.getElementById('profile-mic-btn');
    const status = document.getElementById('profile-bulk-status');
    if (!textarea || !parseBtn || !micBtn) return;

    textarea.addEventListener('input', () => {
      parseBtn.disabled = !textarea.value.trim();
    });

    parseBtn.addEventListener('click', () => this._parseBulk(textarea.value.trim(), status, parseBtn));
    micBtn.addEventListener('click', () => this._toggleMic(textarea, micBtn, status));
  },

  async _parseBulk(text, statusEl, btn) {
    if (!text) return;
    btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Разбираю...';
    try {
      const resp = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!resp.ok) throw new Error('extract failed');
      const data = await resp.json();
      const anketa = data.anketa || {};
      let filled = 0;
      this.ANKETA_FIELDS.forEach(spec => {
        const v = anketa[spec.name];
        if (v === null || v === undefined || v === '') return;
        const input = document.getElementById(`pf-anketa-${spec.name}`);
        if (input) {
          input.value = String(v);
          input.classList.add('profile-field-extracted');
          filled++;
        }
      });
      this._refreshSaveButtonState();
      if (statusEl) statusEl.textContent = filled
        ? `Заполнено полей: ${filled}. Проверь и поправь если что.`
        : 'Не получилось распознать поля. Попробуй сформулировать иначе.';
    } catch (e) {
      console.warn('[bulk parse]', e);
      if (statusEl) statusEl.textContent = 'Ошибка разбора. Попробуй ещё раз.';
    } finally {
      btn.disabled = false;
    }
  },

  _toggleMic(textarea, btn, statusEl) {
    if (this._mic && this._mic.isRecording) {
      this._mic.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusEl) statusEl.textContent = 'Микрофон в этом браузере недоступен.';
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mimeCandidates = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
      const mimeType = mimeCandidates.find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        btn.classList.remove('recording');
        btn.classList.add('processing');
        if (statusEl) statusEl.textContent = 'Распознаю речь...';
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const resp = await fetch('/api/speech', {
            method: 'POST',
            headers: { 'Content-Type': mimeType, 'X-Language': 'ru' },
            body: blob
          });
          if (!resp.ok) throw new Error('speech failed');
          const data = await resp.json();
          const tr = (data.transcript || '').trim();
          if (tr) {
            textarea.value = (textarea.value ? textarea.value + ' ' : '') + tr;
            textarea.dispatchEvent(new Event('input'));
            if (statusEl) statusEl.textContent = 'Распознано. Нажми «Разобрать и заполнить».';
          } else {
            if (statusEl) statusEl.textContent = 'Ничего не расслышал. Попробуй ещё раз.';
          }
        } catch (e) {
          console.warn('[mic]', e);
          if (statusEl) statusEl.textContent = 'Ошибка распознавания. Попробуй ещё раз.';
        }
        btn.classList.remove('processing');
        this._mic = null;
      };
      this._mic = {
        isRecording: true,
        stop: () => recorder.stop()
      };
      recorder.start();
      btn.classList.add('recording');
      if (statusEl) statusEl.textContent = 'Слушаю... Нажми ещё раз чтобы остановить.';
    }).catch(err => {
      console.warn('[mic access]', err);
      if (statusEl) statusEl.textContent = 'Нет доступа к микрофону.';
    });
  },

  _fieldHTML(spec) {
    const value = ProfileStore.get('anketa', spec.name);
    const display = (value === null || value === undefined) ? '' :
      (typeof value === 'object' ? JSON.stringify(value) : String(value));
    const inputId = `pf-anketa-${spec.name}`;
    const star = spec.required ? '<span class="profile-required-marker">*</span>' : '';
    return `
      <div class="profile-field${spec.required ? ' profile-field-required' : ''}">
        <label for="${inputId}">${spec.label}${star}</label>
        <input id="${inputId}" type="${spec.type || 'text'}" value="${this._esc(display)}"
               data-layer="anketa" data-field="${spec.name}" data-required="${spec.required ? '1' : '0'}" />
      </div>
    `;
  },

  _readonlyField(layer, name, label) {
    const value = ProfileStore.get(layer, name);
    const display = (value === null || value === undefined) ? '<em>не задано</em>' :
      (typeof value === 'object' ? JSON.stringify(value) : String(value));
    return `
      <div class="profile-field profile-field-readonly">
        <label>${label}</label>
        <div class="profile-readonly-value">${display}</div>
      </div>
    `;
  },

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  _renderAnketa() {
    const c = document.getElementById('profile-anketa');
    if (!c) return;
    const saveLabel = this._mode === 'required' ? 'Сохранить и начать' : 'Сохранить изменения';
    const cancelBtn = this._mode === 'required'
      ? `<button class="profile-cancel-btn" id="profile-cancel-anketa" type="button">Отмена</button>`
      : '';
    c.innerHTML =
      this.ANKETA_FIELDS.map(s => this._fieldHTML(s)).join('') +
      `<div class="profile-actions">
         <button class="profile-save-btn" id="profile-save-anketa" disabled>${saveLabel}</button>
         ${cancelBtn}
       </div>`;

    document.getElementById('profile-save-anketa').addEventListener('click', () => this._saveAnketa());
    const cBtn = document.getElementById('profile-cancel-anketa');
    if (cBtn) cBtn.addEventListener('click', () => this._cancelRequired());

    c.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => this._refreshSaveButtonState());
    });
  },

  _renderPatterns() {
    const c = document.getElementById('profile-patterns');
    if (!c) return;
    c.innerHTML =
      this._readonlyField('patterns', 'breakfast', 'Типичный завтрак') +
      this._readonlyField('patterns', 'lunch', 'Типичный обед') +
      this._readonlyField('patterns', 'dinner', 'Типичный ужин') +
      this._readonlyField('patterns', 'snacks', 'Перекусы') +
      this._readonlyField('patterns', 'training', 'Тренировки') +
      this._readonlyField('patterns', 'sleep', 'Сон') +
      this._readonlyField('patterns', 'caffeine', 'Кофе') +
      this._readonlyField('patterns', 'personal_notes', 'Заметки');
  },

  _refreshSaveButtonState() {
    const btn = document.getElementById('profile-save-anketa');
    if (!btn) return;
    // В edit-режиме кнопка всегда активна (правка существующих).
    if (this._mode !== 'required') { btn.disabled = false; return; }
    const inputs = document.querySelectorAll('#profile-anketa input[data-required="1"]');
    const allFilled = Array.from(inputs).every(i => i.value.trim().length > 0);
    btn.disabled = !allFilled;
  },

  _saveAnketa() {
    const inputs = document.querySelectorAll('#profile-anketa input');
    let saved = 0;
    inputs.forEach(input => {
      const layer = input.dataset.layer;
      const field = input.dataset.field;
      const newVal = input.value.trim();
      const oldVal = ProfileStore.get(layer, field);
      const oldStr = oldVal === null || oldVal === undefined ? '' :
        (typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal));
      if (newVal === oldStr) return;
      if (newVal === '') return;
      let val = newVal;
      if (input.type === 'number') {
        const n = parseFloat(newVal);
        if (!isNaN(n)) val = n;
      }
      ProfileStore.set(layer, field, val, 'patient_input', 'confirmed_by_patient');
      saved++;
    });

    // После сохранения анкеты — нормализуем регион в IANA TZ, если есть и не задан override
    try {
      if (typeof Time !== 'undefined') {
        const region = ProfileStore.get('anketa', 'region');
        if (region && !Time.getTz()) {
          const tz = Time.regionToTz(region);
          if (tz) Time.setTz(tz);
        }
      }
    } catch (e) { console.warn('[tz from region]', e); }

    if (this._mode === 'required') {
      const cb = this._onSaved;
      this._onSaved = null;
      this._doClose();
      if (cb) cb();
      return;
    }

    const btn = document.getElementById('profile-save-anketa');
    if (btn) {
      btn.textContent = saved ? `Сохранено (${saved})` : 'Без изменений';
      setTimeout(() => { if (btn) btn.textContent = 'Сохранить изменения'; }, 1500);
    }
  },

  _cancelRequired() {
    if (this._mode !== 'required') return;
    const cb = this._onCancel;
    this._onCancel = null;
    this._onSaved = null;
    // временно переключаем mode чтобы _doClose сработал
    this._mode = 'edit';
    this._doClose();
    if (cb) cb();
  },

  _confirmReset() {
    if (!window.confirm('Удалить весь профиль, чат и историю? Это нельзя отменить.')) return;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(k => {
        if (k && (k.startsWith('hd_') || k === 'theme')) localStorage.removeItem(k);
      });
    } catch(e) { console.warn('[reset] failed:', e); }
    window.location.replace(window.location.origin + window.location.pathname);
  }
};

if (typeof window !== 'undefined') window.ProfileOverlay = ProfileOverlay;
