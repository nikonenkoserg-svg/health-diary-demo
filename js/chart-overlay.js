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
      foodsPill.style.display = '';
      foodsPill.textContent = 'Точки — это твои измерения. Между ними не достраиваем.' +
        (m.length ? '  ·  замеров сегодня: ' + m.length : '');
    }

    if (keyNumbers) keyNumbers.innerHTML = '';
    if (leverCard) leverCard.classList.add('hidden');

    const panel = document.getElementById('chart-panel');
    if (panel) panel.classList.remove('phase-3');
  }
};

if (typeof window !== 'undefined') window.ChartOverlay = ChartOverlay;
