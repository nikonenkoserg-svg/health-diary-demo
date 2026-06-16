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


// === LIBRARY — карточки контента ВНУТРИ дневника, без ссылок на канал ===
RAG.library = null;
RAG._loadLibrary = async function(){
  if (this.library) return this.library;
  const res = await fetch('knowledge/library.json');
  this.library = await res.json();
  // Backward-compat alias на старое поле .articles чтобы isReady() и старый код работали
  this.articles = this.library;
  return this.library;
};
RAG.init = async function(){
  if (this.loadingPromise) return this.loadingPromise;
  this.loadingPromise = Promise.all([this._loadCards(), this._loadEmbedder(), this._loadLibrary()]);
  await this.loadingPromise;
  // Догенерируем эмбеддинги для карточек без vec (фоном, не блокируем UI)
  this.ensureLibraryVectors().catch(e => console.warn('[RAG] vector backfill failed:', e));
  return true;
};

RAG.ensureLibraryVectors = async function(){
  if (!this.library || !this.embedder) return;
  const missing = this.library.filter(c => !c.vec || !Array.isArray(c.vec));
  if (missing.length === 0) return;
  let cached = {};
  try { cached = JSON.parse(localStorage.getItem('hd_lib_vec_cache') || '{}'); } catch(_) {}
  let newCount = 0;
  for (const c of missing) {
    if (cached[c.id] && Array.isArray(cached[c.id])) {
      c.vec = cached[c.id];
      continue;
    }
    try {
      const text = ((c.title || '') + '\n\n' + (c.text || '')).slice(0, 2000);
      const vec = await this.embed(text);
      c.vec = vec;
      cached[c.id] = vec;
      newCount++;
    } catch(e) {
      console.warn('[RAG] embed failed for card', c.id, e.message);
    }
  }
  if (newCount > 0) {
    try { localStorage.setItem('hd_lib_vec_cache', JSON.stringify(cached)); } catch(_) {}
    console.log('[RAG] generated', newCount, 'new card embeddings');
  }
};
RAG.searchCard = async function(query, minScore, opts){
  minScore = minScore || 0.35;
  opts = opts || {};
  const userSex = opts.sex;
  if (!this.library || !this.embedder) return null;
  const qVec = await this.embed(query);
  let best = null;
  for (const a of this.library) {
    if (!a.vec) continue; // карточки без эмбеддинга пропускаем
    if (a.gender === 'female' && userSex && userSex !== 'женский') continue;
    const score = this._cosine(qVec, a.vec);
    if (!best || score > best.score) best = { id: a.id, title: a.title, text: a.text, score };
  }
  if (!best || best.score < minScore) return null;
  return best;
};
// Backward alias
RAG.searchArticle = RAG.searchCard;
RAG.getCardById = function(id){
  if (!this.library) return null;
  return this.library.find(c => String(c.id) === String(id)) || null;
};
RAG.formatCardForPrompt = function(card){
  if (!card) return '';
  // Спутник получает выжимку текста как материал, но НЕ ссылку. Упоминать источник в ответе нельзя.
  const excerpt = (card.text || '').slice(0, 800);
  return '\n\n[МАТЕРИАЛ ПО ТЕМЕ — для информирования ответа]\n«' + card.title + '»:\n' + excerpt + '\n\nИспользуй эти факты в ответе если уместно. НЕ ссылайся на источник, НЕ говори «в посте», «в канале», «в карточке». Просто отвечай по сути, опираясь на материал.\n[/МАТЕРИАЛ]';
};
RAG.formatArticleForPrompt = RAG.formatCardForPrompt;

if (typeof window !== 'undefined') window.RAG = RAG;
