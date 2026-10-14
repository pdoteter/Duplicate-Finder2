const { spawn } = require('child_process');
const http = require('http');

function waitForVite(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve();
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timeout waiting for Vite dev server'));
      } else {
        setTimeout(check, 400);
      }
    };

    check();
  });
}

async function main() {
  console.log('[Dev] Starting Vite dev server...');
  const viteProcess = spawn('npx', ['vite', '--port', '5173'], {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
  });

  try {
    await waitForVite('http://localhost:5173');
    console.log('[Dev] Vite is ready. Launching Electron...');

    const electronProcess = spawn('npx', ['electron', '.'], {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: 'http://localhost:5173' }
    });

    electronProcess.on('close', (code) => {
      console.log('[Dev] Electron window closed. Shutting down Vite...');
      viteProcess.kill();
      process.exit(code || 0);
    });
  } catch (err) {
    console.error('[Dev] Failed to start dev environment:', err);
    viteProcess.kill();
    process.exit(1);
  }
}

main();
