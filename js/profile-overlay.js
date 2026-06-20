// ProfileOverlay — UI просмотра и редактирования профиля.
// По спецификации Тренера: пациент может посмотреть, что система знает о нём,
// и поправить Слой 1 (Анкета). Слой 2 (Паттерны) — только просмотр.
// Слои 3-4 — скрыты до наполнения.

const ProfileOverlay = {
  isOpen: false,

  open() {
    if (this.isOpen) return;
    this._render();
    document.body.style.overflow = 'hidden';
    this.isOpen = true;
  },

  close() {
    const el = document.getElementById('profile-overlay');
    if (el) el.remove();
    document.body.style.overflow = '';
    this.isOpen = false;
  },

  _render() {
    if (typeof ProfileStore === 'undefined') return;
    // Триггер автомиграции если есть legacy профиль и v2 пуст
    if (!ProfileStore._load() && typeof Storage !== 'undefined') {
      const legacy = Storage.getProfile && Storage.getProfile();
      if (legacy && Object.keys(legacy).length > 0) {
        ProfileStore.migrateFromLegacy(legacy);
      }
    }

    const root = document.createElement('div');
    root.id = 'profile-overlay';
    root.innerHTML = `
      <div class="profile-backdrop"></div>
      <div class="profile-modal">
        <div class="profile-header">
          <span>Мой профиль</span>
          <button class="profile-close" aria-label="Закрыть">×</button>
        </div>
        <div class="profile-body">
          <section class="profile-section">
            <h3>Анкета</h3>
            <p class="profile-hint">Стабильные данные. Меняй, если что-то поменялось.</p>
            <div class="profile-fields" id="profile-anketa"></div>
          </section>
          <section class="profile-section">
            <h3>Паттерны жизни</h3>
            <p class="profile-hint">Что Спутник знает о твоём режиме. Сейчас только просмотр — Спутник будет уточнять в диалоге.</p>
            <div class="profile-fields" id="profile-patterns"></div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    root.querySelector('.profile-backdrop').addEventListener('click', () => this.close());
    root.querySelector('.profile-close').addEventListener('click', () => this.close());

    this._renderAnketa();
    this._renderPatterns();
  },

  _field(layer, name, label, type) {
    const value = ProfileStore.get(layer, name);
    const display = (value === null || value === undefined) ? '' :
      (typeof value === 'object' ? JSON.stringify(value) : String(value));
    const inputId = `pf-${layer}-${name}`;
    return `
      <div class="profile-field">
        <label for="${inputId}">${label}</label>
        <input id="${inputId}" type="${type || 'text'}" value="${this._esc(display)}"
               data-layer="${layer}" data-field="${name}" />
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
    c.innerHTML =
      this._field('anketa', 'sex', 'Пол') +
      this._field('anketa', 'age', 'Возраст', 'number') +
      this._field('anketa', 'height', 'Рост (см)', 'number') +
      this._field('anketa', 'weight', 'Вес (кг)', 'number') +
      this._field('anketa', 'chronic', 'Хронические заболевания') +
      this._field('anketa', 'allergies', 'Аллергии') +
      this._field('anketa', 'medications', 'Медикаменты') +
      this._field('anketa', 'heredity', 'Наследственность') +
      this._field('anketa', 'diagnosis', 'Диагноз (преддиабет/диабет)') +
      this._field('anketa', 'region', 'Регион') +
      `<button class="profile-save-btn" id="profile-save-anketa">Сохранить изменения</button>`;
    document.getElementById('profile-save-anketa').addEventListener('click', () => this._saveAnketa());
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
      if (newVal === oldStr) return; // не изменилось — пропускаем
      if (newVal === '') return; // пустое — не записываем (пока не реализовано удаление)
      // Числовые поля приводим
      let val = newVal;
      if (input.type === 'number') {
        const n = parseFloat(newVal);
        if (!isNaN(n)) val = n;
      }
      ProfileStore.set(layer, field, val, 'patient_input', 'confirmed_by_patient');
      saved++;
    });
    const btn = document.getElementById('profile-save-anketa');
    if (btn) {
      btn.textContent = saved ? `Сохранено (${saved})` : 'Без изменений';
      setTimeout(() => { if (btn) btn.textContent = 'Сохранить изменения'; }, 1500);
    }
  }
};

if (typeof window !== 'undefined') window.ProfileOverlay = ProfileOverlay;
