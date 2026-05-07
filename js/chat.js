// Chat module — send, receive, display, typewriter

const Chat = {
  chatData: null,
  isSending: false,

  init() {
    this.chatData = Storage.getChat();
    this.restoreMessages();

    // If fresh start — show greeting
    if (this.chatData.state === 'init') {
      this.showGreeting();
    }
  },

  async showGreeting() {
    this.chatData.state = 'active';
    Storage.saveChat(this.chatData);
    await this.typeMessage(Assistant.GREETING, 'bot');
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

    // Save to messages
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

    // Show user message
    this.addMessageToDOM('user', text);
    this.chatData.messages.push({ role: 'user', content: text });
    this.chatData.userMsgCount++;
    Storage.saveChat(this.chatData);
    this.scrollToBottom();

    // Try to parse profile from user text
    const profile = Assistant.parseProfile(text);
    if (profile) {
      const existing = Storage.getProfile();
      const merged = { ...existing, ...profile };
      Storage.saveProfile(merged);
    }

    // Show typing
    this.showTyping();

    try {
      const currentProfile = Storage.getProfile();
      const systemPrompt = Assistant.buildSystemPrompt(
        currentProfile,
        this.chatData.userMsgCount,
        this.chatData.questionCount
      );

      // Build messages for API (keep last 20 for context)
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...this.chatData.messages.slice(-20)
      ];

      const models = [
        'anthropic/claude-3.5-haiku',
        'deepseek/deepseek-chat'
      ];

      let reply = null;
      for (const model of models) {
        try {
          const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              temperature: 0.9,
              max_tokens: this.chatData.userMsgCount <= 5 ? 200 : 300
            })
          });

          if (!resp.ok) continue;
          const data = await resp.json();
          const raw = data.choices?.[0]?.message?.content;
          if (raw) {
            reply = Assistant.filterResponse(raw);
            break;
          }
        } catch { continue; }
      }

      this.hideTyping();

      if (reply) {
        // Track questions
        if (reply.includes('?')) this.chatData.questionCount++;
        else this.chatData.questionCount = 0;

        await this.typeMessage(reply, 'bot');
      } else {
        this.addMessageToDOM('bot', 'Не удалось получить ответ. Попробуйте ещё раз.');
      }
    } catch (err) {
      this.hideTyping();
      this.addMessageToDOM('bot', 'Ошибка соединения. Проверьте интернет.');
      console.error('Chat error:', err);
    }

    this.isSending = false;
  }
};
