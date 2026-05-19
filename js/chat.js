// Chat module — send, receive, display, typewriter

const Chat = {
  chatData: null,
  isSending: false,

  init() {
    this.chatData = Storage.getChat();
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
    // Восстанавливаем панель графика из последних данных
    const lastChart = [...this.chatData.messages].reverse().find(m => m.chartData);
    if (lastChart && typeof Chart !== 'undefined') {
      Chart.updatePanel(lastChart.chartData);
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
            const hasEssentials = fullProfile.sex && fullProfile.age &&
                                  fullProfile.weight && fullProfile.height;
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

    // --- ГРАФИК: проверяем еду в сообщении ---
    let chartData = null;
    if (typeof Engine !== 'undefined' && (this.chatData.state === 'active' || this.chatData.state === 'bridge')) {
      const currentProfile = Storage.getProfile() || {};
      const result = Engine.analyzeWithChart(text, currentProfile);
      if (result) {
        chartData = result.chartData;
      }
    }

    this.showTyping();

    try {
      const currentProfile = Storage.getProfile();
      const systemPrompt = Assistant.buildSystemPrompt(
        currentProfile,
        this.chatData.userMsgCount,
        this.chatData.questionCount,
        this.chatData.messages,
        this.chatData.state,
        !!chartData  // hasChart flag
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
          max_tokens: chartData ? 150 : 300  // Короче если есть график
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
