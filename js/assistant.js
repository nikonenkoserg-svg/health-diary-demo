// Assistant — prompt, filter, profile parsing

const Assistant = {
  GREETING: `Здравствуйте, я ассистент дневника. Несколько слов о том, как это устроено.

Разговор у нас честный — я не притворяюсь врачом и не ставлю диагнозов. Я помогаю замечать то, что повторяется в вашем теле, связи, которые вы сами можете не видеть.

Никуда не тороплю. Общайтесь со мной как удобно — голосом, текстом, в любое время.

Чтобы я был полезен, расскажите, что привело. Недавний анализ? Тревога? Симптом, который не проходит? Или просто хочется разобраться, что происходит, пока ничего не болит?`,

  BASE_PROMPT: `Ты ассистент дневника здоровья. Попутчик, не врач.

Помогаешь замечать связь еды, сна, стресса, движения с самочувствием и сахаром. Не ставишь диагнозов.

Тон: спокойный, короткий, без списков и markdown. Максимум 5 предложений. Один вопрос за ответ.

Знания: преддиабет, инсулинорезистентность. Четыре опоры: сон, порядок еды, время еды, движение после еды. Еда→нагрузка: мороженое 230ккал=46 приседаний.

Дневник фиксирует всё что рассказывает пользователь. Со временем покажет связи и графики. Даже одна запись в день полезна.

Без шаблонов: никаких "отличный вопрос", "рад помочь". Чушь→"Нет." Паника→"Стоп. Дыши."`,

  buildSystemPrompt(profile, userMsgCount, questionCount) {
    let prompt = this.BASE_PROMPT;

    if (profile && Object.keys(profile).length > 0) {
      prompt += '\n\nПрофиль: ';
      if (profile.sex) prompt += `${profile.sex}, `;
      if (profile.age) prompt += `${profile.age} лет, `;
      if (profile.weight) prompt += `${profile.weight} кг, `;
      if (profile.bmi) prompt += `ИМТ ${profile.bmi}, `;
      if (profile.sex === 'женский') prompt += 'учитывай цикл и гормоны, ';
      prompt = prompt.replace(/, $/, '');
    }

    if (userMsgCount <= 5)
      prompt += '\nФаза: начало. Спокойно, коротко.';
    else if (userMsgCount <= 12)
      prompt += '\nФаза: знакомство. Можно пошутить.';
    else
      prompt += '\nФаза: доверие. Можно быть прямее.';

    if (questionCount >= 1)
      prompt += '\nНе задавай вопросов.';

    return prompt;
  },

  parseProfile(text) {
    const p = {};
    const t = text.toLowerCase();

    if (/\b(мужчина|мужской|муж|парень)\b/.test(t)) p.sex = 'мужской';
    else if (/\b(женщина|женский|жен|девушка)\b/.test(t)) p.sex = 'женский';

    const ageMatch = t.match(/(\d{1,2})\s*(лет|года|год)/);
    if (ageMatch) p.age = parseInt(ageMatch[1]);

    const hMatch = t.match(/(\d{3})\s*(см|сантиметр)/) || t.match(/рост\s*(\d{3})/);
    if (hMatch) p.height = parseInt(hMatch[1]);

    const wMatch = t.match(/(\d{2,3})\s*(кг|килограмм)/) || t.match(/вес\s*(\d{2,3})/);
    if (wMatch) p.weight = parseInt(wMatch[1]);

    if (p.height && p.weight) {
      const h = p.height / 100;
      p.bmi = (p.weight / (h * h)).toFixed(1);
    }

    return Object.keys(p).length > 0 ? p : null;
  },

  filterResponse(text) {
    if (!text) return '';
    let r = text;

    r = r.replace(/\*\*(.+?)\*\*/g, '$1');
    r = r.replace(/__(.+?)__/g, '$1');
    r = r.replace(/\*(.+?)\*/g, '$1');
    r = r.replace(/_(.+?)_/g, '$1');
    r = r.replace(/```[\s\S]*?```/g, '');
    r = r.replace(/`(.+?)`/g, '$1');
    r = r.replace(/^\s*[-•●◦▪]\s+/gm, '');
    r = r.replace(/^\s*\d+[.)]\s+/gm, '');
    r = r.replace(/https?:\/\/\S+/g, '');

    const templates = [
      /[^.!?]*спасибо за (честность|откровенность|доверие)[^.!?]*[.!?]/gi,
      /[^.!?]*(молодец|горжусь|отличн)[^.!?]*[.!?]/gi,
      /[^.!?]*рад[а]? помочь[^.!?]*[.!?]/gi,
      /[^.!?]*обращайся[^.!?]*[.!?]/gi,
    ];
    templates.forEach(rx => { r = r.replace(rx, ''); });

    r = r.replace(/\n{3,}/g, '\n\n').trim();

    const sentences = r.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 5) {
      r = sentences.slice(0, 5).join(' ').trim();
    }

    return r;
  }
};
