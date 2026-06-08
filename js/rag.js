// RAG — поиск ближайших карточек по эмбеддингу запроса
// Использует @xenova/transformers (загружен через CDN в index.html)
// База: knowledge/cards.json (200 карточек с предрассчитанными эмбеддингами)

const RAG = {
  cards: null,
  embedder: null,
  loadingPromise: null,

  async _loadCards() {
    if (this.cards) return this.cards;
    const res = await fetch('knowledge/cards.json');
    this.cards = await res.json();
    return this.cards;
  },

  async _loadEmbedder() {
    if (this.embedder) return this.embedder;
    const { pipeline, env } = window.transformers;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    this.embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
      quantized: true
    });
    return this.embedder;
  },

  async init() {
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = Promise.all([this._loadCards(), this._loadEmbedder()]);
    await this.loadingPromise;
    return true;
  },

  isReady() {
    return this.cards !== null && this.embedder !== null;
  },

  async embed(text) {
    if (!this.embedder) await this._loadEmbedder();
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  },

  _cosine(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  },

  async search(query, k) {
    k = k || 3;
    if (!this.isReady()) return [];
    const qVec = await this.embed(query);
    const scored = this.cards.map(c => ({
      id: c.id,
      patient: c.patient,
      ideal: c.ideal,
      score: this._cosine(qVec, c.vec)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  },

  formatForPrompt(hits) {
    if (!hits || hits.length === 0) return '';
    const lines = ['', '[ПРИМЕРЫ ОТВЕТОВ ТРЕНЕРА — ЭТАЛОН ТОНА И ФОРМЫ]'];
    lines.push('Это реальные диалоги. Не правила, не шаблоны — образец длины, регистра и того, что Тренер НЕ говорит.');
    lines.push('');
    for (const h of hits) {
      lines.push('Пациент: «' + h.patient + '»');
      lines.push('Ответ: «' + h.ideal + '»');
      lines.push('');
    }
    lines.push('[/ПРИМЕРЫ]');
    return lines.join('\n');
  }
};

if (typeof window !== 'undefined') window.RAG = RAG;
