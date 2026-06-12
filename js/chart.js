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
      : (typeof Time !== 'undefined' ? Time.nowParts().minuteOfDay : new Date().getHours()*60 + new Date().getMinutes());

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
    ctx.fillText('допустимо после еды · до 7.8', pad.left + plotW - 4, normTop + 11 * S);
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
        radius: Math.max(28, r + 20),
        timeLabel: (ev.certain === false ? '~' : '') + ev.timeLabel,
        label: ev.label,
        kcal: ev.kcal || null
      });
    }

    // === Точки реальных замеров (Storage.getGlucoseLog) ===
    const measurements = data.measurements || [];
    for (const m of measurements) {
      if (m.minute == null) continue;
      const mx = xScale(m.minute);
      if (mx < pad.left - 4 || mx > pad.left + plotW + 4) continue;
      const my = yScale(m.value);
      // Чёрная точка с белым контуром (заметная, отличается от кружков событий)
      const r = 5 * Math.min(S, 1.5);
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#fafbfc' : '#1c2128';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isDark ? '#0d1117' : '#fafbfc';
      ctx.stroke();
      // Цифра рядом
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
      ctx.font = font(9, true);
      ctx.textAlign = 'left';
      ctx.fillText(m.value.toFixed(1), mx + r + 3, my + 3);
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
      if (typeof window.ChartOverlay !== 'undefined') window.ChartOverlay.update(data);
    });
  },

  // Пульсирующая точка «сейчас» + подпись с системным временем
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

    // Подпись «сейчас HH:MM» — чтобы юзер видел что JS считает текущим временем
    let label = document.getElementById('chart-now-label');
    if (!label) {
      label = document.createElement('div');
      label.id = 'chart-now-label';
      label.className = 'chart-now-label';
      wrap.appendChild(label);
    }
    const tp = (typeof Time !== 'undefined') ? Time.nowParts() : null;
    if (tp) {
      label.textContent = tp.hour + ':' + String(tp.minute).padStart(2,'0');
      label.style.left = meta.nowPoint.x + 'px';
      label.style.top = (meta.nowPoint.y + 12) + 'px';
    }
  },

  // Карточка события — открывается тапом по точке
  _showEventCard(hit) {
    const wrap = document.getElementById('chart-canvas-wrap');
    if (!wrap) return;
    let card = document.getElementById('chart-event-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'chart-event-card';
      card.className = 'chart-event-card';
      wrap.appendChild(card);
    }
    const foods = hit.label.split(/\s*,\s*/).map(f => f.trim()).filter(Boolean);
    const foodList = foods.map(f => '<li>' + f + '</li>').join('');
    const kcalLine = hit.kcal ? '<div class="chart-card-meta">' + hit.kcal + ' ккал</div>' : '';
    card.innerHTML =
      '<button class="chart-card-close" aria-label="Закрыть">×</button>' +
      '<div class="chart-card-time">' + hit.timeLabel + '</div>' +
      '<ul class="chart-card-foods">' + foodList + '</ul>' +
      kcalLine;
    card.classList.add('visible');

    const closeBtn = card.querySelector('.chart-card-close');
    if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); this._hideEventCard(); };
  },

  _hideEventCard() {
    const card = document.getElementById('chart-event-card');
    if (card) card.classList.remove('visible');
  },

  // Легенда — цветные точки + названия для вторичных кривых
  _updateLegend(data) {
    const el = document.getElementById('chart-legend');
    if (!el) return;
    const items = [];
    // Главная — сахар
    items.push({ color: '#ff4d6d', label: 'сахар', main: true });
    const secondary = data.secondary || [];
    for (const proc of secondary) {
      items.push({ color: proc.color, label: proc.label });
    }
    el.innerHTML = items.map(it =>
      '<span class="chart-legend-item' + (it.main ? ' main' : '') + '">' +
      '<span class="chart-legend-dot" style="background:' + it.color + '"></span>' +
      it.label + '</span>'
    ).join('');
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
      const handleTap = (cx, cy) => {
        const hits = (this._lastMeta && this._lastMeta.eventHits) || [];
        let nearest = null, bestDist = Infinity;
        for (const h of hits) {
          const dx = h.x - cx, dy = h.y - cy;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d <= h.radius && d < bestDist) { nearest = h; bestDist = d; }
        }
        if (nearest) {
          this._showEventCard(nearest);
          return;
        }
        const card = document.getElementById('chart-event-card');
        if (card && card.classList.contains('visible')) {
          this._hideEventCard();
          return;
        }
        panel.classList.toggle('expanded');
        this.updatePanel();
      };

      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        handleTap(e.clientX - rect.left, e.clientY - rect.top);
      });

      // iOS Safari: дублируем через touchend на случай если click не доходит
      let touchStartXY = null;
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartXY = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }, { passive: true });
      canvas.addEventListener('touchend', (e) => {
        if (!touchStartXY || !e.changedTouches[0]) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartXY.x;
        const dy = t.clientY - touchStartXY.y;
        touchStartXY = null;
        if (Math.sqrt(dx*dx + dy*dy) > 12) return; // это скролл, не тап
        // click обычно сам сработает следом, но не всегда — обработаем сами с защитой от двойного
        if (this._tapHandled) { this._tapHandled = false; return; }
        this._tapHandled = true;
        setTimeout(() => { this._tapHandled = false; }, 400);
        const rect = canvas.getBoundingClientRect();
        handleTap(t.clientX - rect.left, t.clientY - rect.top);
        e.preventDefault();
      });
    }
    window.addEventListener('resize', () => {
      if (this._lastChartData) this.updatePanel();
    });
  }
};
