import { BOOK_EXTENSIONS, MAX_BOOK_BYTES } from '../../electron/book-formats.mjs';
import { parseChapters } from './chapters.mjs';
import { shortcutAction } from './shortcuts.mjs';
// 浏览器调试数据独立保存，不连接 Electron 的真实书库或系统配置。
const KEY = 'fish-book.browser-preview.v2';
const defaults = {
  theme: 'system', readerColorMode: 'custom', readerBackgroundEffect: 'glass', readerBlur: 14,
  booksInfo: [], currentBookName: '', start: 0, currentBookProgress: 0,
  cleanMode: false, key4: 'Alt+Q',
  paginationMode: 'auto',
  wordsPerPage: 200, fontSize: 14, lineHeight: 1.6, letterSpacing: 0,
  textColor: '#36433c', textBgColor: '#f6f5f0', bgOpacity: 0.15, textOpacity: 1,
  readerWidth: 560, readerHeight: 110, readerPadding: 12, readerRadius: 5,
  readerX: null, readerY: null, resizable: true, alwaysOnTop: true,
  rememberPosition: true, showProgress: false, fontFamily: 'sans', textAlign: 'left',
  key1: 'Alt+Z', key2: 'Alt+C', key3: 'Alt+V', shortcutErrors: [],
};
let config;
try { config = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
catch { config = { ...defaults }; }
config.readerColorMode = 'custom';
if (!['glass', 'solid', 'transparent'].includes(config.readerBackgroundEffect)) config.readerBackgroundEffect = 'glass';
config.readerBlur = Math.min(30, Math.max(0, Number(config.readerBlur) || defaults.readerBlur));
const listeners = new Set();
const commandListeners = new Set();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(KEY) : null;
channel?.addEventListener('message', event => {
  if (event.data?.type !== 'config') return;
  config = event.data.value;
  listeners.forEach(listener => listener(config));
});

function save(next) {
  // 先持久化成功再更新界面，配额不足时由调用方展示错误。
  localStorage.setItem(KEY, JSON.stringify(next));
  config = next;
  listeners.forEach(listener => listener(config));
  channel?.postMessage({ type: 'config', value: config });
  return config;
}

let database;
function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('fish-book-preview-books', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books', { keyPath: 'name' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
async function transaction(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('books', mode);
    const request = action(tx.objectStore('books'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('书库保存失败'));
  });
}
async function textOf(name) {
  const record = await transaction('readonly', store => store.get(name));
  if (!record) throw new Error('这本书不在浏览器书库中，请重新导入书籍。');
  return record.text;
}

export const browserBridge = {
  platform: 'browser',
  getBookDetails: async name => {
    const record = await transaction('readonly', store => store.get(name));
    if (!record) throw new Error('书籍不存在，请重新导入');
    return { ...record, chapters: record.chapters || parseChapters(record.text) };
  },
  updateBook: async (name, patch) => {
    await textOf(name);
    const previous = config.booksInfo.find(book => book.bookName === name) || { bookName: name, start: 0 };
    const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => ['displayName', 'notes', 'tags', 'status', 'scrollTop', 'bookmarks'].includes(key)));
    return save({ ...config, booksInfo: [...config.booksInfo.filter(book => book.bookName !== name), { ...previous, ...allowed, bookName: name }] });
  },
  getConfig: async () => config,
  setConfig: async (key, value) => save({ ...config, [key]: value }),
  listBooks: async () => (await transaction('readonly', store => store.getAllKeys())).sort((a, b) => a.localeCompare(b, 'zh-CN')),
  importBooks: () => new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = BOOK_EXTENSIONS.map(ext => `.${ext}`).join(','); input.multiple = true;
    input.oncancel = () => resolve({ imported: [], errors: [] });
    input.onchange = async () => {
      try {
        const imported = [];
        const errors = [];
        for (const file of input.files || []) {
          try {
            if (file.size > MAX_BOOK_BYTES) throw new Error('文件大小超过 32 MB 限制');
            if (await transaction('readonly', store => store.getKey(file.name))) throw new Error('同名书籍已存在，未覆盖');
            const { parseBook } = await import('../../electron/book-parser.mjs');
            const book = parseBook(file.name, await file.arrayBuffer());
            await transaction('readwrite', store => store.add({ name: file.name, ...book }));
            imported.push(file.name);
            save({ ...config, booksInfo: [...config.booksInfo.filter(item => item.bookName !== file.name), { bookName: file.name, displayName: book.title, author: book.author, format: book.format, start: 0, total: book.text.length, bookProgress: 0 }] });
          } catch (error) { errors.push({ name: file.name, message: error.message }); }
        }
        resolve({ imported, errors });
      } catch (error) { reject(error); }
    };
    input.click();
  }),
  readBook: async (name, start = 0, length = Infinity) => (await textOf(name)).slice(start, length === Infinity ? undefined : start + length),
  getBookLength: async name => (await textOf(name)).length,
  selectBook: async name => {
    const text = await textOf(name);
    const saved = config.booksInfo.find(book => book.bookName === name);
    const start = Math.min(saved?.start || 0, Math.max(0, text.length - 1));
    return save({ ...config, currentBookName: name, start, currentBookProgress: text.length ? Math.round(start / text.length * 100) : 0 });
  },
  saveProgress: async (name, offset) => {
    const text = await textOf(name);
    if (name !== config.currentBookName) return config;
    const start = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
    const progress = text.length ? Math.round(start / text.length * 100) : 0;
    const booksInfo = config.booksInfo.filter(book => book.bookName !== name);
    booksInfo.push({ ...config.booksInfo.find(book => book.bookName === name), bookName: name, start, total: text.length, bookProgress: progress, scrollTop: 0, lastReadAt: new Date().toISOString() });
    return save({ ...config, booksInfo, start, currentBookProgress: progress });
  },
  showReader: async () => { window.dispatchEvent(new Event('fish:show-reader')); },
  hideReader: async () => { window.dispatchEvent(new Event('fish:hide-reader')); },
  resetReaderPosition: async () => { window.dispatchEvent(new Event('fish:reset-reader')); },
  openBooksFolder: async () => { throw new Error('浏览器无法直接打开系统书库，请使用“导入书籍”。'); },
  windowAction: async () => {},
  openExternal: async url => window.open(url, '_blank', 'noopener,noreferrer'),
  onConfigChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  onReaderCommand: listener => { commandListeners.add(listener); return () => commandListeners.delete(listener); },
};

window.addEventListener('keydown', event => {
  if (window.fishBook) return;
  if (event.target.closest('input, textarea, select, [contenteditable=true]')) return;
  if (event.repeat || event.isComposing) return;
  const match = shortcutAction(event, config);
  if (!match) return;
  event.preventDefault();
  if (match === 'exit-clean') save({ ...config, cleanMode: false });
  else if (match === 'toggle') window.dispatchEvent(new Event('fish:toggle-reader'));
  else commandListeners.forEach(listener => listener(match));
});
