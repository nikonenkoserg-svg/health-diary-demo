// ChartOverlay — текстовый слой над графиком.
// Только заголовок «Картина дня» и принцип «между точками не достраиваем».
// Без фаз, прогнозов пика, целевых значений, оценок и рычагов.

const ChartOverlay = {
  update(dayData) {
    const phaseLabel = document.getElementById('chart-phase-label');
    const headline = document.getElementById('chart-headline');
    const foodsPill = document.getElementById('chart-foods-pill');
    const keyNumbers = document.getElementById('chart-key-numbers');
    const leverCard = document.getElementById('chart-lever-card');

    if (phaseLabel) phaseLabel.textContent = 'КАРТИНА ДНЯ';

    if (headline) headline.textContent = 'С прибором. Реальные замеры.';

    if (foodsPill) {
      const m = (dayData && dayData.measurements) || [];
      const u = (dayData && dayData.untimed) || [];
      const total = m.length + u.length;
      foodsPill.style.display = '';
      // Счётчик считает ВСЕ замеры (на оси + без времени), но на ось встают только
      // timed. Без разбивки пациент считает точки, видит меньше числа и ищет «где ещё».
      // Есть безвременные → показываем «N (X на оси, Y без времени)», счёт сходится с глазами.
      foodsPill.textContent = 'Точки — это твои измерения. Между ними не достраиваем.' +
        (total ? '  ·  замеров сегодня: ' + total +
          (u.length ? ' (' + m.length + ' на оси, ' + u.length + ' без времени)' : '') : '');
    }

    // Замеры без точного времени: в дневнике есть, но на ось не встают — строкой.
    if (keyNumbers) {
      const u = (dayData && dayData.untimed) || [];
      if (u.length) {
        const vals = u.map(x => x.value.toFixed(1).replace('.', ',')).join(' · ');
        keyNumbers.innerHTML = '<span class="untimed-note">Без точного времени: ' + vals + '</span>';
      } else {
        keyNumbers.innerHTML = '';
      }
    }
    if (leverCard) leverCard.classList.add('hidden');

    const panel = document.getElementById('chart-panel');
    if (panel) panel.classList.remove('phase-3');
  }
};

if (typeof window !== 'undefined') window.ChartOverlay = ChartOverlay;
