// Time — единая правда о времени для пользователя
// Все компоненты используют этот модуль, а не new Date().getHours()

const Time = {
  // Возвращает IANA-часовой пояс пользователя.
  // 1. profile.timezone (если задан)
  // 2. Автоопределение по устройству (только при первом запуске, сохраняется в профиль)
  // 3. UTC как запас
  getTz() {
    if (typeof Storage === 'undefined') {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
    }
    const profile = Storage.getProfile() || {};
    if (profile.timezone) return profile.timezone;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      profile.timezone = tz;
      Storage.saveProfile(profile);
      return tz;
    } catch { return 'UTC'; }
  },

  setTz(tz) {
    if (typeof Storage === 'undefined') return;
    const profile = Storage.getProfile() || {};
    profile.timezone = tz;
    Storage.saveProfile(profile);
  },

  // Текущие значения с учётом часового пояса пользователя
  nowParts() {
    const tz = this.getTz();
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit', minute: '2-digit',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour12: false
      });
      const parts = fmt.formatToParts(new Date());
      const get = (t) => parseInt(parts.find(p => p.type === t).value);
      const hour = get('hour') % 24;
      const minute = get('minute');
      return {
        hour, minute,
        minuteOfDay: hour * 60 + minute,
        dateISO: get('year') + '-' +
                 String(get('month')).padStart(2, '0') + '-' +
                 String(get('day')).padStart(2, '0'),
        tz
      };
    } catch {
      // Запас — локаль устройства
      const d = new Date();
      return {
        hour: d.getHours(), minute: d.getMinutes(),
        minuteOfDay: d.getHours() * 60 + d.getMinutes(),
        dateISO: d.toISOString().slice(0, 10),
        tz: 'UTC'
      };
    }
  },

  fmtMinute(min) {
    return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  }
};
