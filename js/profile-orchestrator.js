// ProfileOrchestrator — селектор слоёв профиля под тип сообщения.
// По спецификации Тренера: не весь профиль в каждый запрос — релевантный срез.
//
// Маппинг класс сообщения → слои:
//   meal       → anketa (база) + patterns.питание + reactions.еда
//   exercise   → anketa (база) + patterns.training + reactions.activity
//   sleep      → anketa (база) + patterns.sleep + reactions.sleep
//   stress     → anketa (база) + patterns.stress_triggers + journal.emotional
//   confront   → journal (полный) + краткая выжимка из остальных
//   meta       → ничего из профиля (general talk)
//   other      → краткая выжимка из anketa

const ProfileOrchestrator = {
  // Возвращает массив всех совпавших типов. В смешанной реплике
  // («съел мороженое, видимо стресс») оба сигнала должны попасть в контекст,
  // иначе побеждает первый матч и второй теряется.
  classify(text) {
    if (!text || typeof text !== 'string') return ['other'];
    const t = text.toLowerCase();
    const types = [];
    if (/(съел|ела|выпил|пила|перекус|завтрак|обед|ужин|кушал|поел|поела|поужинал|пообедал|позавтракал)/.test(t)) types.push('meal');
    if (/(тренир|пробеж|спорт|нагрузк|ходил|ходила|бегал|бегала|приседан|подтягиван|зал)/.test(t)) types.push('exercise');
    if (/(спал|спала|сон|выспал|выспалась|засыпал|проснулся|проснулась)/.test(t)) types.push('sleep');
    if (/(стресс|тревог|нервн|злюсь|злилась|переживал|переживаю)/.test(t)) types.push('stress');
    if (/(не работает|надоело|бросаю|сдаюсь|плохо помога|обнул)/.test(t)) types.push('confront');
    if (!types.length && /(привет|здравствуй|доброе утро|добрый день|добрый вечер|спасибо|пока)/.test(t)) types.push('meta');
    return types.length ? types : ['other'];
  },

  _baseAnketa() {
    if (typeof ProfileStore === 'undefined') return null;
    const s = (f) => ProfileStore.get('anketa', f);
    const fields = {
      sex: s('sex'), age: s('age'), height: s('height'), weight: s('weight'),
      chronic: s('chronic'), allergies: s('allergies'), medications: s('medications'),
      diagnosis: s('diagnosis')
    };
    return Object.fromEntries(Object.entries(fields).filter(([_, v]) => v !== null));
  },

  _patternsFood() {
    if (typeof ProfileStore === 'undefined') return null;
    const s = (f) => ProfileStore.get('patterns', f);
    return {
      breakfast: s('breakfast'), lunch: s('lunch'),
      dinner: s('dinner'), snacks: s('snacks'),
      caffeine: s('caffeine'),
      personal_notes: s('personal_notes')
    };
  },

  _patternsTraining() {
    if (typeof ProfileStore === 'undefined') return null;
    return { training: ProfileStore.get('patterns', 'training') };
  },

  _patternsSleep() {
    if (typeof ProfileStore === 'undefined') return null;
    return { sleep: ProfileStore.get('patterns', 'sleep') };
  },

  _summary() {
    const a = this._baseAnketa();
    if (!a) return null;
    return {
      sex: a.sex || null,
      age: a.age || null,
      diagnosis: a.diagnosis || null,
      chronic: a.chronic || null
    };
  },

  // Принимает массив типов (или строку для обратной совместимости).
  // Мерджит срезы патернов из всех применимых типов.
  contextFor(messageTypes) {
    if (typeof ProfileStore === 'undefined') return {};
    const types = Array.isArray(messageTypes) ? messageTypes : [messageTypes];
    if (!types.length || (types.length === 1 && types[0] === 'meta')) return {};
    if (types.includes('confront')) return { summary: this._summary() };

    const out = {};
    const needsAnketa = types.some(t => ['meal','exercise','sleep','stress'].includes(t));
    if (needsAnketa) out.anketa = this._baseAnketa();

    const patternsMerged = {};
    if (types.includes('meal')) Object.assign(patternsMerged, this._patternsFood() || {});
    if (types.includes('exercise')) Object.assign(patternsMerged, this._patternsTraining() || {});
    if (types.includes('sleep')) Object.assign(patternsMerged, this._patternsSleep() || {});
    if (Object.keys(patternsMerged).length) out.patterns = patternsMerged;

    if (!Object.keys(out).length) out.summary = this._summary();
    return out;
  },

  // Форматирование среза в строку для системного промпта.
  formatForPrompt(context) {
    if (!context || Object.keys(context).length === 0) return '';
    const lines = [];
    if (context.summary) {
      const s = context.summary;
      const parts = [];
      if (s.sex) parts.push(s.sex);
      if (s.age) parts.push(s.age + ' лет');
      if (s.diagnosis && s.diagnosis.name) parts.push(s.diagnosis.name);
      if (s.chronic) parts.push('хронические: ' + JSON.stringify(s.chronic));
      if (parts.length) lines.push('Профиль (выжимка): ' + parts.join(', '));
    }
    if (context.anketa) {
      const a = context.anketa;
      const parts = [];
      if (a.sex) parts.push(a.sex);
      if (a.age) parts.push(a.age + ' лет');
      if (a.height) parts.push(a.height + ' см');
      if (a.weight) parts.push(a.weight + ' кг');
      if (a.diagnosis && a.diagnosis.name) parts.push('диагноз: ' + a.diagnosis.name);
      if (a.chronic) parts.push('хронические: ' + (Array.isArray(a.chronic) ? a.chronic.join(', ') : a.chronic));
      if (a.allergies) parts.push('аллергии: ' + (Array.isArray(a.allergies) ? a.allergies.join(', ') : a.allergies));
      if (a.medications) parts.push('медикаменты: ' + JSON.stringify(a.medications));
      if (parts.length) lines.push('Анкета: ' + parts.join(', '));

      // Явный список НЕИЗВЕСТНЫХ полей — чтобы модель не достраивала "пусто = нет".
      const unknown = [];
      if (!a.chronic) unknown.push('хронические заболевания');
      if (!a.allergies) unknown.push('аллергии');
      if (!a.medications) unknown.push('медикаменты');
      if (!(a.diagnosis && a.diagnosis.name)) unknown.push('диагноз');
      if (unknown.length) lines.push('НЕИЗВЕСТНО (пациент не заполнял, не считать отсутствием): ' + unknown.join(', '));
    }
    if (context.patterns) {
      const p = context.patterns;
      const items = [];
      if (p.breakfast) items.push('завтрак: ' + JSON.stringify(p.breakfast));
      if (p.lunch) items.push('обед: ' + JSON.stringify(p.lunch));
      if (p.dinner) items.push('ужин: ' + JSON.stringify(p.dinner));
      if (p.snacks) items.push('перекусы: ' + JSON.stringify(p.snacks));
      if (p.training) items.push('тренировки: ' + JSON.stringify(p.training));
      if (p.sleep) items.push('сон: ' + JSON.stringify(p.sleep));
      if (p.caffeine) items.push('кофеин: ' + JSON.stringify(p.caffeine));
      if (p.personal_notes) items.push('заметки: ' + JSON.stringify(p.personal_notes));
      if (items.length) lines.push('Паттерны: ' + items.join('; '));
    }
    if (!lines.length) return '';
    return '\n\n[ПРОФИЛЬ ПАЦИЕНТА — релевантный срез]\n' + lines.join('\n') + '\n[/ПРОФИЛЬ]';
  }
};

if (typeof window !== 'undefined') window.ProfileOrchestrator = ProfileOrchestrator;
