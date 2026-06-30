// Assistant — prompt, filter, profile parsing
// Uses Knowledge from knowledge/core-style.js (loaded via index.html)
// Uses Onboarding from js/onboarding.js

const Assistant = {

  async buildSystemPrompt(profile, userMsgCount, questionCount, messages, state, hasChart, timeUncertain, leverHint, unspecifiedFoods, recapEvents) {
    if (typeof Knowledge !== 'undefined') {
      let prompt = await Knowledge.buildPrompt(profile, userMsgCount, questionCount, messages);

      // Bridge phase
      if (state === 'bridge' && typeof Onboarding !== 'undefined') {
        prompt += Onboarding.BRIDGE_PROMPT;
      }

      // Место и время пациента — критично для правильного парсинга времени.
      // Если устройство в одной зоне, а пациент в другой — без этого блока
      // модель и Engine разъезжаются с реальностью.
      try {
        if (typeof Time !== 'undefined') {
          const region = (profile && (profile.region || profile.anketa_region)) || null;
          const tp = Time.nowParts();
          const hh = String(tp.hour).padStart(2, '0');
          const mm = String(tp.minute).padStart(2, '0');
          let devTz = null;
          try { devTz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
          prompt += '\n\n[МЕСТО И ВРЕМЯ ПАЦИЕНТА]\n';
          if (region) prompt += 'Регион: ' + region + '.\n';
          prompt += 'Часовой пояс пациента: ' + (tp.tz || 'device') + '.\n';
          prompt += 'Текущее время пациента: ' + hh + ':' + mm + '.\n';
          if (devTz && tp.tz && devTz !== tp.tz && tp.tz !== 'device' && tp.tz !== 'device-fallback') {
            prompt += 'Внимание: часовой пояс устройства (' + devTz + ') НЕ совпадает с зоной пациента. Все упоминания времени пациентом считай по зоне пациента, не по устройству.\n';
          }
          prompt += 'Если пациент пишет "в 02:45" — это 02:45 по его местному времени, а не по устройству.\n';
          prompt += '[/МЕСТО И ВРЕМЯ ПАЦИЕНТА]';
        }
      } catch (e) { console.warn('[tz prompt]', e); }

      // Долгосрочная память пациента — паттерны, реакции, образ жизни.
      // Накоплена секретарём из предыдущих диалогов. Если пуста — блок пропускаем.
      try {
        if (typeof PatientMemory !== 'undefined' && typeof PatientMemory.format === 'function') {
          const memBlock = PatientMemory.format();
          if (memBlock) prompt += '\n\n' + memBlock;
        }
      } catch (e) { console.warn('[memory prompt]', e); }

      // Внимание к цифрам и режиму. Если пациент сообщает время, длительность,
      // частоту, количество — проверяй на правдоподобие. Не подтверждай молча
      // экстремальные значения, переспрашивай мягко чтобы убедиться что не опечатка.
      prompt += '\n\n[ВНИМАНИЕ К ЦИФРАМ]\n';
      prompt += 'Если пациент называет время/длительность/частоту, которые выходят за норму — переспроси, не подтверждай автоматически.\n';
      prompt += 'Примеры аномалий: подъём в 2-3 ночи, тренировка дольше 2 часов подряд, сон меньше 5 часов, более 5 приёмов пищи, замер выше 11 или ниже 3, температура выше 39.\n';
      prompt += 'Реакция: одна короткая фраза без оценки. «2 ночи — это точное время или 14:00?», «6 часов тренировки в день каждый день — уточни что входит, это вместе с разминкой?». Не одобряй («плотный старт»), не осуждай, просто уточняй число.\n';
      prompt += 'Если пациент подтвердил — записывай как есть и идёшь дальше. Цель — отсечь опечатки и понять контекст, не вести разъяснительную работу.\n';
      prompt += '[/ВНИМАНИЕ К ЦИФРАМ]';

      // Активная нагрузка пациента — Engine.setActiveWorkload зафиксировал
      // из реплики. Передаём модели, чтобы не предлагала ходьбу как
      // дополнительный рычаг при идущей тренировке.
      try {
        if (typeof Engine !== 'undefined' &&
            typeof Engine.hasActiveWorkload === 'function' &&
            Engine.hasActiveWorkload()) {
          const w = Engine.getActiveWorkload();
          prompt += '\n\n[АКТИВНАЯ НАГРУЗКА ПАЦИЕНТА]\n';
          prompt += 'Тип: ' + (w.kind || 'нагрузка') + '.\n';
          if (w.hours) prompt += 'Длительность: ' + w.hours + ' ч.\n';
          prompt += 'У пациента идёт мышечная работа, рычаг ходьбы НЕ предлагай как дополнение — это та же самая работа, только слабее. Если в карточке на экране у пациента написано про ходьбу — это шаблон, который не учёл его контекст. Признай это честно: «карточка по шаблону предложила, в твоём случае не нужно — твоя тренировка уже закроет пик». НЕ ВРИ что «не рекомендовал», если карточка предложила.\n';
          prompt += '[/АКТИВНАЯ НАГРУЗКА]';
        }
      } catch (e) { console.warn('[workload prompt]', e); }

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
До 14:00 чувствительность выше, тот же перекус лёг бы мягче утром.»

Пример плохого ответа:
«Вижу твой ритм — тренировка как точка максимальной концентрации...» — это не про график, это пересказ дня.

ЗАПРЕЩЕНО давать советы на будущее без запроса: «ужин полегче», «к вечеру ешь меньше», «прогулка снимет тяжесть» — это сервисный дрейф. Говори ТОЛЬКО про то, что пациент сейчас спросил или сейчас сделал. Никаких «если вечером будет X — делай Y» если пациент не спрашивал про вечер.
[/РЕЖИМ ГРАФИКА]`;
      }

      // Пересказ дня — пациент описал несколько приёмов, последний не свежий.
      // Графика нет, но нужен развёрнутый разбор (исключение из правила «одно слово»).
      if (recapEvents && recapEvents.length > 0) {
        prompt += '\n\n[ПЕРЕСКАЗ ДНЯ]\n';
        prompt += 'Пациент описал день целиком. Это пересказ — НЕ отвечай одним словом «Принял.» Дай разбор:\n';
        prompt += '1. По каждому приёму одна строка: что в нём ключевое (быстрый сахар / белок / клетчатка), как влияет.\n';
        prompt += '2. Общая картина дня — паттерны (порядок, паузы между приёмами), баланс, риски.\n';
        prompt += '3. Ориентир на остаток дня. Если до сна ещё есть время — что важно (или не делать).\n';
        prompt += 'Опирайся на список ниже. Не дублируй текст пациента, не перечисляй то что он сам сказал.\n';
        prompt += '\nКРИТИЧНО — ГРАФИКА В ЭТОМ ОТВЕТЕ НЕТ. НЕ упоминай «график», «график ровный», «график показывает», «на графике видно». Графической кривой пациент не увидит. Говори словами про события и физиологию.\n';
        prompt += 'КРИТИЧНО — НЕ ВЫДУМЫВАЙ еду, которую пациент НЕ называл. Не давай советы про «вечерний ужин», «вечерний углеводный плот», «убери Х», если пациент про это не упоминал. Только то что есть в списке ниже.\n';
        prompt += 'КРИТИЧНО — НЕ ПЕРЕСПРАШИВАЙ то что пациент уже сказал. Если он написал «спал хорошо» — НЕ спрашивай «как сон». Если сказал «настроение бодрое» — НЕ спрашивай про настроение. Прочитай первое сообщение пациента целиком.\n';
        prompt += '\nПриёмы пищи за день:\n';
        for (const ev of recapEvents) {
          prompt += '- ' + (ev.time || '?') + ' — ' + (ev.foods || 'не уточнено') + '\n';
        }
        prompt += '[/ПЕРЕСКАЗ ДНЯ]';
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

  filterResponse(text, lastUserMsg, isLongAnswerContext) {
    if (!text) return '';
    let r = text;
    lastUserMsg = lastUserMsg || '';

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

    // Если пациент сам поставил протокол ("буду сообщать", "напишу", "отчитаюсь",
    // "по ходу", "в процессе сообщу") — вырезаем финальный вопрос. Спутник
    // не должен спрашивать то, о чём пациент сам обещал сообщить.
    const protocolMarkers = /(буду сообщать|сообщу|отчитаюсь|по ходу (напишу|сообщу|отмечу)|в процессе (буду|сообщ|отмеч)|напишу как)/i;
    if (lastUserMsg && protocolMarkers.test(lastUserMsg)) {
      // вырезать ПОСЛЕДНЕЕ предложение если оно вопрос
      r = r.replace(/[\s]*[^.!?]+\?\s*$/, '').trim();
    }

    // Контекстный лимит: 3 предложения по умолчанию, 7 — когда нужен развёрнутый ответ
    // (триггер в реплике, первое сообщение после анкеты, прямой широкий вопрос).
    const limit = isLongAnswerContext ? 7 : 3;
    const sentences = r.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > limit) {
      r = sentences.slice(0, limit).join(' ').trim();
    }

    return r;
  }
};
