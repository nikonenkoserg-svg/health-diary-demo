// Theme & font size

const Theme = {
  init() {
    const s = Storage.getSettings();
    this.apply(s.theme, s.fontLarge);
  },

  apply(theme, fontLarge) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('font-large', fontLarge);
    document.getElementById('btnTheme').textContent = theme === 'dark' ? '🌙' : '☀';
    document.getElementById('btnFont').textContent = fontLarge ? 'A−' : 'A+';
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', theme === 'dark' ? '#0f0f1a' : '#f8f9fc');
  },

  toggle() {
    const s = Storage.getSettings();
    s.theme = s.theme === 'dark' ? 'light' : 'dark';
    Storage.saveSettings(s);
    this.apply(s.theme, s.fontLarge);
  },

  toggleFont() {
    const s = Storage.getSettings();
    s.fontLarge = !s.fontLarge;
    Storage.saveSettings(s);
    this.apply(s.theme, s.fontLarge);
  }
};
