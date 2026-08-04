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

    if (phaseLabel) phaseLabel.textContent = 'КАРТИНА ДНЯ' + this._dateSuffix(dayData);

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
,

  _MONTHS: ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],
  // Дата — из dayData.dateISO (тот же todayISO, что фильтрует точки). Парсим строку,
  // не new Date, чтобы пояс устройства не сдвинул день. Нет метки → пустая подпись.
  _dateSuffix(dayData) {
    const iso = dayData && dayData.dateISO;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const mo = parseInt(iso.slice(5, 7), 10) - 1;
    const day = parseInt(iso.slice(8, 10), 10);
    if (mo < 0 || mo > 11 || !day) return '';
    return ' · ' + day + ' ' + this._MONTHS[mo];
  }
};

if (typeof window !== 'undefined') window.ChartOverlay = ChartOverlay;
