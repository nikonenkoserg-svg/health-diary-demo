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
    // Слой 2 — круг жизни. meals/training/sleep берутся из patterns (уже известно —
    // не переспрашивать). work/family/hobbies пока без источника → это пробелы для нити.
    { key: 'meals',    layer: 2, label: 'питание (типичное)', importance: 0.7, detect: 'fact'   },
    { key: 'training', layer: 2, label: 'тренировки',         importance: 0.7, detect: 'fact'   },
    { key: 'sleep',    layer: 2, label: 'сон',                importance: 0.6, detect: 'fact'   },
    { key: 'work',     layer: 2, label: 'работа',             importance: 0.6, detect: 'active' },
    { key: 'family',   layer: 2, label: 'семья',              importance: 0.6, detect: 'active' },
    { key: 'hobbies',  layer: 2, label: 'хобби/интересы',     importance: 0.5, detect: 'active' },
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
    // Круг жизни (слой 2) из patterns — чтобы Спутник опирался на известное, а не переспрашивал.
    const PT = (f) => ProfileStore.get('patterns', f);
    const _s = (v) => {
      if (v == null) return null;
      if (typeof v !== 'object') return String(v);
      if (v.text) return String(v.text);
      if (v.raw) return String(v.raw);
      if (v.typical_duration_hours != null) return v.typical_duration_hours + ' ч';
      return JSON.stringify(v);
    };
    const _meals = [['breakfast', 'завтрак'], ['lunch', 'обед'], ['dinner', 'ужин'], ['snacks', 'перекусы']]
      .map(([f, lbl]) => { const v = PT(f); return v ? (lbl + ' — ' + _s(v)) : null; })
      .filter(Boolean).join('; ');
    if (_meals) m.meals = _meals;
    const _tr = _s(PT('training')); if (_tr) m.training = _tr;
    const _sl = _s(PT('sleep'));    if (_sl) m.sleep = _sl;
    const _wk = _s(PT('work_mode')); if (_wk) m.work = _wk;
    const FORM_AXES = { attitude_numbers: 1, tone_openness: 1 };
    ['motive', 'attitude_numbers', 'life_rhythm', 'tone_openness', 'stress_attitude',
     'li_intensity', 'li_origin', 'li_content', 'li_meaning'].forEach(k => {
      const v = FORM_AXES[k] ? this._stableAxis(k) : P(k);
      if (v) m[k] = v;
    });
    return m;
  },

  // ── ПАССИВНОЕ ЧТЕНИЕ формы ответа: характер из ФОРМЫ, не из содержания.
  passiveRead(text, context) {
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

    // Канонические имена: один сигнал называется одинаково в классификаторе,
    // хранилище и портрете. Сигнал остаётся уликой, а не готовой чертой.
    const signals = {
      response_length_words: wc,
      sentence_length_words: Math.round(avgLen * 10) / 10,
      number_count: numbers,
      unit_count: units,
      exclamation_count: exclam,
      emotion_marker_count: emotion,
      hedging: (t.match(/(может быть|возможно|наверное|кажется|не уверен|вроде)/gi) || []).length,
      self_correction: (t.match(/(точнее|вернее|нет,|то есть|поправлюсь)/gi) || []).length,
      abandoned_topic: /(?:\.\.\.|…)$/.test(t) ? 1 : 0,
      punctuation_break: /[!?]{2,}|\.{3,}|…/.test(t) ? 1 : 0,
      response_latency_seconds: context && Number.isFinite(context.responseLatencyMs)
        ? Math.round(context.responseLatencyMs / 1000) : null,
      volunteered: context && context.wasPrompted ? 0 : 1,
      discipline_marker: discipline ? 1 : 0,
      no_diagnosis_marker: noDiag ? 1 : 0
    };
    const portrait = {};

    if (avgLen <= 5 && emotion === 0 && exclam === 0) portrait.tone_openness = 'сух, по делу, закрытый';
    else if (wc > 40 || emotion >= 2 || exclam >= 1) portrait.tone_openness = 'развёрнут, эмоционален, делится';
    else portrait.tone_openness = 'нейтральный';

    // Черту приписываем только по ПОЛОЖИТЕЛЬНОМУ сигналу (плотность цифр). Отсутствие
    // чисел в реплике — не «избегает конкретики»: у вопроса цифр и не бывает.
    if (numbers >= 4 && units >= 3) portrait.attitude_numbers = 'любит точность, педант';

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
      signals.daily_sport = dailySport ? 1 : 0;
      signals.sleep_hours = sleepH;
      signals.short_sleep_normalized = shortSleepHeld ? 1 : 0;
    }

    return { signals, portrait };
  },

  // ── ДАТЧИК ВОВЛЕЧЁННОСТИ: расположенность к диалогу из ФОРМЫ реплики.
  // Детерминированный балл: охотно (делится) / нейтрально / сухо (на отъебись).
  // Кормит гейт: на «сухом» ассистент не рыбачит темами. Твердеет за 3-4 реплики.

  // Чистый замер/лог еды — не «сухость», это данные. Такие реплики не оцениваем.
  _isDataDrop(text) {
    const t = (text || '').trim();
    if (!t) return true;
    if (t.includes('?')) return false;
    const wc = t.split(/\s+/).filter(Boolean).length;
    const hasNum = /\d/.test(t);
    if (wc <= 4 && hasNum) return true;
    const foodOnly = /^(съел|съела|поел|поела|выпил|выпила|перекус|завтрак|обед|ужин)[\s,]/i.test(t);
    if (foodOnly && wc <= 6) return true;
    return false;
  },

  // Балл одной реплики [-2..+2]. skip=true — не разговорная (замер/лог), не считаем.
  readEngagement(text) {
    const t = (text || '').trim();
    if (this._isDataDrop(text)) return { skip: true, score: 0, read: null };
    const wc = t.split(/\s+/).filter(Boolean).length;
    const hasQ = t.includes('?');
    const exclam = /!/.test(t);
    const emotion = /бо(юсь|ялся)|страшно|тревог|устал|надоел|не могу|помоги|переживаю|зл(юсь|ит)|тяжело|рад|нрав|хочу|интересно|важно/i.test(t);
    // местоимения — через границы пробелов: JS \b не срабатывает на кириллице
    const shares = /(^|[\s,.:;(])(я|мне|меня|мной|мой|моя|мои|мы|нам)([\s,.:;!?)]|$)/i.test(t)
      || /работ|семь|жен(а|ы|е|у)|муж|дет(и|ей|ьми)|друз|отпуск|привыч|люблю|обычно|дома/i.test(t);
    const dismiss = /^(норм|нормально|пофиг|похер|похрен|не знаю|хз|ну да|да|нет|ок|окей|угу|ага|ладно|неважно|не важно|всё равно|все равно|как обычно|отстань|отвали|потом|не сейчас|нет времени)[\s.!]*$/i.test(t);
    // Отмашка доминирует: бонусы не начисляем (иначе «как обычно» ловит маркер близости).
    if (dismiss) return { skip: false, score: -2, read: 'сухой', signals: { wc, hasQ, emotion, shares, dismiss, exclam } };
    let s = 0;
    if (wc <= 3 && !hasQ) s -= 1;
    if (wc >= 12) s += 1;
    if (wc >= 30) s += 1;
    if (hasQ && wc >= 3) s += 1;
    if (emotion) s += 1;
    if (shares) s += 1;
    if (exclam) s += 1;
    if (s > 2) s = 2; if (s < -2) s = -2;
    const read = s <= -1 ? 'сухой' : (s >= 1 ? 'охотный' : 'нейтральный');
    return { skip: false, score: s, read, signals: { wc, hasQ, emotion, shares, dismiss, exclam } };
  },

  // Пишем балл разговорной реплики в историю portrait.engagement.
  observeEngagement(text) {
    if (typeof ProfileStore === 'undefined') return;
    const r = this.readEngagement(text);
    if (r.skip) return;
    try { ProfileStore.set('portrait', 'engagement', String(r.score), 'passive_read', 'inferred'); } catch (_) {}
  },

  // ── ЖИВАЯ ТЕМА (узел №3): на ЧЁМ пациент загорается. Копим тему→балл в постоянную
  // память. Тема с устойчиво высоким баллом = «дверь», через неё можно разговорить.
  TOPICS: [
    { key: 'family', label: 'семья и близкие',
      stems: ['семь','жена','жены','жене','жену','муж','дети','детей','детьми','детям','ребён','ребен','мама','мам','папа','пап','бабуш','дедуш','внук','дочь','доч','сын','родител','брат','сестр'] },
    { key: 'hobby', label: 'хобби / увлечение',
      stems: ['хобби','рыбалк','рыбач','охот','музык','гитар','книг','читаю','читать','огород','дача','дач','рукодел','рисую','рисова','фото','коллекц','мастер','вяза','вышив'] },
    { key: 'sport', label: 'спорт / движение',
      stems: ['спорт','трениров','бег','бега','плаван','плава','велосип','йог','турник','штанг','фитнес','футбол','лыж','поход','качалк','зарядк'] },
    { key: 'travel', label: 'поездки / места',
      stems: ['путешеств','поездк','поехал','отпуск','море','моря','горы','горах','стран','город','виза','переезд','переех','релокац','заграниц'] },
    { key: 'work', label: 'работа / дело',
      stems: ['работ','коллег','начальник','офис','проект','бизнес','клиент','зарплат','карьер','совещан'] },
    { key: 'money', label: 'деньги / финансы',
      stems: ['деньг','финанс','ипотек','кредит','расход','бюджет','инвест','накопл','зараб'] },
    { key: 'food', label: 'еда / готовка',
      stems: ['готов','кухн','рецепт','пеку','печь','варю','вари','поесть','вкусн','ресторан','блюд'] },
  ],

  // тема реплики: токены реплики, совпадение по НАЧАЛУ слова (склонение — суффикс).
  // Первое совпадение по приоритету TOPICS, иначе null.
  classifyTopic(text) {
    const tokens = String(text || '').toLowerCase().split(/[^а-яёa-z]+/).filter(Boolean);
    if (!tokens.length) return null;
    for (const tp of this.TOPICS) {
      for (const tok of tokens) {
        for (const st of tp.stems) { if (tok.startsWith(st)) return tp.key; }
      }
    }
    return null;
  },

  // Копим и положительную, и отрицательную вовлечённость: яркая боль тоже дверь.
  observeTopic(text) {
    if (typeof ProfileStore === 'undefined') return;
    const r = this.readEngagement(text);
    if (r.skip || r.score === 0) return;
    const topic = this.classifyTopic(text);
    if (!topic) return;
    const painful = /стресс|нерв|ссор|сканда|боюсь|страшно|тревог|устал|вымота|злит|бесит|боль|тяжело|проблем|не могу|напряг/i.test(String(text || ''));
    const signed = painful ? -Math.max(1, Math.abs(r.score)) : r.score;
    try { ProfileStore.set('portrait', 'topic_' + topic, String(signed), 'passive_read', 'inferred'); } catch (_) {}
  },

  // Дверь = повторная высокая вовлечённость. Знак обязателен: боль не тепло.
  liveTopic() {
    if (typeof ProfileStore === 'undefined' || !ProfileStore.getHistory) return null;
    let best = null, bestMagnitude = 0;
    for (const tp of this.TOPICS) {
      const hist = ProfileStore.getHistory('portrait', 'topic_' + tp.key) || [];
      if (hist.length < 2) continue;
      let sum = 0;
      for (const e of hist) { const v = Number(e && e.value); if (!Number.isNaN(v)) sum += v; }
      const magnitude = Math.abs(sum);
      if (magnitude > bestMagnitude) {
        bestMagnitude = magnitude;
        best = { topic: tp.key, label: tp.label, score: sum, n: hist.length,
          valence: sum < 0 ? 'negative' : (sum > 0 ? 'positive' : 'mixed') };
      }
    }
    return best;
  },

  // Стабильная расположенность: среднее последних оценок. Нужно ≥2, твердеет к 3-4.
  stableEngagement() {
    if (typeof ProfileStore === 'undefined' || !ProfileStore.getHistory) return null;
    const hist = (ProfileStore.getHistory('portrait', 'engagement') || []).slice(-6);
    if (hist.length < 2) return null;
    let sum = 0, n = 0;
    for (const e of hist) { const v = e && Number(e.value); if (!Number.isNaN(v)) { sum += v; n++; } }
    if (!n) return null;
    const avg = sum / n;
    const level = avg <= -0.6 ? 'сухой' : (avg >= 0.7 ? 'охотный' : 'нейтральный');
    return { level, avg: Math.round(avg * 100) / 100, n };
  },

  // ── НАБЛЮДЕНИЕ: пассивно вычитанные оси кладём в слой portrait.
  // Стабильные оси (мотив/ритм/интенсивность) пишем один раз; тон/цифры — обновляем.
  observe(text, context) {
    if (typeof ProfileStore === 'undefined') return;
    this.observeEngagement(text);
    this.observeTopic(text);
    this.observeState(text);
    this.observeEvidence(text, context);
    // ЗАКРЫТИЕ ПРОБЕЛА НИТИ: если на прошлом ходу открыли тему (li_origin и т.п.),
    // ответ пациента ПИШЕМ в этот ключ — иначе пробел вечно пуст и вопрос всплывает
    // снова («анкетная амнезия»). Событие здоровья/еды между вопросом и ответом
    // не трогаем — ждём настоящий ответ.
    try {
      const asked = ProfileStore.get('portrait', '_askedThread');
      if (asked) {
        const t = (text || '').trim();
        const isEvent = this.moment(text) === 'health'
          || /съел|съела|поел|поела|выпил|выпила|перекус|завтрак|обед|ужин|замер|сахар|ммоль|глюкоз/i.test(t);
        if (!isEvent && !ProfileStore.get('portrait', asked)) {
          const complaint = /уже\s+спраш|не помн|я\s+(же\s+)?ответил|говорил уже|повтор/i.test(t);
          const wc = t.split(/\s+/).filter(Boolean).length;
          if (complaint) {
            ProfileStore.set('portrait', asked, 'рассказано ранее', 'answered', 'stated');
            ProfileStore.set('portrait', '_askedThread', '', 'thread', 'meta');
          } else if (wc >= 3) {
            ProfileStore.set('portrait', asked, (t.length > 200 ? t.slice(0, 200) : t), 'answered', 'stated');
            ProfileStore.set('portrait', '_askedThread', '', 'thread', 'meta');
          }
        }
      }
    } catch (_) {}
    const { portrait } = this.passiveRead(text);
    Object.entries(portrait).forEach(([k, v]) => {
      if (v == null || v === '') return;
      const stable = (k === 'motive' || k === 'life_rhythm' || k === 'li_intensity');
      if (stable && ProfileStore.get('portrait', k)) return;
      try { ProfileStore.set('portrait', k, v, 'passive_read', 'inferred'); } catch (_) {}
    });
  },

  // ── Стабильное чтение оси-из-формы: берём доминанту по истории, а не последнюю реплику.
  // Одно сообщение не лепит черту — нужно ≥ minCount совпадений.
  _stableAxis(field, minCount) {
    minCount = minCount || 2;
    if (typeof ProfileStore === 'undefined' || !ProfileStore.getHistory) {
      return (typeof ProfileStore !== 'undefined' && ProfileStore.get) ? ProfileStore.get('portrait', field) : null;
    }
    const hist = (ProfileStore.getHistory('portrait', field) || []).slice(-8);
    if (!hist.length) return null;
    const tally = {};
    for (const e of hist) { const v = e && e.value; if (v) tally[v] = (tally[v] || 0) + 1; }
    let best = null, bestN = 0;
    for (const k in tally) { if (tally[k] > bestN) { best = k; bestN = tally[k]; } }
    return bestN >= minCount ? best : null;
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

  // ── СОСТОЯНИЕ НА СЕЙЧАС. Одиночный эпизод не черта, но и не мусор:
  // сохраняем улику, повтор повышаем в паттерн.
  readState(text) {
    const t = (text || '').trim();
    const acuteStress = /стресс|нерв|аврал|дедлайн|ссор|сканда|переж(иваю|ивал)|паник|не сплю|бессонниц|горю|горит|завал|замота|вымота|на нервах|напряг|тревож|сорвал/i.test(t);
    const busy = /аврал|дедлайн|некогда|замота|весь день|беготн|на ногах|запар|разрыва/i.test(t);
    return { acuteStress, busy, valence: (acuteStress || busy) ? 'negative' : 'neutral' };
  },

  observeState(text) {
    if (typeof ProfileStore === 'undefined') return;
    const state = this.readState(text);
    const evidence = String(text || '').trim().slice(0, 220);
    const keys = [];
    if (state.acuteStress) keys.push('acute_stress');
    if (state.busy) keys.push('busy_day');
    for (const key of keys) {
      ProfileStore.set('portrait', 'state_' + key,
        { state: key, valence: 'negative', evidence }, 'passive_read', 'observed');
      const hist = ProfileStore.getHistory('portrait', 'state_' + key) || [];
      if (hist.length >= 2) {
        ProfileStore.set('portrait', 'state_patterns',
          { state: key, valence: 'negative', frequency: hist.length,
            evidence: hist.slice(-3).map(e => e.value && e.value.evidence).filter(Boolean) },
          'state_accumulator', 'repeated');
      }
    }
  },

  // Улики формы и прямые слова пациента живут отдельно от гладких выводов портрета.
  observeEvidence(text, context) {
    if (typeof ProfileStore === 'undefined') return;
    const t = String(text || '').trim();
    if (!t) return;
    const asked = ProfileStore.get('portrait', '_askedThread');
    const ctx = Object.assign({}, context || {}, { wasPrompted: !!asked });
    const { signals } = this.passiveRead(t, ctx);
    const prior = ProfileStore.getHistory('portrait', 'delivery_signals') || [];
    const previous = prior.length ? prior[prior.length - 1].value : null;
    const prevLen = previous && Number(previous.response_length_words);
    if (prevLen > 0) signals.response_length_jump = Math.round((signals.response_length_words / prevLen) * 100) / 100;
    else signals.response_length_jump = null;
    ProfileStore.set('portrait', 'delivery_signals', signals, 'passive_read', 'observed');
    const disclosure = /для меня (?:это )?важно|не отдам|ни при каких обстоятельствах|ради (?:этого|чего)|смысл (?:в|этого)|да[её]т мне|не готов(?:а)? отказаться|моя ценност|я выбираю это потому/i.test(t);
    if (disclosure) {
      ProfileStore.set('portrait', 'self_disclosures',
        { kind: 'motive_or_value', quote: t.slice(0, 500) }, 'patient_input', 'stated');
    }
  },

  stableStates() {
    if (typeof ProfileStore === 'undefined' || !ProfileStore.getHistory) return [];
    const result = [];
    for (const key of ['acute_stress', 'busy_day']) {
      const hist = ProfileStore.getHistory('portrait', 'state_' + key) || [];
      if (hist.length >= 2) result.push({ state: key, valence: 'negative', frequency: hist.length });
    }
    return result;
  },

  disclosures() {
    if (typeof ProfileStore === 'undefined' || !ProfileStore.getHistory) return [];
    return (ProfileStore.getHistory('portrait', 'self_disclosures') || [])
      .slice(-6).map(e => e && e.value).filter(Boolean);
  },

  // ── РАМКА ТОНА (узел характера №1): возраст задаёт энергию/темп/формальность,
  // пол сужает риск нелепого вопроса про тело. Детерминированно, из фактов анкеты.
  toneFrame(profile) {
    const p = profile || {};
    const m = String(p.age == null ? '' : p.age).match(/\d{1,3}/);
    const age = m ? parseInt(m[0], 10) : NaN;
    const sex = p.sex === 'мужской' ? 'мужчина' : (p.sex === 'женский' ? 'женщина' : null);
    if (!Number.isFinite(age) && !sex) return '';
    const parts = [];
    if (Number.isFinite(age)) {
      let band;
      if (age < 25) band = 'до 25 — живее и проще, меньше пиетета, но без панибратства и академизма';
      else if (age < 40) band = '25–39 — на равных, по-деловому, без снисхождения';
      else if (age < 60) band = '40–59 — уважительно-партнёрски, ценит компетентность и конкретику, не сюсюкай';
      else band = '60+ — подчёркнуто уважительно, без спешки и сленга/англицизмов, ясно и по делу, дай время';
      parts.push('возраст ' + age + ': ' + band);
    }
    if (sex) parts.push(sex + ' — учитывай при вопросах о теле, чтобы не спросить нелепое');
    return '[РАМКА ТОНА]: ' + parts.join('; ') + '. Сверяйся с ней прежде, чем задать вопрос.';
  },

  // ── ИНЪЕКЦИЯ: портрет + (по времени) либо «не лезь», либо опенер (разговорить, не вопрос).
  buildInjection(profile, gap, timing, eng, state, live, stressDoor, statePatterns, disclosures) {
    const p = profile || {};
    const known = this.KNOWLEDGE_MAP
      .filter(f => p[f.key] != null && p[f.key] !== '')
      .map(f => `${f.label}: ${p[f.key]}`);
    let out = '[ПОРТРЕТ ПАЦИЕНТА]\n';
    out += known.length ? ('Известно — ' + known.join('; ') + '.\n')
                        : 'Пока почти ничего не известно.\n';
    const tf = this.toneFrame(p);
    if (tf) out += tf + '\n';
    if (state && state.acuteStress) out += '[СОСТОЯНИЕ СЕЙЧАС]: в реплике острый стресс — учти при чтении сахара (кортизол его поднимает), поддержи по-человечески. Это МОМЕНТ, не черта — в характер не записывай.\n';
    else if (state && state.busy) out += '[СОСТОЯНИЕ СЕЙЧАС]: день плотный/рваный — читай цифры с этой поправкой, не как черту характера.\n';
    if (statePatterns && statePatterns.length) out += '[ПОВТОРЯЮЩИЕСЯ СОСТОЯНИЯ — ещё не черты]: ' + statePatterns.map(s => s.state + ', знак=' + s.valence + ', эпизодов=' + s.frequency).join('; ') + '. Ищи контекст и закономерность; не называй чертой без дальнейших повторов.\n';
    if (disclosures && disclosures.length) out += '[САМОРАСКРЫТИЯ — долговременные улики]: ' + disclosures.map(d => '«' + d.quote + '»').join('; ') + '. Это пациент уже говорил. Перед «не знаю / не говорил» проверь эти улики.\n';
    out += 'Читай каждое событие ЧЕРЕЗ портрет: одна цифра/сон/еда значат разное у разных людей. '
         + 'Норма — база ЭТОГО человека, не общая таблица. Тон подстрой под портрет.\n';
    if (known.length) out += 'Что перечислено как известное — НЕ переспрашивай, опирайся на это.\n';
    out += 'Черты характера здесь — ГИПОТЕЗЫ из наблюдения, не факты. Не заявляй их пациенту как приговор («ты такой-то»); держи как фон. Не уверен или пациент возразил — не настаивай, признай ошибку.\n';
    if (eng && eng.level === 'сухой') out += 'Расположенность к диалогу: СУХАЯ (на отъебись). Не рыбачь, не заводи темы, не дави вопросами — коротко, по делу, держись фактов.\n';
    else if (eng && eng.level === 'охотный') out += 'Расположенность к диалогу: ОХОТНАЯ (делится, с пониманием). Момент ценен — можно чуть глубже: живой комментарий, оставь дверь, чтобы рассказал сам.\n';
    else if (eng && eng.level === 'нейтральный') out += 'Расположенность к диалогу: нейтральная. Тему тронь по случаю, лёгким комментарием, без нажима.\n';
    if (live) out += '[ДВЕРЬ]: ' + live.label + '; сила=' + Math.abs(live.score) + '; знак=' + live.valence + '. ' + (live.valence === 'negative' ? 'Это может быть рана, а не тёплая тема: входи мягко только по случаю, не используй как универсальный рычаг.' : 'Через неё можно аккуратно разговорить; не в лоб, по случаю.') + '\n';
    if (!gap || timing === 'none') return out;
    if (eng && eng.level === 'сухой') {
      out += '[НЕ ВРЕМЯ ДЛЯ ТЕМ]: расположенность сухая — портрет-пробел не поднимай, ответь по существу и не тяни разговор.';
      return out;
    }
    if (timing === 'hold') {
      out += '[НЕ ВРЕМЯ ДЛЯ ТЕМ]: человек принёс замер/самочувствие — займись этим, портрет-пробел не поднимай.';
      return out;
    }
    out += `[ЗАВЕСТИ РАЗГОВОР — не вопрос, а открытие темы]: ${gap.label}. `;
    out += timing === 'now-hook'
      ? 'Зацепись за то, что он только что сказал: дай живой короткий комментарий и оставь дверь, чтобы рассказал сам.'
      : 'Момент спокойный: подведи к теме мягко, комментарием, не допросом. По одному, по случаю.';
    if (stressDoor) out += ' [СТРЕСС-ДВЕРЬ]: живой темы пока нет — стресс всегда уместный мягкий вход (как спишь, что выматывает в последнее время), но как ФИЗИОЛОГИЮ (влияет на сахар), не «что на душе». Изредка, не дави.';
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
    const eng = this.stableEngagement();
    const dry = !!(eng && eng.level === 'сухой');
    // Открываем тему нити → запоминаем ключ, чтобы ответ пациента закрыл пробел.
    // На сухой расположенности тему не открываем — ключ не ставим.
    if (typeof ProfileStore !== 'undefined' && gap && gap.key && gap.fromThread && !dry
        && (timing === 'now-hook' || timing === 'now-calm')) {
      try { ProfileStore.set('portrait', '_askedThread', gap.key, 'thread', 'meta'); } catch (_) {}
    }
    const state = this.readState(text);
    const live = this.liveTopic();
    // СТРЕСС-ДВЕРЬ (fallback): нет живой темы, не сухой, не в стрессе прямо сейчас.
    // Троттл: не чаще чем раз в ~8 разговорных реплик (часы = длина истории вовлечённости).
    let stressDoor = false;
    if (!dry && !live && !state.acuteStress && (timing === 'now-hook' || timing === 'now-calm')) {
      try {
        const clock = (ProfileStore.getHistory ? (ProfileStore.getHistory('portrait', 'engagement') || []).length : 0);
        const raw = ProfileStore.get ? ProfileStore.get('portrait', '_stressDoorAt') : null;
        const lastN = raw == null ? NaN : Number(raw);
        const last = Number.isNaN(lastN) ? -999 : lastN;
        if (clock - last >= 8) { stressDoor = true; ProfileStore.set('portrait', '_stressDoorAt', String(clock), 'thread', 'meta'); }
      } catch (_) {}
    }
    return this.buildInjection(merged, gap, timing, eng, state, live, stressDoor, this.stableStates(), this.disclosures());
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = PatientModel;
