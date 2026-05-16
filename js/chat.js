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
    } else if (state === 'post_register') {
      this.playMonologue();
    }
  },

  async showGreeting() {
    await this.typeMessage(Onboarding.GREETING, 'bot');
    this.chatData.state = 'pre_register';
    Storage.saveChat(this.chatData);
  },

  async playMonologue() {
    const startIdx = this.chatData.monologueIdx || 0;
    for (let i = startIdx; i < Onboarding.MONOLOGUE.length; i++) {
      this.chatData.monologueIdx = i + 1;
      Storage.saveChat(this.chatData);
      await new Promise(r => setTimeout(r, i === 0 ? 500 : 2000));
      await this.typeMessage(Onboarding.MONOLOGUE[i], 'bot');
    }
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

    // === PRE-REGISTER ===
    if (this.chatData.state === 'pre_register') {
      const category = Onboarding.classifyResponse(text);

      if (category === 'aggressive') {
        await this.typeMessage(Onboarding.RESPONSES.aggressive, 'bot');
        this.isSending = false;
        return;
      }

      // LLM response with pre-register prompt
      this.showTyping();
      try {
        const apiMessages = [
          { role: 'system', content: Onboarding.PRE_REGISTER_PROMPT },
          ...this.chatData.messages.slice(-4)
        ];

        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, max_tokens: 200 })
        });

        this.hideTyping();

        if (resp.ok) {
          const data = await resp.json();
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            const reply = Assistant.filterResponse(raw);
            await this.typeMessage(reply, 'bot');
          }
        }
      } catch (err) {
        this.hideTyping();
        console.error('Pre-register LLM error:', err);
      }

      // Transition to post-register
      this.chatData.state = 'post_register';
      this.chatData.monologueIdx = 0;
      Storage.saveChat(this.chatData);
      await new Promise(r => setTimeout(r, 1500));
      await this.playMonologue();

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
        this.chatData.state
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
