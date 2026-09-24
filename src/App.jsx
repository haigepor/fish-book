import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, LibraryBig, SlidersHorizontal, Moon, Sun, Monitor, Minus, Maximize2, X, Search, Plus, RefreshCw, FolderOpen, ArrowUpRight, ChevronRight, Check, PanelTop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { fishBook, displayTitle } from '@/lib/fish-book';
import { Preferences, Preview } from './features/Preferences';
import { Reader } from './features/Reader';
import { BookEditor } from './features/BookEditor';
import { FishMark, ReadingArt, BookCover, AmbientArt } from './components/ReadingArt';

const api = fishBook();
const isBrowser = api.platform === 'browser';

function useConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.getConfig().then(value => { if (active) setConfig(value); }).catch(err => setError(err.message));
    const unsubscribe = api.onConfigChanged(setConfig);
    return () => { active = false; unsubscribe(); };
  }, []);
  const update = useCallback(async (key, value) => {
    try { const next = await api.setConfig(key, value); setConfig(next); return next; }
    catch (err) { setError(err.message); return undefined; }
  }, []);
  return { config, update, error, setError };
}

export function ThemeChoice({ theme, onChange }) {
  return <div className="theme-choice" role="group" aria-label="界面主题">{[
    ['white', Sun, '亮色'], ['dark', Moon, '暗黑'], ['system', Monitor, '跟随系统'],
  ].map(([value, Icon, label]) => <Button key={value} title={label} aria-label={label} aria-pressed={theme === value} variant="ghost" size="icon" onClick={() => onChange(value)}><Icon size={16} /></Button>)}</div>;
}

function BrowserReader({ config }) {
  const [visible, setVisible] = useState(false);
  const [bounds, setBounds] = useState(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    const toggle = () => setVisible(value => !value);
    const reset = () => {
      api.setConfig('readerX', 30); api.setConfig('readerY', 100);
      setBounds(null); setVisible(true);
    };
    const events = { 'fish:show-reader': show, 'fish:hide-reader': hide, 'fish:toggle-reader': toggle, 'fish:reset-reader': reset };
    Object.entries(events).forEach(([name, fn]) => window.addEventListener(name, fn));
    return () => Object.entries(events).forEach(([name, fn]) => window.removeEventListener(name, fn));
  }, []);
  const width = Math.min(bounds?.width ?? config.readerWidth, viewport.width - 20);
  const height = Math.min(bounds?.height ?? config.readerHeight, viewport.height - 50);
  const left = Math.max(0, Math.min(bounds?.x ?? (config.rememberPosition ? config.readerX : null) ?? 60, viewport.width - width));
  const top = Math.max(40, Math.min(bounds?.y ?? (config.rememberPosition ? config.readerY : null) ?? 110, viewport.height - height));
  const startGesture = (event, edge = '') => {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const origin = { x: left, y: top, width, height };
    let next = origin;
    const mouseX = event.clientX; const mouseY = event.clientY;
    element.onpointermove = move => {
      const dx = move.clientX - mouseX; const dy = move.clientY - mouseY;
      next = { ...origin };
      if (!edge) {
        next.x = Math.max(0, Math.min(viewport.width - width, origin.x + dx));
        next.y = Math.max(40, Math.min(viewport.height - height, origin.y + dy));
      } else {
        if (edge.includes('e')) next.width = Math.max(100, Math.min(viewport.width - origin.x, width + dx));
        if (edge.includes('s')) next.height = Math.max(100, Math.min(viewport.height - origin.y, height + dy));
        if (edge.includes('w')) { next.x = Math.max(0, Math.min(origin.x + width - 100, origin.x + dx)); next.width = width + origin.x - next.x; }
        if (edge.includes('n')) { next.y = Math.max(40, Math.min(origin.y + height - 100, origin.y + dy)); next.height = height + origin.y - next.y; }
      }
      setBounds(next);
    };
    const finish = async () => {
      element.onpointermove = null; element.onpointerup = null; element.onpointercancel = null; element.onlostpointercapture = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      // 只在手势结束保存，避免每个像素都写入存储。
      try {
        if (edge) { await api.setConfig('readerWidth', Math.round(next.width)); await api.setConfig('readerHeight', Math.round(next.height)); }
        if (config.rememberPosition) { await api.setConfig('readerX', Math.round(next.x)); await api.setConfig('readerY', Math.round(next.y)); }
      } finally { if (config.rememberPosition) setBounds(null); }
    };
    element.onpointerup = finish; element.onpointercancel = finish; element.onlostpointercapture = finish;
  };
  if (!visible) return null;
  return <div className="browser-reader" role="region" aria-label="浏览器阅读浮层" style={{ left, top, width, height, borderRadius: config.readerRadius }}>
    <Reader config={config} onDrag={event => startGesture(event)} />
    {config.resizable && !config.cleanMode && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(edge => <div key={edge} aria-hidden="true" className={`reader-resize edge-${edge}`} onPointerDown={event => startGesture(event, edge)} />)}
  </div>;
}

function Library({ config, onError, onSettings }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setBooks(await api.listBooks()); }
    catch (error) { onError(error.message); }
    finally { setLoading(false); }
  }, [onError]);
  useEffect(() => { refresh(); }, [refresh]);
  const read = async name => {
    setBusy(true);
    try { await api.selectBook(name); await api.showReader(); }
    catch (error) { onError(error.message); }
    finally { setBusy(false); }
  };
  const importBooks = async () => {
    setBusy(true);
    try { setImportResult(await api.importBooks()); await refresh(); }
    catch (error) { onError(error.message); }
    finally { setBusy(false); }
  };
  const current = books.includes(config.currentBookName) ? config.currentBookName : null;
  const visible = books.filter(name => `${displayTitle(name)} ${config.booksInfo.find(book => book.bookName === name)?.displayName || ''}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || name === current));
  return <div className="workspace">
    {editing && <BookEditor key={editing} name={editing} config={config} onClose={() => setEditing(null)} />}
    {importResult && (importResult.imported.length > 0 || importResult.errors.length > 0) && <div className="import-result" role="status"><strong>已导入 {importResult.imported.length} 本{importResult.errors.length ? `，${importResult.errors.length} 本未导入` : ''}</strong>{importResult.errors.map((item, index) => <p key={index}>{item.name}：{item.message}</p>)}<Button variant="ghost" onClick={() => setImportResult(null)}>关闭导入结果</Button></div>}
    <div className="page-heading"><div><p className="eyebrow">你的私人阅读空间</p><h1>我的书架<span>{books.length} 本</span></h1><p className="muted">给忙碌留一点空白，接着读完喜欢的故事。</p></div><Button disabled={busy} onClick={importBooks}><Plus /> {busy ? '处理中…' : '导入书籍'}</Button></div>
    <div className={`library-layout ${previewOpen ? '' : 'preview-collapsed'}`}><div className="library-main">
      <Card className="continue-card"><ReadingArt className="continue-art" /><div className="continue-copy"><span className="eyebrow">{current ? '继续上次阅读' : '从一本书开始'}</span><h2>{current ? (config.booksInfo.find(book => book.bookName === current)?.displayName || displayTitle(current)) : '把喜欢的故事放进书架'}</h2><p>{current ? `已读 ${config.currentBookProgress || 0}% · 阅读进度自动保存` : '支持 TXT、EPUB、HTML / HTM、FB2 · 单本最大 32 MB'}</p>{current && <div className="reading-track"><span style={{ width: `${config.currentBookProgress || 0}%` }} /></div>}</div><Button disabled={busy} onClick={() => current ? read(current) : importBooks()}>{current ? '继续阅读' : '导入书籍'}<ChevronRight /></Button></Card>
      <div className="library-toolbar"><Button variant="outline" aria-expanded={previewOpen} onClick={() => setPreviewOpen(value => !value)}><PanelTop size={15} />{previewOpen ? '收起预览' : '阅读器预览'}</Button><div className="filter-choice" role="group" aria-label="筛选书籍"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部书籍</button><button aria-pressed={filter === 'reading'} onClick={() => setFilter('reading')}>正在阅读</button></div><div className="search-box"><Search size={16} /><Input aria-label="搜索书名" placeholder="搜索书名…" value={query} onChange={event => setQuery(event.target.value)} /></div><Button variant="ghost" size="icon" title="刷新书架" aria-label="刷新书架" onClick={refresh} disabled={loading}><RefreshCw size={16} /></Button></div>
      {loading ? <div className="empty-state" role="status">正在读取书架…</div> : visible.length ? <div className="book-grid">{visible.map(name => {
        const active = name === current;
        const saved = config.booksInfo.find(book => book.bookName === name);
        const progress = active ? config.currentBookProgress : saved?.bookProgress || 0;
        return <Card key={name} className={`book-card ${active ? 'is-current' : ''}`}><BookCover name={name} bookmarked={Boolean(saved?.bookmarks?.length)} /><div className="book-card-top"><span className="eyebrow">私人藏书</span><span className="file-type">{name.split('.').pop().toUpperCase()}</span></div><h3 title={saved?.displayName || displayTitle(name)}>{saved?.displayName || displayTitle(name)}</h3><p className="muted">{active ? '正在阅读' : progress ? '已开始阅读' : '还未开始'} · {progress}%</p><div className="reading-track"><span style={{ width: `${progress}%` }} /></div><div className="book-card-actions"><Button variant="ghost" className="book-action" onClick={() => read(name)} disabled={busy}>{active ? '继续阅读' : '打开阅读'}<ArrowUpRight size={16} /></Button><Button variant="ghost" className="book-edit" aria-label={`编辑 ${displayTitle(name)}`} onClick={() => setEditing(name)}>编辑</Button></div></Card>;
      })}</div> : <div className="empty-state"><ReadingArt /><h3>{query || filter !== 'all' ? '没有找到匹配的书籍' : '书架准备好了'}</h3><p>{query ? '试试其他关键词。' : '导入 TXT、EPUB、HTML/HTM 或 FB2，开始阅读。'}</p><Button variant="outline" onClick={query || filter !== 'all' ? () => { setQuery(''); setFilter('all'); } : importBooks}>{query || filter !== 'all' ? '显示全部' : '导入书籍'}</Button></div>}
      <div className="library-foot"><Check size={14} /><span>{isBrowser ? '文件保存在此浏览器中' : '本地文件，不上传云端'}</span>{!isBrowser && <button onClick={() => api.openBooksFolder().catch(error => onError(error.message))}><FolderOpen size={14} />打开书库文件夹</button>}</div>
    </div><aside className="reading-aside" hidden={!previewOpen}><div className="section-label"><PanelTop size={16} /><h2>你的阅读器</h2></div><Preview config={config} /><p className="muted small">拖住阅读器顶部即可移动，正文区域支持滚动。</p><Button variant="outline" onClick={onSettings}>自定义阅读器<SlidersHorizontal size={15} /></Button><div className="shortcut-note"><h3>随手翻一页</h3><p><span>上一页</span><kbd>{config.key1}</kbd></p><p><span>下一页</span><kbd>{config.key2}</kbd></p><p><span>显示 / 隐藏</span><kbd>{config.key3}</kbd></p><small>{isBrowser ? '浏览器快捷键仅在页面获得焦点时有效。' : '快捷键在其他应用中也可以使用。'}</small></div></aside></div>
  </div>;
}

export default function App() {
  const { pathname } = useLocation();
  const { config, update, error, setError } = useConfig();
  const [page, setPage] = useState('library');
  const reader = pathname === '/reader';
  useEffect(() => {
    if (!config) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = config.theme === 'dark' || config.theme === 'system' && media.matches;
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [config?.theme]);
  useEffect(() => { document.body.classList.toggle('reader-window', reader); }, [reader]);
  if (!config) return <div className="boot-state" role="status">{error || '正在准备阅读空间…'}</div>;
  if (reader) return <Reader config={config} />;
  return <div className="app-shell">
    <header className="titlebar"><span>fish-book <span className="titlebar-divider">/</span> 私人阅读空间</span><div className="no-drag">{isBrowser ? <span className="preview-badge">浏览器调试版</span> : <><Button aria-label="最小化" size="icon" variant="ghost" onClick={() => api.windowAction('minimize')}><Minus /></Button><Button aria-label="最大化" size="icon" variant="ghost" onClick={() => api.windowAction('toggle-maximize')}><Maximize2 /></Button><Button aria-label="关闭窗口" size="icon" variant="ghost" onClick={() => api.windowAction('close')}><X /></Button></>}</div></header>
    <div className="app-body"><aside className="sidebar"><div className="brand"><span><FishMark /></span><div>fish-book<small>把阅读带在身边</small></div></div><p className="nav-caption">工作空间</p><nav><button aria-current={page === 'library' ? 'page' : undefined} onClick={() => setPage('library')}><LibraryBig size={18} /><span>我的书架</span></button><button aria-current={page === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}><SlidersHorizontal size={18} /><span>阅读偏好</span></button></nav><div className="sidebar-bottom"><div className="sidebar-tip"><BookOpen size={18} /><p>故事未完，<br />随时继续。</p></div><ThemeChoice theme={config.theme} onChange={value => update('theme', value)} /><span className="version">fish-book · 本地阅读</span></div></aside><main className="main-pane"><AmbientArt settings={page === 'settings'} />{page === 'library' ? <Library config={config} onError={setError} onSettings={() => setPage('settings')} /> : <Preferences config={config} update={update} onError={setError} />}</main></div>
    {error && <div className="error-toast" role="alert"><span>{error}</span><Button variant="ghost" size="icon" aria-label="关闭错误提示" onClick={() => setError('')}><X /></Button></div>}
    {isBrowser && <BrowserReader config={config} />}
  </div>;
}
