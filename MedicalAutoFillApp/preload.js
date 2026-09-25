/*
 * Preload — cầu nối AN TOÀN giữa renderer (trang medinet / panel) và main process.
 *
 * contextIsolation: true + sandbox: true, nên renderer không có `require`.
 * Bản cũ expose đúng 1 hàm `MAF.fillData` mà không có UI nào gọi => vô dụng.
 *
 * LƯU Ý TÊN: không dùng `window.MAF` ở đây, vì trang medinet cũng có `window.MAF`
 * (engine được tiêm vào). Hai thứ khác nhau mà trùng tên là nguồn gốc của lỗi
 * khó dò. Renderer của ta dùng `window.maf`.
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const api = {
  version: '2.0.0',

  // cấu hình
  getConfig: () => invoke('maf:get-config'),
  importConfig: () => invoke('maf:import-config'),
  exportConfig: () => invoke('maf:export-config'),

  // clipboard native (không cần quyền navigator.clipboard, không cần HTTPS)
  readClipboard: () => invoke('maf:read-clipboard'),

  // trang medinet
  pageState: () => invoke('maf:page-state'),
  reloadMedinet: () => invoke('maf:reload-medinet'),
  openMedinet: (url) => invoke('maf:open-medinet', url),

  // điền
  fill: (payload) => invoke('maf:fill', payload),
  selectNo: () => invoke('maf:select-no'),
  scan: (filter) => invoke('maf:scan', filter),

  // panel
  openPanel: () => invoke('maf:open-panel'),
  log: (msg) => invoke('maf:log', String(msg).slice(0, 500)),

  /** Đăng ký nhận sự kiện từ main (kết quả điền, trạng thái trang, lệnh từ menu). */
  on: (channel, cb) => {
    const allowed = ['maf:result', 'maf:config', 'page-state',
      'maf:focus-paste', 'maf:do-scan', 'maf:do-import', 'maf:do-export'];
    if (allowed.indexOf(channel) < 0) return () => { };
    const listener = (_event, payload) => { try { cb(payload); } catch (e) { console.error(e); } };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};

contextBridge.exposeInMainWorld('maf', api);
