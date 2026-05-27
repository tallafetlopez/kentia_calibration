'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net  = require('net');
const fs   = require('fs');

const SERVER_PORT = 8000;
const MONGO_PORT  = 27017;
const SERVER_URL  = `http://localhost:${SERVER_PORT}`;

let mongoProcess   = null;
let serverProcess  = null;
let mainWindow     = null;
let splashWindow   = null;
let mongoOwnedByUs = false;

// ── Logging ──────────────────────────────────────────────────────────────────
// All server/mongo output goes to %LOCALAPPDATA%\CalibrationManager\app.log
// so errors are diagnosable without opening a console window.
function getLogDir() {
  return path.join(
    process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'),
    'CalibrationManager'
  );
}

let logStream = null;
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  if (logStream) logStream.write(line);
}

// ── Paths ─────────────────────────────────────────────────────────────────────
// With --onedir, PyInstaller produces a directory; the exe lives inside it.
function getServerDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'CalibrationManagerServer');
  }
  return path.join(__dirname, '..', 'backend', 'dist', 'CalibrationManagerServer');
}

function getServerExe() {
  return path.join(getServerDir(), 'CalibrationManagerServer.exe');
}

function getMongodPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mongod.exe');
  }
  return 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
}

function getDbPath() {
  return path.join(getLogDir(), 'db');
}

// ── Port helper ───────────────────────────────────────────────────────────────
function isPortListening(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    sock.setTimeout(400);
    sock.once('connect',  () => { sock.destroy(); resolve(true);  });
    sock.once('error',    () => resolve(false));
    sock.once('timeout',  () => { sock.destroy(); resolve(false); });
  });
}

async function waitForPort(port, label, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${label} no respondió en ${timeoutMs / 1000}s (puerto ${port}).`);
}

// ── Start MongoDB ─────────────────────────────────────────────────────────────
async function startMongoDB() {
  if (await isPortListening(MONGO_PORT)) {
    log('MongoDB already running, reusing');
    mongoOwnedByUs = false;
    return;
  }

  const mongodPath = getMongodPath();

  if (!fs.existsSync(mongodPath)) {
    throw new Error(
      `mongod.exe no encontrado en:\n${mongodPath}\n\n` +
      `Reinstala la aplicación con el instalador más reciente.`
    );
  }

  const dbPath  = getDbPath();
  const logPath = path.join(getLogDir(), 'mongod.log');

  fs.mkdirSync(dbPath,               { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  log(`Starting mongod: ${mongodPath}`);

  await new Promise((resolve, reject) => {
    mongoProcess = spawn(mongodPath, [
      '--dbpath',  dbPath,
      '--port',    String(MONGO_PORT),
      '--bind_ip', '127.0.0.1',
      '--logpath', logPath,
      '--logappend',
      '--wiredTigerCacheSizeGB', '0.5',
    ], { detached: false, windowsHide: true, stdio: 'pipe' });

    mongoProcess.on('error', (err) => reject(new Error(`No se pudo arrancar MongoDB: ${err.message}`)));
    mongoProcess.on('exit',  (code) => {
      if (code !== null && code !== 0) reject(new Error(`MongoDB terminó con código ${code}. Revisa: ${logPath}`));
    });

    mongoOwnedByUs = true;
    waitForPort(MONGO_PORT, 'MongoDB', 40_000).then(resolve).catch(reject);
  });

  log('MongoDB ready');
  // Short grace period for MongoDB to finish internal init
  await new Promise(r => setTimeout(r, 1500));
}

// ── Kill any process occupying a port ─────────────────────────────────────────
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    const netstat = spawn('netstat', ['-ano'], { shell: true, windowsHide: true, stdio: 'pipe' });
    let output = '';
    netstat.stdout.on('data', (d) => { output += d.toString(); });
    netstat.on('close', () => {
      const portRx = new RegExp(`[:\\.]${port}\\s+.*LISTENING`, 'i');
      for (const line of output.split('\n')) {
        if (portRx.test(line)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            log(`Killing PID ${pid} occupying port ${port}`);
            try { spawn('taskkill', ['/F', '/PID', pid], { shell: true, windowsHide: true }); } catch (_) {}
          }
        }
      }
      // Brief wait for the port to free up
      setTimeout(resolve, 800);
    });
    netstat.on('error', () => resolve());
  });
}

// ── Start FastAPI server ──────────────────────────────────────────────────────
async function startServer() {
  // Kill any zombie process occupying port 8000 before starting fresh
  if (await isPortListening(SERVER_PORT)) {
    log(`Port ${SERVER_PORT} already in use — killing existing process…`);
    await killProcessOnPort(SERVER_PORT);
  }

  return new Promise((resolve, reject) => {
    const exe = getServerExe();
    const cwd = getServerDir();

    if (!fs.existsSync(exe)) {
      return reject(new Error(`Servidor no encontrado:\n${exe}`));
    }

    log(`Starting server: ${exe}`);

    serverProcess = spawn(exe, [], {
      detached: false,
      windowsHide: true,
      stdio: 'pipe',
      cwd,
    });

    // Pipe output to log file
    serverProcess.stdout.on('data', (d) => { if (logStream) logStream.write(d); });
    serverProcess.stderr.on('data', (d) => { if (logStream) logStream.write(d); });

    serverProcess.on('error', (err) => reject(new Error(`Error al lanzar servidor: ${err.message}`)));

    serverProcess.on('exit', (code) => {
      log(`Server exited with code ${code}`);
      if (code !== 0 && code !== null) {
        reject(new Error(`El servidor terminó con código de error ${code}.\nRevisa: ${path.join(getLogDir(), 'app.log')}`));
      }
    });

    // Wait for port 8000 to be listening (faster than waiting for full HTTP)
    waitForPort(SERVER_PORT, 'Servidor API', 60_000)
      .then(resolve)
      .catch(reject);
  });
}

// ── Splash ────────────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480, height: 280,
    frame: false, resizable: false, center: true,
    alwaysOnTop: true, backgroundColor: '#1e293b',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { nodeIntegration: false },
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e293b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;user-select:none}
.logo{font-size:46px}.title{font-size:22px;font-weight:600;letter-spacing:-.5px}
.subtitle{font-size:13px;color:#94a3b8}
.spinner{width:34px;height:34px;border:3px solid #334155;border-top-color:#3b82f6;
  border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.status{font-size:12px;color:#64748b;margin-top:-6px}
</style></head><body>
  <div class="logo">⚙️</div>
  <div class="title">Calibration Manager</div>
  <div class="subtitle">HERKO Engineering Tools</div>
  <div class="spinner"></div>
  <div class="status">Iniciando servicios…</div>
</body></html>`;
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// ── Main window ───────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 1024, minHeight: 768,
    title: 'Calibration Manager',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null; }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Shutdown ──────────────────────────────────────────────────────────────────
function stopAll() {
  [serverProcess, mongoOwnedByUs ? mongoProcess : null].forEach(proc => {
    if (proc && !proc.killed) { try { proc.kill('SIGTERM'); } catch (_) {} }
  });
  serverProcess = null;
  mongoProcess  = null;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Open log file
  const logDir = getLogDir();
  fs.mkdirSync(logDir, { recursive: true });
  logStream = fs.createWriteStream(path.join(logDir, 'app.log'), { flags: 'a' });
  log('=== Calibration Manager starting ===');

  createSplash();

  try {
    await startMongoDB();
    await startServer();
    createMainWindow();
  } catch (err) {
    log(`FATAL: ${err.message}`);
    stopAll();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    dialog.showErrorBox(
      'Calibration Manager — Error de inicio',
      `${err.message}\n\nLog: ${path.join(logDir, 'app.log')}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => { stopAll(); app.quit(); });
app.on('before-quit',        () => stopAll());
