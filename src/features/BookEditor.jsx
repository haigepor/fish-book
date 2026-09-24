import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookSelect } from '@/components/BookSelect';
import { fishBook, displayTitle } from '@/lib/fish-book';
import { currentChapter } from '@/lib/chapters.mjs';
const api = fishBook();

export function BookEditor({ name, config, onClose }) {
  const saved = config.booksInfo.find(book => book.bookName === name) || {};
  const [draft, setDraft] = useState({ displayName: saved.displayName || displayTitle(name), tags: saved.tags || '', notes: saved.notes || '', status: saved.status || 'reading' });
  const [chapters, setChapters] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; api.getBookDetails(name).then(book => { if (active) setChapters(book.chapters); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [name]);
  const field = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const jump = async offset => { setBusy(true); try { await api.selectBook(name); await api.saveProgress(name, offset); await api.showReader(); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const save = async () => { setBusy(true); try { await api.updateBook(name, draft); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="book-editor"><DialogHeader><DialogTitle>书籍资料</DialogTitle><DialogDescription>仅编辑应用内资料，不修改原始书籍文件。</DialogDescription></DialogHeader>
    <div className="book-facts"><strong>{currentChapter(chapters, saved.start || 0)}</strong><span>已读 {saved.bookProgress || 0}%</span><small>最后阅读：{saved.lastReadAt ? new Date(saved.lastReadAt).toLocaleString() : '暂无记录'}</small></div>
    <p className="field-hint">格式：{name.split('.').pop().toUpperCase()} · 作者：{saved.author || '未知'} · {chapters.length} 个章节</p><label>显示书名<input value={draft.displayName} maxLength={200} onChange={event => field('displayName', event.target.value)} /></label>
    <label>标签<input value={draft.tags} maxLength={200} placeholder="例如：小说、待读" onChange={event => field('tags', event.target.value)} /></label>
    <BookSelect label="阅读状态" value={draft.status} onChange={value => field('status', value)} options={[{ value: 'reading', label: '阅读中' }, { value: 'later', label: '待读' }, { value: 'finished', label: '已读完' }]} />
    <label>备注<textarea rows={3} maxLength={10000} value={draft.notes} onChange={event => field('notes', event.target.value)} /></label>
    <BookSelect label="章节跳转" value="" disabled={busy || !chapters.length} placeholder={chapters.length ? '选择章节并开始阅读' : '未识别到章节'} onChange={value => jump(Number(value))} options={chapters.map(item => ({ value: String(item.start), label: item.title }))} />
    <div className="saved-bookmarks"><strong>已保存书签</strong>{saved.bookmarks?.length ? saved.bookmarks.map(item => <Button key={item.start} variant="outline" disabled={busy} onClick={() => jump(item.start)}>{item.title} · 位置 {item.start}</Button>) : <p>在阅读器中点击书签按钮即可保存。</p>}</div>
    {error && <p role="alert">{error}</p>}<div className="editor-actions"><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm('确定重置这本书的阅读进度？备注和书签会保留。')) jump(0); }}>重置进度</Button><Button variant="ghost" onClick={onClose}>取消</Button><Button disabled={busy} onClick={save}>保存资料</Button></div>
  </DialogContent></Dialog>;
}
