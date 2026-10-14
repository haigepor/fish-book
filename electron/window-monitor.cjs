const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

function createWindowMonitor({ scriptPath, ownerPid = process.pid, onSnapshot = () => {}, onUnavailable = () => {} }) {
  let child;
  let startPromise;
  let ready = false;
  let nextId = 0;
  let tracked = '';
  let stopping = false;
  const pending = new Map();
  const send = value => { if (child?.stdin.writable) child.stdin.write(JSON.stringify(value) + '\n'); };
  function start() {
    if (startPromise) return startPromise;
    stopping = false;
    startPromise = new Promise((resolve, reject) => {
      if (process.platform !== 'win32') { reject(new Error('应用绑定仅支持 Windows 桌面端')); return; }
      const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-OwnerProcessId', String(ownerPid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const running = child;
      const timer = setTimeout(() => fail(new Error('Windows 窗口监听启动超时')), 15000);
      const fail = error => {
        if (child !== running) { clearTimeout(timer); reject(error); return; }
        clearTimeout(timer); ready = false;
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
        pending.clear(); reject(error);
        if (!stopping) onUnavailable(error);
        child?.kill(); startPromise = null; child = null;
      };
      child.on('error', fail);
      child.on('exit', () => fail(new Error('Windows 窗口监听已停止，请刷新应用列表重试')));
      child.stdin.on('error', () => {});
      // stderr 只供诊断；不把系统窗口标题或进程信息写入应用日志。
      child.stderr.resume();
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        let data;
        try { data = JSON.parse(line); } catch { return; }
        if (data.type === 'ready') { clearTimeout(timer); ready = true; send({ command: 'track', hwnd: tracked }); resolve(); }
        else if (data.type === 'snapshot') onSnapshot(data);
        else if (data.type === 'windows') {
          const request = pending.get(data.id);
          if (request) { clearTimeout(request.timer); pending.delete(data.id); request.resolve(data.windows); }
        } else if (data.type === 'error') fail(new Error(data.message || 'Windows 窗口监听失败'));
      });
    });
    return startPromise;
  }
  return {
    start,
    get ready() { return ready; },
    async list() {
      await start();
      return new Promise((resolve, reject) => {
        const id = String(++nextId);
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('获取窗口列表超时')); }, 5000);
        pending.set(id, { resolve, reject, timer }); send({ command: 'list', id });
      });
    },
    track(hwnd = '') { tracked = hwnd; if (ready) send({ command: 'track', hwnd }); },
    refresh() { if (ready) send({ command: 'snapshot' }); },
    stop() {
      stopping = true; ready = false;
      send({ command: 'quit' });
      const running = child; child = null; startPromise = null;
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('窗口监听已停止')); }
      pending.clear(); running?.kill();
    },
  };
}
module.exports = { createWindowMonitor };
