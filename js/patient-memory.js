// PatientMemory — долгосрочная модель пациента в localStorage.
// Структура: { patterns, reactions, lifestyle, notes:[] }.
// Обновляется LLM-секретарём после 5 user-сообщений ИЛИ день-end фразы.
const PatientMemory = {
  STORAGE_KEY: 'hd_patient_model',
  COUNTER_KEY: 'hd_patient_memory_counter',

  get() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    } catch (_) { return {}; }
  },

  save(model) {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(model)); } catch (_) {}
  },

  clear() {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.COUNTER_KEY);
  },

  isEmpty() {
    const m = this.get();
    if (!m || Object.keys(m).length === 0) return true;
    const has = (k) => m[k] && (Array.isArray(m[k]) ? m[k].length > 0 : Object.keys(m[k]).length > 0);
    return !(has('patterns') || has('reactions') || has('lifestyle') || has('notes'));
  },

  format() {
    if (this.isEmpty()) return null;
    const m = this.get();
    let out = '[ПАМЯТЬ О ПАЦИЕНТЕ]\n';
    if (m.patterns && Object.keys(m.patterns).length) {
      out += 'Паттерны:\n';
      for (const [, v] of Object.entries(m.patterns)) { const t = typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v)); if (t) out += '- ' + t + '\n'; }
    }
    if (m.reactions && Object.keys(m.reactions).length) {
      out += 'Реакции:\n';
      for (const [, v] of Object.entries(m.reactions)) { const t = typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v)); if (t) out += '- ' + t + '\n'; }
    }
    if (m.lifestyle && Object.keys(m.lifestyle).length) {
      out += 'Образ жизни:\n';
      for (const [, v] of Object.entries(m.lifestyle)) { const t = typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v)); if (t) out += '- ' + t + '\n'; }
    }
    if (m.notes && m.notes.length) {
      out += 'Заметки:\n';
      for (const n of m.notes) { const t = typeof n === 'string' ? n : (n == null ? '' : JSON.stringify(n)); if (t) out += '- ' + t + '\n'; }
    }
    out += '[/ПАМЯТЬ О ПАЦИЕНТЕ]\n';
    out += 'Опирайся на эту память. Если новая реплика противоречит — приоритет новой реплике, память отстаёт.';
    return out;
  },

  incrementCounter() {
    const n = parseInt(localStorage.getItem(this.COUNTER_KEY) || '0', 10) + 1;
    localStorage.setItem(this.COUNTER_KEY, String(n));
    return n;
  },
  resetCounter() { localStorage.setItem(this.COUNTER_KEY, '0'); },
  getCounter() { return parseInt(localStorage.getItem(this.COUNTER_KEY) || '0', 10); },

  DAY_END_PATTERNS: [
    /всё на сегодня/i, /все на сегодня/i,
    /закончил( на сегодня)?/i,
    /спокойной ночи/i,
    /иду спать/i, /пошёл спать/i, /пошел спать/i,
    /отбой/i
  ],

  isDayEndPhrase(text) {
    if (!text) return false;
    return this.DAY_END_PATTERNS.some(rx => rx.test(text));
  },

  shouldTrigger(userText, threshold) {
    if (this.isDayEndPhrase(userText)) return { trigger: true, reason: 'day_end' };
    if (this.getCounter() >= (threshold || 5)) return { trigger: true, reason: 'count' };
    return { trigger: false };
  },

  async update(messages) {
    // Сбрасываем счётчик ОПТИМИСТИЧНО в момент триггера (не по успеху) + in-flight
    // флаг: иначе при отказе (напр. нулевой баланс) вызов бьёт на каждое сообщение,
    // а при быстрых сообщениях уходит дважды. (Fix: повторный/двойной вызов)
    if (this._inflight) return null;
    this._inflight = true;
    this.resetCounter();
    try {
      const currentModel = this.get();
      const recent = (messages || []).slice(-10);
      const res = await fetch('/api/memory-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentModel, messages: recent })
      });
      if (!res.ok) {
        console.warn('[PatientMemory] update failed:', res.status);
        return null;
      }
      const data = await res.json();
      if (data && data.updatedModel) {
        this.save(data.updatedModel);
        console.log('[PatientMemory] updated:', data.updatedModel);
        return data.updatedModel;
      }
      return null;
    } catch (e) {
      console.warn('[PatientMemory] update error:', e);
      return null;
    } finally {
      this._inflight = false;
    }
  }
};

if (typeof window !== 'undefined') window.PatientMemory = PatientMemory;
