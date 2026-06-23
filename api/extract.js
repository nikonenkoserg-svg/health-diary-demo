// Извлекает структурированную анкету из свободного текста (голос или блок).
// Модель: Claude Haiku 4.5 через OpenRouter. Возвращает {anketa: {...}}.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};
    const text = (body.text || '').toString().trim();
    if (!text) return res.status(400).json({ error: 'text required' });

    const systemPrompt = `Извлеки из текста структурированную анкету пациента. Верни ТОЛЬКО валидный JSON-объект, без markdown, без пояснений.

Формат:
{
  "sex": "мужской" | "женский" | null,
  "age": number | null,
  "height": number | null,
  "weight": number | null,
  "diagnosis": string | null,
  "bad_habits": string | null,
  "chronic": string | null,
  "allergies": string | null,
  "medications": string | null,
  "heredity": string | null,
  "region": string | null
}

Правила:
- Если данных по полю нет в тексте — null.
- Не выдумывай. Только явно сказанное.
- age, height, weight — числа без единиц (53, 183, 77).
- bad_habits: фраза как сказал пациент ("курю", "не курю не пью", "алкоголь по выходным").
- diagnosis: краткая формулировка ("преддиабет", "диабет 2 типа", "нет").
- Опциональные поля (chronic, allergies, medications, heredity, region): если упомянуто "нет" — пиши "нет", если не упомянуто — null.`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return res.status(502).json({ error: 'extractor api error', details: errText.slice(0, 300) });
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    let anketa = {};
    try {
      anketa = JSON.parse(content);
    } catch (e) {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { anketa = JSON.parse(m[0]); } catch (_) {} }
    }
    res.status(200).json({ anketa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
