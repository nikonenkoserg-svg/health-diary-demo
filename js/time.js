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
  },

  // Маппинг свободного текста региона (как пациент ввёл в анкете) → IANA TZ.
  // Сначала по словам/синонимам страны и крупных городов. Если не распознали — null.
  regionToTz(text) {
    if (!text) return null;
    const t = String(text).toLowerCase().trim();
    const map = [
      // Россия и СНГ
      [/(моск|россия|подмоск|питер|санкт-петер|спб|пермь|казан|самар|воронеж|ростов|нижн|калин|сочи|туапсе|анап|кубан|краснодар)/, 'Europe/Moscow'],
      [/(екатеринбург|урал|челябин|тюмень|оренбург|уфа)/, 'Asia/Yekaterinburg'],
      [/(новосибирск|омск|томск|кемер|алтай|барнаул)/, 'Asia/Novosibirsk'],
      [/(красноярск|братск|иркутск|байкал|улан)/, 'Asia/Krasnoyarsk'],
      [/(владивосток|хабаровск|сахалин|камчатк|приморск)/, 'Asia/Vladivostok'],
      [/(беларус|белорус|минск)/, 'Europe/Minsk'],
      [/(украин|киев|львов|одесс|харьков|днепр)/, 'Europe/Kyiv'],
      [/(казах|алматы|астана|нур-султ)/, 'Asia/Almaty'],
      [/(грузи|тбилиси|батум|кутаис)/, 'Asia/Tbilisi'],
      [/(армен|ерев)/, 'Asia/Yerevan'],
      [/(азерб|баку)/, 'Asia/Baku'],
      // Европа
      [/(франц|париж|марсель|лион|ницц|канны|cannes|nice|paris|france)/, 'Europe/Paris'],
      [/(испан|мадрид|барсел|spain|madrid|barcelona)/, 'Europe/Madrid'],
      [/(португал|лиссаб|порту|portugal|lisbon|lisboa)/, 'Europe/Lisbon'],
      [/(итал|рим|милан|неапол|italy|rome|milan)/, 'Europe/Rome'],
      [/(герман|берлин|мюнхен|германия|germany|berlin|munich)/, 'Europe/Berlin'],
      [/(нидерланд|амстердам|голланд|netherlands|amsterdam)/, 'Europe/Amsterdam'],
      [/(швейцар|цюрих|женев|switzerland|zurich|geneva)/, 'Europe/Zurich'],
      [/(великобритан|англи|лондон|uk|london|england)/, 'Europe/London'],
      [/(ирланд|дублин|ireland|dublin)/, 'Europe/Dublin'],
      [/(польш|варшав|poland|warsaw)/, 'Europe/Warsaw'],
      [/(чех|прага|czech|prague)/, 'Europe/Prague'],
      [/(турц|стамбул|анкар|анталь|turkey|istanbul)/, 'Europe/Istanbul'],
      // Америка
      [/(бразил|сан[- ]пауло|рио|brazil|sao paulo|rio)/, 'America/Sao_Paulo'],
      [/(арген|буэнос|argentina|buenos)/, 'America/Argentina/Buenos_Aires'],
      [/(мексик|mexico)/, 'America/Mexico_City'],
      [/(чили|сантьяго|chile|santiago)/, 'America/Santiago'],
      [/(колумб|богот|colombia|bogota)/, 'America/Bogota'],
      [/(перу|лима|peru|lima)/, 'America/Lima'],
      [/(нью[- ]йорк|new york|nyc|бостон|boston|вашингтон|washington|майами|miami|флорид)/, 'America/New_York'],
      [/(лос[- ]анджелес|лос анджел|los angeles|сан[- ]франциск|san francisco|сиэтл|seattle|калифорни|оригон)/, 'America/Los_Angeles'],
      [/(чикаго|chicago|техас|texas|даллас|хьюст)/, 'America/Chicago'],
      [/(денвер|denver|колорадо|юта|utah)/, 'America/Denver'],
      [/(канад|торонто|оттава|canada|toronto|ottawa)/, 'America/Toronto'],
      [/(ванкувер|vancouver)/, 'America/Vancouver'],
      // Азия / Океания
      [/(израил|тель[- ]авив|иерусал|israel|tel aviv)/, 'Asia/Jerusalem'],
      [/(оаэ|дуба|абу[- ]даби|uae|dubai)/, 'Asia/Dubai'],
      [/(индия|дели|мумба|india|delhi|mumbai|бангалор|bangalore)/, 'Asia/Kolkata'],
      [/(таиланд|бангкок|пхукет|thailand|bangkok|phuket)/, 'Asia/Bangkok'],
      [/(сингапур|singapore)/, 'Asia/Singapore'],
      [/(гонконг|hong kong)/, 'Asia/Hong_Kong'],
      [/(япон|токио|осак|japan|tokyo)/, 'Asia/Tokyo'],
      [/(южн.{0,5}коре|сеул|south korea|seoul)/, 'Asia/Seoul'],
      [/(китай|пекин|шанха|china|beijing|shanghai)/, 'Asia/Shanghai'],
      [/(австрал|сидней|мельбурн|australia|sydney|melbourne)/, 'Australia/Sydney']
    ];
    for (const [rx, tz] of map) {
      if (rx.test(t)) return tz;
    }
    return null;
  },

  // Текущее время для пациента в формате строки "ЧЧ:ММ" + название зоны.
  // Используется в промпте, чтобы модель видела фактическое время пациента.
  patientNowLabel() {
    const tp = this.nowParts();
    const hh = String(tp.hour).padStart(2, '0');
    const mm = String(tp.minute).padStart(2, '0');
    return hh + ':' + mm + ' (' + tp.tz + ')';
  }
};
