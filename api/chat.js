export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { model, messages, temperature, max_tokens } = req.body;
  const models = model ? [model] : ['deepseek/deepseek-v4-flash'];

  // Token budget protection: estimate tokens and trim history if needed
  // ~4 chars per token for Russian text, budget ~1000 tokens for prompt
  const TOKEN_BUDGET = 3000; // total tokens we can afford
  const trimmedMessages = trimToFit(messages, TOKEN_BUDGET);

  for (const m of (Array.isArray(models) ? models : [models])) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://health-diary-sooty.vercel.app',
          'X-Title': 'Health Diary'
        },
        body: JSON.stringify({ model: m, messages: trimmedMessages, temperature: temperature || 0.9, max_tokens: max_tokens || 300 }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[chat] ${m} returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return res.status(200).json(data);
      }
      console.error(`[chat] ${m} empty response`);
    } catch (err) {
      console.error(`[chat] ${m} error: ${err.message}`);
      continue;
    }
  }

  res.status(502).json({ error: 'All models failed' });
}

function trimToFit(messages, budget) {
  if (!messages || messages.length === 0) return messages;

  const estimateTokens = (text) => Math.ceil((text || '').length / 4);

  // System message always stays
  const system = messages[0]?.role === 'system' ? messages[0] : null;
  const history = system ? messages.slice(1) : [...messages];

  let usedTokens = system ? estimateTokens(system.content) : 0;
  const maxHistoryTokens = budget - usedTokens;

  // Keep messages from the end (most recent), drop oldest if over budget
  const kept = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(history[i].content);
    if (usedTokens + msgTokens > budget) break;
    usedTokens += msgTokens;
    kept.unshift(history[i]);
  }

  // Always keep at least the last 2 messages (user + assistant)
  if (kept.length < 2 && history.length >= 2) {
    return system
      ? [system, ...history.slice(-2)]
      : history.slice(-2);
  }

  return system ? [system, ...kept] : kept;
}
