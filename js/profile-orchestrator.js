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
  classify(text) {
    if (!text || typeof text !== 'string') return 'other';
    const t = text.toLowerCase();
    if (/(съел|ела|выпил|пила|перекус|завтрак|обед|ужин|кушал|поел|поела|поужинал|пообедал|позавтракал)/.test(t)) return 'meal';
    if (/(тренир|пробеж|спорт|нагрузк|ходил|ходила|бегал|бегала|приседан|подтягиван|зал)/.test(t)) return 'exercise';
    if (/(спал|спала|сон|выспал|выспалась|засыпал|проснулся|проснулась)/.test(t)) return 'sleep';
    if (/(стресс|тревог|нервн|злюсь|злилась|переживал|переживаю)/.test(t)) return 'stress';
    if (/(не работает|надоело|бросаю|бросаю|сдаюсь|плохо помога|обнул)/.test(t)) return 'confront';
    if (/(привет|здравствуй|доброе утро|добрый день|добрый вечер|спасибо|пока)/.test(t)) return 'meta';
    return 'other';
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

  contextFor(messageType) {
    if (typeof ProfileStore === 'undefined') return {};
    switch (messageType) {
      case 'meal':
        return { anketa: this._baseAnketa(), patterns: this._patternsFood() };
      case 'exercise':
        return { anketa: this._baseAnketa(), patterns: this._patternsTraining() };
      case 'sleep':
        return { anketa: this._baseAnketa(), patterns: this._patternsSleep() };
      case 'stress':
        return { anketa: this._baseAnketa() };
      case 'confront':
        return { summary: this._summary() };
      case 'meta':
        return {};
      default:
        return { summary: this._summary() };
    }
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
