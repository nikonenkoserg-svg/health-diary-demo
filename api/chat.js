export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { model, messages, temperature, max_tokens } = req.body;
  const models = model ? [model] : ['anthropic/claude-3.5-haiku', 'deepseek/deepseek-chat'];

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
        body: JSON.stringify({ model: m, messages, temperature: temperature || 0.9, max_tokens: max_tokens || 300 }),
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
