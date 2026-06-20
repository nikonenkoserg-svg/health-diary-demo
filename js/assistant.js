// Assistant — prompt, filter, profile parsing
// Uses Knowledge from knowledge/core-style.js (loaded via index.html)
// Uses Onboarding from js/onboarding.js

const Assistant = {

  async buildSystemPrompt(profile, userMsgCount, questionCount, messages, state, hasChart, timeUncertain, leverHint, unspecifiedFoods) {
    if (typeof Knowledge !== 'undefined') {
      let prompt = await Knowledge.buildPrompt(profile, userMsgCount, questionCount, messages);

      // Bridge phase
      if (state === 'bridge' && typeof Onboarding !== 'undefined') {
        prompt += Onboarding.BRIDGE_PROMPT;
      }

      // Engine: analyze food in last user message
      if (typeof Engine !== 'undefined' && messages && messages.length > 0) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          const analysis = Engine.analyze(lastUserMsg.content, profile || {});
          if (analysis) {
            prompt += Engine.formatForPrompt(analysis);
          }
        }
      }

      // Если есть график — добавляем конкретные данные из последнего события Engine.
      // Это закрывает архитектурный распад: подсистема еды и генератор ответа
      // имели разное состояние сообщения. Теперь генератор видит то же что и график.
      if (hasChart && typeof Engine !== 'undefined' && Engine._dayEvents && Engine._dayEvents.length > 0) {
        const last = Engine._dayEvents[Engine._dayEvents.length - 1];
        const items = (last.foods || []).map(f => `${f.name} (~${f.portion}г, ${f.kcal} ккал)`).join(', ');
        const totalKcal = (last.foods || []).reduce((s, f) => s + (f.kcal || 0), 0);
        const peak = last.curve ? last.curve.peak : null;
        const peakTime = last.curve ? last.curve.peakTime : null;
        const returnTime = last.curve ? last.curve.returnTime : null;
        prompt += `\n\n[ТЕКУЩЕЕ СОБЫТИЕ — пациент только что съел]
Состав: ${items}
Итого: ~${totalKcal} ккал
Прогноз: пик ${peak} ммоль/л через ${peakTime} мин, возврат к норме через ${returnTime} мин с момента приёма
ВРЕМЯ ПРИЁМА УКАЗАНО — не переспрашивай "во сколько ты съел" если в сообщении пациента есть "сейчас", "только что", "прямо сейчас", "минуту назад", указано "N минут/часов назад" или конкретное время.
В ответе: реагируй на эти данные, не дублируй их подробно словами. Один факт + один рычаг. Не описывай что показывает график — пациент сам видит.
[/ТЕКУЩЕЕ СОБЫТИЕ]`;
      }

      if (hasChart) {
        prompt += `\n\n[РЕЖИМ ГРАФИКА]
Перед твоим текстом пользователь уже видит график глюкозной кривой. График показывает пик, динамику, время возврата — описывать это словами ЗАПРЕЩЕНО.

ФОРМАТ ОТВЕТА В ЭТОМ РЕЖИМЕ:
- Строго 2-3 предложения. Каждое на отдельной строке
- НЕ комментируй остальной рассказ пользователя — ТОЛЬКО про еду и её последствия
- НЕ описывай что на графике — человек это видит
- Скажи то, чего график НЕ покажет: рычаг (что сделать), связь с другими факторами, вопрос

Пример хорошего ответа:
«Если пройдёшься 10 минут после еды — срежешь пик почти вдвое.
Вечером чувствительность к инсулину ниже, поэтому тот же перекус утром лёг бы мягче.»

Пример плохого ответа:
«Вижу твой ритм — тренировка как точка максимальной концентрации...» — это не про график, это пересказ дня.
[/РЕЖИМ ГРАФИКА]`;
      }

      // Граммовка продуктов не указана — попросить уточнить
      if (unspecifiedFoods && unspecifiedFoods.length > 0) {
        prompt += '\n\n[ПОРЦИЯ НЕ УКАЗАНА]\n' +
          'Пациент назвал продукты без точной граммовки: ' + unspecifiedFoods.join(', ') + '.\n' +
          'График построен по дефолтной порции — это приблизительно. Если уместно — одной фразой уточни сколько было (граммы или штуки). Не лекторствуй про калории.\n' +
          '[/ПОРЦИЯ]';
      }

      // Время события не указано — попросить уточнить
      if (timeUncertain) {
        prompt += '\n\n[ВРЕМЯ НЕ УКАЗАНО]\nПользователь не сказал, во сколько это было. График поставил событие на текущее время — это может быть неточно.\nВ ответе обязательно спроси когда это было: «А во сколько ты это съел?» или «Это было только что или раньше?». Без времени график неточен.\n[/ВРЕМЯ НЕ УКАЗАНО]';
      }

      // Рычаг при крупном пике
      if (leverHint && leverHint.needed) {
        const peakMin = leverHint.peakInMinutes;
        const hrs = leverHint.abstainHours;
        const peakDesc = peakMin <= 5 ? 'почти сейчас' :
                         peakMin < 60 ? 'через ' + peakMin + ' мин' :
                         'через ~' + Math.round(peakMin/60) + ' ч';
        prompt += '\n\n[РЫЧАГ — БОЛЬШОЙ ПИК ВПЕРЕДИ]\n';
        prompt += 'Прогноз пика: ' + leverHint.peak + ' ммоль/л ' + peakDesc + '.\n';
        if (leverHint.preferAbstain) {
          prompt += 'У пользователя преддиабет — скорость пика опасна сама по себе. Приоритет: ВОЗДЕРЖАНИЕ от углеводов ' + hrs + ' ч + замедление за счёт белка/жира в следующий приём пищи. Движение упомяни как дополнение, не как замену.\n';
        } else {
          prompt += 'Дай рычаг в формате ДВЕ АЛЬТЕРНАТИВЫ:\n';
          prompt += '— если сейчас доступна нагрузка (20-30 минут движения) → срежешь пик\n';
          prompt += '— если нет → ' + hrs + ' ч без углеводов, пик спадёт сам\n';
        }
        prompt += 'Ответ строго 2-3 короткие фразы. Первая — указание на график. Вторая-третья — рычаг.\n';
        prompt += '[/РЫЧАГ]';
      }

      return prompt;
    }
    return this._fallbackPrompt(profile, userMsgCount, questionCount, state);
  },

  _fallbackPrompt(profile, userMsgCount, questionCount, state) {
    let prompt = `Ты — попутчик. Не врач, не коуч, не справочник. Слушай, запоминай, замечай.
Формат: 2-3 предложения. Каждое на отдельной строке. Без списков, двоеточий с перечислениями, эмодзи, markdown.
Тон: спокойный, внимательный. Никаких "отличный вопрос", "молодец", "рад помочь".`;

    if (profile && Object.keys(profile).length > 0) {
      prompt += '\nПрофиль: ';
      if (profile.sex) prompt += `${profile.sex}, `;
      if (profile.age) prompt += `${profile.age} лет, `;
      if (profile.weight) prompt += `${profile.weight} кг, `;
      prompt = prompt.replace(/, $/, '');
    }
    if (userMsgCount <= 5) prompt += '\nФаза: начало.';
    else if (userMsgCount <= 12) prompt += '\nФаза: знакомство.';
    else prompt += '\nФаза: доверие.';

      // === ИСТОРИЯ ПАЦИЕНТА: замеры, еда, тренды — для ответов на запросы памяти ===
      if (typeof Storage !== 'undefined') {
        const gl = (Storage.getGlucoseLog && Storage.getGlucoseLog()) || [];
        if (gl.length > 0) {
          const sorted = gl.slice().sort((a, b) => b.time - a.time);
          const last10 = sorted.slice(0, 10).reverse();
          const lines = last10.map(g => {
            const d = new Date(g.time);
            const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const time = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            const typeMap = { fasting: 'натощак', postprandial: 'после еды', bedtime: 'перед сном', preprandial: 'до еды', random: '' };
            return '  ' + day + ' ' + time + ' — ' + g.value.toFixed(1) + (typeMap[g.type] ? ' (' + typeMap[g.type] + ')' : '');
          }).join('\n');
          // Сводка
          const last7d = sorted.filter(g => Date.now() - g.time < 7*24*3600*1000);
          let summary = '';
          if (last7d.length >= 3) {
            const avg = (last7d.reduce((s, g) => s + g.value, 0) / last7d.length).toFixed(1);
            const fasting = last7d.filter(g => g.type === 'fasting');
            const above78 = last7d.filter(g => g.value >= 7.8).length;
            summary = '\nСредний за 7 дней: ' + avg;
            if (fasting.length) {
              const avgF = (fasting.reduce((s, g) => s + g.value, 0) / fasting.length).toFixed(1);
              summary += ', натощак ' + avgF;
            }
            if (above78 > 0) summary += '. Замеров выше 7.8: ' + above78;
          }
          prompt += '\n\n[ИСТОРИЯ ЗАМЕРОВ ПАЦИЕНТА]\n' + lines + summary +
            '\nЕсли пациент спрашивает про прошлые цифры (вчера, неделя, средний) — отвечай по этим данным точно, не выдумывай.\n[/ИСТОРИЯ]';
        }

        // История ЕДЫ
        const fl = (Storage.getFoodLog && Storage.getFoodLog()) || [];
        if (fl.length > 0) {
          const sortedF = fl.slice().sort((a, b) => b.time - a.time);
          const last10F = sortedF.slice(0, 10).reverse();
          const linesF = last10F.map(f => {
            const d = new Date(f.time);
            const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
            const time = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            const kcalStr = f.kcal ? ' · ' + f.kcal + ' ккал' : '';
            const peakStr = f.peakEstimate ? ' · прогноз пика ' + f.peakEstimate.toFixed(1) : '';
            return '  ' + day + ' ' + time + ' — ' + f.foods + kcalStr + peakStr;
          }).join('\n');
          prompt += '\n\n[ИСТОРИЯ ЕДЫ ПАЦИЕНТА]\n' + linesF +
            '\nЕсли пациент спрашивает что ел вчера, сколько раз ел сладкое, какой был самый высокий прогноз пика — отвечай по этим данным точно.\n[/ИСТОРИЯ ЕДЫ]';
        }
      }
    if (questionCount >= 1) prompt += '\nНе задавай вопросов.';

    if (state === 'bridge' && typeof Onboarding !== 'undefined') {
      prompt += Onboarding.BRIDGE_PROMPT;
    }

    return prompt;
  },

  parseProfile(text) {
    const p = {};
    const t = text.toLowerCase();

    // \b не работает с кириллицей в JS — сравниваем по словам
    const profileWords = t.split(/[^а-яёa-z]+/i).filter(Boolean);
    const maleWords = ['мужчина','мужской','мужчин','муж','парень','м'];
    const femaleWords = ['женщина','женский','женщин','жен','девушка','ж'];
    if (profileWords.some(w => maleWords.includes(w))) p.sex = 'мужской';
    else if (profileWords.some(w => femaleWords.includes(w))) p.sex = 'женский';

    const ageMatch = t.match(/(\d{1,2})\s*(лет|года|год)/);
    if (ageMatch) p.age = parseInt(ageMatch[1]);

    const hMatch = t.match(/(\d{3})\s*(см|сантиметр)/) || t.match(/рост\s*(\d{3})/);
    if (hMatch) p.height = parseInt(hMatch[1]);

    const wMatch = t.match(/(\d{2,3})\s*(кг|килограмм)/) || t.match(/вес\s*(\d{2,3})/);
    if (wMatch) p.weight = parseInt(wMatch[1]);

    if (p.height && p.weight) {
      const h = p.height / 100;
      p.bmi = (p.weight / (h * h)).toFixed(1);
    }

    return Object.keys(p).length > 0 ? p : null;
  },

  filterResponse(text) {
    if (!text) return '';
    let r = text;

    // Пост-фильтр: вырезаем слова-паразиты в открытии реплики.
    // "Понял.", "Понял!", "Хорошо,", "Конечно." — снимают авторитет, открывают сервисный режим.
    r = r.replace(/^\s*(понял|понятно|хорошо|конечно|ага|ясно|итак|так|слушай)[,.!\s]+/i, '');
    // "Записал!" как восклицание — паразит. "Записал." как акт — оставляем.
    r = r.replace(/^\s*(сейчас разбер[уё]м?|давай разбер[еёу]м|давай по[р]?ядку|я объясню|объясню)[,.!\s]+/i, '');
    r = r.replace(/^\s*записал!\s*/i, '');

    r = r.replace(/\*\*(.+?)\*\*/g, '$1');
    r = r.replace(/__(.+?)__/g, '$1');
    r = r.replace(/\*(.+?)\*/g, '$1');
    r = r.replace(/_(.+?)_/g, '$1');
    r = r.replace(/```[\s\S]*?```/g, '');
    r = r.replace(/`(.+?)`/g, '$1');
    r = r.replace(/^\s*[-•●◦▪]\s+/gm, '');
    r = r.replace(/^\s*\d+[.)]\s+/gm, '');
    r = r.replace(/https?:\/\/\S+/g, '');

    const templates = [
      /[^.!?]*спасибо за (честность|откровенность|доверие)[^.!?]*[.!?]/gi,
      /[^.!?]*(молодец|горжусь|отличн)[^.!?]*[.!?]/gi,
      /[^.!?]*рад[а]? помочь[^.!?]*[.!?]/gi,
      /[^.!?]*обращайся[^.!?]*[.!?]/gi,
      /[^.!?]*у меня есть (полная )?картина[^.!?]*[.!?]/gi,
      /[^.!?]*можем начинать работать[^.!?]*[.!?]/gi,
      /[^.!?]*черкни как (пойдёт|идёт|пройдёт|поведёт)[^.!?]*[.!?]/gi,
      /[^.!?]*расскажи (потом )?как [^.!?]*[.!?]/gi,
      /[^.!?]*интересно как (будет|поведёт|повлияет|пойдёт)[^.!?]*[.!?]/gi,
      /[^.!?]*(понял|принял) твою (картину|ситуацию)[^.!?]*[.!?]/gi,
    ];
    templates.forEach(rx => { r = r.replace(rx, ''); });

    // Оценочные слова — \b не работает с кириллицей, используем lookbehind/lookahead
    r = r.replace(/(?<![а-яёa-z])(очень )?интересн(?:ое|ая|ый|о)(?![а-яёa-z])/gi, '');
    r = r.replace(/(?<![а-яёa-z])умно(?![а-яёa-z])/gi, '');
    r = r.replace(/(?<![а-яёa-z])серьёзн(?:ая|ый|о|ое|ую|ого|ому|ой|ыми|ое)(?![а-яёa-z])/gi, '');
    r = r.replace(/(?<![а-яёa-z])качественн(?:ые|ое|ая|ый|о|ую)(?![а-яёa-z])/gi, '');
    r = r.replace(/(?<![а-яёa-z])умн(?:о|ый|ая|ое|ые)(?![а-яёa-z])/gi, '');

    r = r.replace(/\s+—\s+(?=[,.])/g, '');
    r = r.replace(/\s{2,}/g, ' ');
    r = r.replace(/\n{3,}/g, '\n\n').trim();

    // Жёсткий лимит — 3 предложения
    const sentences = r.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 3) {
      r = sentences.slice(0, 3).join(' ').trim();
    }

    return r;
  }
};
