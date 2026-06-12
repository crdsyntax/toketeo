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

let backendPort = 3000;

async function startBackend() {
  const envVars = loadEnv();
  backendPort = parseInt(envVars.PORT || '3000', 10);
  
  // En producción (paquetizado), forzamos el inicio a menos que estemos seguros del puerto
  if (app.isPackaged) {
    console.log(`Production mode: Starting backend on port ${backendPort}`);
  } else {
    const inUse = await isPortInUse(backendPort);
    if (inUse) {
      console.log(`Port ${backendPort} already in use — skipping NestJS backend spawn.`);
      return;
    }
  }

  const backendPath = path.resolve(__dirname, '../dist/main.js');
  const userDataPath = app.getPath('userData');
  const dataPath = path.join(userDataPath, 'data');
  const logsPath = path.join(userDataPath, 'logs');
  
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
  if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath, { recursive: true });

  const logFile = path.join(logsPath, 'backend.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const msgInit = `--- Backend Startup: ${new Date().toISOString()} ---\n` +
                  `Backend Path: ${backendPath}\n` +
                  `Data Path: ${dataPath}\n` +
                  `Is Packaged: ${app.isPackaged}\n`;
  logStream.write(msgInit);

  backendProcess = fork(backendPath, [], {
    cwd: path.dirname(backendPath), // Importante: cwd al directorio del dist/main.js
    env: {
      ...process.env,
      ...envVars,
      TOKETEO_DATA_PATH: dataPath,
      NODE_ENV: app.isPackaged ? 'production' : 'development',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
  });

  backendProcess.stdout.on('data', (data) => {
    const msg = `[Backend]: ${data}`;
    console.log(msg);
    logStream.write(`${new Date().toISOString()} ${msg}\n`);
  });

  backendProcess.stderr.on('data', (data) => {
    const msg = `[Backend Error]: ${data}`;
    console.error(msg);
    logStream.write(`${new Date().toISOString()} ${msg}\n`);
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start NestJS backend:', err);
    logStream.write(`${new Date().toISOString()} [Critical]: Failed to start backend: ${err.message}\n`);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`NestJS backend exited with code ${code} and signal ${signal}`);
    logStream.write(`${new Date().toISOString()} [Info]: Backend exited with code ${code}\n`);
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
      additionalArguments: [`--backend-port=${backendPort}`]
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
