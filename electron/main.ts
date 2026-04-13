import { app, BrowserWindow, dialog, session } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import http from 'http';

const isDev = !app.isPackaged;
if (!isDev) process.env.NODE_ENV = 'production';
const SERVER_PORT = 3001;

// Set DB path to user data directory — writable, survives app updates
// server/src/db.ts checks process.env.DB_PATH first
process.env.DB_PATH = path.join(app.getPath('userData'), 'timepunch.db');

let server: http.Server | null = null;

async function startExpressServer(): Promise<void> {
  // pathToFileURL required — dynamic import() needs a file:// URL, not a raw path
  const serverPath = pathToFileURL(
    path.join(__dirname, '../server/dist/app.js')
  ).href;
  const { default: expressApp } = await import(serverPath);
  return new Promise((resolve) => {
    server = expressApp.listen(SERVER_PORT, '127.0.0.1', () => {
      console.log(`Express server listening on port ${SERVER_PORT}`);
      resolve();
    });
  });
}

async function createWindow(): Promise<void> {
  // In dev, Vite dev server + tsx-watch Express handle everything separately
  if (!isDev) {
    await startExpressServer();
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AFL Time Punch',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Handle Excel export downloads — trigger native save dialog
  session.defaultSession.on('will-download', (_event, item) => {
    const defaultPath = path.join(app.getPath('downloads'), item.getFilename());
    item.setSavePath(defaultPath);
  });

  if (isDev) {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    await win.loadURL(`http://127.0.0.1:${SERVER_PORT}`);
  }
}

app.whenReady().then(createWindow).catch((err) => {
  dialog.showErrorBox(
    'AFL Time Punch failed to start',
    err?.stack ?? String(err)
  );
  app.quit();
});

app.on('window-all-closed', () => {
  if (server) {
    server.close(() => console.log('Express server stopped'));
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
