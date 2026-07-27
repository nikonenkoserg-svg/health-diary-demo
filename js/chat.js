// Chat module — send, receive, display, typewriter

// Маркеры триггеров в сообщении пациента: стресс, тревога, недосып, усталость.
// Когда такой маркер появляется, ответ Спутника НЕ должен быть жёстко обрезан
// на третьем предложении — надо адресовать и факт, и триггер.
const TRIGGER_MARKERS = /(стресс|тревог|не выспал|недосып|устал|из[- ]за работы|паник|нервн|злюсь|переживаю|расстро|грустн|тоск|обид|раздраж)/i;

// Широкие вопросы — содержательно требуют развёрнутого ответа.
const WIDE_QUESTION_MARKERS = /(расскажи (про|о|почему|как)|что такое|что нужно знать|как работает|как устроен|почему именно|объясни)/i;

function isLongAnswerContext(userText, chatData) {
  if (!userText) return false;
  if (TRIGGER_MARKERS.test(userText)) return true;
  if (WIDE_QUESTION_MARKERS.test(userText)) return true;
  // Первое сообщение после анкеты — переход в bridge ещё не случился (bridgeCount=0).
  if (chatData && chatData.state === 'bridge' && !chatData.bridgeCount) return true;
  return false;
}

const Chat = {
  chatData: null,
  isSending: false,

  init() {
    this.chatData = Storage.getChat();

    // Миграция: старое блокирующее состояние прибора упразднено.
    // Зависшие сессии переводим в active, чтобы диалог и парсеры работали.
    if (this.chatData.state === 'parked_no_device') {
      this.chatData.state = 'active';
      Storage.saveChat(this.chatData);
    }

    this.replayDayLog();
    this.restoreMessages();

    const state = this.chatData.state;
    const hasMessages = this.chatData.messages.length > 0;

    if (state === 'init' || (state === 'pre_register' && !hasMessages)) {
      this.showGreeting();
    } else if (state === 'pre_register') {
      this._addRegisterCTA();
    } else if (state === 'registered') {
      // Зарегистрирован, но анкету ещё не заполнил — кнопка «Заполнить анкету».
      this._addAnketaCTA();
    } else if (state === 'awaiting_anketa') {
      // Ждём свободного ответа пациента в чат. Реплика REGISTERED_INTRO уже
      // выведена и восстановлена через restoreMessages. Ничего не делаем.
    } else if (state === 'anketa') {
      this._openAnketaOverlay();
    }
  },

  async showGreeting() {
    await this.typeMessage(Onboarding.GREETING, 'bot');
    this.chatData.state = 'pre_register';
    Storage.saveChat(this.chatData);
    this._addRegisterCTA();
  },

  // CTA «Зарегистрироваться» — единственный путь в auth-модалку при state='pre_register'.
  _addRegisterCTA() {
    const chat = document.getElementById('chat');
    if (!chat || document.getElementById('register-cta')) return;
    const wrap = document.createElement('div');
    wrap.id = 'register-cta';
    wrap.className = 'register-cta';
    const btn = document.createElement('button');
    btn.className = 'register-cta-btn';
    btn.textContent = 'Зарегистрироваться';
    btn.addEventListener('click', () => this._openRegistration());
    wrap.appendChild(btn);
    chat.appendChild(wrap);
    this.scrollToBottom();
  },

  // CTA «Заполнить анкету» — для state='registered' (отменил или перезагрузил).
  _addAnketaCTA() {
    const chat = document.getElementById('chat');
    if (!chat || document.getElementById('register-cta')) return;
    const wrap = document.createElement('div');
    wrap.id = 'register-cta';
    wrap.className = 'register-cta';
    const btn = document.createElement('button');
    btn.className = 'register-cta-btn';
    btn.textContent = 'Заполнить анкету';
    btn.addEventListener('click', () => {
      const el = document.getElementById('register-cta');
      if (el) el.remove();
      this.chatData.state = 'anketa';
      Storage.saveChat(this.chatData);
      this._openAnketaOverlay();
    });
    wrap.appendChild(btn);
    chat.appendChild(wrap);
    this.scrollToBottom();
  },

  async _openRegistration() {
    if (typeof Auth === 'undefined') return;
    if (this._registrationInProgress) return;
    this._registrationInProgress = true;
    Auth.openRegistration(async (email) => {
      try {
        const el = document.getElementById('register-cta');
        if (el) el.remove();
        this.chatData.state = 'registered';
        Storage.saveChat(this.chatData);
        await this.typeMessage(Onboarding.REGISTERED_INTRO, 'bot');
        // Анкета теперь собирается в свободной форме: ждём ответ пациента в чат.
        // Парсер /api/extract раскладывает реплику по полям ProfileStore.
        // Старый путь через ProfileOverlay.openRequired остаётся только как
        // редактор анкеты из меню профиля.
        this.chatData.state = 'awaiting_anketa';
        Storage.saveChat(this.chatData);
      } finally {
        this._registrationInProgress = false;
      }
    });
  },

  // Открыть модальный оверлей анкеты.
  // onSaved → state=active, реплика ENTRY.
  // onCancel → возврат в pre_register с приветствием и кнопкой.
  _openAnketaOverlay() {
    if (typeof ProfileOverlay === 'undefined') return;
    ProfileOverlay.openRequired(
      () => this._onAnketaSaved(),
      () => this._onAnketaCancelled()
    );
  },

  _onAnketaCancelled() {
    // После отмены — пациент остаётся зарегистрированным, но без анкеты.
    // В чате появляется CTA «Заполнить анкету».
    const registered = (typeof Auth !== 'undefined') && Auth.isRegistered();
    this.chatData.state = registered ? 'registered' : 'pre_register';
    Storage.saveChat(this.chatData);
    if (registered) this._addAnketaCTA(); else this._addRegisterCTA();
  },

  async _onAnketaSaved() {
    this.chatData.state = 'active';
    Storage.saveChat(this.chatData);
    await this.typeMessage(Onboarding.ENTRY, 'bot');
  },

  restoreMessages() {
    const chat = document.getElementById('chat');
    chat.innerHTML = '';
    this.chatData.messages.forEach(m => {
      if (m.chartData) return; // графики теперь в панели
      this.addMessageToDOM(m.role === 'user' ? 'user' : 'bot', m.content);
    });
    // Панель графика: из движка (если события дня восстановлены) либо из сохранённого
    if (typeof Chart !== 'undefined' && typeof Engine !== 'undefined') {
      Chart.updatePanel(Engine.getDayData(Storage.getProfile() || {}));
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

  addCardLink(cardId, title) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'message bot card-hint';
    const intro = document.createElement('span');
    intro.textContent = 'Глубже: ';
    div.appendChild(intro);
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'card-link';
    link.textContent = title;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      this.openCardOverlay(cardId);
    });
    div.appendChild(link);
    chat.appendChild(div);
    this.scrollToBottom();
  },

  openCardOverlay(cardId) {
    const card = window.RAG && window.RAG.getCardById ? window.RAG.getCardById(cardId) : null;
    if (!card) return;
    // Удаляем предыдущий оверлей если есть
    const old = document.getElementById('card-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'card-overlay';
    overlay.className = 'card-overlay';
    overlay.innerHTML =
      '<div class="card-modal">' +
      '  <div class="card-header">' +
      '    <button class="card-close" aria-label="Закрыть">✕</button>' +
      '  </div>' +
      '  <div class="card-body">' +
      '    <h2 class="card-title"></h2>' +
      '    <div class="card-text"></div>' +
      '  </div>' +
      '</div>';
    overlay.querySelector('.card-title').textContent = card.title || '';
    const body = overlay.querySelector('.card-text');
    const paras = (card.text || '').split(/\n\n+/);
    for (const p of paras) {
      const el = document.createElement('p');
      el.textContent = p.trim();
      body.appendChild(el);
    }
    overlay.querySelector('.card-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  },

  // Backward compatibility — старый код может звать addArticleLink
  addArticleLink(urlOrId, title) { this.addCardLink(urlOrId, title); },

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
        // Если стрим ещё не завершён — печатаем только до последней границы слова
        // (пробел/перевод строки/знак препинания). Иначе слово может оборваться
        // на середине, пока ждём следующий чанк от модели.
        let printableLen;
        if (streamDone) {
          printableLen = pending.length;
        } else {
          let boundary = -1;
          for (let i = pending.length - 1; i >= 0; i--) {
            const c = pending.charCodeAt(i);
            // пробел, перевод строки, типичные разделители
            if (c === 32 || c === 10 || c === 9 || c === 44 || c === 46 || c === 33 || c === 63 || c === 58 || c === 59 || c === 8212 || c === 8211) { boundary = i; break; }
          }
          printableLen = boundary >= 0 ? boundary + 1 : 0;
        }
        if (printableLen === 0) {
          await new Promise(r => setTimeout(r, 20));
          continue;
        }
        // Адаптивная задержка по 1 символу: плавная скорость без скачков.
        // Буфер большой — печатаем чаще, маленький — спокойно.
        let delay;
        if (printableLen > 150) delay = 8;
        else if (printableLen > 80) delay = 14;
        else if (printableLen > 30) delay = 20;
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
    if (parseError || !acc) {
      console.error('[chat] _streamReply empty: parseError=' + parseError + ', acc.length=' + acc.length + ', buffer.length=' + buffer.length);
      return null;
    }
    this.chatData.messages.push({ role: 'assistant', content: acc });
    Storage.saveChat(this.chatData);
    return acc;
  },

  async typeMessage(text, role) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    chat.appendChild(div);

    // Печатаем не побуквенно, а кадрами: за один шаг рисуем 1-3 символа
    // и спим один раз. Иначе на iPad Safari Service Worker и paint забивают
    // main thread, цикл встаёт на ~2-3 секунды посреди слова.
    let i = 0;
    while (i <= text.length) {
      const remaining = text.length - i;
      let step, delay;
      if (remaining > 200) { step = 3; delay = 24; }
      else if (remaining > 100) { step = 2; delay = 24; }
      else if (remaining > 40)  { step = 1; delay = 22; }
      else                       { step = 1; delay = 28; }
      i = Math.min(i + step, text.length);
      div.textContent = text.slice(0, i);
      // scrollToBottom только периодически, не на каждый символ
      if (i % 12 === 0 || i === text.length) this.scrollToBottom();
      if (i >= text.length) break;
      await new Promise(r => setTimeout(r, delay));
    }
    this.scrollToBottom();

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
      if (el) el._baseText = s.text;
    }, s.at));
    // Секундомер — для теста видно точное время ожидания.
    div._baseText = 'Слышу.';
    const startedAt = Date.now();
    this._typingInterval = setInterval(() => {
      const el = document.getElementById('typing');
      if (!el) return;
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      el.textContent = (el._baseText || 'Слышу.') + ' (' + sec + 'с)';
    }, 200);
  },

  hideTyping() {
    if (this._typingTimers) {
      this._typingTimers.forEach(t => clearTimeout(t));
      this._typingTimers = null;
    }
    if (this._typingInterval) {
      clearInterval(this._typingInterval);
      this._typingInterval = null;
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

  // Нормализация записей времени в свободном тексте: «В 12. 30.», «В 12.30.», «В 04.» → «в 12:30», «в 04:00».
  // \b не работает для кириллической «в» — используем lookbehind по пробелам/пунктуации.
  normalizeTimeNotation(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/(?<=^|[\s.,;!?])в\s*(\d{1,2})\.\s*(\d{2})(?!\d)/gi, 'в $1:$2')
      .replace(/(?<=^|[\s.,;!?])в\s*(\d{1,2})\.(?!\d)/gi, 'в $1:00');
  },

  // Возвращает максимальную «в HH:MM» из текста как минута дня, или -1.
  latestExplicitMinute(text) {
    const norm = this.normalizeTimeNotation(text);
    const re = /(?<=^|[\s.,;!?])в\s*(\d{1,2}):(\d{2})/gi;
    let latest = -1;
    let m;
    while ((m = re.exec(norm)) !== null) {
      const h = parseInt(m[1]);
      const mm = parseInt(m[2]);
      if (h > 23 || mm > 59) continue;
      const t = h * 60 + mm;
      if (t > latest) latest = t;
    }
    return latest;
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
    // Нормализация записей времени: «В 12. 30.», «В 04.» → «в 12:30», «в 04:00».
    text = this.normalizeTimeNotation(text);
    const tp = (typeof Time !== 'undefined' ? Time.nowParts() : { hour: new Date().getHours(), minute: new Date().getMinutes(), tz: 'UTC' });
    const hhmm = tp.hour + ':' + tp.minute.toString().padStart(2, '0');

    let sys = `Ты извлекаешь приёмы пищи и напитков из сообщения пользователя.
Текущее время: ${hhmm} (${tp.tz}).`;
    if (this.chatData.dayLog && this.chatData.dayLog.wake != null) {
      sys += `\nВремя подъёма сегодня: ${this.minToHM(this.chatData.dayLog.wake)}.`;
    }
    sys += `

Верни ТОЛЬКО валидный JSON, без markdown и пояснений:
{"kind":"fact|pattern|recap|plan|hypothetical","wake":"ЧЧ:ММ" или null,"events":[...],"workload":{"active":true|false,"hours":число|null,"kind":"тренировка|спорт|прогулка|бег|велик|...","starts_now":true|false}}

КРИТИЧНО — классификация реплики (поле kind):
- "fact" — пациент описывает РЕАЛЬНОЕ событие еды только что или недавно. Маркеры: "съел", "выпил", "поел", "час назад", "сейчас", "только что", "30 минут назад", упоминание текущего приёма с прошедшим временем. ТОЛЬКО эти случаи строят график.
- "pattern" — пациент рассказывает ТИПИЧНЫЙ режим / распорядок питания, не конкретное событие. Маркеры: перечисление приёмов дня подряд ("утром... в процессе тренировки... после тренировки..."), "обычно", "по расписанию", "стараюсь", "ем каждый день", в анкетной перечислительной форме без явного "только что съел". График НЕ строим.
- "recap" — пациент пересказывает УЖЕ ПРОШЕДШИЙ день (часто заканчивается фразой "сейчас занимаюсь делами", "сейчас работаю", "сейчас отдыхаю", "уже всё нормально"). Признаки: 3+ приёма еды подряд с относительными временами ("через час", "на третьем часу тренировки", "через полтора часа после", "потом", "после этого"), отсутствует свежее событие в конце. График НЕ строим. Это разговор о прошедшем, а не текущее событие.
- "plan" — пациент описывает БУДУЩЕЕ намерение. Маркеры: "буду есть", "собираюсь", "планирую съесть", "через час съем". График НЕ строим.
- "hypothetical" — пациент задаёт условный/гипотетический вопрос. Маркеры: "а если я съем", "а если я съел", "что если съесть", "допустим я съел", "представь я выпил", "а что будет если", "а сколько будет если". Это сослагательное наклонение / условие, не реальная еда. График НЕ строим.

Если есть сомнения между fact и pattern/recap/hypothetical — выбирай НЕ fact (безопаснее не построить фантомный график, чем построить).
Свежее событие = ОДИН приём пищи + маркер настоящего времени ("только что", "сейчас съел", "20 минут назад") + НЕТ условных слов ("если", "допустим", "представь"). Длинный пересказ дня — НЕ fact, даже если внутри есть слово "съел". Условный вопрос — НЕ fact.

КРИТИЧНО — поле workload (намерение физической нагрузки):
- "active":true если пациент сообщает что НАЧИНАЕТ или сейчас занимается длительной нагрузкой (≥ 30 минут): тренировка, спорт, поход в зал, велик, бег, длинная прогулка, плавание, йога.
- "hours": длительность в часах, если указана ("шесть часов тренировки" → 6, "час бега" → 1, "сейчас тренируюсь" без длительности → null).
- "kind": тип нагрузки ("тренировка", "бег", "велик", "плавание", "прогулка" и т.п.).
- "starts_now":true если "начинаю", "сейчас", "иду", "побежал". false если в прошлом ("вчера тренировался") или далёкое будущее ("завтра в зал").
- Если нагрузка короткая (<30 мин) или нет упоминания — workload:{"active":false}.

Пример: "Позавтракал йогуртом и кофе. Сейчас начинаю шестичасовую тренировку." →
events с едой + workload:{"active":true,"hours":6,"kind":"тренировка","starts_now":true}

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
- Нет еды в сообщении → {"kind":"fact","wake":null,"events":[]}
- Если pattern или plan — events можно вернуть для информации, но граф НЕ построится

Примеры:
"Я съел 150 грамм торта и выпил чашку кофе" →
{"wake":null,"events":[{"time":"<текущее>","certain":false,"items":[{"product":"торт","portion_g":150,"confidence":"high"},{"product":"кофе","portion_g":200,"confidence":"medium"}]}]}

"Утром сахар 5.5, час назад съел 200 грамм овсяной каши с мёдом, сейчас 9" →
{"kind":"fact","wake":null,"events":[{"time":"<час назад>","certain":true,"items":[{"product":"овсяная каша","portion_g":200,"confidence":"high"},{"product":"мёд","portion_g":15,"confidence":"low"}]}]}

"Мне 53 года, рост 183, вес 77. Утром йогурт, печенье, кофе. В процессе тренировки перекус творогом или яйцом. После тренировки мясо, овощи, фрукты" →
{"kind":"pattern","wake":null,"events":[]}
(это анкета о типичном режиме питания, не разовое событие — график НЕ строим)

"Через час планирую съесть овсянку с бананом" →
{"kind":"plan","wake":null,"events":[]}`;

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: text }
          ],
          max_tokens: 2000
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
    // Счётчик для триггера обновления долгосрочной памяти
    try {
      if (typeof PatientMemory !== 'undefined' && this.chatData.state === 'active') PatientMemory.incrementCounter();
    } catch (_) {}
    Storage.saveChat(this.chatData);
    this.scrollToBottom();
    // Индикатор «думаю» — сразу при отправке, не после всех парсеров
    this.showTyping();

    // Парсер замеров глюкозы: тихо сохраняет в Storage.
    // pureGlucose=true когда сообщение явно про замер ("сахар сейчас 5,5",
    // "глюкоза 6,2 натощак") и не содержит глагола приёма пищи. В этом случае
    // food extractor пропускается — иначе слово "сахар" попадает в график еды.
    let pureGlucose = false;
    if (typeof Engine !== 'undefined' && Engine.parseGlucose) {
      const g = Engine.parseGlucose(text);

      // Одноразовая привязка времени: если прошлый замер остался без времени и
      // это сообщение — ответ про время (без нового значения) — привяжем и закроем.
      const pending = this.chatData.pendingGlucoseTime;
      if (pending && Engine.parseEventTime) {
        if (!g) {
          const et = Engine.parseEventTime(text);
          if (et && et.certain && et.minute >= 0 && et.minute < 1440) {
            Storage.setGlucoseTime(pending.idx, et.minute, pending.dateISO);
          }
        }
        // В любом случае вопрос задан один раз — снимаем ожидание.
        this.chatData.pendingGlucoseTime = null;
      }

      if (g) {
        Storage.addGlucose(g);
        // Уточняем время ТОЛЬКО у замера без времени И без контекста (голая цифра).
        // «Натощак / перед сном / до / после еды» уже несут временное окно — спрашивать
        // точную минуту у них = выдуманная просьба (Спутник сочинял вопрос на пустом месте).
        const hasCtx = g.type && g.type !== 'random';
        if (!g.timeCertain && !hasCtx) {
          this.chatData.pendingGlucoseTime = { idx: Storage.getGlucoseLog().length - 1, dateISO: g.dateISO };
        } else {
          this.chatData.pendingGlucoseTime = null;
        }
        const t = text.toLowerCase();
        const foodIntent = /(съел|съела|поел|поела|ел\s|ела\s|выпил|выпила|пил\s|пила\s|перекус|завтрак|обед|ужин|кушал|кушала|покушал|покушала|позавтракал|позавтракала|пообедал|пообедала|поужинал|поужинала)/i.test(t);
        pureGlucose = !foodIntent;
      }
    }

    // === PRE-REGISTER: до регистрации Спутник в диалог не вступает.
    // Согласие → две реплики и сразу открываем модальную анкету.
    // Агрессия → одна короткая фраза.
    // Всё остальное → одна заглушка PRE_REGISTER_HOLD.
    if (this.chatData.state === 'pre_register') {
      // До регистрации Спутник в диалог не вступает: вход только через кнопку
      // «Создать профиль». Распознавание согласия по тексту убрано — оно было
      // хрупким (любое «готово/давай» запирало пациента в оверлее).
      this.hideTyping();
      const category = Onboarding.classifyResponse(text);
      if (category === 'aggressive') {
        await this.typeMessage(Onboarding.RESPONSES.aggressive, 'bot');
      } else {
        await this.typeMessage(Onboarding.PRE_REGISTER_HOLD, 'bot');
      }
      // Кнопка могла исчезнуть после перерисовки — восстанавливаем.
      this._addRegisterCTA();
      this.isSending = false;
      return;
    }

    // === AWAITING_ANKETA: первичный сбор профиля свободным сообщением.
    // Парсим через /api/extract, кладём непустые поля в ProfileStore.
    // Если минимум (sex, age, height, weight, diagnosis) собран → state=active + ENTRY.
    // Если чего-то не хватает → одна короткая реплика с конкретным списком, остаёмся в awaiting_anketa.
    if (this.chatData.state === 'awaiting_anketa') {
      let anketa = {};
      try {
        const resp = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (resp.ok) {
          const data = await resp.json();
          anketa = data.anketa || {};
        }
      } catch (err) {
        console.warn('[awaiting_anketa extract]', err);
      }

      if (typeof ProfileStore !== 'undefined') {
        Object.entries(anketa).forEach(([k, v]) => {
          if (v === null || v === undefined || v === '') return;
          try {
            ProfileStore.set('anketa', k, v, 'patient_input', 'confirmed_by_patient');
          } catch (_) {}
        });
      }

      // Fallback для имени: если извлечь не удалось, а пациент прислал короткую
      // реплику (одно-два слова, без цифр) — берём её как имя-обращение.
      // Отбрасываем частицы "можно", "называть", "меня", "зови", "просто".
      if (typeof ProfileStore !== 'undefined' && !ProfileStore.get('anketa', 'name')) {
        const cleaned = text
          .replace(/[.,!?;:()"«»]/g, ' ')
          .split(/\s+/)
          .filter(w => w && !/^(можно|называть|называй|зови|меня|просто|я|это|мне|мой|моя|звать|обращаться|обращайся)$/i.test(w));
        if (cleaned.length > 0 && cleaned.length <= 3 && !/\d/.test(cleaned.join(''))) {
          const guess = cleaned[0].replace(/(ом|ем|ой|ей|у|ю|а|я)$/i, '').trim();
          if (guess.length >= 2) {
            try { ProfileStore.set('anketa', 'name', guess, 'patient_input_fallback', 'confirmed_by_patient'); } catch(_) {}
          }
        }
      }

      // Первое сообщение разобрано и разложено по полям. Дальше — всегда живой
      // диалог, никаких блокирующих состояний. Чего не хватает в профиле
      // (имя, прибор, диагноз) — Спутник добирает в разговоре, читая контекст.
      // Прибор как порог входа теперь поведение Спутника (промпт), не хардкод-ветка.
      // Модель пациента: пассивно вычитываем характер из анкетного сообщения
      // (жёсткий режим/аномалия/мотив) — до первого живого диалога.
      try { if (typeof PatientModel !== 'undefined') PatientModel.observe(text); } catch (_) {}

      this.hideTyping();
      this.chatData.state = 'active';
      Storage.saveChat(this.chatData);
      await this.typeMessage(Onboarding.ENTRY, 'bot');
      this.isSending = false;
      return;
    }

    // === NORMAL FLOW (active) ===
    const profile = Assistant.parseProfile(text);
    if (profile) {
      const existing = Storage.getProfile();
      Storage.saveProfile({ ...existing, ...profile });
    }

    // --- ГРАФИК: извлекаем события питания ---
    let chartData = null;
    let timeUncertain = false;
    let leverHint = null;
    let recapEvents = null;

    // Уточнение существующего event (граммы/время в отдельной реплике без еды)
    if (typeof Engine !== 'undefined' && Engine.updateLastEventFromContext &&
        (this.chatData.state === 'active' || this.chatData.state === 'bridge') &&
        !pureGlucose &&
        !this.looksLikeFood(text) && Engine._dayEvents.length > 0) {
      const profile = Storage.getProfile() || {};
      if (Engine.updateLastEventFromContext(text, profile)) {
        chartData = Engine.getDayData(profile);
      }
    }

    if (typeof Engine !== 'undefined' &&
        (this.chatData.state === 'active' || this.chatData.state === 'bridge') &&
        !pureGlucose &&
        this.looksLikeFood(text)) {
      const foodProfile = Storage.getProfile() || {};
      // LLM извлекает события с временем
      const extracted = await this.extractDayEvents(text);
      // Намерение физической нагрузки — ставим только для kind=fact (свежее событие).
      // Для recap/pattern LLM может ошибочно поставить starts_now=true для тренировки
      // из утра — это создаст ложный «активная тренировка прямо сейчас» в Engine.
      if (extracted && extracted.workload && extracted.workload.active &&
          extracted.workload.starts_now && extracted.kind === 'fact' &&
          typeof Engine.setActiveWorkload === 'function') {
        Engine.setActiveWorkload(extracted.workload);
      }

      // Детерминированная страховка от нестабильной LLM-классификации.
      // Считаем самое позднее «в HH:MM» в тексте; если оно в окне [-10, +60] минут
      // от текущего времени пациента — есть свежий приём. Override kind на fact,
      // независимо от того, что вернула LLM (recap/pattern/null).
      const nowMinFresh = (typeof Time !== 'undefined' && Time.nowParts) ? Time.nowParts().minuteOfDay : null;
      const latestTxtMin = this.latestExplicitMinute(text);
      const hasFreshTime = nowMinFresh != null && latestTxtMin >= 0
        && (nowMinFresh - latestTxtMin) >= -10
        && (nowMinFresh - latestTxtMin) <= 60;

      const dbg = {
        ts: new Date().toISOString(),
        kind: extracted && extracted.kind,
        events: extracted && extracted.events ? extracted.events.length : 0,
        latestTxtMin, nowMinFresh, hasFreshTime,
        text: text.slice(0, 200)
      };
      console.log('[chat] extract:', dbg);
      try {
        const log = JSON.parse(localStorage.getItem('hd_debug_log') || '[]');
        log.push(dbg);
        if (log.length > 20) log.shift();
        localStorage.setItem('hd_debug_log', JSON.stringify(log));
      } catch (_) {}

      if (hasFreshTime && extracted && extracted.events && extracted.events.length > 0) {
        if (extracted.kind !== 'fact') {
          console.log('[chat] override kind ->', 'fact', '(was', extracted.kind + ')');
          extracted.kind = 'fact';
        }
      }

      // Если pattern/plan/recap — еда не строит график. Сохраняем профильный паттерн отдельно.
      if (extracted && extracted.kind && extracted.kind !== 'fact') {
        if (extracted.kind === 'pattern') {
          const prof = Storage.getProfile() || {};
          prof.mealPattern = text.slice(0, 500);
          Storage.saveProfile(prof);
        }
        // Recap → собираем список приёмов для блока [ПЕРЕСКАЗ ДНЯ] в промпте.
        // Это пересказ дня, без графика, но с развёрнутым разбором по приёмам.
        if (extracted.kind === 'recap' && extracted.events && extracted.events.length > 0) {
          recapEvents = extracted.events.map(ev => ({
            time: ev.time,
            foods: ev.items && Array.isArray(ev.items)
              ? ev.items.map(i => i.product + (i.portion_g ? ' ' + i.portion_g + 'г' : '')).join(', ')
              : (ev.foods || '')
          }));
        }
      } else if (extracted && extracted.events.length > 0) {
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
          // Override: явные временные маркеры в сообщении пациента отменяют флаг.
          // "прямо сейчас", "только что", "сейчас", "минуту назад", "N мин/часов назад", "в HH:MM"
          if (timeUncertain && /(прямо сейчас|только что|сейчас (съ|поел|поп|выпил)|минуту назад|\d+\s*мин(уту?|ут)?\s*назад|\d+\s*ча?со?в?\s*назад|в \d{1,2}[:.\s]\d{2})/i.test(text)) {
            timeUncertain = false;
          }
        }
        chartData = Engine.getDayData(foodProfile);
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
      if (typeof Engine !== 'undefined' && Engine._dayEvents && Engine._dayEvents.length > 0) {
        const lastEv = Engine._dayEvents[Engine._dayEvents.length - 1];
        if (lastEv && lastEv.foods) {
          unspecifiedFoods = lastEv.foods.filter(f => f.defaultPortion === true).map(f => f.name);
        }
      }

      // Реальное состояние графика на СЕЙЧАС (то, что рисует панель) — в промпт.
      // Независимо от текущего сообщения: пациент может спросить «где график» без нового замера.
      let chartState = null;
      try {
        if (typeof Engine !== 'undefined' && Engine.getDayData) {
          const dd = Engine.getDayData(currentProfile || {});
          const fmt = (min) => (typeof Time !== 'undefined' && Time.fmtMinute) ? Time.fmtMinute(min)
            : (Math.floor(min/60) + ':' + String(min%60).padStart(2,'0'));
          chartState = {
            timed: (dd.measurements || []).map(m => ({ t: fmt(m.minute), v: m.value, type: m.type })),
            untimed: (dd.untimed || []).map(u => ({ v: u.value, type: u.type }))
          };
        }
      } catch (_) {}

      // Модель пациента: дочитываем характер из этой реплики и строим блок [ПОРТРЕТ].
      let portraitBlock = '';
      try {
        if (typeof PatientModel !== 'undefined') {
          PatientModel.observe(text);
          portraitBlock = PatientModel.inject(text);
        }
      } catch (_) {}

      let systemPrompt = await Assistant.buildSystemPrompt(
        currentProfile,
        this.chatData.userMsgCount,
        this.chatData.questionCount,
        this.chatData.messages,
        this.chatData.state,
        !!chartData,
        timeUncertain,
        leverHint,
        unspecifiedFoods,
        recapEvents,
        !!this.chatData.pendingGlucoseTime,
        chartState,
        portraitBlock
      );

      // RAG: ищем релевантную карточку ДО отправки промпта, чтобы Спутник мог
      // опереться на её материал в ответе. Карточку сохраняем для плашки внизу.
      let relevantCard = null;
      try {
        // Жёсткий детектор вопроса: либо «?» в реплике, либо вопросительное слово
        // в самом начале первой фразы. «Когда до этого дойду» в середине не считается.
        const trimmed = (text || '').trim();
        const firstSentence = trimmed.split(/[.!?]/)[0] || '';
        const startsWithQ = /^\s*(что|как|почему|зачем|когда|где|какой|какая|какое|какие|нужно ли|можно ли|стоит ли|правда ли|поможет ли|есть ли|правда|почему именно)\b/i.test(firstSentence);
        const isQuestion = trimmed.includes('?') || startsWithQ;
        if (isQuestion && typeof window.RAG !== 'undefined' && window.RAG.isReady && window.RAG.isReady()) {
          // Определяем фазу пациента для фильтрации RAG. Onboarding:
          // первые 15 сообщений ИЛИ менее 3 событий еды в dayLog. Иначе stable.
          const userMsgCount = this.chatData.messages.filter(m => m.role === 'user').length;
          const eventsCount = (this.chatData.dayLog && this.chatData.dayLog.events) ? this.chatData.dayLog.events.length : 0;
          const phase = (userMsgCount < 15 || eventsCount < 3) ? 'onboarding' : 'stable';
          relevantCard = await window.RAG.searchCard(text, null, { sex: (Storage.getProfile() || {}).sex, phase });
          // Дедуп + троттлинг плашки библиотеки: одну и ту же карточку не повторять,
          // и не давать плашку чаще раза в 3 сообщения — иначе Спутник повторяет материал подряд.
          const _shownCards = this.chatData.shownCards || [];
          const _lastCardAt = (this.chatData.lastCardAt == null) ? -99 : this.chatData.lastCardAt;
          if (relevantCard && (_shownCards.includes(relevantCard.id) || (this.chatData.userMsgCount - _lastCardAt) < 3)) {
            relevantCard = null;
          }
          if (relevantCard && window.RAG.formatCardForPrompt) {
            systemPrompt += window.RAG.formatCardForPrompt(relevantCard);
            // Спутник должен ЗНАТЬ что к его ответу будет приклеена плашка с карточкой.
            // Без этого блока он отрицает что отправил «ссылку», когда пациент спрашивает.
            systemPrompt += '\n\n[ПРИКРЕПЛЕНА КАРТОЧКА]\n' +
              'Под твоим ответом фронт прикрепит плашку «Глубже: «' + relevantCard.title + '»».\n' +
              'Это произойдёт автоматически — твоя ответственность.\n' +
              'Если пациент спросит про ссылку/карточку — НЕ говори «не отправлял». Признай: «да, приклеил карточку «' + relevantCard.title + '»». Если она не в тему — извинись одной фразой.\n' +
              '[/ПРИКРЕПЛЕНА КАРТОЧКА]';
          }
        }
      } catch (e) { console.warn('[RAG] search failed:', e); }

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...this.chatData.messages.filter(m => !m.chartData).slice(-12)
      ];

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          max_tokens: (typeof Engine !== 'undefined' && Engine._dayEvents && Engine._dayEvents.length > 0) ? 800 : 1500,
          stream: true
        })
      });

      if (resp.ok && resp.body) {
        // Обновляем график пока модель думает
        if (typeof Chart !== 'undefined' && typeof Engine !== 'undefined') {
          Chart.updatePanel(Engine.getDayData(Storage.getProfile() || {}));
        }

        const raw = await this._streamReply(resp);
        this.hideTyping();
        if (raw) {
          const longCtx3 = isLongAnswerContext(text, this.chatData);
          const reply = Assistant.filterResponse(raw, text, longCtx3);
          if (reply.includes('?')) this.chatData.questionCount++;
          else this.chatData.questionCount = 0;

          // Плашка «Глубже:» — используем карточку, найденную ДО запроса.
          if (relevantCard) {
            try {
              this.addCardLink(relevantCard.id, '«' + relevantCard.title + '»');
              (this.chatData.shownCards = this.chatData.shownCards || []).push(relevantCard.id);
              this.chatData.lastCardAt = this.chatData.userMsgCount;
              Storage.saveChat(this.chatData);
            } catch (e) { console.warn('[RAG] card link failed:', e); }
          }

          if (this.chatData.state === 'bridge') {
            this.chatData.bridgeCount = (this.chatData.bridgeCount || 0) + 1;
            if (this.chatData.bridgeCount >= 3) {
              this.chatData.state = 'active';
            }
            Storage.saveChat(this.chatData);
          }
        } else {
          console.error('[chat] Empty reply from API. Status:', resp.status, 'headers:', Object.fromEntries(resp.headers.entries()));
          this.addMessageToDOM('bot', 'Пустой ответ (status ' + resp.status + '). Попробуйте ещё раз.');
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.error('[chat] API error:', resp.status, errText);
        this.addMessageToDOM('bot', 'Ошибка ' + resp.status + '. Попробуйте ещё раз.');
      }
    } catch (err) {
      this.hideTyping();
      this.addMessageToDOM('bot', 'Ошибка соединения. Проверьте интернет.');
      console.error('Chat error:', err);
    }

    // Долгосрочная память — обновляем после 5 user-сообщений ИЛИ день-end фразы.
    // Fire-and-forget, не блокирует следующее сообщение.
    try {
      if (typeof PatientMemory !== 'undefined' && this.chatData.state === 'active') {
        const trig = PatientMemory.shouldTrigger(text, 5);
        if (trig.trigger) {
          console.log('[memory] trigger:', trig.reason);
          PatientMemory.update(this.chatData.messages).catch(e => console.warn('[memory]', e));
        }
      }
    } catch (_) {}

    this.isSending = false;
  }
};
