const DEFAULT_CONFIG = Object.freeze({
  theme: 'white',
  readerColorMode: 'custom',
  readerBackgroundEffect: 'glass',
  readerBlur: 14,
  cleanMode: false,
  paginationMode: 'auto',
  key4: 'Alt+Q',
  booksInfo: [
    {
      bookName: '说明文档.txt',
      bookProgress: 0,
      start: 0,
      content: '欢迎使用 fish-book！',
      total: -1,
    },
  ],
  time: '',
  currentBookName: '说明文档.txt',
  currentBookProgress: 0,
  currentBookContent: '',
  start: 0,
  wordsPerPage: 40,
  textColor: '#36433c',
  textBgColor: '#f6f5f0',
  bgOpacity: 0.15,
  textOpacity: 1,
  resizable: true,
  fontSize: 14,
  letterSpacing: 0,
  lineHeight: 1.6,
  readerWidth: 560,
  readerHeight: 110,
  readerX: null,
  readerY: null,
  readerPadding: 12,
  readerRadius: 5,
  alwaysOnTop: true,
  rememberPosition: true,
  showProgress: false,
  fontFamily: 'sans',
  textAlign: 'left',
  key1: 'alt + z',
  key2: 'alt + c',
  key3: 'alt + v',
});

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeConfig(value = {}) {
  const config = { ...DEFAULT_CONFIG, ...value };
  config.theme = ['white', 'dark', 'system'].includes(config.theme) ? config.theme : DEFAULT_CONFIG.theme;
  // 阅读器拥有独立配色，主界面的明暗主题不能改变悬浮阅读窗口。
  config.readerColorMode = 'custom';
  config.readerBackgroundEffect = ['glass', 'solid', 'transparent'].includes(config.readerBackgroundEffect)
    ? config.readerBackgroundEffect : DEFAULT_CONFIG.readerBackgroundEffect;
  config.paginationMode = config.paginationMode === 'fixed' ? 'fixed' : 'auto';
  config.fontSize = clamp(config.fontSize, 12, 32, DEFAULT_CONFIG.fontSize);
  config.wordsPerPage = Math.round(clamp(config.wordsPerPage, 10, 2000, DEFAULT_CONFIG.wordsPerPage));
  config.letterSpacing = clamp(config.letterSpacing, 0, 10, DEFAULT_CONFIG.letterSpacing);
  config.bgOpacity = clamp(config.bgOpacity, 0, 1, DEFAULT_CONFIG.bgOpacity);
  config.textOpacity = clamp(config.textOpacity, 0.2, 1, DEFAULT_CONFIG.textOpacity);
  config.currentBookProgress = clamp(config.currentBookProgress, 0, 100, 0);
  config.start = clamp(config.start, 0, Number.MAX_SAFE_INTEGER, 0);
  config.resizable = Boolean(config.resizable);
  for (const [key, min, max] of [
    ['lineHeight', 1, 3], ['readerWidth', 100, 1600], ['readerHeight', 100, 900],
    ['readerPadding', 4, 48], ['readerRadius', 0, 28], ['readerBlur', 0, 30],
  ]) config[key] = clamp(config[key], min, max, DEFAULT_CONFIG[key]);
  for (const key of ['readerWidth', 'readerHeight']) config[key] = Math.round(config[key]);
  for (const key of ['readerX', 'readerY']) {
    config[key] = Number.isFinite(config[key]) ? Math.round(config[key]) : null;
  }
  for (const key of ['alwaysOnTop', 'rememberPosition', 'showProgress', 'cleanMode']) {
    config[key] = typeof config[key] === 'boolean' ? config[key] : DEFAULT_CONFIG[key];
  }
  for (const key of ['textColor', 'textBgColor']) {
    if (!/^#[\da-f]{6}$/i.test(config[key])) config[key] = DEFAULT_CONFIG[key];
  }
  if (!['sans', 'serif', 'mono'].includes(config.fontFamily)) config.fontFamily = 'sans';
  if (!['left', 'center', 'justify'].includes(config.textAlign)) config.textAlign = 'left';
  if (!Array.isArray(config.booksInfo)) config.booksInfo = [];
  ['key1', 'key2', 'key3', 'key4'].forEach(key => {
    if (typeof config[key] !== 'string' || !config[key].trim()) config[key] = DEFAULT_CONFIG[key];
  });
  return config;
}

module.exports = { DEFAULT_CONFIG, normalizeConfig };
