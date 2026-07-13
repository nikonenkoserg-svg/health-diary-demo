export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { model, messages, temperature, max_tokens, stream } = req.body;
  const models = model ? [model] : ['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5'];

  const TOKEN_BUDGET = 3000;
  const trimmedMessages = trimToFit(messages, TOKEN_BUDGET);

  if (stream) {
    return handleStream(req, res, models, trimmedMessages, temperature, max_tokens);
  }

  for (const m of (Array.isArray(models) ? models : [models])) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://health-diary-sooty.vercel.app',
          'X-Title': 'Health Diary'
        },
        body: JSON.stringify({ model: m, messages: trimmedMessages, temperature: temperature || 0.9, max_tokens: max_tokens || 1500 }),
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

async function handleStream(req, res, models, messages, temperature, max_tokens) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  for (const m of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://health-diary-sooty.vercel.app',
          'X-Title': 'Health Diary'
        },
        body: JSON.stringify({
          model: m,
          messages,
          temperature: temperature || 0.9,
          max_tokens: max_tokens || 1500,
          stream: true
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok || !response.body) {
        console.error(`[chat-stream] ${m} returned ${response.status}`);
        continue;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotContent = false;

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
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              gotContent = true;
              res.write('data: ' + JSON.stringify({ content: delta, model: m }) + '\n\n');
            }
          } catch (_) {}
        }
      }
      if (gotContent) {
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      console.error(`[chat-stream] ${m} empty stream`);
    } catch (err) {
      console.error(`[chat-stream] ${m} error: ${err.message}`);
      continue;
    }
  }

  res.write('data: ' + JSON.stringify({ error: 'All models failed' }) + '\n\n');
  res.end();
}

function trimToFit(messages, budget) {
  if (!messages || messages.length === 0) return messages;

  const estimateTokens = (text) => Math.ceil((text || '').length / 4);

  const system = messages[0]?.role === 'system' ? messages[0] : null;
  const history = system ? messages.slice(1) : [...messages];

  let usedTokens = system ? estimateTokens(system.content) : 0;

  const kept = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(history[i].content);
    if (usedTokens + msgTokens > budget) break;
    usedTokens += msgTokens;
    kept.unshift(history[i]);
  }

  if (kept.length < 2 && history.length >= 2) {
    return system
      ? [system, ...history.slice(-2)]
      : history.slice(-2);
  }

  return system ? [system, ...kept] : kept;
}
