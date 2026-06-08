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
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'typing';
    div.id = 'typing';
    div.textContent = 'думаю';
    chat.appendChild(div);
    this.scrollToBottom();
  },

  hideTyping() {
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
{"wake":"ЧЧ:ММ" или null,"events":[{"time":"ЧЧ:ММ","certain":true,"foods":"продукты"}]}

Правила:
- Каждый приём пищи или напиток — отдельный элемент events
- Время словами переводи в цифры: "три пятнадцать"→"3:15", "пол девятого"→"8:30"
- Относительное время разворачивай по цепочке: если "в 4 начал, через 2 часа молоко" — молоко в "6:00"
- "N часов назад" — отсчитывай от текущего времени
- Точное время → certain:true. Расплывчатое ("утром","днём","вечером") или вычисленное приблизительно → certain:false
- Совсем нет времени → time текущее, certain:false
- foods — простые названия через запятую (блины, кофе, молоко, мясо). Без описаний и количеств
- wake — время подъёма, если есть "проснулся/встал в..."
- Нет еды в сообщении → {"wake":null,"events":[]}`;

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
      Engine.addEvent(e.foods, profile, { minute: e.minute, certain: e.certain });
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
      const agreeWords = ['да','ага','давай','давайте','ок','окей','окай','хорошо','хорошо','ладно','погнали','готов','готова','готовы','поехали','профиль','done','start','go','yes','ok','го'];
      const agreeStem = ['созд','зарег','регистр','начн','сделал','сделан','оформ','готов'];
      const isQuestion = text.includes('?');
      const isAgree = !isQuestion && words.length <= 4 && (
        words.some(w => agreeWords.includes(w)) ||
        words.some(w => agreeStem.some(s => w.startsWith(s)))
      );
      if (isAgree) {
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
          body: JSON.stringify({ messages: apiMessages, max_tokens: 250 })
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
        const apiMessages = [
          { role: 'system', content: Onboarding.QUESTIONNAIRE_PROMPT },
          ...this.chatData.messages.slice(-10)
        ];

        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, max_tokens: 300 })
        });

        this.hideTyping();

        if (resp.ok) {
          const data = await resp.json();
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            const reply = Assistant.filterResponse(raw);
            await this.typeMessage(reply, 'bot');

            // Завершение опросника: по собранным данным, не по словам LLM
            const fullProfile = Storage.getProfile() || {};
            const hasEssentials = fullProfile.age && fullProfile.weight && fullProfile.height;
            const done = /начинать работать|картина есть|достаточно|можем начинать|приступ/i;
            if (hasEssentials || done.test(reply)) {
              this.chatData.state = 'bridge';
              this.chatData.bridgeCount = 0;
              Storage.saveChat(this.chatData);
            }
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
          if (mn == null || !ev.foods) continue;
          const certain = ev.certain !== false;
          const dup = this.chatData.dayLog.events.some(
            e => e.minute === mn && e.foods === ev.foods);
          if (dup) continue;
          Engine.addEvent(ev.foods, foodProfile, { minute: mn, certain });
          this.chatData.dayLog.events.push({ foods: ev.foods, minute: mn, certain });
          if (!certain) timeUncertain = true;
        }
        chartData = Engine.getCurvePoints(foodProfile);
        // Подсказка рычага по последнему добавленному событию
        const lastEvent = Engine._dayEvents[Engine._dayEvents.length - 1];
        leverHint = Engine.computeLeverHint(lastEvent, foodProfile);
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

    this.showTyping();

    try {
      const currentProfile = Storage.getProfile();
      const systemPrompt = await Assistant.buildSystemPrompt(
        currentProfile,
        this.chatData.userMsgCount,
        this.chatData.questionCount,
        this.chatData.messages,
        this.chatData.state,
        !!chartData,
        timeUncertain,
        leverHint
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
          max_tokens: chartData ? 800 : 1500  // Короче если есть график
        })
      });

      this.hideTyping();

      if (resp.ok) {
        const data = await resp.json();
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const reply = Assistant.filterResponse(raw);
          if (reply.includes('?')) this.chatData.questionCount++;
          else this.chatData.questionCount = 0;

          // Обновляем постоянную панель графика
          if (chartData && typeof Chart !== 'undefined') {
            Chart.updatePanel(chartData);
            this.saveChartData(chartData);
          }

          await this.typeMessage(reply, 'bot');

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
