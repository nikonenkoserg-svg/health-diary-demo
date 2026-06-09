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
    return this.cards !== null && this.embedder !== null && this.articles !== null;
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


// === ARTICLES (ссылки на посты канала) ===
RAG.articles = null;
RAG._loadArticles = async function(){
  if (this.articles) return this.articles;
  const res = await fetch('knowledge/articles.json');
  this.articles = await res.json();
  return this.articles;
};
const origInit = RAG.init.bind(RAG);
RAG.init = async function(){
  if (this.loadingPromise) return this.loadingPromise;
  this.loadingPromise = Promise.all([this._loadCards(), this._loadEmbedder(), this._loadArticles()]);
  await this.loadingPromise;
  return true;
};
RAG.searchArticle = async function(query, minScore){
  minScore = minScore || 0.45;
  if (!this.articles || !this.embedder) return null;
  const qVec = await this.embed(query);
  let best = null;
  for (const a of this.articles) {
    const score = this._cosine(qVec, a.vec);
    if (!best || score > best.score) best = { ...a, score };
  }
  if (!best || best.score < minScore) return null;
  return best;
};
RAG.formatArticleForPrompt = function(article){
  if (!article) return '';
  return '\n\n[РЕЛЕВАНТНЫЙ РАЗБОР В КАНАЛЕ]\nПо теме реплики есть пост: ' + article.url + ' · «' + article.title + '».\nЕсли уместно — мягко упомяни ссылку в ответе (например: «по этой теме разбор в канале: ' + article.url + '»). Не лекторствуй сверх ссылки.\n[/РАЗБОР]';
};

if (typeof window !== 'undefined') window.RAG = RAG;
