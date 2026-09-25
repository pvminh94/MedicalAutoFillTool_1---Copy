const { app, BrowserWindow, globalShortcut, clipboard } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Mở thẳng medinet
  mainWindow.loadURL('https://quanlyskcd.medinet.org.vn/account/login');

  // Tắt menu
  mainWindow.setMenuBarVisibility(false);

  // Khi trang load xong, inject script auto-fill
  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow.webContents.getURL();
    console.log('Đã load:', url);

    // Inject bridge API
    mainWindow.webContents.executeJavaScript(`
      window.__MAF_ELECTRON = true;
      console.log('[MAF] Electron bridge ready');
    `);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Đăng ký phím tắt Ctrl+B = chọn Không
  globalShortcut.register('CommandOrControl+B', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          var n = 0;
          var keywords = ['không', 'hầu như không', 'không nhớ rõ', 'không có', 'bình thường', 'không rõ'];
          document.querySelectorAll('.dx-item-content, .dx-list-item-content, span, label').forEach(function(el) {
            if (!el.innerText) return;
            var t = el.innerText.trim().toLowerCase();
            if (keywords.indexOf(t) >= 0) {
              var container = el.closest('.dx-radio-button, .dx-item, td, tr') || el.parentElement;
              var radio = container ? container.querySelector('input[type="radio"]') : null;
              if (radio) { if (!radio.checked) { radio.click(); n++; } }
              else {
                var clickable = (container ? container.querySelector('.dx-radio, .dx-radio-value-container') : null) || el;
                var checked = container && (container.getAttribute('aria-checked') === 'true' || container.classList.contains('dx-state-checked'));
                if (!checked) { clickable.click(); n++; }
              }
            }
          });
          console.log('[MAF] Đã chọn ' + n + ' ô Không');
        })();
      `);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC: nhận dữ liệu paste từ web
const { ipcMain } = require('electron');

ipcMain.on('fill-data', (event, data) => {
  console.log('Nhận dữ liệu fill:', data ? data.length + ' dòng' : '0');
  if (mainWindow && data) {
    fillMedinetForm(data);
  }
});

function fillMedinetForm(rows) {
  // Lấy dòng đầu tiên
  const data = rows.length > 0 ? rows[0] : [];

  // Build script fill
  const script = `
(function() {
  var data = ${JSON.stringify(data)};
  var ok=0, miss=0;

  var fieldMap = [
    {idx:0, labels:['makcb','ma kcb']},
    {idx:1, labels:['hoten','ho ten','ho va ten']},
    {idx:2, labels:['ngaysinh','ngay sinh','nam sinh']},
    {idx:3, labels:['gioitinh','gioi tinh']},
    {idx:4, labels:['dantoc','dan toc']},
    {idx:5, labels:['mabhyt','ma bhyt','bao hiem y te']},
    {idx:6, labels:['ngaykham','ngay kham','ngay vao']},
    {idx:7, labels:['bacsy','bac sy','bac si']},
    {idx:8, labels:['chan doan','chan doan']},
    {idx:9, labels:['mau','xet nghiem mau']},
    {idx:10, labels:['nuoctieu','nuoc tieu','xet nghiem nuoc tieu']},
    {idx:11, labels:['glucose','glucose','duong huyet']},
    {idx:12, labels:['ure','ure','urea']},
    {idx:13, labels:['creatinin','creatinin','creatinine']},
    {idx:14, labels:['got','got','ast']},
    {idx:15, labels:['gpt','gpt','alt']},
    {idx:16, labels:['cholesterol','cholesterol']},
    {idx:17, labels:['triglycerid','triglycerid','triglyceride']},
    {idx:18, labels:['hdl','hdl-cholesterol']},
    {idx:19, labels:['ldl','ldl-cholesterol']},
    {idx:20, labels:['bili tp','bilirubin tp','bilirubin toan phan']},
    {idx:21, labels:['bili tt','bilirubin tt','bilirubin truc tiep']},
    {idx:22, labels:['bili gt','bilirubin gt','bilirubin gian tiep']},
    {idx:23, labels:['protein','protein toan phan']},
    {idx:24, labels:['albumin','albumin']},
    {idx:25, labels:['globulin','globulin']},
    {idx:26, labels:['men tim','men tim']},
    {idx:27, labels:['ck-mb','ck-mb']},
    {idx:28, labels:['troponin','troponin','tnt']},
    {idx:29, labels:['crp','crp']},
    {idx:30, labels:['mau lam','mau lang']},
    {idx:31, labels:['sat','sat huyet thanh']},
    {idx:32, labels:['ferritin','ferritin']}
  ];

  function findInput(labels) {
    var keys = labels.map(function(l){return String(l).toLowerCase().trim();});
    var els = document.querySelectorAll('label,span,div,td,th,p,b,strong');
    var found = null;
    Array.prototype.forEach.call(els,function(el){
      var t = el.innerText ? el.innerText.toLowerCase().trim() : '';
      if(keys.indexOf(t)>=0){
        var container = el.closest('.dx-field,.form-group,.row,div')||el.parentElement;
        var input = container ? container.querySelector('input:not([type=hidden]),textarea') : null;
        if(!input){
          var lr = el.getBoundingClientRect();
          var inputs = document.querySelectorAll('input:not([type=hidden]),textarea');
          var best = null, min = 999999;
          Array.prototype.forEach.call(inputs,function(inp){
            var ir = inp.getBoundingClientRect();
            if(ir.top>=lr.bottom-10&&ir.top<=lr.bottom+60&&ir.left>=lr.left-20&&ir.left<=lr.left+80){
              var d = Math.abs(ir.top-lr.bottom);
              if(d<min){min=d;best=inp;}
            }
          });
          input = best;
        }
        if(input)found=input;
      }
    });
    return found;
  }

  function setVal(input,val){
    if(!input)return false;
    input.focus();
    input.value=val;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    input.dispatchEvent(new Event('blur',{bubbles:true}));
    return true;
  }

  fieldMap.forEach(function(f){
    var raw=data[f.idx];
    if(raw===undefined||raw===null||String(raw).trim()==='')return;
    var inp=findInput(f.labels);
    if(inp&&setVal(inp,String(raw).trim()))ok++;else miss++;
  });

  console.log('[MAF] ✅ Fill xong: '+ok+' OK, '+miss+' thieu');
  return {ok:ok, miss:miss};
})();
  `;

  mainWindow.webContents.executeJavaScript(script).then(result => {
    console.log('[MAF] Kết quả fill:', JSON.stringify(result));
  }).catch(err => {
    console.error('[MAF] Lỗi fill:', err);
  });
}