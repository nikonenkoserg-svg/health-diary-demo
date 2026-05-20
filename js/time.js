// Time — единая правда о времени для пользователя
// По умолчанию: время устройства (то что у юзера на часах).
// Опционально: явный override через profile.tzOverride — для мультидевайсного юзера.

const Time = {
  // Текущий явный часовой пояс — если задан в профиле
  getTz() {
    if (typeof Storage === 'undefined') return null;
    const profile = Storage.getProfile() || {};
    // Миграция: старое поле timezone от v45 автоопределения — снести
    if (profile.timezone && !profile.tzOverride) {
      delete profile.timezone;
      Storage.saveProfile(profile);
    }
    return profile.tzOverride || null;
  },

  setTz(tz) {
    if (typeof Storage === 'undefined') return;
    const profile = Storage.getProfile() || {};
    if (tz) profile.tzOverride = tz; else delete profile.tzOverride;
    Storage.saveProfile(profile);
  },

  // Описание текущего пояса для UI
  tzLabel() {
    const tz = this.getTz();
    if (tz) return tz;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone + ' (устройство)';
    } catch {
      return 'устройство';
    }
  },

  // Текущие значения. Без override — берём время устройства.
  nowParts() {
    const tz = this.getTz();
    if (!tz) {
      const d = new Date();
      return {
        hour: d.getHours(),
        minute: d.getMinutes(),
        minuteOfDay: d.getHours() * 60 + d.getMinutes(),
        dateISO: d.getFullYear() + '-' +
                 String(d.getMonth() + 1).padStart(2, '0') + '-' +
                 String(d.getDate()).padStart(2, '0'),
        tz: 'device'
      };
    }
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
      const d = new Date();
      return {
        hour: d.getHours(), minute: d.getMinutes(),
        minuteOfDay: d.getHours() * 60 + d.getMinutes(),
        dateISO: d.toISOString().slice(0, 10),
        tz: 'device-fallback'
      };
    }
  },

  fmtMinute(min) {
    return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0');
  }
};
