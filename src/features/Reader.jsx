import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, List, Scan, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fishBook } from '@/lib/fish-book';
import { parseChapters, currentChapter } from '@/lib/chapters.mjs';
import { useReaderPagination } from './useReaderPagination';
import { shortcutAction } from '@/lib/shortcuts.mjs';

const api = fishBook();
export const fontFamilies = { sans: '"Microsoft YaHei", "PingFang SC", sans-serif', serif: '"Noto Serif SC", "SimSun", serif', mono: 'Consolas, "Microsoft YaHei", monospace' };
export function readingStyle(config) {
  const alpha = Math.round((config.bgOpacity ?? 0.15) * 255).toString(16).padStart(2, '0');
  const color = config.textColor || '#36433c';
  const background = config.textBgColor || '#f6f5f0';
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  // 透明窗口无法可靠读取后方应用颜色，按字色配置反差描边，保护跨背景可读性。
  const lightText = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 150;
  const halo = lightText ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.68)';
  const effect = config.readerBackgroundEffect || 'glass';
  return { color, backgroundColor: effect === 'transparent' ? 'transparent' : `${background}${alpha}`, fontSize: `${config.fontSize}px`, lineHeight: config.lineHeight, letterSpacing: `${config.letterSpacing}px`, fontFamily: fontFamilies[config.fontFamily], textAlign: config.textAlign, '--reader-ink-halo': halo, '--reader-fg': color, '--reader-bg': background, '--reader-scroll-thumb': `${color}99`, '--reader-frost-border': `${color}2e`, '--reader-blur': `${config.readerBlur ?? 14}px`, '--ring': color };
}

export function Reader({ config, onDrag }) {
  const [spaceDown, setSpaceDown] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [query, setQuery] = useState('');
  const dragPointer = useRef(null);
  const scrollTimer = useRef(null);
  const [content, setContent] = useState('');
  const [bookChapters, setBookChapters] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const textRef = useRef(null);
  const pageHistory = useRef([]);
  const pendingTurn = useRef(null);
  const [turn, setTurn] = useState({ sequence: 0, direction: 1 });
  const latestConfig = useRef(config);
  latestConfig.current = config;
  const name = config.currentBookName;
  const setClean = value => api.setConfig('cleanMode', value).catch(err => setError(err.message));
  const startNativeGesture = useCallback((event, edge = '') => {
    if (api.platform !== 'electron' || event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    dragPointer.current = { element, id: event.pointerId };
    api.startReaderGesture(edge, { x: event.screenX, y: event.screenY });
    element.onpointermove = move => api.updateReaderGesture({ x: move.screenX, y: move.screenY });
    const finish = () => {
      element.onpointermove = null; element.onpointerup = null; element.onpointercancel = null; element.onlostpointercapture = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      dragPointer.current = null;
      api.endReaderGesture();
    };
    element.onpointerup = finish; element.onpointercancel = finish; element.onlostpointercapture = finish;
  }, []);
  useEffect(() => {
    const release = () => {
      setSpaceDown(false);
      const pointer = dragPointer.current;
      if (pointer?.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id);
      dragPointer.current = null;
      if (api.platform === 'electron') api.endReaderGesture();
    };
    const keydown = event => {
      // 已配置的快捷键优先，不重复触发默认翻页或空格拖动。
      if (event.defaultPrevented || shortcutAction(event, latestConfig.current)) return;
      if (event.isComposing || event.target.closest('input, textarea, select, [contenteditable=true]')) return;
      if (event.key === 'Escape') { setDirectory(false); api.setConfig('cleanMode', false).catch(err => setError(err.message)); }
      if (event.code === 'Space' && !event.ctrlKey && !event.altKey && !event.metaKey && event.target.closest('.reader-surface')) { event.preventDefault(); setSpaceDown(true); }
    };
    const keyup = event => { if (event.code === 'Space') release(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', release);
    return () => { release(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', release); clearTimeout(scrollTimer.current); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setBookChapters(null); setContent(''); pageHistory.current = []; pendingTurn.current = null;
    if (!name) { setContent(''); setLoading(false); return undefined; }
    api.getBookDetails(name).then(book => { if (active) { setContent(book.text); setBookChapters(book.chapters); } }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [name]);
  const start = Math.min(config.start || 0, Math.max(0, content.length - 1));
  const pageSize = config.wordsPerPage;
  const pagination = useReaderPagination(textRef, content, start, config);
  const end = pagination.end;
  const pageText = content.slice(start, end);
  useLayoutEffect(() => {
    if (!pendingTurn.current) return;
    const direction = pendingTurn.current;
    pendingTurn.current = null;
    setTurn(value => ({ sequence: value.sequence + 1, direction }));
  }, [start]);
  const go = useCallback(async direction => {
    if (busy.current || loading || !content.length || direction > 0 && end >= content.length) return;
    clearTimeout(scrollTimer.current);
    const last = pageHistory.current.at(-1);
    const previous = pagination.automatic ? (last?.end === start && last.layout === pagination.layout ? last.start : pagination.previous()) : Math.max(0, start - pageSize);
    const next = direction > 0 ? end : previous;
    if (next === start) return;
    pendingTurn.current = direction;
    busy.current = true;
    try {
      await api.saveProgress(name, next);
      if (direction > 0) pageHistory.current.push({ start, end, layout: pagination.layout });
      else if (last?.start === next) pageHistory.current.pop();
      else pageHistory.current = [];
    }
    catch (err) { pendingTurn.current = null; setError(err.message); }
    finally { busy.current = false; }
  }, [content.length, name, pageSize, start, end, loading, pagination]);
  useEffect(() => api.onReaderCommand(command => { if (command === 'previous') go(-1); else if (command === 'next') go(1); }), [go]);
  useEffect(() => { if (textRef.current && !loading) textRef.current.scrollTop = pagination.automatic ? 0 : config.booksInfo.find(book => book.bookName === name)?.scrollTop || 0; }, [start, name, loading, pagination.automatic, end]);
  const chapters = useMemo(() => bookChapters || parseChapters(content), [content, bookChapters]);
  const chapter = currentChapter(chapters, start);
  const jump = async offset => { try { pendingTurn.current = offset < start ? -1 : 1; await api.saveProgress(name, offset); pageHistory.current = []; setDirectory(false); } catch (err) { pendingTurn.current = null; setError(err.message); } };
  const bookmark = async () => {
    const old = config.booksInfo.find(book => book.bookName === name)?.bookmarks || [];
    try { await api.updateBook(name, { bookmarks: [...old.filter(item => item.start !== start), { start, title: chapter }] }); } catch (err) { setError(err.message); }
  };
  const progress = content.length ? Math.round(start / content.length * 100) : 0;
  const effect = config.readerBackgroundEffect || 'glass';
  return <section className={`reader-surface reader-effect-${effect} ${spaceDown ? 'space-drag' : ''} ${config.cleanMode ? 'is-clean' : ''}`} style={{ ...readingStyle(config), borderRadius: config.readerRadius }}>
    <header className="reader-header" onPointerDown={event => { if (event.target.closest('button')) return; if (onDrag) onDrag(event); else startNativeGesture(event); }}><span className="reader-chapter" title={chapter}>{chapter}</span>
    <div className="reader-tools"><Button variant="ghost" size="icon" aria-label="章节目录" onClick={() => setDirectory(value => !value)}><List size={14} /></Button><Button variant="ghost" size="icon" aria-label="添加书签" disabled={!content} onClick={bookmark}><Bookmark size={14} /></Button><Button variant="ghost" size="icon" aria-label="进入清屏模式" title={`清屏，${config.key4 || 'Alt+Q'} 或 Esc 退出`} onClick={() => { if (config.shortcutErrors?.length) { setError('请先解决快捷键冲突，或从主界面退出清屏。'); return; } setDirectory(false); setClean(true); }}><Scan size={14} /></Button><Button className="reader-close no-drag" variant="ghost" size="icon" title="隐藏阅读器" aria-label="隐藏阅读器" onClick={() => api.hideReader()}><X size={14} /></Button></div></header>
    {directory && !config.cleanMode && <div className="reader-directory"><div className="directory-heading"><Button variant="ghost" size="icon" aria-label="返回阅读" title="返回阅读" onClick={() => setDirectory(false)}><ChevronLeft size={18} /></Button><strong>章节目录</strong><span>{chapters.length} 章</span></div><input aria-label="搜索章节" placeholder="搜索章节" value={query} onChange={event => setQuery(event.target.value)} /><div className="directory-list" role="region" aria-label="章节列表" tabIndex={0}>{chapters.length ? chapters.filter(item => item.title.includes(query)).map(item => <button key={item.start} aria-current={chapter === item.title ? 'location' : undefined} onClick={() => jump(item.start)}>{item.title}</button>) : <p>未识别到章节</p>}{chapters.length > 0 && !chapters.some(item => item.title.includes(query)) && <p>没有匹配的章节</p>}</div></div>}
    <div className="reader-text" ref={textRef} onPointerDown={event => { if (spaceDown) { if (onDrag) { dragPointer.current = { element: event.currentTarget, id: event.pointerId }; onDrag(event); } else startNativeGesture(event); } }} onScroll={event => { const scrollTop = event.currentTarget.scrollTop; clearTimeout(scrollTimer.current); if (name && !pagination.automatic) scrollTimer.current = setTimeout(() => api.updateBook(name, { scrollTop }).catch(err => setError(err.message)), 180); }} style={{ padding: `4px ${config.readerPadding}px 6px`, opacity: config.textOpacity ?? 1 }} tabIndex={0} onKeyDown={event => {
      if (!shortcutAction(event, config) && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); go(event.key === 'ArrowLeft' ? -1 : 1); }
    }}><div key={turn.sequence} className={`reader-page ${turn.direction < 0 ? 'turn-previous' : 'turn-next'}`}>{loading ? '正在读取…' : error ? <span role="alert">无法读取：{error}</span> : pageText || '请先在书架导入并打开一本书籍。'}</div></div>
    <footer className={`reader-footer ${config.showProgress ? 'show-progress' : ''}`}><Button variant="ghost" size="icon" aria-label="上一页" disabled={loading || !start || !content.length} onClick={() => go(-1)}><ChevronLeft size={15} /></Button><span>{config.showProgress ? (pagination.automatic ? `${progress}% · ${chapter}` : `${progress}% · ${Math.floor(start / pageSize) + 1} / ${Math.max(1, Math.ceil(content.length / pageSize))} 页`) : ''}</span><Button variant="ghost" size="icon" aria-label="下一页" disabled={loading || end >= content.length} onClick={() => go(1)}><ChevronRight size={15} /></Button></footer>
    {api.platform === 'electron' && config.resizable && !config.cleanMode && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(edge => <div key={edge} aria-hidden="true" className={`reader-resize edge-${edge}`} onPointerDown={event => startNativeGesture(event, edge)} />)}
  </section>;
}
