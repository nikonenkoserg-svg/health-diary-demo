// Chart — canvas-график глюкозной кривой
// Факт (сплошная) vs прогноз (пунктир). Линия «сейчас». Разметка.

const Chart = {

  ZONES: {
    normal:   { max: 5.5, border: '#48c78e' },
    elevated: { max: 7.8, border: '#ffb74d' },
    high:     { max: 15,  border: '#ff4d6d' }
  },

  _lastChartData: null,

  // Кардинальный сплайн через массив точек {x,y}
  _spline(ctx, pts) {
    if (pts.length < 2) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const t = 0.3;
      const cp1x = p1.x + (p2.x - p0.x) * t;
      const cp1y = p1.y + (p2.y - p0.y) * t;
      const cp2x = p2.x - (p3.x - p1.x) * t;
      const cp2y = p2.y - (p3.y - p1.y) * t;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  },

  _draw(ctx, w, h, data) {
    const isDark = !document.documentElement.hasAttribute('data-theme') ||
                   document.documentElement.getAttribute('data-theme') !== 'light';

    // Масштаб шрифтов/отступов — растёт в полноэкранном режиме
    const S = h <= 200 ? 1 : Math.min(h / 200, 2.1);
    const font = (px, bold) => (bold ? 'bold ' : '') + Math.round(px * S) +
                 'px -apple-system, system-ui, sans-serif';

    const pad = {
      top: 16 * S,
      right: 14 * S,
      bottom: 30 * S,
      left: 40 * S
    };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const points = data.points;
    const events = data.events || [];
    const nowMin = data.nowMinute != null
      ? data.nowMinute
      : new Date().getHours() * 60 + new Date().getMinutes();

    const minMin = points[0].minute;
    const maxMin = points[points.length - 1].minute;
    const minG = Math.min(4.0, Math.min(...points.map(p => p.glucose)) - 0.3);
    const maxG = Math.max(8.5, Math.max(...points.map(p => p.glucose)) + 1.2);

    const xScale = (m) => pad.left + ((m - minMin) / (maxMin - minMin || 1)) * plotW;
    const yScale = (g) => pad.top + plotH - ((g - minG) / (maxG - minG)) * plotH;

    const txtDim = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    const txtBright = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)';

    // === Зоны фона ===
    const normTop = yScale(Math.min(5.5, maxG));
    const normBot = yScale(minG);
    ctx.fillStyle = isDark ? 'rgba(72,199,142,0.08)' : 'rgba(72,199,142,0.12)';
    ctx.fillRect(pad.left, normTop, plotW, normBot - normTop);

    if (maxG > 5.5) {
      const elevTop = yScale(Math.min(7.8, maxG));
      ctx.fillStyle = isDark ? 'rgba(255,183,77,0.08)' : 'rgba(255,183,77,0.12)';
      ctx.fillRect(pad.left, elevTop, plotW, normTop - elevTop);
    }
    if (maxG > 7.8) {
      const highTop = yScale(maxG);
      ctx.fillStyle = isDark ? 'rgba(255,77,109,0.06)' : 'rgba(255,77,109,0.10)';
      ctx.fillRect(pad.left, highTop, plotW, yScale(7.8) - highTop);
    }

    // Подписи зон — справа
    ctx.textAlign = 'right';
    ctx.font = font(8.5);
    ctx.fillStyle = isDark ? 'rgba(72,199,142,0.55)' : 'rgba(72,199,142,0.7)';
    ctx.fillText('норма', pad.left + plotW - 4, normTop + 11 * S);
    if (maxG > 6.2) {
      ctx.fillStyle = isDark ? 'rgba(255,183,77,0.6)' : 'rgba(255,183,77,0.75)';
      ctx.fillText('повышено', pad.left + plotW - 4, yScale(7.8) + 11 * S);
    }
    if (maxG > 8.3) {
      ctx.fillStyle = isDark ? 'rgba(255,77,109,0.6)' : 'rgba(255,77,109,0.75)';
      ctx.fillText('высоко', pad.left + plotW - 4, yScale(maxG) + 11 * S);
    }

    // Пороговые линии 5.5 и 7.8
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isDark ? 'rgba(72,199,142,0.3)' : 'rgba(72,199,142,0.5)';
    let yln = yScale(5.5);
    ctx.beginPath(); ctx.moveTo(pad.left, yln); ctx.lineTo(pad.left + plotW, yln); ctx.stroke();
    if (maxG > 7) {
      ctx.strokeStyle = isDark ? 'rgba(255,183,77,0.4)' : 'rgba(255,183,77,0.6)';
      yln = yScale(7.8);
      ctx.beginPath(); ctx.moveTo(pad.left, yln); ctx.lineTo(pad.left + plotW, yln); ctx.stroke();
    }
    ctx.setLineDash([]);

    // === Глюкозная кривая: факт (сплошная) + прогноз (пунктир) ===
    const xy = points.map(p => ({ x: xScale(p.minute), y: yScale(p.glucose), fact: p.fact }));
    const peakG = Math.max(...points.map(p => p.glucose));
    const lineColor = peakG > 7.8 ? '#ff4d6d' : peakG > 5.5 ? '#ffb74d' : '#48c78e';

    const factPts = xy.filter(p => p.fact);
    const forecastPts = [];
    if (factPts.length > 0) forecastPts.push(factPts[factPts.length - 1]);
    xy.forEach(p => { if (!p.fact) forecastPts.push(p); });

    // Заливка под фактической частью
    if (factPts.length >= 2) {
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      if (peakG > 7.8) {
        grad.addColorStop(0, isDark ? 'rgba(255,77,109,0.25)' : 'rgba(255,77,109,0.20)');
        grad.addColorStop(0.5, 'rgba(255,183,77,0.10)');
        grad.addColorStop(1, 'rgba(72,199,142,0.02)');
      } else if (peakG > 5.5) {
        grad.addColorStop(0, isDark ? 'rgba(255,183,77,0.20)' : 'rgba(255,183,77,0.15)');
        grad.addColorStop(1, 'rgba(72,199,142,0.02)');
      } else {
        grad.addColorStop(0, isDark ? 'rgba(72,199,142,0.15)' : 'rgba(72,199,142,0.10)');
        grad.addColorStop(1, 'rgba(72,199,142,0.02)');
      }
      ctx.beginPath();
      this._spline(ctx, factPts);
      ctx.lineTo(factPts[factPts.length - 1].x, yScale(minG));
      ctx.lineTo(factPts[0].x, yScale(minG));
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Линия факта — сплошная
    if (factPts.length >= 2) {
      ctx.beginPath();
      this._spline(ctx, factPts);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.4 * Math.min(S, 1.5);
      ctx.stroke();
    }

    // Линия прогноза — пунктир, бледнее
    if (forecastPts.length >= 2) {
      ctx.beginPath();
      this._spline(ctx, forecastPts);
      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2 * Math.min(S, 1.5);
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // === Вторичные процессы — тонкие фоновые линии, без подписей ===
    const secondary = data.secondary || [];
    if (secondary.length > 0) {
      const secH = plotH * 0.18;
      const secBase = pad.top + plotH - secH * 0.1;
      for (const proc of secondary) {
        if (proc.points.length < 2) continue;
        const maxVal = Math.max(...proc.points.map(p => p.value), 0.01);
        const ptsSec = proc.points.map(p => ({
          x: xScale(p.minute),
          y: secBase - (p.value / maxVal) * secH
        }));
        ctx.beginPath();
        this._spline(ctx, ptsSec);
        ctx.strokeStyle = proc.color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.2 * Math.min(S, 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // === Линия «сейчас» ===
    let nowPoint = null;
    if (nowMin >= minMin && nowMin <= maxMin) {
      const nx = xScale(nowMin);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(nx, pad.top);
      ctx.lineTo(nx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      const nowGl = points.reduce((b, p) =>
        Math.abs(p.minute - nowMin) < Math.abs(b.minute - nowMin) ? p : b);
      nowPoint = { x: nx, y: yScale(nowGl.glucose) };
    } else {
      const last = points[points.length - 1];
      nowPoint = { x: xScale(last.minute), y: yScale(last.glucose) };
    }

    // === Маркеры событий — только точки, текст по тапу ===
    const eventHits = [];
    for (const ev of events) {
      const x = xScale(ev.minute);
      if (x < pad.left - 2 || x > pad.left + plotW + 2) continue;
      const closest = points.reduce((b, p) =>
        Math.abs(p.minute - ev.minute) < Math.abs(b.minute - ev.minute) ? p : b);
      const ey = yScale(closest.glucose);

      const r = 5 * Math.min(S, 1.7);
      // Внутренняя точка фона
      ctx.beginPath();
      ctx.arc(x, ey, r - 1, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(15,15,26,0.95)' : 'rgba(248,249,252,0.95)';
      ctx.fill();
      // Кольцо
      ctx.beginPath();
      ctx.arc(x, ey, r, 0, Math.PI * 2);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      eventHits.push({
        x, y: ey,
        radius: r + 8,
        timeLabel: (ev.certain === false ? '~' : '') + ev.timeLabel,
        label: ev.label
      });
    }

    // Плоская кривая — поясняем
    if (peakG <= 5.3 && events.length > 0) {
      ctx.fillStyle = isDark ? 'rgba(72,199,142,0.6)' : 'rgba(72,199,142,0.8)';
      ctx.font = font(10);
      ctx.textAlign = 'center';
      ctx.fillText('не влияет на сахар', pad.left + plotW / 2, pad.top + plotH * 0.4);
    }

    // Пик
    const peakPoint = points.reduce((b, p) => p.glucose > b.glucose ? p : b);
    if (peakPoint.glucose > 5.5) {
      ctx.fillStyle = txtBright;
      ctx.font = font(9.5, true);
      ctx.textAlign = 'center';
      ctx.fillText(peakPoint.glucose.toFixed(1),
                   xScale(peakPoint.minute), yScale(peakPoint.glucose) - 15 * S);
    }

    // === Ось X — время ===
    ctx.fillStyle = txtDim;
    ctx.font = font(9);
    ctx.textAlign = 'center';
    const firstHour = Math.ceil(minMin / 60);
    const lastHour = Math.floor(maxMin / 60);
    const hourStep = (lastHour - firstHour) > 8 ? 2 : 1;
    for (let hr = firstHour; hr <= lastHour; hr += hourStep) {
      const x = xScale(hr * 60);
      if (x < pad.left + 12 || x > pad.left + plotW - 12) continue;
      ctx.fillText(hr + ':00', x, h - 9 * S);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, pad.top + plotH);
      ctx.lineTo(x, pad.top + plotH + 4 * S);
      ctx.stroke();
    }

    // === Ось Y — глюкоза ===
    ctx.textAlign = 'right';
    ctx.fillStyle = txtDim;
    ctx.font = font(9);
    const yLabels = [5.0, 5.5, 7.8];
    if (maxG > 9) yLabels.push(9.0);
    for (const g of yLabels) {
      if (g < minG || g > maxG) continue;
      ctx.fillText(g.toFixed(1), pad.left - 4, yScale(g) + 3 * S);
    }
    ctx.textAlign = 'left';
    ctx.font = font(8.5);
    ctx.fillStyle = txtDim;
    ctx.fillText('сахар, ммоль/л', pad.left, pad.top - 5 * S);

    return { nowPoint, eventHits };
  },

  // === ПОСТОЯННАЯ ПАНЕЛЬ ===
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

    requestAnimationFrame(() => {
      const wrap = document.getElementById('chart-canvas-wrap');
      if (!wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const expanded = panel.classList.contains('expanded');
      const width = wrap.clientWidth || 320;
      const height = expanded ? Math.max(wrap.clientHeight || 320, 320) : 160;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const meta = this._draw(ctx, width, height, data);
      this._lastMeta = meta;
      this._placeNowMarker(meta);
    });
  },

  // Пульсирующая точка «сейчас» — CSS-слой
  _placeNowMarker(meta) {
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

  // Показать подсказку события
  _showEventTooltip(hit) {
    const wrap = document.getElementById('chart-canvas-wrap');
    if (!wrap) return;
    let tip = document.getElementById('chart-event-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'chart-event-tooltip';
      tip.className = 'chart-event-tooltip';
      wrap.appendChild(tip);
    }
    tip.textContent = hit.timeLabel + ' · ' + hit.label;
    tip.style.left = hit.x + 'px';
    tip.style.top = (hit.y - 14) + 'px';
    tip.classList.add('visible');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => tip.classList.remove('visible'), 3000);
  },

  _hideEventTooltip() {
    const tip = document.getElementById('chart-event-tooltip');
    if (tip) tip.classList.remove('visible');
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
      canvas.addEventListener('click', (e) => {
        // Координаты клика относительно canvas (в CSS px)
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const hits = (this._lastMeta && this._lastMeta.eventHits) || [];
        let nearest = null, bestDist = Infinity;
        for (const h of hits) {
          const dx = h.x - cx, dy = h.y - cy;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d <= h.radius && d < bestDist) { nearest = h; bestDist = d; }
        }
        if (nearest) {
          this._showEventTooltip(nearest);
          return;
        }
        // Клик не по событию — toggle fullscreen
        this._hideEventTooltip();
        panel.classList.toggle('expanded');
        this.updatePanel();
      });
    }
    window.addEventListener('resize', () => {
      if (this._lastChartData) this.updatePanel();
    });
  }
};
