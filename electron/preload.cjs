const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fishBook', {
  platform: 'electron',
  getBookDetails: name => ipcRenderer.invoke('books:details', name),
  updateBook: (name, patch) => ipcRenderer.invoke('books:update', name, patch),
  importBooks: () => ipcRenderer.invoke('books:import'),
  selectBook: name => ipcRenderer.invoke('books:select', name),
  saveProgress: (name, start) => ipcRenderer.invoke('books:progress', name, start),
  resetReaderPosition: () => ipcRenderer.invoke('reader:reset-position'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  listBooks: () => ipcRenderer.invoke('books:list'),
  readBook: (fileName, start, length) => ipcRenderer.invoke('books:read', fileName, start, length),
  getBookLength: fileName => ipcRenderer.invoke('books:total', fileName),
  openBooksFolder: () => ipcRenderer.invoke('books:open-folder'),
  windowAction: action => ipcRenderer.invoke('window:action', action),
  showReader: () => ipcRenderer.invoke('reader:show'),
  hideReader: () => ipcRenderer.invoke('reader:hide'),
  startReaderGesture: (edge, point) => ipcRenderer.send('reader:gesture-start', edge, point),
  updateReaderGesture: point => ipcRenderer.send('reader:gesture-update', point),
  endReaderGesture: () => ipcRenderer.send('reader:gesture-end'),
  openExternal: url => ipcRenderer.invoke('external:open', url),
  onReaderCommand: listener => {
    const callback = (_event, command) => listener(command);
    ipcRenderer.on('reader:command', callback);
    return () => ipcRenderer.removeListener('reader:command', callback);
  },
  onConfigChanged: listener => {
    const callback = (_event, config) => listener(config);
    ipcRenderer.on('config:changed', callback);
    return () => ipcRenderer.removeListener('config:changed', callback);
  },
});
