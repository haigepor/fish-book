function normalizeBinding(value) {
  if (!value || !['app', 'window'].includes(value.mode) || typeof value.appPath !== 'string' || !/^[a-z]:\\[^\0\r\n]+\.exe$/i.test(value.appPath)) return null;
  const result = { mode: value.mode, appPath: value.appPath.slice(0, 32768), title: String(value.title || '').slice(0, 300) };
  if (value.mode === 'window') {
    if (!/^[1-9]\d{0,19}$/.test(String(value.hwnd)) || !Number.isSafeInteger(value.pid) || value.pid <= 0 || !/^\d{1,20}$/.test(String(value.startedAt))) return null;
    Object.assign(result, { hwnd: String(value.hwnd), pid: value.pid, startedAt: String(value.startedAt) });
    if (value.invalidated === true) result.invalidated = true;
  }
  return result;
}
const sameWindow = (a, b) => Boolean(a && b && a.hwnd === b.hwnd && a.pid === b.pid && a.startedAt === b.startedAt && a.appPath?.toLowerCase() === b.appPath?.toLowerCase());
const usable = window => Boolean(window?.visible && !window.minimized && !window.cloaked);
function matches(binding, window) {
  return usable(window) && (binding.mode === 'app' ? binding.appPath.toLowerCase() === window.appPath?.toLowerCase() : sameWindow(binding, window));
}
function visibilityDecision(config, snapshot, context) {
  if (!config.readerRequested) return { visible: false, reason: 'manual-hidden' };
  const binding = config.readerBinding;
  if (!binding) return { visible: true, reason: 'unbound' };
  if (binding.invalidated) return { visible: false, reason: 'window-closed' };
  if (!context.available) return { visible: false, reason: 'unavailable' };
  if (binding.mode === 'window' && !sameWindow(binding, snapshot?.target)) return { visible: false, reason: 'window-closed' };
  const foreground = snapshot?.foreground;
  // 阅读器获得焦点时继续沿用最后一个有效宿主；主界面和其他应用不享有此例外。
  if (foreground?.hwnd === context.readerHwnd) {
    const validHost = context.visible && sameWindow(context.host, snapshot.target) && matches(binding, snapshot.target);
    return { visible: Boolean(validHost), reason: validHost ? 'visible' : 'waiting' };
  }
  const visible = matches(binding, foreground);
  return { visible, reason: visible ? 'visible' : 'waiting', ...(visible ? { host: foreground } : {}) };
}
module.exports = { normalizeBinding, sameWindow, visibilityDecision };
