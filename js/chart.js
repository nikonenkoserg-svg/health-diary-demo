// Chart — canvas-график глюкозной кривой в пузыре чата
// Без внешних библиотек. Рисует прямо в ленте сообщений.

const Chart = {

  // Цвета зон
  ZONES: {
    normal:   { max: 5.5, color: 'rgba(72, 199, 142, 0.15)', border: '#48c78e' },
    elevated: { max: 7.8, color: 'rgba(255, 183, 77, 0.15)', border: '#ffb74d' },
    high:     { max: 15,  color: 'rgba(255, 77, 109, 0.10)', border: '#ff4d6d' }
  },

  // Создаёт canvas-элемент с графиком и вставляет в чат
  render(chartData, container) {
    if (!chartData || !chartData.points || chartData.points.length < 2) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'message bot chart-message';

    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const width = Math.min(container.clientWidth * 0.85, 340);
    const height = 180;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    wrapper.appendChild(canvas);
    container.appendChild(wrapper);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    this._draw(ctx, width, height, chartData);

    return wrapper;
  },

  _draw(ctx, w, h, data) {
    const pad = { top: 12, right: 12, bottom: 28, left: 36 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const points = data.points;
    const events = data.events || [];

    // Диапазоны
    const minMin = points[0].minute;
    const maxMin = points[points.length - 1].minute;
    const minG = Math.min(4.0, Math.min(...points.map(p => p.glucose)) - 0.3);
    const maxG = Math.max(8.5, Math.max(...points.map(p => p.glucose)) + 1.2);

    const xScale = (m) => pad.left + ((m - minMin) / (maxMin - minMin)) * plotW;
    const yScale = (g) => pad.top + plotH - ((g - minG) / (maxG - minG)) * plotH;

    // === Зоны фона ===
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
                   document.documentElement.getAttribute('data-theme') !== 'light';

    // Зона нормы (зелёная)
    const normTop = yScale(Math.min(this.ZONES.normal.max, maxG));
    const normBot = yScale(minG);
    ctx.fillStyle = isDark ? 'rgba(72, 199, 142, 0.08)' : 'rgba(72, 199, 142, 0.12)';
    ctx.fillRect(pad.left, normTop, plotW, normBot - normTop);

    // Зона повышенная (жёлтая)
    if (maxG > this.ZONES.normal.max) {
      const elevTop = yScale(Math.min(this.ZONES.elevated.max, maxG));
      const elevBot = normTop;
      ctx.fillStyle = isDark ? 'rgba(255, 183, 77, 0.08)' : 'rgba(255, 183, 77, 0.12)';
      ctx.fillRect(pad.left, elevTop, plotW, elevBot - elevTop);
    }

    // Зона высокая (красная)
    if (maxG > this.ZONES.elevated.max) {
      const highTop = yScale(maxG);
      const highBot = yScale(this.ZONES.elevated.max);
      ctx.fillStyle = isDark ? 'rgba(255, 77, 109, 0.06)' : 'rgba(255, 77, 109, 0.10)';
      ctx.fillRect(pad.left, highTop, plotW, highBot - highTop);
    }

    // === Горизонтальные линии ===
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    const gSteps = [4.5, 5.0, 5.5, 6.0, 7.0, 7.8, 9.0, 10.0];
    for (const g of gSteps) {
      if (g < minG || g > maxG) continue;
      const y = yScale(g);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    // Пороговые линии
    // 5.5 — верхняя граница нормы
    ctx.strokeStyle = isDark ? 'rgba(72, 199, 142, 0.3)' : 'rgba(72, 199, 142, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const y55 = yScale(5.5);
    ctx.beginPath(); ctx.moveTo(pad.left, y55); ctx.lineTo(pad.left + plotW, y55); ctx.stroke();

    // 7.8 — граница преддиабета
    if (maxG > 7) {
      ctx.strokeStyle = isDark ? 'rgba(255, 183, 77, 0.4)' : 'rgba(255, 183, 77, 0.6)';
      const y78 = yScale(7.8);
      ctx.beginPath(); ctx.moveTo(pad.left, y78); ctx.lineTo(pad.left + plotW, y78); ctx.stroke();
    }
    ctx.setLineDash([]);

    // === Кривая глюкозы ===
    ctx.beginPath();
    ctx.moveTo(xScale(points[0].minute), yScale(points[0].glucose));

    // Сглаженная кривая (cardinal spline)
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const tension = 0.3;
      const cp1x = xScale(p1.minute) + (xScale(p2.minute) - xScale(p0.minute)) * tension;
      const cp1y = yScale(p1.glucose) + (yScale(p2.glucose) - yScale(p0.glucose)) * tension;
      const cp2x = xScale(p2.minute) - (xScale(p3.minute) - xScale(p1.minute)) * tension;
      const cp2y = yScale(p2.glucose) - (yScale(p3.glucose) - yScale(p1.glucose)) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, xScale(p2.minute), yScale(p2.glucose));
    }

    // Градиент под кривой
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    const peakG = Math.max(...points.map(p => p.glucose));
    if (peakG > 7.8) {
      gradient.addColorStop(0, isDark ? 'rgba(255, 77, 109, 0.25)' : 'rgba(255, 77, 109, 0.20)');
      gradient.addColorStop(0.5, isDark ? 'rgba(255, 183, 77, 0.10)' : 'rgba(255, 183, 77, 0.10)');
      gradient.addColorStop(1, 'rgba(72, 199, 142, 0.02)');
    } else if (peakG > 5.5) {
      gradient.addColorStop(0, isDark ? 'rgba(255, 183, 77, 0.20)' : 'rgba(255, 183, 77, 0.15)');
      gradient.addColorStop(1, 'rgba(72, 199, 142, 0.02)');
    } else {
      gradient.addColorStop(0, isDark ? 'rgba(72, 199, 142, 0.15)' : 'rgba(72, 199, 142, 0.10)');
      gradient.addColorStop(1, 'rgba(72, 199, 142, 0.02)');
    }

    // Заливка под кривой
    const curvePath = new Path2D();
    curvePath.moveTo(xScale(points[0].minute), yScale(points[0].glucose));
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const tension = 0.3;
      const cp1x = xScale(p1.minute) + (xScale(p2.minute) - xScale(p0.minute)) * tension;
      const cp1y = yScale(p1.glucose) + (yScale(p2.glucose) - yScale(p0.glucose)) * tension;
      const cp2x = xScale(p2.minute) - (xScale(p3.minute) - xScale(p1.minute)) * tension;
      const cp2y = yScale(p2.glucose) - (yScale(p3.glucose) - yScale(p1.glucose)) * tension;
      curvePath.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, xScale(p2.minute), yScale(p2.glucose));
    }
    curvePath.lineTo(xScale(points[points.length - 1].minute), yScale(minG));
    curvePath.lineTo(xScale(points[0].minute), yScale(minG));
    curvePath.closePath();
    ctx.fillStyle = gradient;
    ctx.fill(curvePath);

    // Сама линия
    ctx.beginPath();
    ctx.moveTo(xScale(points[0].minute), yScale(points[0].glucose));
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const tension = 0.3;
      const cp1x = xScale(p1.minute) + (xScale(p2.minute) - xScale(p0.minute)) * tension;
      const cp1y = yScale(p1.glucose) + (yScale(p2.glucose) - yScale(p0.glucose)) * tension;
      const cp2x = xScale(p2.minute) - (xScale(p3.minute) - xScale(p1.minute)) * tension;
      const cp2y = yScale(p2.glucose) - (yScale(p3.glucose) - yScale(p1.glucose)) * tension;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, xScale(p2.minute), yScale(p2.glucose));
    }
    const lineColor = peakG > 7.8 ? '#ff4d6d' : peakG > 5.5 ? '#ffb74d' : '#48c78e';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // === Маркеры событий (еда) ===
    for (const ev of events) {
      const x = xScale(ev.minute);
      if (x < pad.left || x > pad.left + plotW) continue;

      // Найдём глюкозу в этой точке
      const closest = points.reduce((best, p) =>
        Math.abs(p.minute - ev.minute) < Math.abs(best.minute - ev.minute) ? p : best
      );
      const y = yScale(closest.glucose);

      // Точка
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.strokeStyle = isDark ? '#1a1a2e' : '#f8f9fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Подпись еды
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = ev.label.length > 12 ? ev.label.slice(0, 11) + '…' : ev.label;
      ctx.fillText(label, x, y - 10);
    }

    // === Аннотация для плоской кривой ===
    if (peakG <= 5.3 && events.length > 0) {
      ctx.fillStyle = isDark ? 'rgba(72, 199, 142, 0.6)' : 'rgba(72, 199, 142, 0.8)';
      ctx.font = '11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('не влияет на сахар', pad.left + plotW / 2, pad.top + plotH * 0.35);
    }

    // === Пик — отметка ===
    const peakPoint = points.reduce((best, p) => p.glucose > best.glucose ? p : best);
    if (peakPoint.glucose > 5.5) {
      const px = xScale(peakPoint.minute);
      const py = yScale(peakPoint.glucose);

      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
      ctx.font = 'bold 10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(peakPoint.glucose.toFixed(1), px, py - 14);
    }

    // === Вторичные процессы (белок, кофеин, гидратация, жир) ===
    const secondary = data.secondary || [];
    if (secondary.length > 0) {
      // Рисуем вторичные кривые в нижней трети графика
      const secH = plotH * 0.25; // 25% высоты для вторичных
      const secBase = pad.top + plotH - secH * 0.1;

      for (const proc of secondary) {
        if (proc.points.length < 2) continue;
        const maxVal = Math.max(...proc.points.map(p => p.value), 0.01);

        ctx.beginPath();
        const firstPt = proc.points[0];
        ctx.moveTo(xScale(firstPt.minute), secBase - (firstPt.value / maxVal) * secH);

        for (let i = 0; i < proc.points.length - 1; i++) {
          const p1 = proc.points[i];
          const p2 = proc.points[i + 1];
          const x1 = xScale(p1.minute);
          const y1 = secBase - (p1.value / maxVal) * secH;
          const x2 = xScale(p2.minute);
          const y2 = secBase - (p2.value / maxVal) * secH;
          const cx = (x1 + x2) / 2;
          ctx.quadraticCurveTo(x1, y1, cx, (y1 + y2) / 2);
        }
        const lastPt = proc.points[proc.points.length - 1];
        ctx.lineTo(xScale(lastPt.minute), secBase - (lastPt.value / maxVal) * secH);

        ctx.strokeStyle = proc.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // Подпись процесса
        const peakPt = proc.points.reduce((best, p) => p.value > best.value ? p : best);
        const px = xScale(peakPt.minute);
        const py = secBase - (peakPt.value / maxVal) * secH;
        ctx.fillStyle = proc.color;
        ctx.font = '9px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.8;
        ctx.fillText(proc.label, px, py - 6);
        ctx.globalAlpha = 1;
      }
    }

    // === Ось X — время ===
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
    ctx.font = '10px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';

    // Показываем каждый час
    const firstHour = Math.ceil(minMin / 60);
    const lastHour = Math.floor(maxMin / 60);
    for (let hr = firstHour; hr <= lastHour; hr++) {
      const m = hr * 60;
      const x = xScale(m);
      if (x < pad.left + 15 || x > pad.left + plotW - 15) continue;
      ctx.fillText(`${hr}:00`, x, h - 6);

      // Тик
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, pad.top + plotH);
      ctx.lineTo(x, pad.top + plotH + 4);
      ctx.stroke();
    }

    // === Ось Y — глюкоза ===
    ctx.textAlign = 'right';
    const yLabels = [5.0, 5.5, 7.8];
    if (maxG > 9) yLabels.push(9.0);
    for (const g of yLabels) {
      if (g < minG || g > maxG) continue;
      const y = yScale(g);
      ctx.fillText(g.toFixed(1), pad.left - 4, y + 3);
    }

    // === Точка «сейчас» — где организм находится в текущий момент ===
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    let nowPoint = null;
    if (nowMin >= minMin && nowMin <= maxMin) {
      const nowGlucose = points.reduce((best, p) =>
        Math.abs(p.minute - nowMin) < Math.abs(best.minute - nowMin) ? p : best
      );
      nowPoint = { x: xScale(nowMin), y: yScale(nowGlucose.glucose) };
    } else {
      // вне диапазона — ставим на последнюю точку кривой
      const last = points[points.length - 1];
      nowPoint = { x: xScale(last.minute), y: yScale(last.glucose) };
    }

    return { nowPoint };
  },

  // Обновить постоянную панель графика
  _lastChartData: null,

  updatePanel(chartData) {
    const panel = document.getElementById('chart-panel');
    const canvas = document.getElementById('chartMain');
    if (!panel || !canvas) return;

    if (chartData) this._lastChartData = chartData;
    const data = this._lastChartData;

    if (!data || !data.points || data.points.length < 2) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');

    const wrap = document.getElementById('chart-canvas-wrap');
    const dpr = window.devicePixelRatio || 1;
    const expanded = panel.classList.contains('expanded');
    const width = wrap.clientWidth || 320;
    const height = expanded ? Math.max(wrap.clientHeight || 300, 300) : 160;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const meta = this._draw(ctx, width, height, data);
    this._placeNowMarker(meta, width, height);
  },

  // Пульсирующая точка «сейчас» — CSS-слой поверх canvas
  _placeNowMarker(meta, w, h) {
    const wrap = document.getElementById('chart-canvas-wrap');
    if (!wrap || !meta || !meta.nowPoint) return;
    let marker = document.getElementById('chart-now-marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'chart-now-marker';
      marker.className = 'chart-now-marker';
      wrap.appendChild(marker);
    }
    marker.style.left = meta.nowPoint.x + 'px';
    marker.style.top = meta.nowPoint.y + 'px';
  },

  // Инициализация: сворачивание + fullscreen по тапу
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
      if (this._lastChartData) this.updatePanel();
    });
  }
};
