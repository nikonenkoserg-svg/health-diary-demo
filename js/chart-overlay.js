// ChartOverlay — слой над графиком с числами и рычагом
// Определяет фазу (1 прогноз / 2 активная / 3 ретроспектива) и обновляет блоки HTML.
// Подключается после chart.js. Спецификация: projects/health-diary/CHART-SPEC-v1.md

const ChartOverlay = {
  PHASE: { PROGNOSIS: 1, ACTIVE: 2, RETROSPECTIVE: 3 },

  // Граница фазы 1→2 жёстко 5 минут после приёма пищи
  PHASE1_DURATION_MIN: 5,

  // Определяет фазу по событию и текущему моменту
  computePhase(event, nowMin) {
    if (!event) return null;
    const sinceEaten = nowMin - event.minute;
    if (sinceEaten < this.PHASE1_DURATION_MIN) return this.PHASE.PROGNOSIS;
    // Если в фактическом массиве уже есть точка ниже 5.5/7.8 после пика — фаза 3
    if (event.returnedToNormalAt != null && nowMin >= event.returnedToNormalAt) {
      return this.PHASE.RETROSPECTIVE;
    }
    return this.PHASE.ACTIVE;
  },

  // Главный метод — обновляет всю обвязку по последнему активному событию
  update(chartData) {
    if (!chartData) { this._clear(); return; }
    const events = chartData.events || [];
    const points = chartData.points || [];
    if (!events.length || !points.length) { this._clear(); return; }

    const nowMin = chartData.nowMinute || this._nowMinute();
    // Объединяем события в одну трапезу если интервал между ними < 60 минут
    const last = events[events.length - 1];
    const recent = events.filter(e => Math.abs(e.minute - last.minute) < 60);
    const merged = {
      minute: recent[0].minute,
      label: recent.map(e => e.label).join(', '),
      kcal: recent.reduce((sum, e) => sum + (e.kcal || 0), 0),
      hasDefaultPortion: recent.some(e => e.hasDefaultPortion === true),
      unspecifiedFoods: recent.flatMap(e => e.unspecifiedFoods || []),
      certain: last.certain
    };

    const phase = this.computePhase(merged, nowMin);
    if (!phase) { this._clear(); return; }

    // Считаем пик и возврат к норме по фактическому массиву + прогнозу
    const peak = this._findPeak(points);
    const inZoneInfo = this._timeInZone(points, merged.minute, peak, nowMin);

    const data = {
      phase,
      event: merged,
      peak,
      nowMin,
      currentGlucose: this._currentGlucose(points, nowMin),
      trend: this._trend(points, nowMin),
      inZone: inZoneInfo,
      returnedAt: merged.returnedToNormalAt
    };

    this._setPhaseLabel(phase);
    this._setHeadline(data);
    this._setFoods(merged);

    const panel = document.getElementById('chart-panel');
    if (panel) panel.classList.toggle('phase-3', phase === this.PHASE.RETROSPECTIVE);

    if (phase === this.PHASE.RETROSPECTIVE) {
      this._renderRetro(data, chartData);
      // В ретро ключевые числа НЕ дублируются вверху — они в карточках
      const el = document.getElementById('chart-key-numbers');
      if (el) el.innerHTML = '';
    } else {
      this._setKeyNumbers(data);
    }
    this._setLeverCard(data);
  },

  _renderRetro(data, chartData) {
    const peak = data.peak;
    const inZone = data.inZone;
    // Главные числа
    const pv = document.getElementById('retro-peak-value');
    const pt = document.getElementById('retro-peak-time');
    const rt = document.getElementById('retro-return-time');
    const zt = document.getElementById('retro-zone-time');
    const zr = document.getElementById('retro-zone-range');
    if (pv) pv.textContent = peak.glucose.toFixed(1);
    if (pt) pt.textContent = 'в ' + this._minuteToClock(peak.minute);
    if (rt) rt.textContent = inZone.leftAt != null ? this._minuteToClock(inZone.leftAt) : '—';
    if (zt) zt.textContent = this._formatHM(inZone.totalMin);
    if (zr) {
      const startMin = inZone.leftAt != null ? inZone.leftAt - inZone.totalMin : null;
      zr.textContent = startMin != null
        ? 'с ' + this._minuteToClock(startMin) + ' до ' + this._minuteToClock(inZone.leftAt)
        : '';
    }
    // Sparkline
    this._drawSparkline(chartData);
  },

  _drawSparkline(chartData) {
    const canvas = document.getElementById('retro-sparkline');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth - 28 || 280;
    const h = 70;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const points = chartData.points || [];
    if (points.length < 2) return;
    const minMin = points[0].minute;
    const maxMin = points[points.length - 1].minute;
    const minG = Math.min(4.0, Math.min(...points.map(p => p.glucose)) - 0.3);
    const maxG = Math.max(8.5, Math.max(...points.map(p => p.glucose)) + 0.8);

    const xs = (m) => 6 + ((m - minMin) / (maxMin - minMin || 1)) * (w - 12);
    const ys = (g) => 12 + (1 - (g - minG) / (maxG - minG)) * (h - 24);

    // линия
    ctx.beginPath();
    ctx.moveTo(xs(points[0].minute), ys(points[0].glucose));
    for (let i = 1; i < points.length; i++) ctx.lineTo(xs(points[i].minute), ys(points[i].glucose));
    ctx.strokeStyle = '#c44762';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Маркер пика
    const peak = points.reduce((b, p) => p.glucose > b.glucose ? p : b, points[0]);
    ctx.beginPath();
    ctx.arc(xs(peak.minute), ys(peak.glucose), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#1c2128';
    ctx.fill();
    ctx.fillStyle = '#1c2128';
    ctx.font = 'bold 10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(peak.glucose.toFixed(1), xs(peak.minute), ys(peak.glucose) - 6);
  },

  // === ВСПОМОГАТЕЛЬНЫЕ ===

  _nowMinute() {
    if (typeof Time !== 'undefined') return Time.nowParts().minuteOfDay;
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  },

  _findPeak(points) {
    return points.reduce((b, p) => p.glucose > b.glucose ? p : b, points[0]);
  },

  _currentGlucose(points, nowMin) {
    const closest = points.reduce((b, p) =>
      Math.abs(p.minute - nowMin) < Math.abs(b.minute - nowMin) ? p : b, points[0]);
    return closest.glucose;
  },

  _trend(points, nowMin) {
    const near = points.filter(p => Math.abs(p.minute - nowMin) < 15);
    if (near.length < 2) return 'stable';
    const sorted = near.slice().sort((a, b) => a.minute - b.minute);
    const delta = sorted[sorted.length - 1].glucose - sorted[0].glucose;
    if (delta > 0.3) return 'rising';
    if (delta < -0.3) return 'falling';
    return 'stable';
  },

  _timeInZone(points, startMin, peak, nowMin) {
    const sorted = points.slice().sort((a, b) => a.minute - b.minute);
    // Когда впервые превысил 7.8
    let enteredAt = null;
    let leftAt = null;
    let prev = null;
    for (const p of sorted) {
      if (p.minute < startMin) { prev = p; continue; }
      if (enteredAt == null && p.glucose >= 7.8) enteredAt = p.minute;
      if (enteredAt != null && leftAt == null && p.glucose < 7.8 && p.minute > peak.minute) {
        leftAt = p.minute;
      }
      prev = p;
    }
    if (enteredAt == null) return { totalMin: 0, leftAt: null };
    const end = leftAt != null ? leftAt : sorted[sorted.length - 1].minute;
    return { totalMin: Math.max(0, end - enteredAt), leftAt };
  },

  _formatHM(totalMin) {
    if (totalMin == null || totalMin <= 0) return '0:00';
    const h = Math.floor(totalMin / 60);
    const m = Math.round(totalMin % 60);
    return h + ':' + String(m).padStart(2, '0');
  },

  // Диапазон для прогноза: округление до получаса с обеих сторон
  _formatRange(totalMin) {
    if (totalMin == null || totalMin <= 0) return '~0:00';
    const round30 = (v) => Math.max(0, Math.round(v / 30) * 30);
    const low = round30(totalMin - 15);
    const high = round30(totalMin + 15);
    return '~' + this._formatHM(low) + '–' + this._formatHM(high);
  },

  _minuteToClock(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h + ':' + String(m).padStart(2, '0');
  },

  // === РЕНДЕР ===

  _setPhaseLabel(phase) {
    const el = document.getElementById('chart-phase-label');
    if (!el) return;
    const map = {
      [this.PHASE.PROGNOSIS]: 'ПРОГНОЗ · ДО 5 МИН ПОСЛЕ ЕДЫ',
      [this.PHASE.ACTIVE]: 'СЕЙЧАС',
      [this.PHASE.RETROSPECTIVE]: 'ЭПИЗОД ЗАВЕРШЁН'
    };
    el.textContent = map[phase] || 'СЕГОДНЯ';
  },

  _setHeadline({ phase, event, peak, nowMin }) {
    const el = document.getElementById('chart-headline');
    if (!el) return;
    const txt = {
      [this.PHASE.PROGNOSIS]: 'Только что съел',
      [this.PHASE.ACTIVE]: peak.minute > nowMin ? 'Пик ещё впереди' : 'Возврат к норме',
      [this.PHASE.RETROSPECTIVE]: 'Приём в ' + this._minuteToClock(event.minute) + ' завершён'
    };
    el.textContent = txt[phase] || '';
  },

  _setFoods(event) {
    const el = document.getElementById('chart-foods-pill');
    if (!el) return;
    if (!event.label) { el.style.display = 'none'; return; }
    el.style.display = '';
    // Тильда если хоть один продукт без указанной порции
    const tilde = event.hasDefaultPortion ? '~' : '';
    const kcal = event.kcal ? ' · ' + tilde + event.kcal + ' ккал' : '';
    const hint = event.hasDefaultPortion ? ' · уточни граммы' : '';
    el.textContent = event.label + kcal + hint;
  },

  _setKeyNumbers({ phase, peak, currentGlucose, trend, inZone, nowMin }) {
    const el = document.getElementById('chart-key-numbers');
    if (!el) return;
    const trendArrow = trend === 'rising' ? ' ↑' : trend === 'falling' ? ' ↓' : '';
    let html = '';
    if (phase === this.PHASE.ACTIVE) {
      html =
        '<div class="kn-block"><span class="kn-label">сейчас</span>' +
        '<span class="kn-value">' + currentGlucose.toFixed(1) + trendArrow + '</span></div>' +
        '<div class="kn-block"><span class="kn-label">прогноз пика</span>' +
        '<span class="kn-value">' + peak.glucose.toFixed(1) + '</span>' +
        '<span class="kn-sub">в ' + this._minuteToClock(peak.minute) + '</span></div>' +
        '<div class="kn-block"><span class="kn-label">остаётся выше нормы</span>' +
        '<span class="kn-value">' + this._formatRange(inZone.totalMin) + '</span></div>';
    } else if (phase === this.PHASE.PROGNOSIS) {
      html =
        '<div class="kn-block"><span class="kn-label">прогноз пика</span>' +
        '<span class="kn-value">' + peak.glucose.toFixed(1) + '</span>' +
        '<span class="kn-sub">через ~' + Math.max(0, Math.round((peak.minute - nowMin) / 5) * 5) + ' мин</span></div>' +
        '<div class="kn-block"><span class="kn-label">прогноз времени в зоне</span>' +
        '<span class="kn-value">' + this._formatRange(inZone.totalMin) + '</span></div>';
    } else if (phase === this.PHASE.RETROSPECTIVE) {
      const leftAtTxt = inZone.leftAt != null ? this._minuteToClock(inZone.leftAt) : '—';
      html =
        '<div class="kn-block"><span class="kn-label">пик</span>' +
        '<span class="kn-value">' + peak.glucose.toFixed(1) + '</span>' +
        '<span class="kn-sub">в ' + this._minuteToClock(peak.minute) + '</span></div>' +
        '<div class="kn-block"><span class="kn-label">время в зоне выше нормы</span>' +
        '<span class="kn-value">' + this._formatHM(inZone.totalMin) + '</span></div>' +
        '<div class="kn-block"><span class="kn-label">опустился ниже 7.8 в</span>' +
        '<span class="kn-value">' + leftAtTxt + '</span></div>';
    }
    el.innerHTML = html;
  },

  _setLeverCard({ phase, peak, nowMin }) {
    const card = document.getElementById('chart-lever-card');
    const title = document.getElementById('chart-lever-title');
    const body = document.getElementById('chart-lever-body');
    if (!card || !title || !body) return;
    if (phase === this.PHASE.PROGNOSIS) {
      card.classList.remove('hidden');
      title.textContent = 'Пик впереди.';
      body.textContent = 'Ходьба 15 мин снизит до ~' + Math.max(5.5, peak.glucose - 3.4).toFixed(1) + ' ммоль/л.';
    } else if (phase === this.PHASE.ACTIVE && peak.minute > nowMin) {
      card.classList.remove('hidden');
      const minToPeak = peak.minute - nowMin;
      title.textContent = 'Пик через ' + Math.max(5, Math.round(minToPeak / 5) * 5) + ' мин.';
      body.textContent = 'Ходьба сейчас — единственный рычаг.';
    } else if (phase === this.PHASE.RETROSPECTIVE) {
      card.classList.remove('hidden');
      title.textContent = 'Пик ' + peak.glucose.toFixed(1) + '. Что в следующий раз?';
      body.innerHTML = '<a href="#" class="chart-lever-link">→ обсудить со Спутником</a>';
    } else {
      card.classList.add('hidden');
    }
  },

  _clear() {
    const el = (id) => document.getElementById(id);
    const headline = el('chart-headline'); if (headline) headline.textContent = '';
    const foods = el('chart-foods-pill'); if (foods) foods.textContent = '';
    const nums = el('chart-key-numbers'); if (nums) nums.innerHTML = '';
    const card = el('chart-lever-card'); if (card) card.classList.add('hidden');
  }
};

if (typeof window !== 'undefined') window.ChartOverlay = ChartOverlay;
