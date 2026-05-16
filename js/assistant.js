// Assistant — prompt, filter, profile parsing
// Uses Knowledge from knowledge/core-style.js (loaded via index.html)
// Uses Onboarding from js/onboarding.js

const Assistant = {

  buildSystemPrompt(profile, userMsgCount, questionCount, messages, state) {
    if (typeof Knowledge !== 'undefined') {
      let prompt = Knowledge.buildPrompt(profile, userMsgCount, questionCount, messages);

      // Bridge phase: add extra instructions for first interactions
      if (state === 'bridge' && typeof Onboarding !== 'undefined') {
        prompt += Onboarding.BRIDGE_PROMPT;
      }

      return prompt;
    }
    return this._fallbackPrompt(profile, userMsgCount, questionCount, state);
  },

  _fallbackPrompt(profile, userMsgCount, questionCount, state) {
    let prompt = `Ты — попутчик. Не врач, не коуч, не справочник. Слушай, запоминай, замечай.
Формат: 2-3 предложения. Каждое на отдельной строке. Без списков, двоеточий с перечислениями, эмодзи, markdown.
Тон: спокойный, внимательный. Никаких "отличный вопрос", "молодец", "рад помочь".`;

    if (profile && Object.keys(profile).length > 0) {
      prompt += '\nПрофиль: ';
      if (profile.sex) prompt += `${profile.sex}, `;
      if (profile.age) prompt += `${profile.age} лет, `;
      if (profile.weight) prompt += `${profile.weight} кг, `;
      prompt = prompt.replace(/, $/, '');
    }
    if (userMsgCount <= 5) prompt += '\nФаза: начало.';
    else if (userMsgCount <= 12) prompt += '\nФаза: знакомство.';
    else prompt += '\nФаза: доверие.';
    if (questionCount >= 1) prompt += '\nНе задавай вопросов.';

    if (state === 'bridge' && typeof Onboarding !== 'undefined') {
      prompt += Onboarding.BRIDGE_PROMPT;
    }

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
