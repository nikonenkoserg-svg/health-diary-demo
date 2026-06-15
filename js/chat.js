// Chat module — send, receive, display, typewriter

const Chat = {
  chatData: null,
  isSending: false,

  init() {
    this.chatData = Storage.getChat();
    this.replayDayLog();
    this.restoreMessages();

    const state = this.chatData.state;
    const hasMessages = this.chatData.messages.length > 0;

    if (state === 'init' || (state === 'pre_register' && !hasMessages)) {
      this.showGreeting();
    } else if (state === 'questionnaire_intro') {
      this.showQuestionnaire();
    }
  },

  async showGreeting() {
    await this.typeMessage(Onboarding.GREETING, 'bot');
    this.chatData.state = 'pre_register';
    Storage.saveChat(this.chatData);
  },

  async showQuestionnaire() {
    await this.typeMessage(Onboarding.QUESTIONNAIRE_INTRO, 'bot');
    await new Promise(r => setTimeout(r, 1500));
    await this.typeMessage(Onboarding.QUESTIONNAIRE_TEXT, 'bot');
    this.chatData.state = 'questionnaire';
    Storage.saveChat(this.chatData);
  },

  restoreMessages() {
    const chat = document.getElementById('chat');
    chat.innerHTML = '';
    this.chatData.messages.forEach(m => {
      if (m.chartData) return; // графики теперь в панели
      this.addMessageToDOM(m.role === 'user' ? 'user' : 'bot', m.content);
    });
    // Панель графика: из движка (если события дня восстановлены) либо из сохранённого
    if (typeof Chart !== 'undefined') {
      if (typeof Engine !== 'undefined' && Engine._dayEvents && Engine._dayEvents.length > 0) {
        Chart.updatePanel(Engine.getCurvePoints(Storage.getProfile() || {}));
      } else {
        const lastChart = [...this.chatData.messages].reverse().find(m => m.chartData);
        if (lastChart) Chart.updatePanel(lastChart.chartData);
      }
    }
    this.scrollToBottom();
  },

  addMessageToDOM(role, text) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    chat.appendChild(div);
  },

  addArticleLink(url, title) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'message bot';
    const intro = document.createElement('span');
    intro.textContent = 'По теме разбор в канале:\n';
    div.appendChild(intro);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = title;
    div.appendChild(link);
    chat.appendChild(div);
    this.scrollToBottom();
  },

  async _streamReply(resp) {
    // SSE-стрим с плавной раскадровкой: модель может присылать чанками,
    // но в DOM мы добавляем по одному символу с задержкой ~22мс — как typeMessage.
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'message bot';
    let added = false;
    let buffer = '';
    let acc = '';            // полный полученный текст
    let pending = '';        // ещё не отрисованный хвост
    let displayed = '';      // уже в DOM
    let streamDone = false;
    const TYPE_MS = 22;

    const tick = async () => {
      while (!streamDone || pending.length > 0) {
        if (pending.length === 0) {
          await new Promise(r => setTimeout(r, 30));
          continue;
        }
        // Адаптивная задержка по 1 символу: плавная скорость без скачков.
        // Буфер большой — печатаем чаще, маленький — спокойно.
        let delay;
        if (pending.length > 150) delay = 8;
        else if (pending.length > 80) delay = 14;
        else if (pending.length > 30) delay = 20;
        else delay = 28;
        const chunk = pending.slice(0, 1);
        pending = pending.slice(1);
        displayed += chunk;
        if (!added) {
          this.hideTyping();
          chat.appendChild(div);
          added = true;
        }
        div.textContent = displayed;
        this.scrollToBottom();
        await new Promise(r => setTimeout(r, delay));
      }
    };
    const typingPromise = tick();

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let parseError = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let lineEnd;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { streamDone = true; continue; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { parseError = true; streamDone = true; continue; }
          if (parsed.content) {
            acc += parsed.content;
            pending += parsed.content;
          }
        } catch (_) {}
      }
    }
    streamDone = true;
    await typingPromise;
    if (parseError || !acc) return null;
    this.chatData.messages.push({ role: 'assistant', content: acc });
    Storage.saveChat(this.chatData);
    return acc;
  },

  async typeMessage(text, role) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    chat.appendChild(div);

    for (let i = 0; i <= text.length; i++) {
      div.textContent = text.slice(0, i);
      this.scrollToBottom();
      await new Promise(r => setTimeout(r, 20));
    }

    this.chatData.messages.push({
      role: role === 'user' ? 'user' : 'assistant',
      content: text
    });
    Storage.saveChat(this.chatData);
  },

  showTyping() {
    // Если уже показан — не дублируем
    if (document.getElementById('typing')) return;
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'typing';
    div.id = 'typing';
    div.textContent = 'Слышу.';
    chat.appendChild(div);
    this.scrollToBottom();
    const steps = [
      { at: 4000, text: 'Уже иду.' },
      { at: 10000, text: 'Я здесь!' }
    ];
    this._typingTimers = steps.map(s => setTimeout(() => {
      const el = document.getElementById('typing');
      if (el) el.textContent = s.text;
    }, s.at));
  },

  hideTyping() {
    if (this._typingTimers) {
      this._typingTimers.forEach(t => clearTimeout(t));
      this._typingTimers = null;
    }
    const el = document.getElementById('typing');
    if (el) el.remove();
  },

  scrollToBottom() {
    const chat = document.getElementById('chat');
    chat.scrollTop = chat.scrollHeight;
  },

  // Сохранить данные графика для восстановления
  saveChartData(chartData) {
    this.chatData.messages.push({
      role: 'assistant',
      content: '[график]',
      chartData: chartData
    });
    Storage.saveChat(this.chatData);
  },

  // === ИЗВЛЕЧЕНИЕ СОБЫТИЙ ПИТАНИЯ (LLM) ===

  hmToMin(hm) {
    if (typeof hm !== 'string') return null;
    const m = hm.match(/(\d{1,2})[:.]?(\d{2})?/);
    if (!m) return null;
    const h = parseInt(m[1]);
    const mm = m[2] ? parseInt(m[2]) : 0;
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  },

  minToHM(min) {
    const h = Math.floor(min / 60);
    return h + ':' + (min % 60).toString().padStart(2, '0');
  },

  ensureDayLog() {
    const today = (typeof Time !== 'undefined' ? Time.nowParts().dateISO : new Date().toISOString().slice(0,10));
    if (!this.chatData.dayLog || this.chatData.dayLog.date !== today) {
      this.chatData.dayLog = { date: today, wake: null, events: [] };
    }
  },

  // Сообщение похоже на запись о еде?
  looksLikeFood(text) {
    if (typeof Engine !== 'undefined' && Engine.parseFood(text).length > 0) return true;
    return /\b(ел|ела|съел|съела|поел|поела|выпил|выпила|пил|пила|перекус|завтрак|обед|ужин|кушал|покушал|позавтракал|пообедал|поужинал)/i.test(text);
  },

  // LLM извлекает приёмы пищи с временем → {wake, events:[{time,certain,foods}]}
  async extractDayEvents(text) {
    const tp = (typeof Time !== 'undefined' ? Time.nowParts() : { hour: new Date().getHours(), minute: new Date().getMinutes(), tz: 'UTC' });
    const hhmm = tp.hour + ':' + tp.minute.toString().padStart(2, '0');

    let sys = `Ты извлекаешь приёмы пищи и напитков из сообщения пользователя.
Текущее время: ${hhmm} (${tp.tz}).`;
    if (this.chatData.dayLog && this.chatData.dayLog.wake != null) {
      sys += `\nВремя подъёма сегодня: ${this.minToHM(this.chatData.dayLog.wake)}.`;
    }
    sys += `

Верни ТОЛЬКО валидный JSON, без markdown и пояснений:
{"wake":"ЧЧ:ММ" или null,"events":[{"time":"ЧЧ:ММ","certain":true,"items":[{"product":"торт","portion_g":150,"confidence":"high"}]}]}

Правила:
- Каждый приём пищи или напиток — отдельный элемент events
- Время словами переводи в цифры: "три пятнадцать"→"3:15", "пол девятого"→"8:30"
- Относительное время разворачивай по цепочке
- "N часов назад" — отсчитывай от текущего времени
- Точное время → certain:true. Расплывчатое ("утром","днём","вечером") или прикидка → certain:false
- Совсем нет времени → time текущее, certain:false
- wake — время подъёма, если есть "проснулся/встал в..."
- items — массив продуктов в этом приёме пищи:
  - product: короткое название в именительном падеже (торт, кофе, овсяная каша). НЕ пиши количества внутри
  - portion_g: оценка в граммах (для жидкостей: 1 мл = 1 г)
  - confidence:
    - "high" — граммовка указана точно («150 г», «250 мл», «200 грамм»)
    - "medium" — бытовая мера (чашка=200, стакан=250, кружка=300, ст.ложка=15, ч.ложка=5, горсть=30, кусок=50, ломтик=30)
    - "low" — порция не указана, прикидываешь средние
- Глюкозу, давление, рост, вес — НЕ включай
- Нет еды в сообщении → {"wake":null,"events":[]}

Примеры:
"Я съел 150 грамм торта и выпил чашку кофе" →
{"wake":null,"events":[{"time":"<текущее>","certain":false,"items":[{"product":"торт","portion_g":150,"confidence":"high"},{"product":"кофе","portion_g":200,"confidence":"medium"}]}]}

"Утром сахар 5.5, час назад съел 200 грамм овсяной каши с мёдом, сейчас 9" →
{"wake":null,"events":[{"time":"<час назад>","certain":true,"items":[{"product":"овсяная каша","portion_g":200,"confidence":"high"},{"product":"мёд","portion_g":15,"confidence":"low"}]}]}`;

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: text }
          ],
          max_tokens: 500
        })
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      let raw = data.choices?.[0]?.message?.content || '';
      raw = raw.replace(/```json|```/g, '').trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      if (!parsed || !Array.isArray(parsed.events)) return null;
      return parsed;
    } catch (err) {
      console.error('extractDayEvents error:', err);
      return null;
    }
  },

  // Восстановить события дня в движок при загрузке
  replayDayLog() {
    if (typeof Engine === 'undefined') return false;
    const today = (typeof Time !== 'undefined' ? Time.nowParts().dateISO : new Date().toISOString().slice(0,10));
    if (!this.chatData.dayLog || this.chatData.dayLog.date !== today) {
      this.chatData.dayLog = null;
      return false;
    }
    const profile = Storage.getProfile() || {};
    Engine.clearDay();
    if (this.chatData.dayLog.wake != null) Engine.setDayStart(this.chatData.dayLog.wake);
    for (const e of this.chatData.dayLog.events) {
      const payload = e.items || e.foods;
      if (payload) Engine.addEvent(payload, profile, { minute: e.minute, certain: e.certain });
    }
    return this.chatData.dayLog.events.length > 0;
  },

  async send(text) {
    if (this.isSending || !text.trim()) return;
    this.isSending = true;

    this.addMessageToDOM('user', text);
    this.chatData.messages.push({ role: 'user', content: text });
    this.chatData.userMsgCount++;
    Storage.saveChat(this.chatData);
    this.scrollToBottom();
    // Индикатор «думаю» — сразу при отправке, не после всех парсеров
    this.showTyping();

    // Парсер замеров глюкозы: тихо сохраняет в Storage
    if (typeof Engine !== 'undefined' && Engine.parseGlucose) {
      const g = Engine.parseGlucose(text);
      if (g) Storage.addGlucose(g);
    }

    // === PRE-REGISTER: user asks questions before creating profile ===
    if (this.chatData.state === 'pre_register') {
      const category = Onboarding.classifyResponse(text);

      if (category === 'aggressive') {
        await this.typeMessage(Onboarding.RESPONSES.aggressive, 'bot');
        this.isSending = false;
        return;
      }

      // Check if user agrees to create profile — пословно, только короткие сообщения
      const words = text.toLowerCase().trim().split(/[\s,.!?;:()«»"]+/).filter(Boolean);
      const agreeWords = ['да','ага','давай','давайте','ок','окей','окай','хорошо','хорошо','ладно','погнали','готов','готова','готово','готовы','поехали','профиль','done','start','go','yes','ok','го','начнём','начнем','поехали'];
      const agreeStem = ['созд','зарег','регистр','начн','сделал','сделан','оформ','готов','поех'];
      const isQuestion = text.includes('?');
      const isAgree = !isQuestion && words.length <= 4 && (
        words.some(w => agreeWords.includes(w)) ||
        words.some(w => agreeStem.some(s => w.startsWith(s)))
      );
      if (isAgree) {
        this.hideTyping();
        this.chatData.state = 'questionnaire_intro';
        Storage.saveChat(this.chatData);
        await new Promise(r => setTimeout(r, 500));
        await this.showQuestionnaire();
        this.isSending = false;
        return;
      }

      // LLM response
      this.showTyping();
      try {
        const apiMessages = [
          { role: 'system', content: Onboarding.PRE_REGISTER_PROMPT },
          ...this.chatData.messages.slice(-6)
        ];

        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, max_tokens: 1200 })
        });

        this.hideTyping();

        if (resp.ok) {
          const data = await resp.json();
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            await this.typeMessage(Assistant.filterResponse(raw), 'bot');
          }
        }
      } catch (err) {
        this.hideTyping();
        console.error('Pre-register LLM error:', err);
      }

      this.isSending = false;
      return;
    }

    // === QUESTIONNAIRE ===
    if (this.chatData.state === 'questionnaire') {
      const profile = Assistant.parseProfile(text);
      if (profile) {
        const existing = Storage.getProfile();
        Storage.saveProfile({ ...existing, ...profile });
      }

      this.showTyping();
      try {
        // Дополняем системный промпт списком УЖЕ известных полей профиля,
        // чтобы LLM не переспрашивал то, что мы уже распарсили.
        const known = Storage.getProfile() || {};
        const knownFields = [];
        if (known.sex) knownFields.push(`пол=${known.sex}`);
        if (known.age) knownFields.push(`возраст=${known.age}`);
        if (known.weight) knownFields.push(`вес=${known.weight} кг`);
        if (known.height) knownFields.push(`рост=${known.height} см`);
        let sysPrompt = Onboarding.QUESTIONNAIRE_PROMPT;
        if (knownFields.length > 0) {
          sysPrompt += `\n\nУЖЕ ИЗВЕСТНО ИЗ ПРОФИЛЯ: ${knownFields.join(', ')}. Эти поля НЕ переспрашивай.`;
        }
        const apiMessages = [
          { role: 'system', content: sysPrompt },
          ...this.chatData.messages.slice(-10)
        ];

        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, max_tokens: 1500 })
        });

        this.hideTyping();

        if (resp.ok) {
          const data = await resp.json();
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            const reply = Assistant.filterResponse(raw);
            await this.typeMessage(reply, 'bot');

            // Анкета — один сеанс. После ответа пациента всегда переключаем
            // на основной режим. Магические фразы не нужны.
            this.chatData.state = 'bridge';
            this.chatData.bridgeCount = 0;
            Storage.saveChat(this.chatData);
          }
        }
      } catch (err) {
        this.hideTyping();
        console.error('Questionnaire LLM error:', err);
      }

      this.isSending = false;
      return;
    }

    // === NORMAL FLOW (bridge + active) ===
    const profile = Assistant.parseProfile(text);
    if (profile) {
      const existing = Storage.getProfile();
      Storage.saveProfile({ ...existing, ...profile });
    }

    // --- ГРАФИК: извлекаем события питания ---
    let chartData = null;
    let timeUncertain = false;
    let leverHint = null;

    // Уточнение существующего event (граммы/время в отдельной реплике без еды)
    if (typeof Engine !== 'undefined' && Engine.updateLastEventFromContext &&
        (this.chatData.state === 'active' || this.chatData.state === 'bridge') &&
        !this.looksLikeFood(text) && Engine._dayEvents.length > 0) {
      const profile = Storage.getProfile() || {};
      if (Engine.updateLastEventFromContext(text, profile)) {
        chartData = Engine.getCurvePoints(profile);
      }
    }

    if (typeof Engine !== 'undefined' &&
        (this.chatData.state === 'active' || this.chatData.state === 'bridge') &&
        this.looksLikeFood(text)) {
      const foodProfile = Storage.getProfile() || {};
      // LLM извлекает события с временем
      const extracted = await this.extractDayEvents(text);
      if (extracted && extracted.events.length > 0) {
        this.ensureDayLog();
        if (extracted.wake) {
          const wm = this.hmToMin(extracted.wake);
          if (wm != null) { Engine.setDayStart(wm); this.chatData.dayLog.wake = wm; }
        }
        for (const ev of extracted.events) {
          const mn = this.hmToMin(ev.time);
          // Новый формат: items=[{product, portion_g, confidence}]. Старый (fallback): foods="строка".
          const payload = (ev.items && Array.isArray(ev.items)) ? ev.items : ev.foods;
          if (mn == null || !payload) continue;
          const certain = ev.certain !== false;
          const payloadKey = typeof payload === 'string' ? payload : JSON.stringify(payload);
          const dup = this.chatData.dayLog.events.some(e => {
            const eKey = typeof (e.items || e.foods) === 'string' ? (e.items || e.foods) : JSON.stringify(e.items || e.foods);
            return e.minute === mn && eKey === payloadKey;
          });
          if (dup) continue;
          Engine.addEvent(payload, foodProfile, { minute: mn, certain });
          this.chatData.dayLog.events.push({ items: ev.items || null, foods: ev.foods || null, minute: mn, certain });
          if (!certain) timeUncertain = true;
        }
        chartData = Engine.getCurvePoints(foodProfile);
        // Подсказка рычага по последнему добавленному событию
        const lastEvent = Engine._dayEvents[Engine._dayEvents.length - 1];
        leverHint = Engine.computeLeverHint(lastEvent, foodProfile);
        // Сохранить в history лог еды для будущих запросов «что я ел вчера»
        if (lastEvent) {
          const now = new Date();
          const eatTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
            Math.floor(lastEvent.eventMinute / 60), lastEvent.eventMinute % 60).getTime();
          Storage.addFood({
            time: eatTime,
            foods: lastEvent.foods.map(f => f.name).join(', '),
            kcal: lastEvent.foods.reduce((s, f) => s + (f.kcal || 0), 0),
            peakEstimate: lastEvent.curve ? lastEvent.curve.peak : null,
            certain: lastEvent.timeCertain
          });
        }
        Storage.saveChat(this.chatData);
      } else {
        // Запасной путь — regex-движок
        const result = Engine.analyzeWithChart(text, foodProfile);
        if (result) {
          chartData = result.chartData;
          timeUncertain = result.timeUncertain;
          leverHint = result.leverHint || null;
        }
      }
    }

    try {
      const currentProfile = Storage.getProfile();
      // Список продуктов без указанной граммовки — для подсказки модели
      let unspecifiedFoods = [];
      if (chartData && chartData.events && chartData.events.length > 0) {
        const lastEv = chartData.events[chartData.events.length - 1];
        if (lastEv.unspecifiedFoods && lastEv.unspecifiedFoods.length) {
          unspecifiedFoods = lastEv.unspecifiedFoods;
        }
      }

      const systemPrompt = await Assistant.buildSystemPrompt(
        currentProfile,
        this.chatData.userMsgCount,
        this.chatData.questionCount,
        this.chatData.messages,
        this.chatData.state,
        !!chartData,
        timeUncertain,
        leverHint,
        unspecifiedFoods
      );

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...this.chatData.messages.filter(m => !m.chartData).slice(-12)
      ];

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          max_tokens: chartData ? 800 : 1500,
          stream: true
        })
      });

      if (resp.ok && resp.body) {
        // Обновляем график пока модель думает
        if (chartData && typeof Chart !== 'undefined') {
          Chart.updatePanel(chartData);
          this.saveChartData(chartData);
        }

        const raw = await this._streamReply(resp);
        this.hideTyping();
        if (raw) {
          const reply = Assistant.filterResponse(raw);
          if (reply.includes('?')) this.chatData.questionCount++;
          else this.chatData.questionCount = 0;

          // Постобработка: ссылка на пост канала появляется ТОЛЬКО когда пациент
          // задаёт вопрос. На декларативные констатации ссылок не даём.
          try {
            const isQuestion = /\?|(?:^|\s)(что|как|почему|зачем|когда|где|какой|какая|какие|нужно ли|можно ли|стоит ли|правда ли|почему ли|поможет ли)(?:\s|$|\?|,|\.)/i.test(text);
            if (isQuestion && typeof window.RAG !== 'undefined' && window.RAG.isReady && window.RAG.isReady()) {
              const article = await window.RAG.searchArticle(text, null, { sex: (Storage.getProfile() || {}).sex });
              if (article) {
                this.addArticleLink(article.url, '«' + article.title + '»');
              }
            }
          } catch (e) { console.warn('[RAG] article post failed:', e); }

          if (this.chatData.state === 'bridge') {
            this.chatData.bridgeCount = (this.chatData.bridgeCount || 0) + 1;
            if (this.chatData.bridgeCount >= 3) {
              this.chatData.state = 'active';
            }
            Storage.saveChat(this.chatData);
          }
        } else {
          this.addMessageToDOM('bot', 'Пустой ответ. Попробуйте ещё раз.');
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.error('Chat API error:', resp.status, errText);
        this.addMessageToDOM('bot', 'Ошибка ' + resp.status + '. Попробуйте ещё раз.');
      }
    } catch (err) {
      this.hideTyping();
      this.addMessageToDOM('bot', 'Ошибка соединения. Проверьте интернет.');
      console.error('Chat error:', err);
    }

    this.isSending = false;
  }
};
