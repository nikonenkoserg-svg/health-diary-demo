// Chat module — send, receive, display, typewriter

const Chat = {
  chatData: null,
  isSending: false,

  init() {
    this.chatData = Storage.getChat();
    this.restoreMessages();

    if (this.chatData.state === 'init') {
      this.showGreeting();
    } else if (this.chatData.state === 'post_register') {
      this.playMonologue();
    }
  },

  async showGreeting() {
    this.chatData.state = 'pre_register';
    Storage.saveChat(this.chatData);
    await this.typeMessage(Onboarding.GREETING, 'bot');
  },

  async playMonologue() {
    const startIdx = this.chatData.monologueIdx || 0;
    for (let i = startIdx; i < Onboarding.MONOLOGUE.length; i++) {
      this.chatData.monologueIdx = i + 1;
      Storage.saveChat(this.chatData);
      await new Promise(r => setTimeout(r, i === 0 ? 500 : 2000));
      await this.typeMessage(Onboarding.MONOLOGUE[i], 'bot');
    }
    // Monologue done — enter bridge phase
    this.chatData.state = 'bridge';
    this.chatData.bridgeCount = 0;
    Storage.saveChat(this.chatData);
  },

  restoreMessages() {
    const chat = document.getElementById('chat');
    chat.innerHTML = '';
    this.chatData.messages.forEach(m => {
      this.addMessageToDOM(m.role === 'user' ? 'user' : 'bot', m.content);
    });
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

  async send(text) {
    if (this.isSending || !text.trim()) return;
    this.isSending = true;

    this.addMessageToDOM('user', text);
    this.chatData.messages.push({ role: 'user', content: text });
    this.chatData.userMsgCount++;
    Storage.saveChat(this.chatData);
    this.scrollToBottom();

    // === PRE-REGISTER: scripted response ===
    if (this.chatData.state === 'pre_register') {
      const category = Onboarding.classifyResponse(text);
      const reply = Onboarding.RESPONSES[category];

      if (category === 'aggressive') {
        // Don't push — just respond and wait
        await this.typeMessage(reply, 'bot');
      } else {
        await this.typeMessage(reply, 'bot');
        // Transition to post-register (simulate registration)
        // In real app: trigger registration UI here
        this.chatData.state = 'post_register';
        this.chatData.monologueIdx = 0;
        Storage.saveChat(this.chatData);
        await new Promise(r => setTimeout(r, 1500));
        await this.playMonologue();
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

    this.showTyping();

    try {
      const currentProfile = Storage.getProfile();
      const systemPrompt = Assistant.buildSystemPrompt(
        currentProfile,
        this.chatData.userMsgCount,
        this.chatData.questionCount,
        this.chatData.messages,
        this.chatData.state // pass state for bridge detection
      );

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...this.chatData.messages.slice(-12)
      ];

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          max_tokens: 300
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
          await this.typeMessage(reply, 'bot');

          // Bridge counter — after 3 exchanges, move to active
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
