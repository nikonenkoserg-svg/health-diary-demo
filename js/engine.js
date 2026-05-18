// Engine — расчётный движок дневника
// Детерминированный: одни данные → один результат. Без LLM.

const Engine = {

  // === БАЗА ПРОДУКТОВ (GI, макронутриенты на 100г) ===
  FOOD_DB: {
    // Быстрые углеводы (GI > 70)
    'пицца':       { gi: 80, carbs: 33, fat: 11, protein: 11, kcal: 270, portion: 300 },
    'блины':       { gi: 85, carbs: 28, fat: 8, protein: 6, kcal: 220, portion: 200 },
    'хлеб белый':  { gi: 75, carbs: 49, fat: 3, protein: 8, kcal: 265, portion: 50 },
    'рис белый':   { gi: 73, carbs: 28, fat: 0.3, protein: 2.7, kcal: 130, portion: 200 },
    'картофель':   { gi: 78, carbs: 17, fat: 0.1, protein: 2, kcal: 77, portion: 200 },
    'сахар':       { gi: 65, carbs: 100, fat: 0, protein: 0, kcal: 400, portion: 10 },
    'шоколад':     { gi: 70, carbs: 60, fat: 30, protein: 5, kcal: 540, portion: 50 },
    'мороженое':   { gi: 62, carbs: 24, fat: 11, protein: 3.5, kcal: 207, portion: 100 },
    'сок':         { gi: 66, carbs: 11, fat: 0, protein: 0.5, kcal: 45, portion: 250 },
    'газировка':   { gi: 63, carbs: 11, fat: 0, protein: 0, kcal: 42, portion: 330 },
    'макароны':    { gi: 55, carbs: 25, fat: 1, protein: 5, kcal: 131, portion: 200 },
    'банан':       { gi: 62, carbs: 23, fat: 0.3, protein: 1, kcal: 96, portion: 120 },

    // Медленные углеводы (GI < 55)
    'каша овсянка':{ gi: 40, carbs: 12, fat: 2, protein: 3, kcal: 68, portion: 250 },
    'каша гречка': { gi: 40, carbs: 19, fat: 2, protein: 4, kcal: 110, portion: 200 },
    'каша':        { gi: 40, carbs: 15, fat: 2, protein: 3.5, kcal: 90, portion: 250 },
    'хлеб черный': { gi: 50, carbs: 40, fat: 3, protein: 7, kcal: 220, portion: 50 },
    'яблоко':      { gi: 36, carbs: 14, fat: 0.2, protein: 0.3, kcal: 52, portion: 180 },
    'апельсин':    { gi: 43, carbs: 12, fat: 0.1, protein: 0.9, kcal: 47, portion: 200 },

    // Белок + жир (GI ~0-30)
    'яйца':        { gi: 0, carbs: 1, fat: 11, protein: 13, kcal: 155, portion: 120 },
    'мясо':        { gi: 0, carbs: 0, fat: 10, protein: 26, kcal: 200, portion: 200 },
    'курица':      { gi: 0, carbs: 0, fat: 4, protein: 31, kcal: 165, portion: 200 },
    'рыба':        { gi: 0, carbs: 0, fat: 5, protein: 22, kcal: 130, portion: 200 },
    'сыр':         { gi: 0, carbs: 1, fat: 25, protein: 25, kcal: 350, portion: 50 },
    'творог':      { gi: 30, carbs: 3, fat: 5, protein: 17, kcal: 120, portion: 150 },
    'молоко':      { gi: 30, carbs: 5, fat: 3.2, protein: 3, kcal: 60, portion: 250 },
    'орехи':       { gi: 15, carbs: 20, fat: 50, protein: 15, kcal: 600, portion: 30 },
    'бутерброд':   { gi: 65, carbs: 30, fat: 10, protein: 10, kcal: 260, portion: 100 },

    // Напитки
    'кофе':        { gi: 0, carbs: 0, fat: 0, protein: 0, kcal: 2, portion: 200, caffeine: true },
    'чай':         { gi: 0, carbs: 0, fat: 0, protein: 0, kcal: 1, portion: 200 },
    'вода':        { gi: 0, carbs: 0, fat: 0, protein: 0, kcal: 0, portion: 250, hydration: true },

    // Овощи
    'салат':       { gi: 15, carbs: 3, fat: 0.2, protein: 1.5, kcal: 15, portion: 150, fiber: true },
    'овощи':       { gi: 15, carbs: 5, fat: 0.3, protein: 2, kcal: 25, portion: 200, fiber: true },
  },

  // === ПАРСЕР ЕДЫ ИЗ ТЕКСТА ===
  parseFood(text) {
    const t = text.toLowerCase();
    const found = [];
    for (const [name, data] of Object.entries(this.FOOD_DB)) {
      if (t.includes(name)) {
        found.push({ name, ...data });
      }
    }
    return found;
  },

  // === ПЕРСОНАЛЬНЫЕ КОЭФФИЦИЕНТЫ ===
  getCoefficients(profile) {
    const coeff = {
      insulinSensitivity: 1.0,  // 1.0 = норма, <1 = резистентность
      metabolicRate: 1.0,       // скорость метаболизма
      peakModifier: 1.0,        // модификатор пика глюкозы
    };

    // Преддиабет — чувствительность снижена
    if (profile.prediabetes) {
      coeff.insulinSensitivity = 0.7;
      coeff.peakModifier = 1.3;
    }

    // Возраст >45 — метаболизм замедляется
    const age = parseInt(profile.age) || 35;
    if (age > 45) {
      coeff.metabolicRate = 1 - (age - 45) * 0.005;
      coeff.peakModifier *= 1 + (age - 45) * 0.01;
    }

    // Активность ускоряет метаболизм
    if (profile.activity === 'active' || profile.activity === 'активный') {
      coeff.insulinSensitivity *= 1.2;
      coeff.metabolicRate *= 1.15;
      coeff.peakModifier *= 0.85;
    } else if (profile.activity === 'sedentary' || profile.activity === 'сидячий') {
      coeff.insulinSensitivity *= 0.85;
      coeff.peakModifier *= 1.1;
    }

    // Плохой сон ухудшает чувствительность
    const sleepHours = parseInt(profile.sleepHours) || 7;
    if (sleepHours < 6) {
      coeff.insulinSensitivity *= 0.75;
      coeff.peakModifier *= 1.2;
    }

    // ИМТ
    const bmi = parseFloat(profile.bmi) || 25;
    if (bmi > 30) {
      coeff.insulinSensitivity *= 0.7;
      coeff.peakModifier *= 1.25;
    } else if (bmi > 27) {
      coeff.insulinSensitivity *= 0.85;
      coeff.peakModifier *= 1.1;
    }

    return coeff;
  },

  // === ГЛЮКОЗНАЯ КРИВАЯ ===
  // Возвращает массив точек: [{t: минуты, glucose: ммоль/л}]
  glucoseCurve(food, coeff) {
    const baseline = 5.0; // нормальный сахар натощак
    const carbsTotal = (food.carbs * food.portion / 100);
    const gi = food.gi;

    if (gi === 0 || carbsTotal < 1) {
      // Белок/жир — минимальное влияние
      return { peak: baseline + 0.3, peakTime: 60, returnTime: 120, timeline: [] };
    }

    // Гликемическая нагрузка
    const gl = (gi * carbsTotal) / 100;

    // Пик: базовый + GL * модификатор / масса тела (упрощённо)
    const peakRise = (gl * 0.12) * coeff.peakModifier;
    const peak = Math.min(baseline + peakRise, 15); // потолок

    // Время до пика: высокий GI = быстрый пик
    const peakTime = gi > 70 ? 35 : gi > 50 ? 50 : 70; // минут

    // Время возврата: зависит от чувствительности к инсулину
    const returnTime = peakTime + Math.round(90 / coeff.insulinSensitivity);

    // Генерация кривой (точки каждые 15 мин на 4 часа)
    const timeline = [];
    for (let t = 0; t <= 240; t += 15) {
      let glucose;
      if (t <= peakTime) {
        // Подъём (парабола)
        glucose = baseline + peakRise * Math.sin((Math.PI / 2) * (t / peakTime));
      } else if (t <= returnTime) {
        // Спад
        const progress = (t - peakTime) / (returnTime - peakTime);
        glucose = peak - (peak - baseline) * progress;
      } else {
        // После возврата — возможен провал ниже базы
        const overshoot = peakRise > 2 ? 0.3 : 0;
        glucose = baseline - overshoot * Math.exp(-(t - returnTime) / 60);
      }
      timeline.push({ t, glucose: Math.round(glucose * 10) / 10 });
    }

    return { peak: Math.round(peak * 10) / 10, peakTime, returnTime, timeline };
  },

  // === РАСЧЁТ НАГРУЗКИ ДЛЯ ОБМЕНА ===
  exerciseExchange(food, profile) {
    const carbsTotal = (food.carbs * food.portion / 100);
    const kcal = (food.kcal * food.portion / 100);
    const weight = parseInt(profile.weight) || 75;

    // Приседания: ~0.5 ккал/приседание при 75кг
    const squats = Math.round(kcal / (0.5 * weight / 75));

    // Ходьба: ~4 ккал/мин при 75кг
    const walkMinutes = Math.round(kcal / (4 * weight / 75));

    // Бег: ~10 ккал/мин при 75кг
    const runMinutes = Math.round(kcal / (10 * weight / 75));

    return { squats, walkMinutes, runMinutes, kcal: Math.round(kcal), carbsG: Math.round(carbsTotal) };
  },

  // === ВРЕМЯ СУТОК — ВЛИЯНИЕ ===
  timeOfDayEffect(hour) {
    if (hour === undefined || hour === null) hour = new Date().getHours();
    if (hour >= 6 && hour < 10) return { modifier: 0.9, note: 'Утро — чувствительность к инсулину максимальная' };
    if (hour >= 10 && hour < 14) return { modifier: 1.0, note: 'День — нормальная чувствительность' };
    if (hour >= 14 && hour < 18) return { modifier: 1.05, note: 'После обеда — небольшое снижение чувствительности' };
    if (hour >= 18 && hour < 21) return { modifier: 1.15, note: 'Вечер — чувствительность снижена' };
    return { modifier: 1.3, note: 'Ночь — чувствительность к инсулину минимальная, еда ляжет тяжелее' };
  },

  // === ГЛАВНЫЙ МЕТОД: анализ события ===
  analyze(text, profile) {
    const foods = this.parseFood(text);
    if (foods.length === 0) return null;

    const coeff = this.getCoefficients(profile || {});
    const timeEffect = this.timeOfDayEffect();

    // Применяем время суток
    coeff.peakModifier *= timeEffect.modifier;

    const results = foods.map(food => {
      const curve = this.glucoseCurve(food, coeff);
      const exchange = this.exerciseExchange(food, profile || {});
      return {
        name: food.name,
        portion: food.portion,
        kcal: Math.round(food.kcal * food.portion / 100),
        gi: food.gi,
        curve,
        exchange
      };
    });

    // Суммарный эффект
    const totalKcal = results.reduce((s, r) => s + r.kcal, 0);
    const maxPeak = Math.max(...results.map(r => r.curve.peak));
    const maxPeakTime = Math.max(...results.map(r => r.curve.peakTime));
    const maxReturnTime = Math.max(...results.map(r => r.curve.returnTime));

    return {
      foods: results,
      summary: {
        totalKcal,
        maxPeak,
        maxPeakTime,
        maxReturnTime,
        timeOfDay: timeEffect.note,
        peakLevel: maxPeak > 9 ? 'высокий' : maxPeak > 7 ? 'умеренный' : 'низкий'
      }
    };
  },

  // === ФОРМАТИРОВАНИЕ ДЛЯ LLM ===
  formatForPrompt(analysis) {
    if (!analysis) return '';

    let text = '\n\n[РАСЧЁТ ДВИЖКА]\n';
    text += `Время суток: ${analysis.summary.timeOfDay}\n`;

    for (const food of analysis.foods) {
      text += `\n${food.name} (~${food.portion}г, ${food.kcal} ккал, GI ${food.gi}):`;
      if (food.curve.peak > 5.5) {
        text += ` пик сахара ~${food.curve.peak} ммоль/л через ${food.curve.peakTime} мин`;
        text += `, возврат к норме через ${food.curve.returnTime} мин`;
      } else {
        text += ` минимальное влияние на сахар`;
      }
      text += `\nОбмен: ${food.exchange.walkMinutes} мин ходьбы или ${food.exchange.squats} приседаний`;
    }

    if (analysis.foods.length > 1) {
      text += `\n\nИтого: ${analysis.summary.totalKcal} ккал, пик ${analysis.summary.peakLevel} (~${analysis.summary.maxPeak})`;
    }

    text += '\n\nИспользуй эти данные в ответе — проговори последствия во времени, не показывай цифры напрямую (кроме ккал и минут ходьбы). Говори как друг, не как калькулятор.';
    text += '\n[/РАСЧЁТ ДВИЖКА]';

    return text;
  }
};
