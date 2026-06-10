const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let backendProcess = null;
let mainWindow = null;

function startBackend() {
  const isDev = !app.isPackaged;
  const backendPath = path.resolve(__dirname, '../dist/main.js');
  
  console.log('Starting NestJS backend from:', backendPath);
  
  backendProcess = fork(backendPath, [], {
    cwd: path.dirname(backendPath),
    env: {
      ...process.env,
      PORT: '3000',
      NODE_ENV: isDev ? 'development' : 'production',
    },
    silent: false
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start NestJS backend child process:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`NestJS backend process exited with code ${code} and signal ${signal}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  // Wait for the NestJS backend to initialize
  setTimeout(createWindow, 2500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) {
      backendProcess.kill();
    }
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
