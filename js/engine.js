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
    'сыр':         { gi: 0, carbs: 1, fat: 25, protein: 25, kcal: 350, portion: 50, dairy: true },
    'творог':      { gi: 30, carbs: 3, fat: 5, protein: 17, kcal: 120, portion: 150, dairy: true },
    'молоко':      { gi: 30, carbs: 5, fat: 3.2, protein: 3, kcal: 60, portion: 250, dairy: true },
    'кефир':       { gi: 15, carbs: 4, fat: 3.2, protein: 3, kcal: 56, portion: 250, dairy: true },
    'йогурт':      { gi: 35, carbs: 7, fat: 3, protein: 5, kcal: 65, portion: 200, dairy: true },
    'сметана':     { gi: 20, carbs: 3, fat: 20, protein: 2.5, kcal: 206, portion: 50, dairy: true },
    'ряженка':     { gi: 15, carbs: 4, fat: 4, protein: 3, kcal: 67, portion: 250, dairy: true },
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
  // Стемминг: обрезаем русские окончания для сравнения
  _stem(word) {
    if (word.length <= 3) return word;
    return word.replace(/(ами|ями|ой|ей|ом|ем|ов|ев|ах|ях|ую|юю|ые|ие|ых|их|ий|ый|ая|яя|ое|ее|у|ю|а|я|о|е|ы|и)$/, '');
  },

  parseFood(text) {
    const t = text.toLowerCase();
    const found = [];
    const words = t.split(/[\s,.:;!?()]+/).filter(w => w.length > 2);
    const stems = words.map(w => this._stem(w));

    // Список числовых указаний количества с позицией в тексте
    const amounts = [];
    const reAmt = /(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|граммов|мл|миллилитр|кусок|кусоч|штук|шт)(?![а-яёa-z])/gi;
    let am;
    while ((am = reAmt.exec(t)) !== null) {
      const num = parseFloat(am[1].replace(',', '.'));
      const unit = am[2];
      let portion = num;
      // куски/штуки → нет точных грамм, но это маркер «указано»
      if (/кусок|кусоч|штук|шт/.test(unit)) portion = null;
      amounts.push({ pos: am.index, num, unit, portion });
    }

    const matchedFoods = [];
    for (const [name, data] of Object.entries(this.FOOD_DB)) {
      let pos = -1;
      if (t.includes(name)) {
        pos = t.indexOf(name);
      } else {
        const nameStem = this._stem(name);
        if (nameStem.length >= 3) {
          for (let i = 0; i < stems.length; i++) {
            if (stems[i] === nameStem || stems[i].startsWith(nameStem) || (nameStem.startsWith(stems[i]) && stems[i].length >= 3)) {
              // приблизительная позиция слова в исходном тексте
              const w = words[i];
              pos = t.indexOf(w);
              break;
            }
          }
        }
      }
      if (pos === -1) continue;
      matchedFoods.push({ name, data, pos });
    }

    for (const f of matchedFoods) {
      // Найти ближайшее количество в окне ±50 символов
      let best = null;
      for (const a of amounts) {
        const dist = Math.abs(a.pos - f.pos);
        if (dist > 60) continue;
        if (!best || dist < best.dist) best = { ...a, dist };
      }
      const item = { name: f.name, ...f.data };
      if (best && best.portion != null) {
        // kcal/carbs остаются как «на 100г» — addEvent сам умножит на portion/100.
        // Меняем только portion.
        item.portion = best.portion;
        item.defaultPortion = false;
      } else if (best && best.portion == null) {
        // указано как «кусок/штука» — не дефолт, но точная масса неизвестна
        item.defaultPortion = false;
        item.portionHint = best.num + ' ' + best.unit;
      } else {
        item.defaultPortion = true;
      }
      found.push(item);
    }
    return found;
  },

  // === ПЕРСОНАЛЬНЫЕ КОЭФФИЦИЕНТЫ ===
  getCoefficients(profile) {
    const coeff = {
      insulinSensitivity: 1.0,
      metabolicRate: 1.0,
      peakModifier: 1.0,
    };

    if (profile.prediabetes) {
      coeff.insulinSensitivity = 0.7;
      coeff.peakModifier = 1.3;
    }

    const age = parseInt(profile.age) || 35;
    if (age > 45) {
      coeff.metabolicRate = 1 - (age - 45) * 0.005;
      coeff.peakModifier *= 1 + (age - 45) * 0.01;
    }

    if (profile.activity === 'active' || profile.activity === 'активный') {
      coeff.insulinSensitivity *= 1.2;
      coeff.metabolicRate *= 1.15;
      coeff.peakModifier *= 0.85;
    } else if (profile.activity === 'sedentary' || profile.activity === 'сидячий') {
      coeff.insulinSensitivity *= 0.85;
      coeff.peakModifier *= 1.1;
    }

    const sleepHours = parseInt(profile.sleepHours) || 7;
    if (sleepHours < 6) {
      coeff.insulinSensitivity *= 0.75;
      coeff.peakModifier *= 1.2;
    }

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
  glucoseCurve(food, coeff) {
    const baseline = 5.0;
    const carbsTotal = (food.carbs * food.portion / 100);
    const gi = food.gi;

    if (gi === 0 || carbsTotal < 1) {
      return { peak: baseline + 0.3, peakTime: 60, returnTime: 120, timeline: [] };
    }

    const gl = (gi * carbsTotal) / 100;
    const peakRise = (gl * 0.12) * coeff.peakModifier;
    const peak = Math.min(baseline + peakRise, 15);
    const peakTime = gi > 70 ? 35 : gi > 50 ? 50 : 70;
    const returnTime = peakTime + Math.round(90 / coeff.insulinSensitivity);

    const timeline = [];
    for (let t = 0; t <= 240; t += 10) {
      let glucose;
      if (t <= peakTime) {
        glucose = baseline + peakRise * Math.sin((Math.PI / 2) * (t / peakTime));
      } else if (t <= returnTime) {
        const progress = (t - peakTime) / (returnTime - peakTime);
        glucose = peak - (peak - baseline) * progress;
      } else {
        const overshoot = peakRise > 2 ? 0.3 : 0;
        glucose = baseline - overshoot * Math.exp(-(t - returnTime) / 60);
      }
      timeline.push({ t, glucose: Math.round(glucose * 10) / 10 });
    }

    return { peak: Math.round(peak * 10) / 10, peakTime, returnTime, timeline };
  },

  // === КРИВАЯ ПИКА ДЛЯ ВСЕГО ПРИЁМА ПИЩИ ===
  // foods: [{name, portion, gi, carbs, fat, protein, fiber, caffeine}]
  // Модифицирует форму пика с учётом всех макро в одном событии.
  mealCurve(foods, coeff) {
    const baseline = 5.0;
    let totalCarbs = 0, totalFat = 0, totalProtein = 0;
    let fiberPresent = false, caffeinePresent = false;
    let giNumerator = 0, giDenominator = 0;

    for (const f of foods) {
      const portion = f.portion || 100;
      const carbsG = (f.carbs || 0) * portion / 100;
      const fatG = (f.fat || 0) * portion / 100;
      const proteinG = (f.protein || 0) * portion / 100;
      totalCarbs += carbsG;
      totalFat += fatG;
      totalProtein += proteinG;
      if (f.fiber) fiberPresent = true;
      if (f.caffeine) caffeinePresent = true;
      if ((f.gi || 0) > 0 && carbsG > 0) {
        giNumerator += f.gi * carbsG;
        giDenominator += carbsG;
      }
    }

    if (totalCarbs < 1 || giDenominator === 0) {
      return { peak: baseline + 0.3, peakTime: 60, returnTime: 120, timeline: [],
               macros: { carbs: 0, fat: Math.round(totalFat), protein: Math.round(totalProtein),
                         fiber: fiberPresent, caffeine: caffeinePresent } };
    }

    const giAvg = giNumerator / giDenominator;
    const gl = (giAvg * totalCarbs) / 100;
    const baseRise = (gl * 0.12) * coeff.peakModifier;

    const carbsRef = Math.max(totalCarbs, 10);
    const fatRatio = totalFat / carbsRef;
    const proteinRatio = totalProtein / carbsRef;

    const fiberMod = fiberPresent ? 0.85 : 1.0;
    const fatMod = 1 - Math.min(0.4, fatRatio * 0.5);
    const proteinMod = 1 - Math.min(0.3, proteinRatio * 0.3);
    const caffeineMod = caffeinePresent ? 1.15 : 1.0;

    const peakRise = baseRise * fatMod * proteinMod * fiberMod * caffeineMod;
    const peak = Math.min(baseline + peakRise, 15);

    const baseTime = giAvg > 70 ? 35 : giAvg > 50 ? 50 : 70;
    const fatDelay = Math.min(30, fatRatio * 30);
    const fiberDelay = fiberPresent ? 15 : 0;
    const peakTime = Math.round(baseTime + fatDelay + fiberDelay);

    const baseDecay = Math.round(90 / coeff.insulinSensitivity);
    const proteinExtension = Math.min(60, totalProtein * 1.5);
    // Кофеин держит инсулиновую резистентность 3-5 часов — для эпизода это +30 мин длительности.
    const caffeineExtension = caffeinePresent ? 30 : 0;
    // Быстрые углеводы у преддиабетика дают долгий эпизод: дополнительный коэффициент.
    const highGIExtension = (giAvg > 70 && coeff.insulinSensitivity < 0.9) ? 20 : 0;
    const returnTime = peakTime + baseDecay + Math.round(proteinExtension) + caffeineExtension + highGIExtension;

    const timeline = [];
    for (let t = 0; t <= 240; t += 10) {
      let glucose;
      if (t <= peakTime) {
        glucose = baseline + peakRise * Math.sin((Math.PI / 2) * (t / peakTime));
      } else if (t <= returnTime) {
        const progress = (t - peakTime) / (returnTime - peakTime);
        glucose = peak - (peak - baseline) * progress;
      } else {
        const overshoot = peakRise > 2 ? 0.3 : 0;
        glucose = baseline - overshoot * Math.exp(-(t - returnTime) / 60);
      }
      timeline.push({ t, glucose: Math.round(glucose * 10) / 10 });
    }

    return {
      peak: Math.round(peak * 10) / 10,
      peakTime, returnTime, timeline,
      macros: {
        carbs: Math.round(totalCarbs),
        fat: Math.round(totalFat),
        protein: Math.round(totalProtein),
        fiber: fiberPresent,
        caffeine: caffeinePresent
      }
    };
  },

  // === РАСЧЁТ НАГРУЗКИ ДЛЯ ОБМЕНА ===
  exerciseExchange(food, profile) {
    const carbsTotal = (food.carbs * food.portion / 100);
    const kcal = (food.kcal * food.portion / 100);
    const weight = parseInt(profile.weight) || 75;

    const squats = Math.round(kcal / (0.5 * weight / 75));
    const walkMinutes = Math.round(kcal / (4 * weight / 75));
    const runMinutes = Math.round(kcal / (10 * weight / 75));

    return { squats, walkMinutes, runMinutes, kcal: Math.round(kcal), carbsG: Math.round(carbsTotal) };
  },

  // === ВРЕМЯ СУТОК — ВЛИЯНИЕ ===
  timeOfDayEffect(hour) {
    if (hour === undefined || hour === null) { hour = (typeof Time !== 'undefined' ? Time.nowParts().hour : new Date().getHours()); }
    if (hour >= 6 && hour < 10) return { modifier: 0.9, note: 'Утро — чувствительность к инсулину максимальная' };
    if (hour >= 10 && hour < 14) return { modifier: 1.0, note: 'День — нормальная чувствительность' };
    if (hour >= 14 && hour < 18) return { modifier: 1.05, note: 'После обеда — небольшое снижение чувствительности' };
    if (hour >= 18 && hour < 21) return { modifier: 1.15, note: 'Вечер — чувствительность снижена' };
    return { modifier: 1.3, note: 'Ночь — чувствительность к инсулину минимальная, еда ляжет тяжелее' };
  },

  // === ВТОРИЧНЫЕ ПРОЦЕССЫ (не глюкоза) ===
  secondaryProcess(food) {
    const processes = [];
    const portion = food.portion || 100;

    // Белок: аминокислоты → синтез → спад
    const proteinG = (food.protein || 0) * portion / 100;
    if (proteinG > 5) {
      const timeline = [];
      const peakTime = 150; // 2.5ч до пика аминокислот
      const duration = 300; // 5ч общая длительность
      for (let t = 0; t <= duration; t += 10) {
        let level;
        if (t <= peakTime) {
          level = (proteinG / 30) * Math.sin((Math.PI / 2) * (t / peakTime));
        } else {
          level = (proteinG / 30) * Math.cos((Math.PI / 2) * ((t - peakTime) / (duration - peakTime)));
        }
        timeline.push({ t, value: Math.round(Math.max(0, level) * 100) / 100 });
      }
      processes.push({
        type: 'protein',
        label: 'белок',
        color: '#64b5f6', // голубой
        peakTime,
        duration,
        intensity: Math.min(proteinG / 30, 1),
        timeline,
        description: proteinG.toFixed(0) + 'г белка → синтез мышц ' + Math.round(duration / 60) + 'ч'
      });
    }

    // Кофеин: быстрый пик → долгий полураспад
    if (food.caffeine) {
      const timeline = [];
      const peakTime = 40;
      const halfLife = 300; // 5 часов
      for (let t = 0; t <= 480; t += 10) {
        let level;
        if (t <= peakTime) {
          level = Math.sin((Math.PI / 2) * (t / peakTime));
        } else {
          level = Math.exp(-0.693 * (t - peakTime) / halfLife);
        }
        timeline.push({ t, value: Math.round(level * 100) / 100 });
      }
      processes.push({
        type: 'caffeine',
        label: 'кофеин',
        color: '#ffb74d', // оранжевый
        peakTime,
        duration: 480,
        intensity: 0.8,
        timeline,
        description: 'пик бодрости через 40 мин, действует ~5ч'
      });
    }

    // Гидратация
    if (food.hydration) {
      const timeline = [];
      for (let t = 0; t <= 120; t += 10) {
        let level;
        if (t <= 20) {
          level = t / 20;
        } else {
          level = Math.max(0, 1 - (t - 20) / 100);
        }
        timeline.push({ t, value: Math.round(level * 100) / 100 });
      }
      processes.push({
        type: 'hydration',
        label: 'гидратация',
        color: '#4fc3f7', // синий
        peakTime: 20,
        duration: 120,
        intensity: 0.6,
        timeline,
        description: 'усвоение воды ~20 мин'
      });
    }

    // Жир: медленное переваривание
    const fatG = (food.fat || 0) * portion / 100;
    if (fatG > 5) {
      const timeline = [];
      const peakTime = 180; // 3ч
      const duration = 360; // 6ч
      for (let t = 0; t <= duration; t += 10) {
        let level;
        if (t <= peakTime) {
          level = (fatG / 25) * Math.sin((Math.PI / 2) * (t / peakTime));
        } else {
          level = (fatG / 25) * Math.cos((Math.PI / 2) * ((t - peakTime) / (duration - peakTime)));
        }
        timeline.push({ t, value: Math.round(Math.max(0, level) * 100) / 100 });
      }
      processes.push({
        type: 'fat',
        label: 'жиры',
        color: '#ce93d8', // сиреневый
        peakTime,
        duration,
        intensity: Math.min(fatG / 25, 1),
        timeline,
        description: fatG.toFixed(0) + 'г жира → переваривание ' + Math.round(duration / 60) + 'ч'
      });
    }

    // Клетчатка: замедляет всасывание
    if (food.fiber) {
      processes.push({
        type: 'fiber',
        label: 'клетчатка',
        color: '#81c784', // зелёный
        peakTime: 0,
        duration: 0,
        intensity: 0.3,
        timeline: [],
        description: 'замедляет всасывание углеводов'
      });
    }

    // Молочные продукты: кальций + казеин (медленный белок)
    if (food.dairy) {
      const timeline = [];
      const peakTime = 120; // кальций усваивается 2ч
      const duration = 240;
      for (let t = 0; t <= duration; t += 10) {
        let level;
        if (t <= peakTime) {
          level = 0.7 * Math.sin((Math.PI / 2) * (t / peakTime));
        } else {
          level = 0.7 * Math.cos((Math.PI / 2) * ((t - peakTime) / (duration - peakTime)));
        }
        timeline.push({ t, value: Math.round(Math.max(0, level) * 100) / 100 });
      }
      processes.push({
        type: 'dairy',
        label: 'кальций',
        color: '#e0e0e0', // светло-серый
        peakTime,
        duration,
        intensity: 0.5,
        timeline,
        description: 'кальций + казеин → усвоение 2-4ч'
      });
    }

    return processes;
  },

  // === ГЛАВНЫЙ МЕТОД: анализ события ===
  // === ПАРСЕР ЗАМЕРОВ ГЛЮКОЗЫ ===
  // «утром 6.2», «после еды 8.5 ммоль», «натощак 5.4», «вечером 7.1»
  parseGlucose(text) {
    if (!text) return null;
    // Цифра вида X.Y или X,Y в диапазоне глюкозы крови (2.5-25 ммоль/л)
    const matches = [...text.matchAll(/(\d{1,2})[.,](\d{1,2})\s*(ммоль|ммл|mmol)?/gi)];
    if (!matches.length) return null;
    const t = text.toLowerCase();
    // Исключения: давление 140/90, рост 183 см, вес 77 кг — не глюкоза
    const isBloodPressure = /\d{2,3}\s*\/\s*\d{2,3}/.test(t);
    for (const m of matches) {
      const value = parseFloat(m[1] + '.' + m[2]);
      if (value < 2.5 || value > 25) continue;
      // Если рядом «кг» / «см» / «лет» — это не глюкоза
      const ctx = t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
      if (/(кг|килограмм|см|сантиметр|лет|года|год)\b/.test(ctx)) continue;
      if (isBloodPressure && m[2].length === 2 && /\d/.test(t[m.index + m[0].length] || '')) continue;
      return {
        value,
        type: this._detectGlucoseType(t),
        source: 'manual',
        time: Date.now(),
        raw: m[0]
      };
    }
    return null;
  },

  _detectGlucoseType(t) {
    // word-boundary не работает с кириллицей, используем lookahead
    if (/натощак|с утра|утром(?![а-яё])/.test(t)) return 'fasting';
    if (/после еды|после завтрак|после обед|после ужин|через час после|через 2 часа после|через два часа после/.test(t)) return 'postprandial';
    if (/перед сном|на ночь|вечером(?![а-яё])/.test(t)) return 'bedtime';
    if (/до еды|перед едой/.test(t)) return 'preprandial';
    return 'random';
  },

  // === АНАЛИЗ ЕДЫ И ПРОДУКТОВ ===
  analyze(text, profile) {
    const foods = this.parseFood(text);
    if (foods.length === 0) return null;

    const coeff = this.getCoefficients(profile || {});
    const timeEffect = this.timeOfDayEffect();
    coeff.peakModifier *= timeEffect.modifier;

    const results = foods.map(food => {
      const curve = this.glucoseCurve(food, coeff);
      const exchange = this.exerciseExchange(food, profile || {});
      const secondary = this.secondaryProcess(food);
      return {
        name: food.name,
        portion: food.portion,
        kcal: Math.round(food.kcal * food.portion / 100),
        gi: food.gi,
        curve,
        exchange,
        secondary
      };
    });

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

    // Вторичные процессы
    for (const food of analysis.foods) {
      if (food.secondary && food.secondary.length > 0) {
        for (const proc of food.secondary) {
          text += `\n${food.name}: ${proc.description}`;
        }
      }
    }

    text += '\n\nИспользуй эти данные в ответе — проговори последствия во времени, не показывай цифры напрямую (кроме ккал и минут ходьбы). Говори как друг, не как калькулятор.';
    text += '\n[/РАСЧЁТ ДВИЖКА]';

    return text;
  },
  // === ЯКОРЬ ДНЯ + НАКОПЛЕНИЕ СОБЫТИЙ ===
  _dayEvents: [],
  dayStart: null,   // минута дня — время подъёма, начало оси графика

  clearDay() {
    this._dayEvents = [];
    this.dayStart = null;
  },

  setDayStart(minute) {
    if (typeof minute === 'number' && minute >= 0 && minute < 1440) {
      this.dayStart = minute;
    }
  },

  // === ПАРСИНГ ВРЕМЕНИ ИЗ ТЕКСТА ===
  // Возвращает { minute, certain } или null
  parseEventTime(text) {
    const t = text.toLowerCase();
    const _tp = (typeof Time !== 'undefined' ? Time.nowParts() : null);
    const nowMin = _tp ? _tp.minuteOfDay : (new Date().getHours()*60 + new Date().getMinutes());
    let m;

    // "только что", "сейчас", "прямо сейчас"
    if (/только что|прямо сейчас|сию минуту|пару минут назад/.test(t)) {
      return { minute: nowMin, certain: true };
    }

    // "N часов назад"
    if (m = t.match(/(\d+)\s*(час|часа|часов)\s*назад/)) {
      return { minute: nowMin - parseInt(m[1]) * 60, certain: true };
    }
    if (/(?:^|\s)час назад/.test(t)) return { minute: nowMin - 60, certain: true };
    if (/полчаса назад|пол часа назад/.test(t)) return { minute: nowMin - 30, certain: true };

    // "N минут назад"
    if (m = t.match(/(\d+)\s*(минут|минуты|мин)\s*назад/)) {
      return { minute: nowMin - parseInt(m[1]), certain: true };
    }

    // Явное время "8:30", "в 14.00"
    if (m = t.match(/\b(\d{1,2})[:.](\d{2})\b/)) {
      const h = parseInt(m[1]), mm = parseInt(m[2]);
      if (h < 24 && mm < 60) return { minute: h * 60 + mm, certain: true };
    }

    // "в 8 утра", "в 14 часов", "в 7 вечера"
    if (m = t.match(/в\s+(\d{1,2})\s*(?:час|часа|часов)?\s*(утра|дня|вечера|ночи)?/)) {
      let h = parseInt(m[1]);
      const period = m[2];
      if ((period === 'дня' || period === 'вечера') && h < 12) h += 12;
      if (period === 'ночи' && h === 12) h = 0;
      if (period === 'утра' && h === 12) h = 0;
      if (h < 24) return { minute: h * 60, certain: true };
    }

    return null;
  },

  // Поймать время подъёма: "встал в 7", "проснулся в 6:30"
  detectWake(text) {
    const t = text.toLowerCase();
    if (/встал|проснул|подъём|подъем|просыпа/.test(t)) {
      const time = this.parseEventTime(text);
      if (time && time.certain) {
        this.setDayStart(time.minute);
        return time.minute;
      }
    }
    return null;
  },

  addEvent(text, profile, opts) {
    const foods = this.parseFood(text);
    if (foods.length === 0) return null;

    const coeff = this.getCoefficients(profile || {});
    const _tp4 = (typeof Time !== 'undefined' ? Time.nowParts() : null);
    const nowMin = _tp4 ? _tp4.minuteOfDay : (new Date().getHours()*60 + new Date().getMinutes());

    // Определяем время события
    let eventMinute, timeCertain;
    if (opts && typeof opts.minute === 'number') {
      eventMinute = opts.minute;
      timeCertain = opts.certain !== false;
    } else {
      const parsed = this.parseEventTime(text);
      if (parsed) {
        eventMinute = parsed.minute;
        timeCertain = parsed.certain;
      } else {
        eventMinute = nowMin;
        timeCertain = false;   // время не указано — под вопросом
      }
    }
    if (eventMinute < 0) eventMinute = 0;
    if (eventMinute >= 1440) eventMinute = 1439;

    const hour = Math.floor(eventMinute / 60);
    const timeEffect = this.timeOfDayEffect(hour);
    coeff.peakModifier *= timeEffect.modifier;

    // Одна кривая на весь приём пищи — учитывает состав
    const mealC = this.mealCurve(foods, coeff);

    const event = {
      eventMinute,
      timeCertain,
      hour,
      minute: eventMinute % 60,
      curve: mealC,
      macros: mealC.macros || null,
      foods: foods.map(food => ({
        name: food.name,
        portion: food.portion,
        gi: food.gi,
        carbs: food.carbs,
        kcal: Math.round(food.kcal * food.portion / 100),
        defaultPortion: food.defaultPortion === true
      }))
    };

    this._dayEvents.push(event);
    return event;
  },

  // === ТОЧКИ ДЛЯ ГРАФИКА ===
  getCurvePoints(profile) {
    const baseline = 5.0;
    const _tp2 = (typeof Time !== 'undefined' ? Time.nowParts() : null);
    const nowMin = _tp2 ? _tp2.minuteOfDay : (new Date().getHours()*60 + new Date().getMinutes());

    const grid = {};
    for (let m = 0; m < 1440; m += 10) grid[m] = baseline;

    for (const event of this._dayEvents) {
      const timeline = event.curve && event.curve.timeline;
      if (!timeline || timeline.length === 0) continue;
      for (const point of timeline) {
        const absMin = event.eventMinute + point.t;
        if (absMin >= 1440) continue;
        const snapMin = Math.round(absMin / 10) * 10;
        if (snapMin < 1440) {
          grid[snapMin] = Math.max(grid[snapMin],
            baseline + (point.glucose - baseline) + (grid[snapMin] - baseline) * 0.3);
        }
      }
    }

    // Диапазон оси: от подъёма (или первого события) до now+2ч (или конца кривых)
    let startMin = 0, endMin = 1440;
    if (this._dayEvents.length > 0) {
      const firstEvent = Math.min(...this._dayEvents.map(e => e.eventMinute));
      const lastCurveEnd = Math.max(...this._dayEvents.map(e => e.eventMinute + 240));
      startMin = this.dayStart != null
        ? Math.min(this.dayStart, firstEvent - 30)
        : Math.max(0, firstEvent - 60);
      endMin = Math.min(1440, Math.max(lastCurveEnd, nowMin + 120));
    }
    startMin = Math.max(0, startMin);

    const points = [];
    for (let m = 0; m < 1440; m += 10) {
      if (m < startMin || m > endMin) continue;
      const h = Math.floor(m / 60);
      points.push({
        minute: m,
        hour: h,
        label: `${h}:${(m % 60).toString().padStart(2, '0')}`,
        glucose: Math.round(grid[m] * 10) / 10,
        fact: m <= nowMin   // true = уже было, false = прогноз
      });
    }

    const eventMarkers = this._dayEvents.map(e => ({
      minute: e.eventMinute,
      timeLabel: `${e.hour}:${(e.eventMinute % 60).toString().padStart(2, '0')}`,
      certain: e.timeCertain,
      label: e.foods.map(f => f.name).join(', '),
      kcal: e.foods.reduce((s, f) => s + f.kcal, 0),
      hasDefaultPortion: e.foods.some(f => f.defaultPortion === true),
      unspecifiedFoods: e.foods.filter(f => f.defaultPortion === true).map(f => f.name)
    }));

    // Вторичные процессы
    const secondaryTimelines = {};
    for (const event of this._dayEvents) {
      for (const food of event.foods) {
        if (!food.secondary) continue;
        for (const proc of food.secondary) {
          if (!proc.timeline || proc.timeline.length === 0) continue;
          if (!secondaryTimelines[proc.type]) {
            secondaryTimelines[proc.type] = { label: proc.label, color: proc.color, points: {} };
          }
          for (const p of proc.timeline) {
            const absMin = event.eventMinute + p.t;
            const snapMin = Math.round(absMin / 10) * 10;
            if (snapMin < 1440) {
              secondaryTimelines[proc.type].points[snapMin] =
                Math.max(secondaryTimelines[proc.type].points[snapMin] || 0, p.value);
            }
          }
        }
      }
    }

    const secondary = Object.entries(secondaryTimelines).map(([type, data]) => ({
      type,
      label: data.label,
      color: data.color,
      points: Object.entries(data.points)
        .map(([m, v]) => ({ minute: Number(m), value: v }))
        .filter(p => p.minute >= startMin && p.minute <= endMin)
        .sort((a, b) => a.minute - b.minute)
    })).filter(s => s.points.length >= 2);

    // Замеры глюкозы из Storage (фактические точки)
    let measurements = [];
    if (typeof Storage !== 'undefined' && Storage.getGlucoseLog) {
      const today = new Date();
      const dayStartTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const log = Storage.getGlucoseLog() || [];
      measurements = log
        .filter(m => m.time >= dayStartTs)
        .map(m => {
          const d = new Date(m.time);
          return { minute: d.getHours() * 60 + d.getMinutes(), value: m.value, type: m.type };
        })
        .filter(m => m.minute >= startMin && m.minute <= endMin);
    }

    return {
      points, events: eventMarkers, baseline, secondary, measurements,
      nowMinute: nowMin,
      dayStart: this.dayStart,
      hasUncertain: this._dayEvents.some(e => !e.timeCertain)
    };
  },

  // === ПОДСКАЗКА «РЫЧАГА» ===
  // Возвращает {needed, peak, peakInMinutes, abstainHours, prediabetes} или null
  computeLeverHint(event, profile) {
    if (!event || !event.curve) return null;
    const peak = event.curve.peak;
    const isPredia = !!(profile && profile.prediabetes);

    // Триггер: для предиабета чувствительный порог 6.7, иначе 7.8
    const threshold = isPredia ? 6.7 : 7.8;
    if (peak < threshold) return null;

    const nowMin = (typeof Time !== 'undefined' ? Time.nowParts().minuteOfDay : new Date().getHours()*60 + new Date().getMinutes());
    const eventMin = event.eventMinute;
    // Время от «сейчас» до пика
    const peakAbsMin = eventMin + event.curve.peakTime;
    let peakInMinutes = peakAbsMin - nowMin;
    if (peakInMinutes < 0) peakInMinutes = 0;
    // Время от «сейчас» до возврата к норме
    const returnAbsMin = eventMin + event.curve.returnTime;
    let returnInMinutes = returnAbsMin - nowMin;
    if (returnInMinutes < 0) returnInMinutes = 0;
    const abstainHours = Math.max(1, Math.round(returnInMinutes / 60));

    return {
      needed: true,
      peak,
      peakInMinutes,
      abstainHours,
      prediabetes: isPredia,
      // Для предиабета приоритет — воздержание/замедление (скорость пика опасна)
      preferAbstain: isPredia
    };
  },

  // === АНАЛИЗ + ТОЧКИ ДЛЯ ГРАФИКА ===
  analyzeWithChart(text, profile) {
    const analysis = this.analyze(text, profile);
    if (!analysis) return null;

    this.detectWake(text);
    const event = this.addEvent(text, profile);
    const chartData = this.getCurvePoints(profile);
    const leverHint = this.computeLeverHint(event, profile);

    return {
      analysis,
      chartData,
      timeUncertain: event ? !event.timeCertain : false,
      leverHint
    };
  },

  // getDayData — данные для нового графика "Картина дня" по реальным замерам.
  // Возвращает измерения, события еды, рабочие нагрузки и персональную медиану.
  // НЕ моделирует кривую — это работа врача и реального прибора, не наша.
  getDayData(profile) {
    const _tp = (typeof Time !== 'undefined' ? Time.nowParts() : null);
    const nowDate = new Date();
    const nowMin = _tp ? _tp.minuteOfDay : (nowDate.getHours()*60 + nowDate.getMinutes());
    const todayISO = _tp ? _tp.dateISO : nowDate.toISOString().slice(0,10);

    const _toMinute = (ms) => {
      const d = new Date(ms);
      return d.getHours()*60 + d.getMinutes();
    };
    const _isToday = (ms) => {
      const d = new Date(ms);
      const iso = d.getFullYear() + '-' +
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0');
      return iso === todayISO;
    };

    let measurements = [];
    if (typeof Storage !== 'undefined' && Storage.getGlucoseLog) {
      const log = Storage.getGlucoseLog() || [];
      measurements = log
        .filter(g => _isToday(g.time))
        .map(g => ({ minute: _toMinute(g.time), value: g.value, type: g.type || 'random' }))
        .sort((a, b) => a.minute - b.minute);
    }

    let foodEvents = [];
    if (this._dayEvents && this._dayEvents.length > 0) {
      foodEvents = this._dayEvents.map(e => ({
        minute: e.eventMinute,
        label: e.foods.map(f => f.name).join(', '),
        certain: e.timeCertain !== false
      }));
    } else if (typeof Storage !== 'undefined' && Storage.getFoodLog) {
      const log = Storage.getFoodLog() || [];
      foodEvents = log
        .filter(f => _isToday(f.time))
        .map(f => ({
          minute: _toMinute(f.time),
          label: (f.foods || '').toString(),
          certain: f.certain !== false
        }));
    }
    foodEvents.sort((a, b) => a.minute - b.minute);

    let workloadEvents = [];
    if (this.hasActiveWorkload && this.hasActiveWorkload()) {
      const w = this.getActiveWorkload();
      if (w && w.startMinute != null) {
        workloadEvents.push({
          minute: w.startMinute,
          kind: w.kind || 'движение',
          durationMin: (w.hours || 0) * 60
        });
      }
    }

    let baseline = null;
    if (typeof Storage !== 'undefined' && Storage.getGlucoseLog) {
      const log = Storage.getGlucoseLog() || [];
      const cutoff = Date.now() - 14*24*60*60*1000;
      const vals = log.filter(g => g.time >= cutoff).map(g => g.value).sort((a,b) => a-b);
      if (vals.length >= 5) {
        baseline = vals[Math.floor(vals.length / 2)];
      }
    }

    const contextLabels = [];
    for (let i = 1; i < measurements.length; i++) {
      const cur = measurements[i];
      const prev = measurements[i-1];
      if (cur.value >= prev.value) continue;
      const recentMove = workloadEvents.find(w =>
        w.minute < cur.minute && (cur.minute - w.minute) <= 60
      );
      if (recentMove) {
        contextLabels.push({ measurementIdx: i, text: 'после движения — ниже' });
      }
    }

    let dayStart = 6*60;
    let dayEnd = 24*60;
    if (measurements.length > 0) {
      dayStart = Math.min(dayStart, Math.max(0, measurements[0].minute - 30));
      dayEnd = Math.max(dayEnd, Math.min(24*60, measurements[measurements.length-1].minute + 60));
    }

    return {
      measurements,
      foodEvents,
      workloadEvents,
      baseline,
      contextLabels,
      nowMin,
      dayStart,
      dayEnd
    };
  }

};
