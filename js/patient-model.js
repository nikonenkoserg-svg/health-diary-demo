// Patient Model Engine — движок полноты модели пациента (шаг 1, слои 0-1).
// Методика «знать характер», защищённая КОДОМ, не промптом: код держит дисциплину,
// модель думает на состоянии. Карта знаний + пассивное чтение формы + нить + инъекция.
// Прод-версия прототипа со стенда (prototype/patient-model-engine.js).

const PatientModel = {
  // ── КАРТА ЗНАНИЙ (слои 0-1). Каждый пункт: важность 0..1 + способ добычи.
  KNOWLEDGE_MAP: [
    { key: 'name',        layer: 0, label: 'обращение',   importance: 0.9, detect: 'fact' },
    { key: 'sex',         layer: 0, label: 'пол',          importance: 0.6, detect: 'fact' },
    { key: 'age',         layer: 0, label: 'возраст',      importance: 0.9, detect: 'fact' },
    { key: 'body',        layer: 0, label: 'рост/вес',     importance: 0.7, detect: 'fact' },
    { key: 'meds',        layer: 0, label: 'медикаменты',  importance: 0.8, detect: 'fact' },
    { key: 'glucometer',  layer: 0, label: 'глюкометр',    importance: 0.8, detect: 'fact' },
    { key: 'brought_by',  layer: 0, label: 'что привело',  importance: 0.9, detect: 'fact' },
    { key: 'motive',           layer: 1, label: 'мотив',                       importance: 0.9, detect: 'active'  },
    { key: 'attitude_numbers', layer: 1, label: 'отношение к цифрам/контролю', importance: 0.7, detect: 'passive' },
    { key: 'life_rhythm',      layer: 1, label: 'ритм жизни',                  importance: 0.7, detect: 'passive' },
    { key: 'tone_openness',    layer: 1, label: 'тон и открытость',            importance: 0.6, detect: 'passive' },
    { key: 'stress_attitude',  layer: 1, label: 'отношение к стрессу',         importance: 0.7, detect: 'active'  },
  ],

  // ── НИТИ: яркая черта открывает упорядоченную цепочку (истоки → наполнение → смысл).
  THREADS: [
    {
      id: 'lifestyle',
      title: 'образ жизни: истоки → наполнение → смысл',
      opensWhen: pr => !!pr.li_intensity,
      chain: [
        { key: 'li_origin',  ask: 'что сформировало такой режим и как давно он длится — здоровье, спорт как страсть, характер, или просто так живётся' },
        { key: 'li_content', ask: 'чем и кем этот режим наполнен — какая работа его позволяет, какая семья его выдерживает' },
        { key: 'li_meaning', ask: 'что это в целом — порыв или осознанный выбор, сформированный обстоятельствами или желанием' },
      ],
    },
  ],

  // ── АДАПТЕР: собрать плоскую модель (факты + портрет) из ProfileStore.
  readModel() {
    const m = {};
    if (typeof ProfileStore === 'undefined') return m;
    const A = (f) => ProfileStore.get('anketa', f);
    const P = (f) => ProfileStore.get('portrait', f);
    m.name = A('name');
    m.sex = A('sex');
    m.age = A('age');
    const h = A('height'), w = A('weight');
    m.body = (h || w) ? [h ? h + 'см' : null, w ? w + 'кг' : null].filter(Boolean).join('/') : null;
    m.meds = A('medications');
    m.glucometer = A('glucometer');
    const diag = A('diagnosis');
    m.brought_by = (diag && diag.name) ? diag.name : (typeof diag === 'string' ? diag : null);
    ['motive', 'attitude_numbers', 'life_rhythm', 'tone_openness', 'stress_attitude',
     'li_intensity', 'li_origin', 'li_content', 'li_meaning'].forEach(k => {
      const v = P(k); if (v) m[k] = v;
    });
    return m;
  },

  // ── ПАССИВНОЕ ЧТЕНИЕ формы ответа: характер из ФОРМЫ, не из содержания.
  passiveRead(text) {
    const t = (text || '').trim();
    const words = t.split(/\s+/).filter(Boolean);
    const wc = words.length;
    const sentences = t.split(/[.!?;]+/).map(s => s.trim()).filter(Boolean);
    const avgLen = sentences.length ? wc / sentences.length : wc;
    const numbers = (t.match(/\d+/g) || []).length;
    const units = (t.match(/см|кг|лет|год|часов|час\b|мин|%|ммоль|грамм/gi) || []).length;
    const exclam = (t.match(/!/g) || []).length;
    const emotion = (t.match(/бо(юсь|ялся)|страшно|тревог|устал|надоел|не могу|помоги|переживаю|зл(юсь|ит)|тяжело|плохо/gi) || []).length;
    const discipline = /каждый день|режим|дисциплин|проверя|тонус|контролир/i.test(t);
    const noDiag = /диагноза нет|нет диагноза|заболеваний нет|не болею/i.test(t);
    const fear = !noDiag && /анализ показал|поставили диагноз|врач сказал|бо(юсь|ялся)|тревог|страшно/i.test(t);

    const signals = { wc, avgLen: Math.round(avgLen * 10) / 10, numbers, units, exclam, emotion, discipline, noDiag };
    const portrait = {};

    if (avgLen <= 5 && emotion === 0 && exclam === 0) portrait.tone_openness = 'сух, по делу, закрытый';
    else if (wc > 40 || emotion >= 2 || exclam >= 1) portrait.tone_openness = 'развёрнут, эмоционален, делится';
    else portrait.tone_openness = 'нейтральный';

    if (numbers >= 4 && units >= 3) portrait.attitude_numbers = 'любит точность, педант';
    else if (numbers <= 1) portrait.attitude_numbers = 'избегает конкретики';

    if (discipline) portrait.life_rhythm = 'жёсткий режим';

    if (noDiag && discipline) portrait.motive = 'дисциплина/тонус, не диагноз';
    else if (fear) portrait.motive = 'тревога/страх диагноза';

    const dailySport = /спорт[^.]*(кажд\w+ день|ежедневн)/i.test(t);
    const sleepM = t.match(/сон\D{0,3}(\d{1,2})\s*час/i);
    const sleepH = sleepM ? +sleepM[1] : null;
    const sleepsFine = /высыпа|нормально сплю|сон[^.]*хорош/i.test(t);
    const shortSleepHeld = sleepH != null && sleepH <= 5 && sleepsFine;
    if (dailySport || shortSleepHeld) {
      portrait.li_intensity = 'высокая — аномальный режим, требует объяснения';
      signals.dailySport = dailySport; signals.sleepH = sleepH; signals.shortSleepHeld = shortSleepHeld;
    }

    return { signals, portrait };
  },

  // ── НАБЛЮДЕНИЕ: пассивно вычитанные оси кладём в слой portrait.
  // Стабильные оси (мотив/ритм/интенсивность) пишем один раз; тон/цифры — обновляем.
  observe(text) {
    if (typeof ProfileStore === 'undefined') return;
    const { portrait } = this.passiveRead(text);
    Object.entries(portrait).forEach(([k, v]) => {
      if (v == null || v === '') return;
      const stable = (k === 'motive' || k === 'life_rhythm' || k === 'li_intensity');
      if (stable && ProfileStore.get('portrait', k)) return;
      try { ProfileStore.set('portrait', k, v, 'passive_read', 'inferred'); } catch (_) {}
    });
  },

  // ── СНИМОК карты: по каждому пункту {known|thin|empty}.
  snapshot(profile) {
    const p = profile || {};
    return this.KNOWLEDGE_MAP.map(field => {
      const v = p[field.key];
      let state = 'empty';
      if (v != null && v !== '') state = (v.thin ? 'thin' : 'known');
      return Object.assign({}, field, { state, value: v == null ? null : v });
    });
  },

  // первое незакрытое звено открытой нити (важнее плоских полей)
  openThreadGap(profile, portrait) {
    const p = profile || {};
    for (const th of this.THREADS) {
      if (!th.opensWhen(portrait || {})) continue;
      const link = th.chain.find(l => p[l.key] == null || p[l.key] === '');
      if (link) return { key: link.key, label: link.ask, importance: 1, fromThread: th.title };
    }
    return null;
  },

  // ── ВЫБОР ПРОБЕЛА: открытая нить важнее плоского поля.
  pickGap(snap, profile, portrait) {
    const thread = this.openThreadGap(profile, portrait);
    if (thread) return thread;
    const open = snap.filter(f => f.state !== 'known');
    if (!open.length) return null;
    open.sort((a, b) => (b.importance * (b.state === 'empty' ? 1 : 0.5))
                      - (a.importance * (a.state === 'empty' ? 1 : 0.5)));
    return open[0];
  },

  // ── НУЖНОЕ ВРЕМЯ: момент здоровья (замер/самочувствие) — не время для тем.
  moment(text) {
    return /сахар|замер|ммоль|глюкоз|плохо|кружит|тошн|тряс|слабост|давлени/i.test(text || '')
      ? 'health' : 'calm';
  },
  hasHook(text) {
    return /спорт|трениров|работ|семь|жен|муж|дет(и|ей)|сон|режим|хобби|отдых|устал/i.test(text || '');
  },
  timingFor(text, gap) {
    if (!gap) return 'none';
    if (this.moment(text) === 'health') return 'hold';
    return this.hasHook(text) ? 'now-hook' : 'now-calm';
  },

  // ── ИНЪЕКЦИЯ: портрет + (по времени) либо «не лезь», либо опенер (разговорить, не вопрос).
  buildInjection(profile, gap, timing) {
    const p = profile || {};
    const known = this.KNOWLEDGE_MAP
      .filter(f => p[f.key] != null && p[f.key] !== '')
      .map(f => `${f.label}: ${p[f.key]}`);
    let out = '[ПОРТРЕТ ПАЦИЕНТА]\n';
    out += known.length ? ('Известно — ' + known.join('; ') + '.\n')
                        : 'Пока почти ничего не известно.\n';
    out += 'Читай каждое событие ЧЕРЕЗ портрет: одна цифра/сон/еда значат разное у разных людей. '
         + 'Норма — база ЭТОГО человека, не общая таблица. Тон подстрой под портрет.\n';
    if (!gap || timing === 'none') return out;
    if (timing === 'hold') {
      out += '[НЕ ВРЕМЯ ДЛЯ ТЕМ]: человек принёс замер/самочувствие — займись этим, портрет-пробел не поднимай.';
      return out;
    }
    out += `[ЗАВЕСТИ РАЗГОВОР — не вопрос, а открытие темы]: ${gap.label}. `;
    out += timing === 'now-hook'
      ? 'Зацепись за то, что он только что сказал: дай живой короткий комментарий и оставь дверь, чтобы рассказал сам.'
      : 'Момент спокойный: подведи к теме мягко, комментарием, не допросом. По одному, по случаю.';
    return out;
  },

  // ── ГЛАВНЫЙ ВХОД: строит блок [ПОРТРЕТ] для системного промпта.
  inject(text) {
    const model = this.readModel();
    const { portrait } = this.passiveRead(text);
    const merged = Object.assign({}, model, portrait);
    const snap = this.snapshot(merged);
    const gap = this.pickGap(snap, merged, merged);
    const timing = this.timingFor(text, gap);
    return this.buildInjection(merged, gap, timing);
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = PatientModel;
