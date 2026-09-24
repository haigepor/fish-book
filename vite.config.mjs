import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// Electron 主进程需要 CommonJS 才能在 ASAR 中稳定加载；浏览器调试则需要 ESM。
// 只转换这两个共享模块，避免引入第二份解析器实现后产生行为漂移。
function sharedCommonJsForBrowser() {
  const formatsFile = path.resolve(root, 'electron/book-formats.cjs');
  const parserFile = path.resolve(root, 'electron/book-parser.cjs');
  const formatsId = '\0fish-book:formats';
  const parserId = '\0fish-book:parser';
  return {
    name: 'fish-book-shared-commonjs',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:fish-book-formats') return formatsId;
      if (id === 'virtual:fish-book-parser') return parserId;
      return null;
    },
    load(id) {
      if (![formatsId, parserId].includes(id)) return null;
      const file = id === formatsId ? formatsFile : parserFile;
      this.addWatchFile(file);
      const code = readFileSync(file, 'utf8');
      if (id === formatsId) {
        return code.replace('module.exports = { BOOK_EXTENSIONS, MAX_BOOK_BYTES, bookFormat, supportedBook };', 'export { BOOK_EXTENSIONS, MAX_BOOK_BYTES, bookFormat, supportedBook };');
      }
      return code
        .replace("const { unzipSync } = require('fflate');", "import { unzipSync } from 'fflate';")
        .replace("const { parseDocument } = require('htmlparser2');", "import { parseDocument } from 'htmlparser2';")
        .replace("const { BOOK_EXTENSIONS, MAX_BOOK_BYTES, bookFormat, supportedBook } = require('./book-formats.cjs');", "import { BOOK_EXTENSIONS, MAX_BOOK_BYTES, bookFormat, supportedBook } from 'virtual:fish-book-formats';")
        .replace('module.exports = { BOOK_EXTENSIONS, MAX_BOOK_BYTES, supportedBook, decodeText, textChapters, parseBook };', 'export { BOOK_EXTENSIONS, MAX_BOOK_BYTES, supportedBook, decodeText, textChapters, parseBook };');
    },
  };
}

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [sharedCommonJsForBrowser(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    outDir: 'app-dist',
    emptyOutDir: true,
  },
});
