/*
 * Medical Auto Fill — Electron (main process)
 *
 * BẢN CŨ VÀ NHỮNG GÌ ĐÃ SỬA
 *  1. Tự viết lại logic điền lần thứ 4 (fieldMap hardcode makcb/hoten/glucose...) —
 *     sai hoàn toàn so với form xét nghiệm KSKDK thật. Nay dùng Shared/maf-engine.js,
 *     cùng một engine với bản WinForms/Web/Bridge.
 *  2. `globalShortcut.register('CommandOrControl+B')` CƯỚP Ctrl+B của MỌI ỨNG DỤNG
 *     trên máy (Word, trình duyệt...). Nay dùng before-input-event, chỉ ăn phím khi
 *     cửa sổ của app đang focus.
 *  3. preload expose `MAF.fillData` nhưng KHÔNG CÓ UI nào gọi nó -> app mở medinet
 *     rồi để đó, không dán được gì. Nay có panel dán dữ liệu (renderer/panel.html).
 *  4. Không đọc clipboard native. Nay dùng `clipboard.readText()` của Electron
 *     (không cần quyền navigator.clipboard, không cần secure context) + retry,
 *     vì clipboard Windows là tài nguyên chia sẻ: Excel/Unikey/RDP/clipboard manager
 *     đang giữ thì OpenClipboard fail -> đây chính là nguyên nhân "lúc dán được lúc không".
 *  5. Không single-instance, không đọc cấu hình, icon.ico không tồn tại.
 */
'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ------------------------------------------------------------------ hằng số
const MEDINET_URL = 'https://quanlyskcd.medinet.org.vn/account/login';
const ENGINE_FILE = 'maf-engine.js';
const PROFILES_FILE = 'default-profiles.json';

let mainWindow = null;      // cửa sổ medinet
let panelWindow = null;     // cửa sổ dán dữ liệu
let engineSource = null;    // nội dung maf-engine.js
let appConfig = null;       // { forms: [...], options: {...} }
let configSource = '(mặc định)';

// ------------------------------------------------------------------ đường dẫn
/** Khi đóng gói (electron-builder extraResources) file nằm trong resources/Shared. */
function sharedPath(file) {
  const candidates = [
    path.join(process.resourcesPath || '', 'Shared', file),        // packaged
    path.join(__dirname, 'Shared', file),                          // nếu copy vào app
    path.join(__dirname, '..', 'Shared', file)                     // dev: repo gốc
  ];
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch (_) { }
  }
  return null;
}

function configPath() {
  return path.join(app.getPath('userData'), 'maf-config.json');
}

/** Cấu hình của bản WinForms — dùng lại được, khỏi cấu hình hai lần. */
function winFormsConfigPath() {
  const appData = process.env.APPDATA || app.getPath('appData');
  return path.join(appData, 'MedicalAutoFillTool', 'config', 'forms.json');
}

// ------------------------------------------------------------------ engine
function loadEngine() {
  if (engineSource) return engineSource;
  const p = sharedPath(ENGINE_FILE);
  if (!p) {
    log('KHÔNG TÌM THẤY ' + ENGINE_FILE + '. Đã tìm: ' + JSON.stringify([
      path.join(process.resourcesPath || '', 'Shared', ENGINE_FILE),
      path.join(__dirname, '..', 'Shared', ENGINE_FILE)
    ]));
    return null;
  }
  engineSource = fs.readFileSync(p, 'utf8');
  log('Engine: ' + p + ' (' + engineSource.length + ' bytes)');
  return engineSource;
}

// ------------------------------------------------------------------ cấu hình
function loadDefaultProfiles() {
  const p = sharedPath(PROFILES_FILE);
  if (!p) return { forms: [], options: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    // default-profiles.json dùng {name,urlContains,fields:[{excelIndex,labels,headerNames,controlType}]}
    // -> đổi sang đúng cấu trúc EngineOptions của maf-engine.js.
    return {
      forms: (raw.forms || []).map(f => ({
        name: f.name,
        urlContains: f.urlContains,
        fields: (f.fields || []).map(x => ({
          index: x.excelIndex,
          labels: x.labels || [],
          headerNames: x.headerNames || [],
          selector: x.selector || null,
          controlType: x.controlType || 'auto',
          required: !!x.required
        }))
      })),
      options: {}
    };
  } catch (e) {
    log('Đọc ' + PROFILES_FILE + ' lỗi: ' + e.message);
    return { forms: [], options: {} };
  }
}

/** Chuẩn hoá cấu hình kiểu WinForms forms.json sang EngineOptions. */
function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;

  // forms.json của WinForms: { version, forms:[{name,urlContains,fields:[{excelIndex,labels,...}]}], options }
  const forms = (cfg.forms || cfg.FormProfiles || []).map(f => ({
    name: f.name || f.Name || '',
    urlContains: f.urlContains || f.UrlContains || f.urlRegex || '',
    fields: (f.fields || f.Fields || []).map(x => ({
      index: first(x.excelIndex, x.ExcelIndex, x.index, 0),
      labels: asList(x.labels, x.Labels),
      headerNames: asList(x.headerNames, x.HeaderNames),
      selector: x.selector || x.Selector || null,
      controlType: x.controlType || x.ControlType || 'auto',
      required: !!(x.required || x.Required),
      transform: x.transform || x.Transform || null
    }))
  })).filter(f => f.name);

  if (!forms.length) return null;
  return { forms, options: cfg.options || cfg.Options || {} };
}

function asList(v, v2) {
  const x = v != null ? v : v2;
  if (Array.isArray(x)) return x.map(String);
  if (typeof x === 'string' && x.trim()) return x.split(';').map(s => s.trim()).filter(Boolean);
  return [];
}

function first(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

function loadConfig() {
  // 1) Cấu hình riêng của app Electron (người dùng đã nhập/xuất)
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      const norm = normalizeConfig(JSON.parse(fs.readFileSync(p, 'utf8')));
      if (norm) { appConfig = norm; configSource = p; return appConfig; }
      log('maf-config.json tồn tại nhưng không đọc được form nào — dùng mặc định.');
    }
  } catch (e) { log('Đọc maf-config.json lỗi: ' + e.message); }

  // 2) Dùng lại cấu hình của bản WinForms nếu có (đỡ phải cấu hình 2 lần)
  try {
    const wf = winFormsConfigPath();
    if (fs.existsSync(wf)) {
      const norm = normalizeConfig(JSON.parse(fs.readFileSync(wf, 'utf8')));
      if (norm) {
        appConfig = norm;
        configSource = wf + ' (của bản WinForms)';
        log('Dùng lại cấu hình WinForms: ' + wf);
        return appConfig;
      }
    }
  } catch (e) { log('Đọc cấu hình WinForms lỗi: ' + e.message); }

  // 3) Mặc định sinh từ BuiltinProfiles.cs
  appConfig = loadDefaultProfiles();
  configSource = sharedPath(PROFILES_FILE) || '(không có)';
  return appConfig;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
    appConfig = normalizeConfig(cfg) || appConfig;
    configSource = configPath();
    return { ok: true, path: configPath() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------------ clipboard
/**
 * Đọc clipboard có RETRY. Trên Windows, clipboard là tài nguyên dùng chung:
 * nếu Excel chưa nhả, hoặc Unikey/TeamViewer/RDP/clipboard manager đang giữ,
 * lần đọc đầu tiên sẽ fail. Bản WinForms cũ gọi đúng 1 lần -> "lúc được lúc không".
 */
async function readClipboardText(tries = 5) {
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    try {
      const t = clipboard.readText();
      if (t && t.trim()) return { ok: true, text: t, attempt: i + 1 };
      lastErr = 'Clipboard rỗng.';
    } catch (e) {
      lastErr = e && e.message ? e.message : String(e);
    }
    await sleep(80 * (i + 1));   // 80, 160, 240... ms
  }
  return { ok: false, error: lastErr || 'Không đọc được clipboard.' };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ------------------------------------------------------------------ cửa sổ
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    title: 'Medinet — Medical Auto Fill',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Chặn cửa sổ bật lên ngoài app (medinet hay mở target=_blank).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)*medinet\.org\.vn\//i.test(url)) {
      mainWindow.loadURL(url);
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Tiêm engine SAU MỖI lần điều hướng (không chỉ lần đầu như bản cũ).
  mainWindow.webContents.on('dom-ready', async () => {
    await injectEngine(mainWindow.webContents);
    await applyConfig(mainWindow.webContents);
    log('Đã tải: ' + mainWindow.webContents.getURL());
    notifyPanel('page-state', await getPageState(mainWindow.webContents));
  });

  // Phím tắt CHỈ khi cửa sổ này focus (không cướp của app khác).
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || !input.shift) return;
    const k = String(input.key || '').toLowerCase();
    if (k === 'v') { event.preventDefault(); openPanel(); ipcSend(panelWindow, 'maf:focus-paste'); }
    else if (k === 'f') { event.preventDefault(); runFillFromClipboard(); }
    else if (k === 'n') { event.preventDefault(); selectAllNo(); }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(MEDINET_URL);
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) { panelWindow.focus(); return panelWindow; }

  panelWindow = new BrowserWindow({
    width: 980,
    height: 760,
    title: 'Dán dữ liệu — Medical Auto Fill',
    alwaysOnTop: false,
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  panelWindow.webContents.on('dom-ready', async () => {
    // Panel cũng cần engine để parseTable/detectHeaderRow — cùng một bản, không nhân đôi logic.
    await injectEngine(panelWindow.webContents);
    ipcSend(panelWindow, 'maf:config', {
      config: appConfig,
      source: configSource,
      engineVersion: engineVersion(),
      page: await getPageState(mainWindow ? mainWindow.webContents : null)
    });
  });

  panelWindow.on('closed', () => { panelWindow = null; });
  panelWindow.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  return panelWindow;
}

function openPanel() { createPanelWindow(); }

function engineVersion() {
  const m = /VERSION\s*[:=]\s*['"]([\d.]+)['"]/.exec(engineSource || '');
  return m ? m[1] : '?';
}

async function injectEngine(contents) {
  if (!contents || contents.isDestroyed()) return false;
  const src = loadEngine();
  if (!src) return false;
  try {
    await contents.executeJavaScript(src, true);
    return true;
  } catch (e) {
    log('Tiêm engine lỗi: ' + e.message);
    return false;
  }
}

/** Đẩy cấu hình vào engine của trang medinet (mỗi lần điều hướng). */
async function applyConfig(contents) {
  if (!contents || contents.isDestroyed() || !appConfig) return;
  const cfg = {
    forms: appConfig.forms,
    noQuestionLabels: appConfig.options.noQuestionLabels ||
      appConfig.options.NoQuestionLabels || null,
    debug: !!appConfig.options.debug
  };
  try {
    await contents.executeJavaScript(
      'window.MAF && MAF.configure(' + JSON.stringify(cfg) + ');', true);
  } catch (e) {
    log('Áp cấu hình lỗi: ' + e.message);
  }
}

async function getPageState(contents) {
  if (!contents || contents.isDestroyed()) return { ready: false, url: '' };
  try {
    return await contents.executeJavaScript(
      'window.MAF ? MAF.state() : { ready:false, error:"engine chua nap" }', true);
  } catch (e) {
    return { ready: false, url: safeUrl(contents), error: e.message };
  }
}

function safeUrl(contents) {
  try { return contents && !contents.isDestroyed() ? contents.getURL() : ''; } catch (_) { return ''; }
}

// ------------------------------------------------------------------ thao tác điền
async function runInMedinet(js) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, report: null, error: 'Cửa sổ medinet chưa mở.' };
  }
  const contents = mainWindow.webContents;
  if (!(await injectEngine(contents))) {
    return { ok: false, report: null, error: 'Không tiêm được engine vào trang medinet.' };
  }
  await applyConfig(contents);
  try {
    // executeJavaScript chờ cả Promise -> nhận thẳng báo cáo của engine,
    // không cần kênh postMessage như WebView2.
    const report = await contents.executeJavaScript(js, true);
    return { ok: !!(report && (report.ok > 0 || report.dryRun || report.rows)), report: report || null, raw: report };
  } catch (e) {
    return { ok: false, report: null, error: e && e.message ? e.message : String(e) };
  }
}

function callEngine(fn, payload) {
  return 'window.MAF ? MAF.' + fn + '(' + JSON.stringify(payload || {}) + ')' +
    ' : Promise.resolve({error:"engine-not-loaded",message:"Engine chưa nạp vào trang medinet."})';
}

async function doFill(payload) {
  const res = await runInMedinet(callEngine('fill', payload));
  report(res, payload && payload.dryRun ? 'Chạy thử' : 'Điền');
  return res;
}

async function selectAllNo() {
  const res = await runInMedinet(callEngine('selectAllNo', {}));
  report(res, 'Chọn "Không"');
  return res;
}

/** Ctrl+Shift+F: đọc clipboard native -> parse -> điền dòng đầu tiên có dữ liệu. */
async function runFillFromClipboard() {
  const clip = await readClipboardText();
  if (!clip.ok) {
    showBalloon('Không đọc được clipboard', clip.error +
      '\nThử Ctrl+C lại trong Excel rồi bấm Ctrl+Shift+F.');
    return { ok: false, error: clip.error };
  }
  const parsed = await runInMedinet(
    'window.MAF ? (function(){ var t = MAF.parseTable(' + JSON.stringify(clip.text) + ');' +
    ' var h = MAF.detectHeaderRow(t.rows);' +
    ' return MAF.fill({ rows: t.rows, headerRowIndex: h }); })()' +
    ' : Promise.resolve({error:"engine-not-loaded"})');
  report(parsed, 'Điền từ clipboard');
  return parsed;
}

function report(res, title) {
  if (!res) return;
  if (!res.ok && res.error) {
    showBalloon(title + ' thất bại', res.error);
    log(title + ' lỗi: ' + res.error);
    return;
  }
  const r = res.report || res.raw || {};
  if (r.error) { showBalloon(title + ' thất bại', r.message || r.error); return; }
  const ok = r.ok || 0, failed = r.failed || 0, empty = r.empty || 0;
  log(title + ': ' + ok + ' ok, ' + failed + ' fail, ' + empty + ' empty');
  if (failed > 0 || ok === 0) {
    showBalloon(title + ': ' + ok + ' trường được điền',
      failed + ' trường không tìm thấy ô' + (empty ? ', ' + empty + ' cột Excel trống' : '') +
      '. Mở panel để xem chi tiết.');
  } else {
    showBalloon(title + ' hoàn tất', 'Đã điền ' + ok + ' trường.' + (empty ? ' (' + empty + ' cột trống)' : ''));
  }
}

function showBalloon(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title: title, body: String(body || '').slice(0, 240) }).show();
  } catch (_) { }
  notifyPanel('maf:result', { title: title, body: body });
}

function notifyPanel(channel, payload) { ipcSend(panelWindow, channel, payload); }

function ipcSend(win, channel, payload) {
  try { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); } catch (_) { }
}

function log(msg) {
  const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + msg;
  console.log(line);
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'app-' + new Date().toISOString().slice(0, 10) + '.log'), line + '\n');
  } catch (_) { }
}

// ------------------------------------------------------------------ IPC
function registerIpc() {
  ipcMain.handle('maf:get-config', () => ({
    config: appConfig, source: configSource, engineVersion: engineVersion()
  }));

  ipcMain.handle('maf:read-clipboard', async () => await readClipboardText());

  ipcMain.handle('maf:page-state', async () => await getPageState(mainWindow ? mainWindow.webContents : null));

  ipcMain.handle('maf:fill', async (_e, payload) => await doFill(payload || {}));

  ipcMain.handle('maf:select-no', async () => await selectAllNo());

  ipcMain.handle('maf:scan', async (_e, filter) => {
    return await runInMedinet('window.MAF ? MAF.scan(' + JSON.stringify(filter || {}) + ') : {error:"engine-not-loaded"}');
  });

  ipcMain.handle('maf:reload-medinet', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.reload(); return { ok: true }; }
    return { ok: false, error: 'Cửa sổ medinet chưa mở.' };
  });

  ipcMain.handle('maf:open-medinet', async (_e, url) => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
    if (url) mainWindow.loadURL(url);
    mainWindow.focus();
    return { ok: true };
  });

  // Nhập cấu hình: chọn file forms.json (xuất từ bản WinForms) hoặc JSON bất kỳ.
  ipcMain.handle('maf:import-config', async () => {
    const win = panelWindow && !panelWindow.isDestroyed() ? panelWindow : mainWindow;
    const res = await dialog.showOpenDialog(win, {
      title: 'Chọn file cấu hình (forms.json)',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    try {
      const raw = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
      const norm = normalizeConfig(raw);
      if (!norm) return { ok: false, error: 'File không chứa form nào hợp lệ.' };
      const saved = saveConfig(raw);
      if (!saved.ok) return { ok: false, error: 'Không ghi được cấu hình: ' + saved.error };
      if (mainWindow && !mainWindow.isDestroyed()) await applyConfig(mainWindow.webContents);
      log('Đã nhập cấu hình từ ' + res.filePaths[0] + ' (' + norm.forms.length + ' form)');
      return { ok: true, forms: norm.forms.length, source: saved.path };
    } catch (e) {
      return { ok: false, error: 'Đọc file lỗi: ' + e.message };
    }
  });

  ipcMain.handle('maf:export-config', async () => {
    const win = panelWindow && !panelWindow.isDestroyed() ? panelWindow : mainWindow;
    const res = await dialog.showSaveDialog(win, {
      title: 'Xuất cấu hình',
      defaultPath: 'maf-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(res.filePath, JSON.stringify(appConfig, null, 2), 'utf8');
      return { ok: true, path: res.filePath };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('maf:open-panel', () => { openPanel(); return { ok: true }; });

  ipcMain.handle('maf:log', (_e, msg) => { log('[panel] ' + msg); return { ok: true }; });
}

// ------------------------------------------------------------------ vòng đời
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Bản cũ không có khoá này: mở 2 lần là 2 cửa sổ medinet + 2 lần tiêm script,
  // và globalShortcut của bản thứ 2 ghi đè bản thứ 1.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
    openPanel();
  });

  app.whenReady().then(() => {
    loadEngine();
    loadConfig();
    log('=== Medical Auto Fill (Electron) ===');
    log('Engine : ' + engineVersion());
    log('Cấu hình: ' + configSource +
      (appConfig ? ' (' + appConfig.forms.length + ' form)' : ''));

    registerIpc();
    buildMenu();
    createMainWindow();
    openPanel();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/** Menu thật (thay cho globalShortcut cướp phím toàn hệ thống). */
function buildMenu() {
  const template = [
    {
      label: 'Tệp',
      submenu: [
        { label: 'Mở panel dán dữ liệu', accelerator: 'CmdOrCtrl+Shift+V', click: () => { openPanel(); ipcSend(panelWindow, 'maf:focus-paste'); } },
        { label: 'Dán từ clipboard và điền ngay', accelerator: 'CmdOrCtrl+Shift+F', click: () => runFillFromClipboard() },
        { type: 'separator' },
        { label: 'Tải lại trang medinet', accelerator: 'F5', click: () => mainWindow && mainWindow.webContents.reload() },
        { label: 'Về trang đăng nhập medinet', click: () => mainWindow && mainWindow.loadURL(MEDINET_URL) },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' }
      ]
    },
    {
      label: 'Điền',
      submenu: [
        { label: 'Chọn "Không" cho mọi câu hỏi', accelerator: 'CmdOrCtrl+Shift+N', click: () => selectAllNo() },
        { label: 'Quét các ô trên trang (chẩn đoán)', click: async () => { openPanel(); ipcSend(panelWindow, 'maf:do-scan'); } }
      ]
    },
    {
      label: 'Cấu hình',
      submenu: [
        { label: 'Nhập file forms.json…', click: () => { openPanel(); ipcSend(panelWindow, 'maf:do-import'); } },
        { label: 'Xuất cấu hình hiện tại…', click: () => { openPanel(); ipcSend(panelWindow, 'maf:do-export'); } },
        { label: 'Mở thư mục cấu hình', click: () => shell.openPath(app.getPath('userData')) }
      ]
    },
    {
      label: 'Xem',
      submenu: [
        { role: 'reload', label: 'Tải lại' },
        { role: 'toggleDevTools', label: 'DevTools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Khổ chữ mặc định' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
