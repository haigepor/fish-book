const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'], {
  cwd: root,
  stdio: 'inherit',
});
let electron;

function waitForVite(attempt = 0) {
  const request = http.get('http://127.0.0.1:5173', response => {
    response.resume();
    electron = spawn(process.execPath, [path.join(root, 'node_modules', 'electron', 'cli.js'), '.'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' },
    });
    electron.on('exit', code => process.exit(code || 0));
  });
  request.on('error', () => {
    if (attempt > 100) process.exitCode = 1;
    else setTimeout(() => waitForVite(attempt + 1), 150);
  });
}

vite.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => { vite.kill(); electron?.kill(); });
waitForVite();
