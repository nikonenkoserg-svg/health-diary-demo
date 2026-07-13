// /api/memory-update — LLM-секретарь долгосрочной памяти.
// На вход: { currentModel, messages: last10 }.
// На выход: { updatedModel }.
// Использует тот же стек, что /api/chat (OpenRouter deepseek).

const SECRETARY_PROMPT = `Ты — секретарь персонального ассистента по здоровью.
Твоя задача — обновить модель пациента на основе последних сообщений диалога.

Модель состоит из четырёх разделов:
- patterns: повторяющиеся паттерны питания, времени, режима (примеры ключей: morning_routine, typical_breakfast, post_workout_snack)
- reactions: реакции организма на конкретную еду / нагрузку, с цифрами если есть (примеры: morning_peak, coffee_cream, caffeine_window)
- lifestyle: образ жизни, условия, контекст (примеры: condition, training_load, region)
- notes: массив строк — важные заметки, цели, предпочтения

Правила:
- Извлекай ТОЛЬКО факты из самого диалога. Не выдумывай.
- Обновляй существующие поля если есть уточнение. Не дублируй.
- ВСЕГДА возвращай модель ЦЕЛИКОМ: все существующие поля currentModel плюс новые. Никогда не удаляй существующие ключи.
- Если ничего нового не сказано — верни currentModel БЕЗ ИЗМЕНЕНИЙ.
- Не записывай эфемерное (мимолётное настроение, разовые вопросы).
- Не записывай гипотетическое («а если бы я съел»).
- Имена полей внутри секций — латиница snake_case.
- Значения полей — на русском, короткие фразы.

Верни ТОЛЬКО валидный JSON в формате:
{"patterns":{...},"reactions":{...},"lifestyle":{...},"notes":[...]}
Без markdown, без префиксов, без объяснений.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentModel, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  const dialog = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => `${m.role === 'user' ? 'Пациент' : 'Ассистент'}: ${m.content || ''}`)
    .join('\n');

  const userPayload =
    'Текущая модель пациента:\n' +
    JSON.stringify(currentModel || {}, null, 2) +
    '\n\nПоследние сообщения диалога:\n' +
    dialog +
    '\n\nВерни обновлённый JSON модели.';

  const apiMessages = [
    { role: 'system', content: SECRETARY_PROMPT },
    { role: 'user', content: userPayload }
  ];

  const models = ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-chat-v3-0324'];

  for (const m of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://health-diary-sooty.vercel.app',
          'X-Title': 'Health Diary Memory'
        },
        body: JSON.stringify({
          model: m,
          messages: apiMessages,
          temperature: 0.3,
          max_tokens: 1200
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[memory-update] ${m} ${response.status}`);
        continue;
      }
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

      let updatedModel;
      try { updatedModel = JSON.parse(cleaned); }
      catch (e) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) { try { updatedModel = JSON.parse(match[0]); } catch (_) {} }
      }

      if (!updatedModel || typeof updatedModel !== 'object') {
        console.error(`[memory-update] ${m} invalid JSON:`, raw.slice(0, 200));
        continue;
      }

      // Ключевое слияние: секретарь может ДОБАВИТЬ или ОБНОВИТЬ ключ, но не сможет
      // молча стереть накопленное — существующие ключи сохраняются. (Fix: забывание)
      const cur = currentModel || {};
      const mergeSection = (name) => ({ ...(cur[name] || {}), ...(updatedModel[name] || {}) });
      updatedModel.patterns = mergeSection('patterns');
      updatedModel.reactions = mergeSection('reactions');
      updatedModel.lifestyle = mergeSection('lifestyle');
      const priorNotes = Array.isArray(cur.notes) ? cur.notes : [];
      const freshNotes = Array.isArray(updatedModel.notes) ? updatedModel.notes : [];
      updatedModel.notes = [...priorNotes, ...freshNotes.filter(n => !priorNotes.includes(n))];

      return res.status(200).json({ updatedModel });
    } catch (err) {
      console.error(`[memory-update] ${m} error:`, err.message);
      continue;
    }
  }

  return res.status(502).json({ error: 'All models failed' });
}
