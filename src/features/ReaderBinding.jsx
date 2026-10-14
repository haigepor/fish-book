import { useCallback, useEffect, useState } from 'react';
import { AppWindow, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fishBook } from '@/lib/fish-book';

const api = fishBook();
const reasons = { 'manual-hidden': '已手动隐藏，切换应用不会自动恢复', waiting: '等待切换到绑定的应用或窗口', visible: '阅读器正在目标窗口上显示', 'window-closed': '原窗口已关闭或失效，请重新绑定', unavailable: '窗口监听暂不可用，请刷新重试', unbound: '未绑定，可在所有应用上显示' };
export function ReaderBinding({ config }) {
  const [windows, setWindows] = useState([]);
  const [mode, setMode] = useState(config.readerBinding?.mode || 'app');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const supported = api.platform === 'electron' && config.bindingStatus?.supported;
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const next = await api.listReaderWindows(); setWindows(next);
      setSelected(current => next.some(item => item.hwnd === current) ? current : '');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { if (supported) refresh(); }, [supported, refresh]);
  const act = async action => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const binding = config.readerBinding;
  return <section className="reader-binding" aria-labelledby="binding-heading">
    <div className="binding-heading"><AppWindow size={18} /><h3 id="binding-heading">跟随指定应用</h3></div>
    <p className="field-hint">只在目标应用处于前台时显示，切走自动隐藏。手动隐藏后需主动恢复。</p>
    {!supported ? <p className="binding-state" role="status">此功能仅支持 Windows 桌面版，浏览器预览无法绑定其他应用。</p> : <>
      <div className="binding-current"><strong>{binding ? (binding.mode === 'app' ? '已绑定应用' : '已绑定窗口') : '当前未绑定'}</strong>{binding && <><span>{binding.mode === 'window' ? binding.title : binding.appPath.split('\\').pop()}</span><small title={binding.appPath}>{binding.appPath}</small></>}<p role="status">{reasons[config.bindingStatus?.reason] || '正在检查窗口状态…'}</p></div>
      <div className="select-fields"><label htmlFor="binding-mode">绑定范围<select id="binding-mode" value={mode} onChange={event => setMode(event.target.value)} disabled={busy}><option value="app">整个应用 · 多个窗口均生效</option><option value="window">单个窗口 · 关闭后需重新绑定</option></select></label><label htmlFor="binding-window">选择已打开的窗口<select id="binding-window" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy} aria-describedby="binding-help"><option value="">{busy ? '正在获取窗口…' : '请选择窗口'}</option>{windows.map(item => <option key={item.hwnd} value={item.hwnd}>{item.title} — {item.appPath.split('\\').pop()}</option>)}</select></label></div>
      <p id="binding-help" className="field-hint">{!busy && !windows.length ? '未找到可绑定窗口，请打开目标应用后刷新。' : mode === 'app' ? '应用绑定记住程序路径，应用重启后仍可使用。浏览器不同标签页均视为同一应用。' : '窗口绑定记住选中的窗口，目标窗口关闭后需要重新选择。'}</p>
      <div className="binding-actions"><Button disabled={busy || !selected} onClick={() => act(() => api.bindReader(mode, selected))}><Link2 size={14} />{binding ? '更新绑定' : '绑定并开启'}</Button><Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw size={14} />刷新窗口</Button>{binding && <Button variant="ghost" disabled={busy} onClick={() => act(() => api.unbindReader())}><Unlink size={14} />解除绑定</Button>}</div>
      <div className="binding-actions"><Button variant="outline" disabled={busy || config.readerRequested || binding?.invalidated} onClick={() => act(() => api.showReader())}>恢复显示</Button><Button variant="ghost" disabled={busy || !config.readerRequested} onClick={() => act(() => api.hideReader())}>手动隐藏</Button></div>
      {(error || config.bindingStatus?.error) && <p role="alert" className="inline-error">{error || config.bindingStatus.error}</p>}
    </>}
  </section>;
}
