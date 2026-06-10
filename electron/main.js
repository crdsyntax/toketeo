const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork, spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

const FRONTEND_DEV_PORT = 51789;
let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

async function startBackend() {
  const envVars = loadEnv();
  const backendPort = parseInt(envVars.PORT || '3000', 10);
  const inUse = await isPortInUse(backendPort);

  if (inUse) {
    console.log(`Port ${backendPort} already in use — skipping NestJS backend spawn.`);
    return;
  }

  const backendPath = path.resolve(__dirname, '../dist/main.js');
  console.log('Starting NestJS backend from:', backendPath);

  backendProcess = fork(backendPath, [], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      ...envVars,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
    },
    silent: false,
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start NestJS backend:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`NestJS backend exited with code ${code} and signal ${signal}`);
  });
}

function startFrontendDev() {
  return new Promise((resolve) => {
    const frontendDir = path.resolve(__dirname, '../frontend');
    frontendProcess = spawn('bun', ['run', 'dev', '--port', String(FRONTEND_DEV_PORT), '--host', '127.0.0.1'], {
      cwd: frontendDir,
      shell: false,
      stdio: 'pipe',
    });

    frontendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write('[vite] ' + output);
      if (output.includes('Local') || output.includes('localhost')) {
        resolve();
      }
    });

    frontendProcess.stderr.on('data', (data) => {
      process.stderr.write('[vite err] ' + data.toString());
    });

    frontendProcess.on('error', (err) => {
      console.error('Failed to start Vite dev server:', err);
      resolve();
    });

    // Fallback: wait 4s and resolve regardless
    setTimeout(resolve, 4000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_DEV_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function killAll() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (frontendProcess) {
    frontendProcess.kill();
    frontendProcess = null;
  }
}

app.whenReady().then(async () => {
  await startBackend();

  if (!app.isPackaged) {
    await startFrontendDev();
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    killAll();
    app.quit();
  }
});

app.on('will-quit', killAll);
