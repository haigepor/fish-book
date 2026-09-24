import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Keyboard, Monitor, Moon, Palette, PanelTop, RotateCcw, Sun, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fishBook } from '@/lib/fish-book';
import { readingStyle } from './Reader';
import { shortcutFromEvent, normalizeShortcut } from '@/lib/shortcuts.mjs';

const api = fishBook();
const themes = [['white', '亮色', Sun], ['dark', '暗黑', Moon], ['system', '跟随系统', Monitor]];
const presets = [
  { name: '夜读', textColor: '#e6e8ed', textBgColor: '#20242c' },
  { name: '纸页', textColor: '#463e34', textBgColor: '#f4eddf' },
  { name: '清晰', textColor: '#26342d', textBgColor: '#edf5ef' },
];

export function Preview({ config }) {
  return <div className="reader-preview" aria-label="阅读效果预览"><div className={`preview-paper reader-effect-${config.readerBackgroundEffect || 'glass'}`} style={{ ...readingStyle(config), borderRadius: config.readerRadius }}><p style={{ padding: `10px ${config.readerPadding}px`, opacity: config.textOpacity ?? 1 }}>放慢一点，也没有关系。<br />翻过这一页，故事仍在继续。</p><div className="preview-foot"><ChevronLeft size={14} /><span>{config.showProgress ? '12% · 预览文本' : '← / → 翻页'}</span><ChevronRight size={14} /></div></div></div>;
}

function RangeField({ label, configKey, config, update, min, max, step = 1, unit = '' }) {
  const value = config[configKey];
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = next => {
    const number = Number(next);
    if (!Number.isFinite(number)) { setDraft(value); return; }
    const bounded = Math.min(max, Math.max(min, number));
    setDraft(bounded); update(configKey, bounded);
  };
  return <div className="range-field"><div className="range-label"><label htmlFor={`number-${configKey}`}>{label}</label><span><Input id={`number-${configKey}`} type="number" min={min} max={max} step={step} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => commit(draft)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><small>{unit}</small></span></div><Slider aria-label={label} value={[Number(draft) || min]} min={min} max={max} step={step} onValueChange={values => setDraft(values[0])} onValueCommit={values => commit(values[0])} /></div>;
}

function ToggleField({ label, hint, configKey, config, update }) {
  return <div className="toggle-field"><label htmlFor={`toggle-${configKey}`}><strong>{label}</strong><span>{hint}</span></label><Switch id={`toggle-${configKey}`} checked={config[configKey]} onCheckedChange={value => update(configKey, value)} /></div>;
}

function ShortcutField({ label, configKey, config, update }) {
  const [draft, setDraft] = useState(config[configKey]);
  const [status, setStatus] = useState('');
  const saving = useRef(false);
  useEffect(() => setDraft(config[configKey]), [config, configKey]);
  const capture = async event => {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || event.nativeEvent.isComposing || saving.current) return;
    const next = shortcutFromEvent(event);
    if (!next) { setStatus('请按字符键、功能键或组合键'); return; }
    const input = event.currentTarget;
    const normalize = normalizeShortcut;
    if (['key1', 'key2', 'key3', 'key4'].some(other => other !== configKey && normalize(config[other]) === normalize(next))) { setStatus('按键已被其他操作使用'); return; }
    if (normalize(next) === normalize(config[configKey])) { setStatus('已保存'); return; }
    saving.current = true;
    setDraft(next);
    setStatus('保存中…');
    try {
      const saved = await update(configKey, next);
      if (!saved) { setDraft(config[configKey]); setStatus('保存失败，请重试'); }
      else { setDraft(saved[configKey]); setStatus(saved.shortcutErrors?.length ? '已保存，请检查占用提示' : '已保存'); input.blur(); }
    } catch {
      setDraft(config[configKey]);
      setStatus('保存失败，请重试');
    } finally { saving.current = false; }
  };
  return <div className="shortcut-field"><label htmlFor={configKey}>{label}</label><Input id={configKey} aria-label={`${label}快捷键`} aria-describedby={`${configKey}-status`} value={draft} readOnly onFocus={event => { event.currentTarget.select(); setStatus('请按快捷键'); }} onKeyDown={capture} /><span id={`${configKey}-status`} className="shortcut-status" role="status">{status || '点击修改'}</span></div>;
}

export function Preferences({ config, update, onError }) {
  const range = (key, label, min, max, step, unit) => <RangeField key={key} configKey={key} label={label} min={min} max={max} step={step} unit={unit} config={config} update={update} />;
  const toggle = (key, label, hint) => <ToggleField key={key} configKey={key} label={label} hint={hint} config={config} update={update} />;
  const applyPreset = async preset => { await update('textColor', preset.textColor); await update('textBgColor', preset.textBgColor); };
  const reset = async () => {
    for (const [key, value] of Object.entries({ paginationMode: 'auto', readerColorMode: 'custom', readerBackgroundEffect: 'glass', readerBlur: 14, fontSize: 14, lineHeight: 1.6, letterSpacing: 0, wordsPerPage: 200, readerWidth: 560, readerHeight: 110, readerPadding: 12, readerRadius: 5, bgOpacity: 0.15, textOpacity: 1, textColor: '#36433c', textBgColor: '#f6f5f0', fontFamily: 'sans', textAlign: 'left', showProgress: false, resizable: true, alwaysOnTop: true, rememberPosition: true })) await update(key, value);
  };
  return <div className="workspace"><div className="page-heading"><div><p className="eyebrow">让阅读更合心意</p><h1>阅读偏好</h1><p className="muted">调整后自动保存，让每一页都舒服一点。</p></div><span className="saved-hint"><Check size={14} />本地自动保存</span></div>
    <div className="settings-layout"><div className="settings-main"><Tabs defaultValue="appearance"><TabsList className="settings-tabs" aria-label="阅读偏好分类"><TabsTrigger value="appearance"><Palette aria-hidden="true" /><span>外观</span></TabsTrigger><TabsTrigger value="text"><Type aria-hidden="true" /><span>文字排版</span></TabsTrigger><TabsTrigger value="window"><PanelTop aria-hidden="true" /><span>悬浮窗口</span></TabsTrigger><TabsTrigger value="keys"><Keyboard aria-hidden="true" /><span>快捷键</span></TabsTrigger></TabsList>
      <TabsContent value="appearance"><Card className="settings-card"><h2>界面主题</h2><p className="muted small">仅控制书架与设置页面，不再改变阅读器。</p><div className="theme-options">{themes.map(([value, label, Icon]) => <button key={value} aria-pressed={config.theme === value} onClick={() => update('theme', value)}><Icon size={22} /><span>{label}</span>{config.theme === value && <Check size={14} />}</button>)}</div><h2>独立阅读器</h2><p className="field-hint">阅读器始终使用下面的独立配色与背景效果。</p><label className="reader-color-mode">背景效果<select aria-label="阅读器背景效果" value={config.readerBackgroundEffect || 'glass'} onChange={event => update('readerBackgroundEffect', event.target.value)}><option value="glass">半透明毛玻璃</option><option value="solid">纯色半透明</option><option value="transparent">完全透明</option></select></label>{config.readerBackgroundEffect === 'glass' && range('readerBlur', '毛玻璃模糊强度', 0, 30, 1, 'px')}<div className="preset-options">{presets.map(preset => <button key={preset.name} onClick={() => applyPreset(preset)} style={{ backgroundColor: preset.textBgColor, color: preset.textColor }}><span>Aa</span>{preset.name}</button>)}</div><div className="color-fields"><label>文字颜色<input type="color" value={config.textColor} onChange={event => update('textColor', event.target.value)} /><code>{config.textColor}</code></label><label>背景颜色<input type="color" value={config.textBgColor} onChange={event => update('textBgColor', event.target.value)} /><code>{config.textBgColor}</code></label></div>{config.readerBackgroundEffect !== 'transparent' && range('bgOpacity', '背景不透明度', 0, 1, 0.05, '')}{range('textOpacity', '文字不透明度', 0.2, 1, 0.05, '')}<p className="field-hint">桌面端在 Windows 11 使用系统 Acrylic，并叠加页面霜化层；浏览器预览只模糊当前页面。默认 15% 背景不透明度，文字透明度独立。</p></Card></TabsContent>
      <TabsContent value="text"><Card className="settings-card"><h2>文字与节奏</h2><div className="select-fields"><label>字体<select value={config.fontFamily} onChange={event => update('fontFamily', event.target.value)}><option value="sans">无衬线 · 微软雅黑</option><option value="serif">衬线 · 宋体</option><option value="mono">等宽 · Consolas</option></select></label><label>对齐方式<select value={config.textAlign} onChange={event => update('textAlign', event.target.value)}><option value="left">左对齐</option><option value="center">居中</option><option value="justify">两端对齐</option></select></label></div>{range('fontSize', '字号', 12, 32, 1, 'px')}{range('lineHeight', '行高', 1, 3, 0.1, '倍')}{range('letterSpacing', '字距', 0, 10, 0.5, 'px')}<label className="reader-color-mode">分页方式<select aria-label="分页方式" value={config.paginationMode || 'auto'} onChange={event => update('paginationMode', event.target.value)}><option value="auto">自适应窗口 · 自动填满一屏</option><option value="fixed">固定字数 · 兼容模式</option></select></label><p className="field-hint">缩放窗口或调整字体时自动重新排版，保持当前阅读起点。</p>{config.paginationMode === 'fixed' && range('wordsPerPage', '每页字数', 10, 2000, 10, '字')}{range('readerPadding', '正文边距', 4, 48, 2, 'px')}{toggle('showProgress', '显示阅读进度', '在阅读器底部显示百分比和页码。')}</Card></TabsContent>
      <TabsContent value="window"><Card className="settings-card"><h2>悬浮窗口</h2><p className="muted small">顶部章节名和空白处可移动窗口，按钮区域不参与拖动；边缘或四角可调整大小。</p><details className="reader-advanced"><summary>高级尺寸设置</summary>{range('readerWidth', '窗口宽度', 100, 1600, 10, 'px')}{range('readerHeight', '窗口高度', 100, 900, 10, 'px')}</details>{range('readerRadius', '窗口圆角', 0, 28, 1, 'px')}{toggle('alwaysOnTop', '始终置顶', api.platform === 'browser' ? '桌面专属；浏览器浮层始终在本页面内。' : '阅读器保持在其他应用上方。')}{toggle('resizable', '允许手动缩放', '拖动窗口边缘可调整尺寸。')}{toggle('rememberPosition', '记住窗口位置', '桌面重启后恢复位置；显示器改变时自动回到屏幕内。')}<Button variant="outline" onClick={() => api.resetReaderPosition().catch(error => onError(error.message))}><RotateCcw />找回阅读窗口</Button></Card></TabsContent>
<TabsContent value="keys"><Card className="settings-card"><h2>用键盘继续故事</h2><p className="field-hint">阅读器聚焦后，按住空格拖动正文；Esc 退出清屏。</p><p className="field-hint" role="status">当前阅读模式：{config.cleanMode ? '清屏模式' : '普通模式'}</p><Button variant="outline" disabled={!config.cleanMode} onClick={() => update('cleanMode', false)}>恢复普通阅读模式</Button><p className="field-hint">仅恢复阅读器操作按钮，不关闭窗口、不退出应用，也不改变阅读进度。</p><p className="muted small">点击输入框，可直接按字母、数字、方向键、F 功能键或组合键，自动保存。单独的修饰键和系统保留键可能不可用。</p>{[['key1', '上一页'], ['key2', '下一页'], ['key3', '显示 / 隐藏'], ['key4', '退出清屏']].map(([key, label]) => <ShortcutField key={key} configKey={key} label={label} config={config} update={update} />)}{config.shortcutErrors?.length > 0 && <div role="alert" className="inline-error">{config.shortcutErrors.join('；')}</div>}<p className="field-hint">{api.platform === 'browser' ? '浏览器中仅在本页面获得焦点时生效，部分组合键可能被浏览器占用。' : '桌面快捷键在其他应用也会生效；单字母、空格等可能影响日常输入，请谨慎设置。'}</p></Card></TabsContent>
    </Tabs><Button variant="ghost" className="reset-settings" onClick={reset}><RotateCcw size={14} />应用轻隐默认参数</Button></div><aside className="settings-preview"><div className="section-label"><PanelTop size={17} /><h2>实时预览</h2><span className="live-dot" /></div><Preview config={config} /><div className="preview-spec"><span>{config.readerWidth} × {config.readerHeight} px</span><span>{config.fontSize} px / {config.lineHeight} 倍行高</span></div><Button onClick={() => api.showReader().catch(error => onError(error.message))}>打开阅读器<ArrowIcon /></Button><p className="muted small">预览文本只用于查看样式。打开阅读器后将显示你选择的书籍。</p></aside></div>
  </div>;
}

function ArrowIcon() { return <ChevronRight size={16} />; }
