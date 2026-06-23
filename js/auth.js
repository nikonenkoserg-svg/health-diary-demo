// Auth — модуль регистрации.
// На стадии тестирования: заглушка. Email сохраняется локально (hd_account),
// никаких писем, никаких токенов. После запуска founding members заглушка
// будет заменена на Supabase Auth с magic link.
//
// API:
//   Auth.isRegistered()        -> boolean
//   Auth.getEmail()            -> string|null
//   Auth.openRegistration(cb)  -> открывает модалку, cb(email) при успехе
//   Auth.logout()              -> удаляет аккаунт (для теста)

const Auth = {
  KEY: 'hd_account',
  _onDone: null,

  _load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  _save(account) {
    try { localStorage.setItem(this.KEY, JSON.stringify(account)); return true; }
    catch (e) { return false; }
  },

  isRegistered() {
    const a = this._load();
    return !!(a && a.email);
  },

  getEmail() {
    const a = this._load();
    return a ? (a.email || null) : null;
  },

  logout() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  },

  openRegistration(onDone) {
    if (document.getElementById('auth-overlay')) return;
    this._onDone = typeof onDone === 'function' ? onDone : null;

    const root = document.createElement('div');
    root.id = 'auth-overlay';
    root.innerHTML = `
      <div class="auth-backdrop"></div>
      <div class="auth-modal">
        <div class="auth-header">Регистрация</div>
        <div class="auth-body">
          <label class="auth-label" for="auth-email">Email</label>
          <input id="auth-email" type="email" autocomplete="email" inputmode="email"
                 placeholder="you@example.com" />
          <p class="auth-hint">На стадии тестирования подтверждать почту не нужно — этот email просто привязывает анкету к тебе.</p>
          <div class="auth-actions">
            <button class="auth-cancel" type="button">Отмена</button>
            <button class="auth-submit" type="button" disabled>Готово</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    const input = root.querySelector('#auth-email');
    const submit = root.querySelector('.auth-submit');
    const cancel = root.querySelector('.auth-cancel');

    const validate = () => {
      const v = input.value.trim();
      submit.disabled = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    };
    input.addEventListener('input', validate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !submit.disabled) submit.click();
    });

    submit.addEventListener('click', () => {
      const email = input.value.trim().toLowerCase();
      this._save({ email, registered_at: new Date().toISOString() });
      const cb = this._onDone;
      this._onDone = null;
      this._close();
      if (cb) cb(email);
    });

    cancel.addEventListener('click', () => {
      this._onDone = null;
      this._close();
    });

    setTimeout(() => input.focus(), 50);
  },

  _close() {
    const el = document.getElementById('auth-overlay');
    if (el) el.remove();
    document.body.style.overflow = '';
  }
};

if (typeof window !== 'undefined') window.Auth = Auth;
