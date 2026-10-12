const { spawn } = require('node:child_process');

const isWindows = process.platform === 'win32';
const devUrl = 'http://127.0.0.1:5173';

function run(command, args, options = {}) {
  if (!isWindows) {
    return spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      ...options
    });
  }

  return spawn('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
    ...options
  });
}

const vite = run('npm', ['run', 'dev']);

let electron;
const timer = setTimeout(() => {
  electron = run('npx', ['electron', '.'], {
    env: {
      ...process.env,
      POMO_DESKTOP_DEV_URL: devUrl
    }
  });

  electron.on('exit', code => {
    vite.kill();
    process.exit(code || 0);
  });
}, 2500);

function shutdown() {
  clearTimeout(timer);
  if (electron) electron.kill();
  vite.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
