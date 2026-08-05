// Loads — движок накопителя микронагрузок. Пациент пишет «присел 20, отжался 15,
// планка 1 мин, прошёл 3000 шагов» — распознаём, копим за день, вечером отчёт.
// Калории — РАСЧЁТ по весу пациента (формула MET), не измерение: «~», честно оценка.
// Справочник хранит коэффициент нагрузки (MET), ккал считаются под вес в момент записи.

const Loads = {
  DEFAULT_WEIGHT: 70, // если вес неизвестен — средний, помечаем менее точным

  // kind: 'reps' — счётные; 'time' — по минутам; 'steps' — шаги.
  // stems — основы для токенного совпадения (кириллический \b не работает).
  EXERCISES: [
    { key: 'burpee',  label: 'бёрпи',              cat: 'всё тело', kind: 'reps',  met: 8.0, secPerRep: 4, stems: ['бёрпи', 'берпи'] },
    { key: 'jump',    label: 'прыжки',             cat: 'кардио',   kind: 'reps',  met: 7.7, secPerRep: 2, stems: ['прыжк', 'прыгал', 'джампинг'] },
    { key: 'lunge',   label: 'выпады',             cat: 'ноги',     kind: 'reps',  met: 4.0, secPerRep: 3, stems: ['выпад'] },
    { key: 'squat',   label: 'приседания',         cat: 'ноги',     kind: 'reps',  met: 5.0, secPerRep: 3, stems: ['присед', 'присел', 'присяд'] },
    { key: 'pushup',  label: 'отжимания',          cat: 'верх',     kind: 'reps',  met: 3.8, secPerRep: 3, stems: ['отжим', 'отжал', 'отжат'] },
    { key: 'calf',    label: 'подъёмы на носки',   cat: 'ноги',     kind: 'reps',  met: 2.8, secPerRep: 2, stems: ['на носк', 'на носоч', 'подъём на нос'] },
    { key: 'crunch',  label: 'скручивания',        cat: 'кор',      kind: 'reps',  met: 3.8, secPerRep: 3, stems: ['скручив', 'пресс'] },
    { key: 'bend',    label: 'наклоны',            cat: 'кор',      kind: 'reps',  met: 3.5, secPerRep: 3, stems: ['наклон'] },
    { key: 'plank',   label: 'планка',             cat: 'кор',      kind: 'time',  met: 3.3,               stems: ['планк'] },
    { key: 'run',     label: 'бег на месте',       cat: 'кардио',   kind: 'time',  met: 8.0,               stems: ['бег на мест', 'бегал на мест'] },
    { key: 'walk',    label: 'ходьба',             cat: 'кардио',   kind: 'steps', met: 3.5,               stems: ['шаг', 'шагов', 'прошёл', 'прошел', 'пройд', 'ходил', 'ходьб'] },
  ],

  _findExercise(clause) {
    const tokens = String(clause || '').toLowerCase().split(/[^а-яёa-z]+/).filter(Boolean);
    const joined = ' ' + tokens.join(' ') + ' ';
    for (const ex of this.EXERCISES) {
      for (const st of ex.stems) {
        // многословная основа («на носк», «бег на мест») — по подстроке склеенного;
        // односложная — по началу токена (склонение суффиксом).
        if (st.includes(' ')) { if (joined.includes(' ' + st) || joined.includes(st + ' ') || joined.includes(st)) return ex; }
        else { for (const tok of tokens) if (tok.startsWith(st)) return ex; }
      }
    }
    return null;
  },

  // Первое число в куске (целое). Возвращает {n, hasSec} — hasSec для «секунд».
  _firstNumber(clause) {
    const m = String(clause || '').match(/\d+/);
    const n = m ? parseInt(m[0], 10) : null;
    const hasSec = /сек|секунд/i.test(clause || '');
    return { n, hasSec };
  },

  // Разбор реплики → массив нагрузок [{key,label,cat,kind,qty,unit}].
  // Делим на куски по запятым/«и»/«;» — по одной нагрузке на кусок.
  parse(text) {
    const t = String(text || '');
    if (!t.trim()) return [];
    const clauses = t.split(/[,;]|\sи\s/i).map(c => c.trim()).filter(Boolean);
    const out = [];
    for (const cl of clauses) {
      const ex = this._findExercise(cl);
      if (!ex) continue;
      const { n, hasSec } = this._firstNumber(cl);
      let qty, unit;
      if (ex.kind === 'reps') { qty = n || null; unit = 'раз'; }
      else if (ex.kind === 'time') { qty = n != null ? (hasSec ? n / 60 : n) : 1; unit = 'мин'; }
      else if (ex.kind === 'steps') { qty = n || null; unit = 'шаг'; }
      if (qty == null || qty <= 0) continue; // нет количества — не пишем наугад
      out.push({ key: ex.key, label: ex.label, cat: ex.cat, kind: ex.kind, met: ex.met, secPerRep: ex.secPerRep || null, qty, unit });
    }
    return out;
  },

  // Калории под вес. Формула MET: ккал/мин = MET × 3.5 × вес / 200.
  // reps → минуты через secPerRep; time → минуты как есть; steps → каденс 100/мин.
  kcalFor(entry, weightKg) {
    if (!entry) return 0;
    const w = (weightKg && weightKg > 0) ? weightKg : this.DEFAULT_WEIGHT;
    const perMin = entry.met * 3.5 * w / 200;
    let minutes = 0;
    if (entry.kind === 'reps') minutes = entry.qty * (entry.secPerRep || 3) / 60;
    else if (entry.kind === 'time') minutes = entry.qty;
    else if (entry.kind === 'steps') minutes = entry.qty / 100;
    const kcal = perMin * minutes;
    return Math.round(kcal * 10) / 10;
  }
};

if (typeof window !== 'undefined') window.Loads = Loads;
if (typeof module !== 'undefined' && module.exports) module.exports = Loads;
