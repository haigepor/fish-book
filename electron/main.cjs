const { app, BrowserWindow, Menu, Tray, ipcMain, screen, shell, globalShortcut, dialog } = require('electron');
const Store = require('electron-store');
const fs = require('node:fs/promises');
const path = require('node:path');
const jschardet = require('jschardet');
const iconv = require('iconv-lite');
const { DEFAULT_CONFIG, normalizeConfig } = require('./config-contract.cjs');
const { readerGestureBounds } = require('./reader-window.cjs');

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const rendererUrl = process.env.ELECTRON_RENDERER_URL || null;
const store = new Store({ name: 'sysConfig', defaults: DEFAULT_CONFIG });
let mainWindow = null;
let readWindow = null;
let tray = null;
let boundsTimer;
let applyingBounds = false;
let readerGesture = null;
let shortcutErrors = [];
// CommonJS 可由 Electron 25 从 ASAR 中直接加载；ESM 动态导入在该路径下会误报模块不存在。
const bookParser = Promise.resolve(require('./book-parser.cjs'));
const parsedBooks = new Map();

function appPath(...parts) {
  return path.join(app.getAppPath(), ...parts);
}

async function booksFolder() {
  const configured = store.get('books_folder_path');
  const folder = typeof configured === 'string' && configured.trim()
    ? configured
    : path.join(app.getPath('documents'), 'fish-book', 'books');
  await fs.mkdir(folder, { recursive: true });
  if (configured !== folder) store.set('books_folder_path', folder);
  return folder;
}

function senderIsTrusted(event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (![mainWindow, readWindow].includes(owner) || event.senderFrame !== event.sender.mainFrame) return false;
  const url = new URL(event.senderFrame.url);
  return isDev ? url.origin === new URL(rendererUrl).origin : url.protocol === 'file:';
}

function requireTrustedSender(event) {
  if (!senderIsTrusted(event)) throw new Error('Rejected IPC message from an untrusted renderer.');
}

function loadRenderer(window, route = '/') {
  if (isDev) return window.loadURL(`${rendererUrl}/#${route}`);
  return window.loadFile(appPath('app-dist', 'index.html'), { hash: route.replace(/^\//, '') });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: appPath('electron', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  loadRenderer(mainWindow);

  tray = new Tray(appPath('public', 'images', 'logo.png'));
  tray.setToolTip('fish-book');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主界面', click: () => mainWindow?.show() },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

function createReadWindow() {
  const config = normalizeConfig(store.store);
  const area = screen.getPrimaryDisplay().workArea;
  readWindow = new BrowserWindow({
    width: config.readerWidth,
    height: config.readerHeight,
    x: area.x + Math.floor((area.width - config.readerWidth) / 2),
    y: area.y + 50,
    frame: false,
    transparent: true,
    fullscreenable: false,
    // 拖动和缩放由应用实时更新完整窗口，避免 Windows 只显示系统轮廓。
    resizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: config.alwaysOnTop,
    ...(process.platform === 'win32' ? { backgroundMaterial: config.readerBackgroundEffect === 'glass' ? 'acrylic' : 'none' } : {}),
    webPreferences: {
      preload: appPath('electron', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  readWindow.setMinimumSize(100, 100);
  readWindow.setMaximumSize(1600, 900);
  applyReaderSettings(config, true);
  // 原生拖动/缩放后记忆位置，程序应用设置时不反向触发写入循环。
  const remember = () => {
    if (applyingBounds) return;
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!readWindow || readWindow.isDestroyed()) return;
      const bounds = readWindow.getBounds();
      store.set({ readerWidth: bounds.width, readerHeight: bounds.height,
        ...(store.get('rememberPosition') ? { readerX: bounds.x, readerY: bounds.y } : {}) });
      notifyConfig();
    }, 250);
  };
  readWindow.on('moved', remember);
  readWindow.on('resized', remember);
  readWindow.on('closed', () => { clearTimeout(boundsTimer); readerGesture = null; readWindow = null; });
  loadRenderer(readWindow, '/reader');
}

function applyReaderSettings(config, restorePosition = false) {
  if (!readWindow) return;
  applyingBounds = true;
  try {
    const old = readWindow.getBounds();
    const candidate = { x: restorePosition && config.rememberPosition && config.readerX !== null ? config.readerX : old.x,
      y: restorePosition && config.rememberPosition && config.readerY !== null ? config.readerY : old.y,
      width: config.readerWidth, height: config.readerHeight };
    const area = screen.getDisplayMatching(candidate).workArea;
    candidate.width = Math.min(candidate.width, area.width);
    candidate.height = Math.min(candidate.height, area.height);
    candidate.x = Math.round(Math.max(area.x, Math.min(candidate.x, area.x + area.width - candidate.width)));
    candidate.y = Math.round(Math.max(area.y, Math.min(candidate.y, area.y + area.height - candidate.height)));
    readWindow.setBounds(candidate);
    // 背景和文字分别在渲染层控制透明度，不能再衰减整个窗口。
    readWindow.setOpacity(1);
    readWindow.setResizable(false);
    readWindow.setAlwaysOnTop(config.alwaysOnTop);
    if (process.platform === 'win32' && typeof readWindow.setBackgroundMaterial === 'function') {
      try { readWindow.setBackgroundMaterial(config.readerBackgroundEffect === 'glass' ? 'acrylic' : 'none'); }
      catch { /* 较旧的 Windows 会忽略系统材质，渲染层仍提供毛玻璃回退。 */ }
    }
  } finally { applyingBounds = false; }
}

function registerShortcuts(config) {
  globalShortcut.unregisterAll();
  shortcutErrors = [];
  for (const [key, action] of [['key1', 'previous'], ['key2', 'next'], ['key3', 'toggle'], ['key4', 'exit-clean']]) {
    try {
      const ok = globalShortcut.register(config[key].replace(/\s/g, ''), () => {
        // 退出清屏只同步阅读状态，不创建、显隐或销毁窗口，也不改变阅读进度。
        if (action === 'exit-clean') { store.set('cleanMode', false); notifyConfig(); return; }
        if (!readWindow) createReadWindow();
        if (action === 'toggle') readWindow.isVisible() ? readWindow.hide() : readWindow.show();
        else readWindow.webContents.send('reader:command', action);
      });
      if (!ok) shortcutErrors.push(`${config[key]} 已被占用，请更换快捷键`);
    } catch { shortcutErrors.push(`${config[key]} 不是有效的快捷键`); }
  }
  // 系统重启后快捷键可能被其他软件占用，不能恢复到无法退出的清屏状态。
  if (shortcutErrors.length && store.get('cleanMode')) { store.set('cleanMode', false); notifyConfig(); }
}

async function readBook(fileName, start = 0, length = Infinity) {
  const { text } = await readBookDetails(fileName);
  return length === Infinity ? text.slice(start) : text.slice(start, start + length);
}

async function readBookDetails(fileName) {
  const { supportedBook, MAX_BOOK_BYTES, parseBook } = await bookParser;
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName || !supportedBook(fileName)) throw new Error('无效的本地书籍文件名');
  const file = path.join(await booksFolder(), fileName);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_BOOK_BYTES) throw new Error('书籍不是普通文件或大小超过 32 MB');
  const signature = `${stat.mtimeMs}:${stat.size}`;
  const cached = parsedBooks.get(file);
  if (cached?.signature === signature) return cached.book;
  const buffer = await fs.readFile(file);
  // 旧 TXT 继续沿用原来的解码器，避免既有进度和书签偏移变化。
  const book = parseBook(fileName, buffer, { decodeTxt: data => iconv.decode(Buffer.from(data), jschardet.detect(data).encoding || 'utf-8') });
  parsedBooks.set(file, { signature, book });
  if (parsedBooks.size > 4) parsedBooks.delete(parsedBooks.keys().next().value);
  return book;
}

function notifyConfig() {
  const config = { ...normalizeConfig(store.store), shortcutErrors };
  mainWindow?.webContents.send('config:changed', config);
  readWindow?.webContents.send('config:changed', config);
}

ipcMain.handle('config:get', event => { requireTrustedSender(event); return { ...normalizeConfig(store.store), shortcutErrors }; });
ipcMain.handle('config:set', (event, key, value) => {
  requireTrustedSender(event);
  if (!Object.hasOwn(DEFAULT_CONFIG, key) && key !== 'books_folder_path') throw new Error('Unknown configuration key.');
  const config = normalizeConfig({ ...store.store, [key]: value });
  store.set(key, config[key]);
  if (['readerWidth', 'readerHeight', 'bgOpacity', 'readerBackgroundEffect', 'resizable', 'alwaysOnTop'].includes(key)) applyReaderSettings(config);
  if (['key1', 'key2', 'key3', 'key4'].includes(key)) registerShortcuts(config);
  notifyConfig();
  return { ...config, shortcutErrors };
});
ipcMain.handle('books:import', async event => {
  requireTrustedSender(event);
  const { BOOK_EXTENSIONS, MAX_BOOK_BYTES, parseBook } = await bookParser;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: '小说书籍', extensions: BOOK_EXTENSIONS }] });
  if (result.canceled) return { imported: [], errors: [] };
  const folder = await booksFolder();
  const imported = [];
  const errors = [];
  for (const file of result.filePaths) {
    const name = path.basename(file);
    try {
      if ((await fs.stat(file)).size > MAX_BOOK_BYTES) throw new Error('文件大小超过 32 MB 限制');
      const data = await fs.readFile(file);
      const book = parseBook(name, data, { decodeTxt: bytes => iconv.decode(Buffer.from(bytes), jschardet.detect(bytes).encoding || 'utf-8') });
      if (path.resolve(file) !== path.resolve(folder, name)) await fs.writeFile(path.join(folder, name), data, { flag: 'wx' });
      const config = normalizeConfig(store.store);
      const existing = config.booksInfo.find(item => item.bookName === name);
      store.set('booksInfo', [...config.booksInfo.filter(item => item.bookName !== name), { bookName: name, displayName: book.title, author: book.author, format: book.format, start: 0, bookProgress: 0, total: book.text.length, ...existing }]);
      imported.push(name);
    } catch (error) { errors.push({ name, message: error.code === 'EEXIST' ? '同名书籍已存在，未覆盖' : error.message }); }
  }
  notifyConfig();
  return { imported, errors };
});
ipcMain.handle('books:select', async (event, name) => {
  requireTrustedSender(event);
  const text = await readBook(name);
  const config = normalizeConfig(store.store);
  const saved = config.booksInfo.find(book => book.bookName === name);
  const start = Math.min(Math.max(0, Number(saved?.start) || 0), Math.max(0, text.length - 1));
  store.set({ currentBookName: name, start, currentBookProgress: text.length ? Math.round(start / text.length * 100) : 0 });
  notifyConfig();
  return normalizeConfig(store.store);
});
ipcMain.handle('books:progress', async (event, name, requestedStart) => {
  requireTrustedSender(event);
  if (name !== store.get('currentBookName')) return normalizeConfig(store.store);
  const text = await readBook(name);
  if (name !== store.get('currentBookName')) return normalizeConfig(store.store);
  const start = Math.round(Math.max(0, Math.min(Number(requestedStart) || 0, Math.max(0, text.length - 1))));
  const progress = text.length ? Math.round(start / text.length * 100) : 0;
  const config = normalizeConfig(store.store);
  const books = config.booksInfo.filter(book => book.bookName !== name);
  books.push({ ...config.booksInfo.find(book => book.bookName === name), bookName: name, start, bookProgress: progress, total: text.length, scrollTop: 0, lastReadAt: new Date().toISOString() });
  store.set({ start, currentBookProgress: progress, booksInfo: books });
  notifyConfig();
  return normalizeConfig(store.store);
});
ipcMain.handle('books:list', async event => {
  requireTrustedSender(event);
  const files = await fs.readdir(await booksFolder());
  const { supportedBook } = await bookParser;
  return files.filter(supportedBook).sort((a, b) => a.localeCompare(b, 'zh-CN'));
});
ipcMain.handle('books:update', async (event, name, patch) => {
  requireTrustedSender(event);
  await readBook(name);
  const config = normalizeConfig(store.store);
  const previous = config.booksInfo.find(book => book.bookName === name) || { bookName: name, start: 0 };
  const next = { ...previous };
  for (const key of ['displayName', 'notes', 'tags', 'status']) if (typeof patch[key] === 'string') next[key] = patch[key].slice(0, key === 'notes' ? 10000 : 200);
  if (Number.isFinite(patch.scrollTop)) next.scrollTop = Math.max(0, patch.scrollTop);
  if (Array.isArray(patch.bookmarks)) next.bookmarks = patch.bookmarks.slice(0, 200).filter(item => Number.isFinite(item.start) && item.start >= 0).map(item => ({ start: item.start, title: String(item.title || '书签').slice(0, 100) }));
  store.set('booksInfo', [...config.booksInfo.filter(book => book.bookName !== name), next]);
  notifyConfig();
  return normalizeConfig(store.store);
});
ipcMain.handle('books:read', (event, fileName, start, length) => { requireTrustedSender(event); return readBook(fileName, start, length); });
ipcMain.handle('books:details', (event, name) => { requireTrustedSender(event); return readBookDetails(name); });
ipcMain.handle('books:total', async (event, fileName) => { requireTrustedSender(event); return (await readBook(fileName)).length; });
ipcMain.handle('books:open-folder', async event => { requireTrustedSender(event); return shell.openPath(await booksFolder()); });
ipcMain.handle('window:action', (event, action) => {
  requireTrustedSender(event);
  const window = BrowserWindow.fromWebContents(event.sender);
  if (action === 'minimize') window.minimize();
  if (action === 'toggle-maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  if (action === 'close') window.hide();
});
ipcMain.handle('reader:show', event => {
  requireTrustedSender(event);
  if (!readWindow) createReadWindow();
  readWindow.show();
});
ipcMain.handle('reader:hide', event => { requireTrustedSender(event); readerGesture = null; readWindow?.hide(); });
ipcMain.on('reader:gesture-start', (event, edge, point) => {
  requireTrustedSender(event);
  if (!readWindow || BrowserWindow.fromWebContents(event.sender) !== readWindow) return;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const normalizedEdge = typeof edge === 'string' ? edge : '';
  if (!['', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(normalizedEdge)) return;
  const config = normalizeConfig(store.store);
  if (normalizedEdge && (!config.resizable || config.cleanMode)) return;
  readerGesture = { senderId: event.sender.id, edge: normalizedEdge, start: point, origin: readWindow.getBounds() };
});
ipcMain.on('reader:gesture-update', (event, point) => {
  requireTrustedSender(event);
  if (!readerGesture || readerGesture.senderId !== event.sender.id || !readWindow) return;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  readWindow.setBounds(readerGestureBounds(readerGesture.origin, readerGesture.start, point, readerGesture.edge));
});
ipcMain.on('reader:gesture-end', event => {
  requireTrustedSender(event);
  if (readerGesture?.senderId === event.sender.id) readerGesture = null;
});
ipcMain.handle('reader:reset-position', event => {
  requireTrustedSender(event);
  if (!readWindow) createReadWindow();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const bounds = readWindow.getBounds();
  readWindow.setPosition(Math.round(area.x + (area.width - bounds.width) / 2), area.y + 60);
  readWindow.show();
});
ipcMain.handle('external:open', (event, url) => {
  requireTrustedSender(event);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only HTTPS links may be opened.');
  return shell.openExternal(parsed.toString());
});

app.whenReady().then(() => {
  createWindow();
  createReadWindow();
  registerShortcuts(normalizeConfig(store.store));
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); clearTimeout(boundsTimer); readerGesture = null; });
