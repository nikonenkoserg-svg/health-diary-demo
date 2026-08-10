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
    // Дедуп открытия модалки делает сам Auth (guard по #auth-overlay). Прежний флаг
    // _registrationInProgress ставился в true, а сбрасывался ТОЛЬКО в success-колбэке;
    // при «Отмене» колбэк не звался → флаг залипал true → кнопка умирала до перезагрузки.
    Auth.openRegistration(async (email) => {
      const el = document.getElementById('register-cta');
      if (el) el.remove();
      // Вернувшийся пользователь (тот же email) — тянем бэкап с сервера. Если он есть,
      // Sync.pull() восстановит данные и перезагрузит страницу (сюда не вернёмся).
      try { if (typeof Sync !== 'undefined' && await Sync.pull(true)) { return; } } catch (_) {}
      this.chatData.state = 'registered';
      Storage.saveChat(this.chatData);
      await this.typeMessage(Onboarding.REGISTERED_INTRO, 'bot');
      // Анкета собирается в свободной форме: ждём ответ пациента в чат.
      // Парсер /api/extract раскладывает реплику по полям ProfileStore.
      this.chatData.state = 'awaiting_anketa';
      Storage.saveChat(this.chatData);
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
      if (m.receipt) {
        const div = document.createElement('div');
        div.className = 'message bot receipt';
        div.textContent = m.content;
        chat.appendChild(div);
        return;
      }
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

  // Человекочитаемая квитанция замера: пациент ВИДИТ, что именно записалось в
  // дневник. Гарантия синхрона чат↔график — в дневник идёт ровно то, что показано.
  formatLoadReceipt(e) {
    let qty;
    if (e.kind === 'time') qty = (e.qty >= 1) ? (e.qty + ' мин') : (Math.round(e.qty * 60) + ' сек');
    else if (e.kind === 'steps') qty = e.qty + ' шагов';
    else qty = '×' + e.qty;
    const parts = [e.label +  + qty];
    if (e.kcal != null) parts.push('~' + (e.kcal >= 10 ? Math.round(e.kcal) : e.kcal) + ' ккал');
    return parts.join(' · ');
  },
  addLoadReceipt(e) {
    const chat = document.getElementById('chat');
    const text = this.formatLoadReceipt(e);
    const div = document.createElement('div');
    div.className = 'message bot receipt';
    div.textContent = text;
    const typing = document.getElementById('typing');
    if (typing) chat.insertBefore(div, typing); else chat.appendChild(div);
    this.scrollToBottom();
    this.chatData.messages.push({ role: 'assistant', content: text, receipt: true, ts: Date.now() });
    Storage.saveChat(this.chatData);
  },

  formatGlucoseReceipt(g) {
    const typeMap = { fasting: 'натощак', postprandial: 'после еды', preprandial: 'до еды', bedtime: 'перед сном', random: '' };
    const parts = [g.value.toFixed(1).replace('.', ',') + ' ммоль/л'];
    const tp = typeMap[g.type]; if (tp) parts.push(tp);
    if (g.localMinute != null) {
      const hh = String(Math.floor(g.localMinute / 60)).padStart(2, '0');
      const mm = String(g.localMinute % 60).padStart(2, '0');
      parts.push(hh + ':' + mm);
    } else {
      parts.push('без времени');
    }
    if (g.recalled && g.dateISO) {
      const d = g.dateISO.split('-');
      parts.push('за ' + d[2] + '.' + d[1]);
    }
    return parts.join(' · ');
  },

  // Показать квитанцию мгновенно (без побуквенной печати), под сообщением
  // пациента и ДО ответа Спутника. Персистится, но в контекст модели не идёт.
  addGlucoseReceipt(g) {
    const chat = document.getElementById('chat');
    const text = this.formatGlucoseReceipt(g);
    const div = document.createElement('div');
    div.className = 'message bot receipt';
    div.textContent = text;
    const typing = document.getElementById('typing');
    if (typing) chat.insertBefore(div, typing); else chat.appendChild(div);
    this.scrollToBottom();
    this.chatData.messages.push({ role: 'assistant', content: text, receipt: true, ts: Date.now() });
    Storage.saveChat(this.chatData);
  },

  // Есть ли в тексте кандидат-замер (быстрый детектор, чтобы решить, звать ли LLM-разбор).
  hasGlucoseNumber(text) {
    return typeof Engine !== 'undefined' && Engine.parseGlucose && !!Engine.parseGlucose(text);
  },

  // Собрать запись замера из структурного ответа LLM-экстрактора.
  // Формат совпадает с Engine.parseGlucose — чтобы график/память читали одинаково.
  buildGlucoseFromExtract(gl, srcText) {
    if (!gl || typeof gl.value !== 'number' || gl.value < 2.5 || gl.value > 25) return null;
    const tp = (typeof Time !== 'undefined' && Time.nowParts) ? Time.nowParts() : null;
    const todayISO = tp ? tp.dateISO : new Date().toISOString().slice(0, 10);
    let dayOffset = Math.max(0, parseInt(gl.day_offset) || 0);
    // ЗАЩИТА ОТ ЛОЖНОГО ВЧЕРА: экстрактор бэкдейтит на «отчитываюсь с запозданием» и т.п.
    // day_offset>0 уважаем ТОЛЬКО при явном маркере прошлого дня в тексте пациента.
    // «С запозданием / записываю поздно» — это тот же день, не вчера.
    if (dayOffset > 0 && srcText) {
      const past = /вчера|позавчера|позапрошл|на\s+прошл|\d+\s*дн(я|ей|)\s*назад|в\s+(понедельник|вторник|сред[уа]|четверг|пятниц[уы]|суббот[уы]|воскресень?е)|\d{1,2}\s*(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(srcText);
      if (!past) dayOffset = 0;
    }
    const dateISO = (dayOffset > 0 && Engine._shiftISO) ? Engine._shiftISO(todayISO, -dayOffset) : todayISO;
    const type = ['fasting', 'postprandial', 'preprandial', 'bedtime', 'random'].includes(gl.type) ? gl.type : 'random';
    let localMinute = null, timeCertain = false;
    if (gl.certain && gl.time) {
      const mn = this.hmToMin(gl.time);
      if (mn != null && mn >= 0 && mn < 1440) { localMinute = mn; timeCertain = true; }
    }
    let ts;
    if (timeCertain) {
      const [y, mo, d] = dateISO.split('-').map(Number);
      const dt = new Date(y, mo - 1, d);
      dt.setHours(Math.floor(localMinute / 60), localMinute % 60, 0, 0);
      ts = dt.getTime();
    } else { ts = Date.now(); }
    const recalled = dayOffset > 0;
    const hasContext = type !== 'random';
    let confidence;
    if (recalled) confidence = 'unverified';
    else if (timeCertain && hasContext) confidence = 'full';
    else if (timeCertain || hasContext) confidence = 'partial';
    else confidence = 'unverified';
    return { value: gl.value, type, source: 'manual', time: ts, dateISO, localMinute, timeCertain, confidence, recalled, raw: String(gl.value) };
  },

  addCardLink(cardId, title) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'message bot card-hint';
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'card-link';
    link.textContent = 'Подробнее';
    void title; // тихая дверь: заголовок раскрывается по тапу в оверлее, не кричит в чате
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
    this._lastStreamDiv = div;
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
    // Пузырь и сохранение финализирует вызывающий ПОСЛЕ фильтра (filterResponse),
    // иначе на экран и в историю уходит сырой markdown. Здесь — только сырой текст.
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
      content: text,
      ts: Date.now()
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
  // Ответ ли это на «во сколько был замер?» (а не новый замер). Нужен, чтобы
  // «Время замера 12.10» / «12:10» привязались как ВРЕМЯ, а не создали фантом 12,1.
  _isTimeAnswer(text) {
    const t = (text || '').toLowerCase();
    // Явный сигнал НОВОГО замера — это не ответ про время.
    if (/сахар|глюкоз|ммоль|мг\s*\/\s*дл/.test(t)) return false;
    // Явное указание времени словом.
    if (/врем|во\s*сколько|часов|утра|вечера|\bдня\b|ночи|полдень|полноч/.test(t)) return true;
    // Голый ответ временем: «12:10», «12.10», «в 12.10», «в 12».
    if (/^\s*(в\s+)?\d{1,2}[:.]\d{2}\s*$/.test(t)) return true;
    if (/^\s*в\s+\d{1,2}\s*$/.test(t)) return true;
    return false;
  },

  saveChartData(chartData) {
    this.chatData.messages.push({
      role: 'assistant',
      content: '[график]',
      chartData: chartData,
      ts: Date.now()
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
{"kind":"fact|pattern|recap|plan|hypothetical","wake":"ЧЧ:ММ" или null,"events":[...],"workload":{"active":true|false,"hours":число|null,"kind":"тренировка|спорт|прогулка|бег|велик|...","starts_now":true|false},"glucose":[{"value":число,"type":"fasting|postprandial|preprandial|bedtime|random","time":"ЧЧ:ММ" или null,"certain":true|false,"day_offset":число}]}

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
- Давление, рост, вес — НЕ включай.
- ЗАМЕРЫ САХАРА/ГЛЮКОЗЫ — в поле glucose (НЕ в events). Каждый замер — отдельный элемент. value в ммоль/л (6.1, 5.9). type: натощак=fasting, после еды=postprandial, до еды=preprandial, перед сном=bedtime, иначе random. ВАЖНО: «через N часов / спустя время после еды / после завтрака-обеда-ужина» = postprandial (даже если слов «после еды» нет); random ставь только когда контекст замера действительно неясен. time — ЧЧ:ММ ИМЕННО этого замера: привязывай ко времени, стоящему рядом с этим числом сахара, НЕ ко времени подъёма и НЕ ко времени другого замера; null если время замера не названо. certain=true только при явно названном времени замера. day_offset: 0 сегодня, 1 вчера, 2 позавчера. «С запозданием / отчитываюсь поздно / записываю задним числом» = СЕГОДНЯ (0). offset>0 ставь ТОЛЬКО при явном маркере прошлого дня: «вчера/позавчера/N дней назад/день недели/дата с месяцем». glucose заполняй ВСЕГДА, когда в сообщении есть замер — даже если еды нет и kind не fact.
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
{"kind":"plan","wake":null,"events":[]}

"Проснулся в 01.30. Натощак в 01.45 замер 6,1. После завтрака показал 6,3, это было в 02.00" →
{"kind":"recap","wake":"01:30","events":[],"glucose":[{"value":6.1,"type":"fasting","time":"01:45","certain":true,"day_offset":0},{"value":6.3,"type":"postprandial","time":"02:00","certain":true,"day_offset":0}]}`;

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
      if (!parsed) return null;
      // events может отсутствовать (чисто-замерное сообщение) — нормализуем в [],
      // чтобы не потерять parsed.glucose. Замеры разбираются даже без еды.
      if (!Array.isArray(parsed.events)) parsed.events = [];
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
    this.chatData.messages.push({ role: 'user', content: text, ts: Date.now() });
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
    // bindOnly=true → сообщение это ОТВЕТ ПРО ВРЕМЯ к висящему замеру, а не новый
    // замер. Тогда ниже блок создания замеров пропускаем — иначе «12.10» уйдёт
    // фантомным замером 12,1.
    let bindOnly = false;
    if (typeof Engine !== 'undefined' && Engine.parseGlucose) {
      const g = Engine.parseGlucose(text);

      // Одноразовая привязка времени: если прошлый замер остался без времени и
      // это сообщение — ответ про время — привяжем и закроем.
      const pending = this.chatData.pendingGlucoseTime;
      if (pending && Engine.parseEventTime) {
        const et = Engine.parseEventTime(text);
        const certain = et && et.certain && et.minute >= 0 && et.minute < 1440;
        // «Время замера 12.10» / голое «12:10» = ВРЕМЯ существующего замера, даже
        // если parseGlucose жадно принял «12.10» за 12,1 (слово «замер» включает
        // сахарный префикс). Привязываем время, НЕ создаём фантомный замер.
        if (certain && this._isTimeAnswer(text)) {
          Storage.setGlucoseTime(pending.idx, et.minute, pending.dateISO);
          bindOnly = true;
        } else if (certain && !g) {
          // Время названо без нового значения — обычная привязка.
          Storage.setGlucoseTime(pending.idx, et.minute, pending.dateISO);
        }
        // Вопрос задан один раз — снимаем ожидание.
        this.chatData.pendingGlucoseTime = null;
        this.chatData.pendingGlucoseAsk = false;
      }

      if (g && !bindOnly) {
        // Сохранение замера — ниже, через структурный LLM-разбор (несколько замеров
        // за сообщение + верная привязка времени). Здесь лишь помечаем: речь про замер.
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
        // Поля образа жизни идут в слой patterns (круг жизни), остальное — в anketa.
        const PATTERN_KEYS = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'snacks', training: 'training', sleep: 'sleep', work: 'work_mode' };
        Object.entries(anketa).forEach(([k, v]) => {
          if (v === null || v === undefined || v === '') return;
          const layer = PATTERN_KEYS[k] ? 'patterns' : 'anketa';
          const field = PATTERN_KEYS[k] || k;
          try {
            ProfileStore.set(layer, field, v, 'patient_input', 'confirmed_by_patient');
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
    let extracted = null;

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
      // LLM извлекает события с временем (общий вызов — переиспользуется для замеров ниже)
      extracted = await this.extractDayEvents(text);
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
          // День еды — по поясу-якорю пациента (тот же «сегодня», что у замеров),
          // не по устройству: иначе история еды и график расходятся при смене пояса.
          const _etp = (typeof Time !== 'undefined' && Time.nowParts) ? Time.nowParts() : null;
          const _etISO = _etp ? _etp.dateISO : new Date().toISOString().slice(0, 10);
          const [_ety, _etm, _etd] = _etISO.split('-').map(Number);
          const eatTime = new Date(_ety, _etm - 1, _etd,
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

    // === ЗАМЕРЫ сахара через структурный LLM-разбор ===================
    // Несколько замеров в одном сообщении + верная привязка времени к каждому.
    // Переиспользуем extracted (если еда уже вызвала экстрактор), иначе зовём сами.
    if ((this.chatData.state === 'active' || this.chatData.state === 'bridge') &&
        this.hasGlucoseNumber(text) && !bindOnly) {
      if (!extracted) {
        try { extracted = await this.extractDayEvents(text); } catch (_) { extracted = null; }
      }
      let saved = 0, lastEntry = null, firstNoTime = null;
      const glArr = (extracted && Array.isArray(extracted.glucose)) ? extracted.glucose : [];
      for (const gl of glArr) {
        const g = this.buildGlucoseFromExtract(gl, text);
        if (!g) continue;
        // Мост «сейчас»: экстрактор (Haiku) НЕ считает «сейчас/только что» явным
        // временем и отдаёт замер безвременным, хотя это текущий момент. Если в
        // сообщении ОДИН замер и он без времени — доопределяем детерминированно
        // через parseEventTime (ловит «сейчас», «в 8 утра» и пр.). Так чат и график
        // говорят одно время. Несколько замеров не трогаем — там время у каждого своё.
        if (glArr.length === 1 && !g.timeCertain && Engine.parseEventTime) {
          const et = Engine.parseEventTime(text);
          if (et && et.certain && et.minute >= 0 && et.minute < 1440) {
            g.localMinute = et.minute;
            g.timeCertain = true;
            const [gy, gmo, gd] = g.dateISO.split('-').map(Number);
            const gdt = new Date(gy, gmo - 1, gd);
            gdt.setHours(Math.floor(et.minute / 60), et.minute % 60, 0, 0);
            g.time = gdt.getTime();
            if (!g.recalled) g.confidence = (g.type && g.type !== 'random') ? 'full' : 'partial';
          }
        }
        if (!Storage.addGlucose(g)) continue; // дубль-призрак отброшен — без квитанции
        this.addGlucoseReceipt(g);
        saved++; lastEntry = g;
        // До-привязку времени наводим на ПЕРВЫЙ безвременный замер реплики, а не на
        // последний: в мультизамере последний может быть с временем, а висит первый.
        if (!g.timeCertain && !firstNoTime) firstNoTime = { idx: Storage.getGlucoseLog().length - 1, dateISO: g.dateISO };
      }
      // Фолбэк: LLM не дал замеров, а кандидат есть → регэксп (первый замер).
      if (!saved) {
        const g = Engine.parseGlucose(text);
        if (g && Storage.addGlucose(g)) {
          this.addGlucoseReceipt(g); saved++; lastEntry = g;
          if (!g.timeCertain && !firstNoTime) firstNoTime = { idx: Storage.getGlucoseLog().length - 1, dateISO: g.dateISO };
        }
      }
      // Готовность ПРИВЯЗАТЬ время — у ЛЮБОГО замера без точного времени: пациент
      // может назвать время позже («последний замер был в 02:47»), и оно должно
      // привязаться независимо от типа (натощак/после еды), иначе точка навсегда
      // остаётся безвременной и на ось не встаёт.
      if (firstNoTime) {
        this.chatData.pendingGlucoseTime = { idx: firstNoTime.idx, dateISO: firstNoTime.dateISO };
        // ПЕРЕСПРАШИВАТЬ время — у ЛЮБОГО безвременного замера: точность = ядро,
        // на ось точка встаёт только с точным временем (решение с Тренером 02.08,
        // мягкий вариант: короткий разбор + запрос времени в одной реплике).
        this.chatData.pendingGlucoseAsk = true;
      } else {
        this.chatData.pendingGlucoseTime = null;
        this.chatData.pendingGlucoseAsk = false;
      }
      if (saved) chartData = Engine.getDayData(Storage.getProfile() || {});
    }

    // === НАГРУЗКИ: микро-упражнения, детерминированный разбор =============
    // «присел 20, отжался 15, планка 1 мин» — копим за день, ккал под вес пациента.
    if ((this.chatData.state === 'active' || this.chatData.state === 'bridge') &&
        typeof Loads !== 'undefined' && Loads.parse) {
      const loads = Loads.parse(text);
      if (loads.length) {
        const prof = Storage.getProfile() || {};
        let wKg = parseFloat(prof.weight);
        if (!(wKg > 0) && typeof ProfileStore !== 'undefined') wKg = parseFloat(ProfileStore.get('anketa', 'weight'));
        const tp = (typeof Time !== 'undefined' && Time.nowParts) ? Time.nowParts() : null;
        const dISO = tp ? tp.dateISO : new Date().toISOString().slice(0, 10);
        const lMin = tp ? tp.minuteOfDay : (new Date().getHours() * 60 + new Date().getMinutes());
        for (const ld of loads) {
          const kcal = Loads.kcalFor(ld, wKg > 0 ? wKg : null);
          const entry = { key: ld.key, label: ld.label, cat: ld.cat, kind: ld.kind, qty: ld.qty, unit: ld.unit, kcal, weightUsed: wKg > 0 ? wKg : null, time: Date.now(), localMinute: lMin, dateISO: dISO };
          Storage.addLoad(entry);
          this.addLoadReceipt(entry);
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
        !!this.chatData.pendingGlucoseAsk,
        chartState,
        portraitBlock
      );

      // RAG: ищем релевантную карточку ДО отправки промпта, чтобы Спутник мог
      // опереться на её материал в ответе. Карточку сохраняем для плашки внизу.
      let relevantCard = null;
      try {
        // РЕШЕНИЕ ПО СМЫСЛУ, не по «?»: карточку ищем по содержанию реплики.
        // searchCard сам вернёт null без темы/при низком косинусе — по умолчанию тишина.
        // Отсекаем лишь операционные/мета реплики: они не к библиотеке.
        const trimmed = (text || '').trim();
        const isOperational = /график|таблиц|ссылк|карточк|кто ты|ты кто|какой\s+(сегодня\s+)?день|спасибо|привет|здравств|как дела|где\s+(мой|мои|мо[её])\s*(график|данные|замер)/i.test(trimmed);
        if (!isOperational && typeof window.RAG !== 'undefined' && window.RAG.isReady && window.RAG.isReady()) {
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
              'Под твоим ответом фронт прикрепит тихую плашку «Подробнее» (раскрывает карточку «' + relevantCard.title + '»).\n' +
              'Это произойдёт автоматически — твоя ответственность.\n' +
              'Если пациент спросит про ссылку/карточку — НЕ говори «не отправлял». Признай: «да, приклеил карточку «' + relevantCard.title + '»». Если она не в тему — извинись одной фразой.\n' +
              '[/ПРИКРЕПЛЕНА КАРТОЧКА]';
          }
        }
      } catch (e) { console.warn('[RAG] search failed:', e); }

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...this.chatData.messages.filter(m => !m.chartData && !m.receipt).slice(-30)
      ];

      const _post = () => fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          max_tokens: (typeof Engine !== 'undefined' && Engine._dayEvents && Engine._dayEvents.length > 0) ? 800 : 1500,
          stream: true
        })
      });
      let resp = await _post();

      if (resp.ok && resp.body) {
        // Обновляем график пока модель думает
        if (typeof Chart !== 'undefined' && typeof Engine !== 'undefined') {
          Chart.updatePanel(Engine.getDayData(Storage.getProfile() || {}));
        }

        let raw = await this._streamReply(resp);
        if (!raw) {
          // Пустой поток (обе модели молчат — обычно разовый сбой провайдера).
          // Молча пробуем ещё раз: пациент видит только «печатает…», сбоя не замечает.
          console.warn('[chat] пустой ответ — авто-ретрай');
          await new Promise(r => setTimeout(r, 700));
          try {
            const resp2 = await _post();
            if (resp2.ok && resp2.body) raw = await this._streamReply(resp2);
          } catch (e) { console.error('[chat] retry failed:', e); }
        }
        this.hideTyping();
        if (raw) {
          const longCtx3 = isLongAnswerContext(text, this.chatData);
          const reply = Assistant.filterResponse(raw, text, longCtx3);
          // Финализируем пузырь и историю ОЧИЩЕННЫМ текстом: стрим показывал сырой
          // markdown, а раньше и в историю уходил сырой acc, фильтр работал вхолостую.
          const finalText = (reply && reply.trim()) ? reply : raw;
          if (this._lastStreamDiv) this._lastStreamDiv.textContent = finalText;
          this.chatData.messages.push({ role: 'assistant', content: finalText, ts: Date.now() });
          Storage.saveChat(this.chatData);
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
          console.error('[chat] Empty reply even after retry. Status:', resp.status, 'headers:', Object.fromEntries(resp.headers.entries()));
          this.addMessageToDOM('bot', 'Связь на секунду прервалась. Повтори, пожалуйста — я здесь.');
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.error('[chat] API error:', resp.status, errText);
        this.addMessageToDOM('bot', 'Связь на секунду прервалась. Повтори, пожалуйста — я здесь.');
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
