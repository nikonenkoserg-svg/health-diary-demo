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
  "name": string | null,
  "sex": "мужской" | "женский" | null,
  "age": number | null,
  "height": number | null,
  "weight": number | null,
  "diagnosis": string | null,
  "medications": string | null,
  "glucometer": "есть глюкометр" | "есть сенсор" | "нет, готов купить" | "нет, не хочу" | null,
  "bad_habits": string | null,
  "chronic": string | null,
  "allergies": string | null,
  "heredity": string | null,
  "region": string | null,
  "breakfast": string | null,
  "lunch": string | null,
  "dinner": string | null,
  "snacks": string | null,
  "training": string | null,
  "sleep": string | null,
  "work": string | null
}

Правила:
- Если данных по полю нет в тексте — null.
- Не выдумывай. Только явно сказанное.
- age, height, weight — числа без единиц (53, 183, 77).
- name: как пациент просит к нему обращаться. Это может быть имя ("Игорь", "Лена"), прозвище ("Тренер", "Босс", "Мама"), уменьшительное ("Игорёк"). Извлекай ЛЮБОЕ обращение — в том числе если пациент говорит "Тренером можно называть", "зови меня Босс", "просто Игорь", или одним словом "Тренер". Слова "можно", "называть", "зови", "меня", "просто" — не часть имени, отбрасывай их.
- diagnosis: краткая формулировка ("преддиабет", "диабет 2 типа", "нет диагноза, профилактика", "дисциплина", "группа риска").
- medications: что принимает от диабета/сахара. "не принимаю", "метформин", "инсулин", "сульфонилмочевина". Если не упомянул — null.
- glucometer: один из четырёх вариантов. "есть глюкометр" — если упомянул обычный глюкометр или просто "глюкометр есть"/"есть прибор"/"мерю сахар". "есть сенсор" — Dexcom, Libre, Stelo, CGM, постоянный сенсор. "нет, готов купить" — нет, но готов выбирать. "нет, не хочу" — нет и не хочет, "гаджетов нет", "приборов нет". null если не упомянуто.
- bad_habits: фраза как сказал пациент.
- Опциональные поля (chronic, allergies, heredity, region): если упомянуто "нет" — пиши "нет", если не упомянуто — null.
- breakfast/lunch/dinner/snacks/training/sleep/work: типичный образ жизни как сказал пациент («утром кофе с блинами», «спорт каждый день по 6 часов», «сон 5 часов, высыпаюсь», «работаю между подходами»). Только явно сказанное, иначе null.`;

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
