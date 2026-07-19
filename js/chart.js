// Chart — canvas-график "Картина дня. С прибором. Реальные замеры."
// Точки — реальные замеры. Линия — только между соседними замерами,
// если разрыв меньше GAP_THRESHOLD минут. Пропуски не достраиваем.
// Снизу — ось событий (еда / движение). НЕТ зон, оценок, прогнозов.

const Chart = {
  GAP_THRESHOLD_MIN: 120,

  _lastData: null,

  _draw(ctx, w, h, data) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
                   document.documentElement.getAttribute('data-theme') !== 'light';

    const S = h <= 200 ? 1 : Math.min(h / 200, 2.1);
    const font = (px, bold) => (bold ? 'bold ' : '') + Math.round(px * S) +
                 'px -apple-system, system-ui, sans-serif';

    const measurements = data.measurements || [];
    const foodEvents = data.foodEvents || [];
    const workloadEvents = data.workloadEvents || [];
    const contextLabels = data.contextLabels || [];

    const eventAxisH = (foodEvents.length || workloadEvents.length) ? 38 * S : 12 * S;

    const pad = {
      top: 26 * S,
      right: 18 * S,
      bottom: 30 * S + eventAxisH,
      left: 44 * S
    };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const minMin = data.dayStart != null ? data.dayStart : 6 * 60;
    const maxMin = data.dayEnd != null ? data.dayEnd : 24 * 60;

    const vals = measurements.map(m => m.value);
    const minG = vals.length ? Math.min(4.0, Math.min(...vals) - 0.5) : 4.0;
    const maxG = vals.length ? Math.max(9.0, Math.max(...vals) + 0.8) : 9.0;

    const xScale = (m) => pad.left + ((m - minMin) / (maxMin - minMin || 1)) * plotW;
    const yScale = (g) => pad.top + plotH - ((g - minG) / (maxG - minG)) * plotH;

    const txtDim = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    const lineColor = '#E07857';
    const dotColor = '#E07857';
    const baselineColor = isDark ? 'rgba(72,199,142,0.6)' : 'rgba(72,199,142,0.75)';

    // Сетка Y
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    const yTicks = [];
    const tickStep = (maxG - minG) > 6 ? 2 : 1;
    for (let g = Math.ceil(minG); g <= Math.floor(maxG); g += tickStep) yTicks.push(g);
    for (const g of yTicks) {
      const y = yScale(g);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    ctx.fillStyle = txtDim;
    ctx.font = font(9);
    ctx.textAlign = 'right';
    for (const g of yTicks) ctx.fillText(g.toString(), pad.left - 6, yScale(g) + 3 * S);
    ctx.textAlign = 'left';
    ctx.font = font(8.5);
    ctx.fillText('сахар, ммоль/л', pad.left, pad.top - 10 * S);

    // "Твоя обычная"
    if (data.baseline != null) {
      const by = yScale(data.baseline);
      ctx.strokeStyle = baselineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(pad.left, by);
      ctx.lineTo(pad.left + plotW, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = baselineColor;
      ctx.font = font(8.5);
      ctx.textAlign = 'right';
      ctx.fillText('твоя обычная', pad.left + plotW - 4, by - 4);
    }

    // Линии между соседними замерами
    ctx.lineWidth = 2.2 * Math.min(S, 1.5);
    for (let i = 1; i < measurements.length; i++) {
      const a = measurements[i - 1];
      const b = measurements[i];
      const gap = b.minute - a.minute;
      if (gap > this.GAP_THRESHOLD_MIN) continue;
      ctx.strokeStyle = lineColor;
      ctx.beginPath();
      ctx.moveTo(xScale(a.minute), yScale(a.value));
      ctx.lineTo(xScale(b.minute), yScale(b.value));
      ctx.stroke();
    }

    // Метки разрывов
    ctx.fillStyle = txtDim;
    ctx.font = font(8.5);
    ctx.textAlign = 'center';
    for (let i = 1; i < measurements.length; i++) {
      const a = measurements[i - 1];
      const b = measurements[i];
      const gap = b.minute - a.minute;
      if (gap <= this.GAP_THRESHOLD_MIN) continue;
      const midX = (xScale(a.minute) + xScale(b.minute)) / 2;
      const midY = (yScale(a.value) + yScale(b.value)) / 2;
      ctx.fillText('не достраиваем', midX, midY - 6);
      ctx.fillText('не мерил', midX, midY + 8);
    }

    // Точки + числа + контекстный лейбл.
    // Подписи-числа разводим при наложении: занятые прямоугольники запоминаем
    // и, если новая подпись пересекается, ставим её снизу / выше.
    const labelBoxes = [];
    const lblW = 26 * S, lblH = 15 * S;
    const collides = (cx, cy) => labelBoxes.some(b =>
      Math.abs(b.x - cx) < lblW && Math.abs(b.y - cy) < lblH);
    for (let i = 0; i < measurements.length; i++) {
      const m = measurements[i];
      const x = xScale(m.minute);
      const y = yScale(m.value);
      const r = 5 * Math.min(S, 1.5);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      // Позиция подписи: сверху → если занято, снизу → если и там занято, выше.
      let ly = y - r - 6 * S;
      if (collides(x, ly)) { ly = y + r + 12 * S; }
      if (collides(x, ly)) { ly = y - r - 6 * S - lblH; }
      if (collides(x, ly)) { ly = y + r + 12 * S + lblH; }
      labelBoxes.push({ x, y: ly });

      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)';
      ctx.font = font(11, true);
      ctx.textAlign = 'center';
      ctx.fillText(m.value.toFixed(1), x, ly);

      // Точное время замера под точкой — абсолютная привязка, не «на глаз» по оси.
      const hh = String(Math.floor(m.minute / 60)).padStart(2, '0');
      const mm = String(m.minute % 60).padStart(2, '0');
      ctx.fillStyle = txtDim;
      ctx.font = font(8.5);
      ctx.textAlign = 'center';
      ctx.fillText(hh + ':' + mm, x, y + r + 12 * S);

      const ctxLabel = contextLabels.find(l => l.measurementIdx === i);
      if (ctxLabel) {
        ctx.fillStyle = lineColor;
        ctx.font = font(9);
        ctx.textAlign = 'left';
        ctx.fillText(ctxLabel.text, x + r + 6, y + 4);
      }
    }

    // Линия "сейчас"
    const nowMin = data.nowMin != null ? data.nowMin : null;
    if (nowMin != null && nowMin >= minMin && nowMin <= maxMin) {
      const nx = xScale(nowMin);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(nx, pad.top);
      ctx.lineTo(nx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ось X
    ctx.fillStyle = txtDim;
    ctx.font = font(9);
    ctx.textAlign = 'center';
    const firstHour = Math.ceil(minMin / 60);
    const lastHour = Math.floor(maxMin / 60);
    const hourStep = (lastHour - firstHour) > 8 ? 3 : 2;
    for (let hr = firstHour; hr <= lastHour; hr += hourStep) {
      const x = xScale(hr * 60);
      if (x < pad.left + 12 || x > pad.left + plotW - 12) continue;
      ctx.fillText(hr.toString().padStart(2,'0') + ':00', x, pad.top + plotH + 14 * S);
    }

    // Ось событий
    if (foodEvents.length || workloadEvents.length) {
      const axisY = pad.top + plotH + 30 * S;

      for (const f of foodEvents) {
        const x = xScale(f.minute);
        if (x < pad.left || x > pad.left + plotW) continue;
        ctx.beginPath();
        ctx.arc(x, axisY, 4 * Math.min(S, 1.4), 0, Math.PI * 2);
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
        ctx.fill();
      }

      for (const w of workloadEvents) {
        const x = xScale(w.minute);
        if (x < pad.left || x > pad.left + plotW) continue;
        const s = 5 * Math.min(S, 1.4);
        ctx.beginPath();
        ctx.moveTo(x, axisY - s);
        ctx.lineTo(x + s, axisY + s);
        ctx.lineTo(x - s, axisY + s);
        ctx.closePath();
        ctx.fillStyle = '#48c78e';
        ctx.fill();
      }
    }

    return { measurements };
  },

  updatePanel(dayData) {
    const panel = document.getElementById('chart-panel');
    const canvas = document.getElementById('chartMain');
    if (!panel || !canvas) return;

    if (dayData) this._lastData = dayData;
    const data = this._lastData;

    const hasAnything = data && (
      (data.measurements && data.measurements.length > 0) ||
      (data.foodEvents && data.foodEvents.length > 0)
    );
    if (!hasAnything) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');

    requestAnimationFrame(() => {
      const wrap = document.getElementById('chart-canvas-wrap');
      if (!wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const expanded = panel.classList.contains('expanded');
      const width = wrap.clientWidth || 320;
      const height = expanded ? Math.max(wrap.clientHeight || 320, 320) : 200;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      this._draw(ctx, width, height, data);

      if (typeof window.ChartOverlay !== 'undefined') window.ChartOverlay.update(data);
    });
  },

  initPanel() {
    const btn = document.getElementById('btnToggleChart');
    const panel = document.getElementById('chart-panel');
    const canvas = document.getElementById('chartMain');

    if (btn && panel) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('collapsed');
      });
    }
    if (canvas && panel) {
      canvas.addEventListener('click', () => {
        panel.classList.toggle('expanded');
        this.updatePanel();
      });
    }
    window.addEventListener('resize', () => {
      if (this._lastData) this.updatePanel();
    });
  }
};
