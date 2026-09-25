/*
 * panel.js — renderer của cửa sổ "Dán dữ liệu" (Electron).
 *
 * Không dùng thư viện nào ngoài maf-engine.js (được main process tiêm vào chính
 * cửa sổ này), nên việc tách cột/nhận diện dòng tiêu đề/so khớp cột dùng ĐÚNG MỘT
 * thuật toán với lúc điền vào medinet. Bản cũ không có UI dán dữ liệu nào cả.
 */
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var rows = [];            // dữ liệu đã tách (mảng 2 chiều)
  var headerIndex = -1;     // dòng tiêu đề (-1 = không có)
  var selectedRow = 0;      // dòng sẽ điền
  var config = null;        // { forms:[...], options:{...} }
  var configSource = '';
  var pageUrl = '';
  var engineReady = false;

  // ------------------------------------------------------------ khởi động
  function init() {
    bindButtons();
    bindEvents();
    waitForEngine(0);
    refreshConfig();
    refreshPageState();
    setInterval(refreshPageState, 8000);
  }

  /** Engine được tiêm sau dom-ready, nên phải chờ (tối đa ~4s) thay vì dùng ngay. */
  function waitForEngine(tries) {
    if (window.MAF && typeof window.MAF.parseTable === 'function') {
      engineReady = true;
      $('engineBadge').className = 'badge ok';
      $('engineBadge').textContent = 'Engine: ' + (window.MAF.VERSION || '?');
      $('engineBadge').title = 'maf-engine.js đã nạp vào panel';
      if (rows.length) { autoDetectHeader(); renderAll(); }
      return;
    }
    if (tries > 40) {
      $('engineBadge').className = 'badge err';
      $('engineBadge').textContent = 'Engine: KHÔNG NẠP ĐƯỢC';
      $('engineBadge').title = 'Thiếu Shared/maf-engine.js — xem log trong %APPDATA%/medical-autofill-app/logs';
      setStatus('err', 'Không nạp được engine (maf-engine.js). Vẫn tách được dữ liệu theo tab/xuống dòng, ' +
        'nhưng không tự nhận diện được dòng tiêu đề.');
      return;
    }
    setTimeout(function () { waitForEngine(tries + 1); }, 100);
  }

  function bindEvents() {
    if (!window.maf) {
      setStatus('err', 'Preload không chạy — không giao tiếp được với tiến trình chính.');
      return;
    }
    window.maf.on('maf:config', function (p) {
      if (!p) return;
      config = p.config; configSource = p.source || '';
      if (p.page && p.page.url) pageUrl = p.page.url;
      showConfigStat();
      renderPageBadge(p.page);
      if (rows.length) { autoDetectHeader(); renderAll(); }
    });
    window.maf.on('page-state', function (st) { renderPageBadge(st); });
    window.maf.on('maf:result', function (r) {
      if (r && r.title) setStatus(r.body && /thất bại|lỗi/i.test(r.title + r.body) ? 'err' : 'ok',
        r.title + (r.body ? '\n' + r.body : ''));
    });
    window.maf.on('maf:focus-paste', function () { focusPaste(); });
    window.maf.on('maf:do-scan', function () { doScan(); });
    window.maf.on('maf:do-import', function () { doImport(); });
    window.maf.on('maf:do-export', function () { doExport(); });
  }

  function bindButtons() {
    $('btnClip').addEventListener('click', readClipboard);
    $('btnParse').addEventListener('click', function () { parseText($('pasteBox').value, 'ô nhập'); });
    $('btnClear').addEventListener('click', function () {
      rows = []; headerIndex = -1; selectedRow = 0;
      $('pasteBox').value = '';
      renderAll();
      setStatus('', 'Đã xóa dữ liệu.');
    });
    $('pasteBox').addEventListener('paste', function () {
      // Chờ trình duyệt dán xong mới phân tích.
      setTimeout(function () { parseText($('pasteBox').value, 'ô nhập'); }, 30);
    });
    $('btnHeader').addEventListener('click', function () {
      if (!rows.length) return;
      headerIndex = selectedRow;
      renderAll();
      setStatus('ok', 'Đã đánh dấu dòng ' + (headerIndex + 1) + ' làm dòng tiêu đề.');
    });
    $('btnNoHeader').addEventListener('click', function () { headerIndex = -1; renderAll(); });

    $('btnFill').addEventListener('click', function () { doFill(false, false); });
    $('btnFillAll').addEventListener('click', function () { doFill(false, true); });
    $('btnDry').addEventListener('click', function () { doFill(true, false); });
    $('btnNo').addEventListener('click', doSelectNo);
    $('btnScan').addEventListener('click', doScan);
    $('btnReload').addEventListener('click', function () {
      window.maf.reloadMedinet().then(function (r) {
        setStatus(r && r.ok ? 'ok' : 'err', r && r.ok ? 'Đã yêu cầu tải lại trang medinet.' : (r && r.error) || 'Lỗi.');
      });
    });
    $('btnImport').addEventListener('click', doImport);
    $('btnExport').addEventListener('click', doExport);

    $('grid').addEventListener('click', function (e) {
      var tr = e.target.closest ? e.target.closest('tr[data-r]') : null;
      if (!tr) return;
      selectedRow = parseInt(tr.getAttribute('data-r'), 10) || 0;
      renderAll();
    });
  }

  // ------------------------------------------------------------ clipboard
  /**
   * Đọc clipboard qua tiến trình chính (API native của Electron).
   * KHÔNG dùng navigator.clipboard.readText(): cần secure context + quyền,
   * và trên file:// thường bị từ chối -> đúng lỗi "lúc dán được lúc không".
   */
  function readClipboard() {
    if (!window.maf) return;
    setStatus('wait', 'Đang đọc clipboard…');
    window.maf.readClipboard().then(function (r) {
      if (!r || !r.ok) {
        setStatus('err', 'Không đọc được clipboard: ' + ((r && r.error) || 'không rõ') +
          '\n\nNguyên nhân thường gặp trên Windows: clipboard đang bị tiến trình khác giữ ' +
          '(Excel chưa nhả, Unikey, TeamViewer/RDP, trình quản lý clipboard). ' +
          'Hãy Ctrl+C lại trong Excel rồi bấm lần nữa — app tự thử lại 5 lần.');
        return;
      }
      $('pasteBox').value = r.text;
      parseText(r.text, 'clipboard');
      if (r.attempt > 1) {
        $('parseStat').textContent += '  (đọc được ở lần thử ' + r.attempt + ' — clipboard Windows đang bận)';
      }
      if ($('chkAutoFill').checked && rows.length) doFill(false, false);
    }).catch(function (e) {
      setStatus('err', 'Lỗi đọc clipboard: ' + msg(e));
    });
  }

  function focusPaste() {
    try { $('pasteBox').focus(); } catch (e) { }
  }

  // ------------------------------------------------------------ tách dữ liệu
  function parseText(text, from) {
    text = String(text || '').replace(/\r\n?/g, '\n');
    if (!text.trim()) {
      rows = []; renderAll();
      setStatus('warn', 'Không có dữ liệu để phân tích.');
      return;
    }

    var parsed = null;
    if (engineReady) {
      try { parsed = window.MAF.parseTable(text); } catch (e) { log('parseTable lỗi: ' + msg(e)); }
    }
    rows = (parsed && parsed.rows && parsed.rows.length)
      ? parsed.rows
      : text.split('\n').map(function (l) { return l.split('\t'); });

    // Cắt dòng/cột trống thừa ở cuối (Excel hay kèm vài dòng rỗng).
    while (rows.length && rows[rows.length - 1].every(function (c) { return !String(c).trim(); })) rows.pop();
    if (!rows.length) { renderAll(); setStatus('warn', 'Dữ liệu rỗng.'); return; }

    autoDetectHeader();
    selectedRow = headerIndex >= 0 ? Math.min(headerIndex + 1, rows.length - 1) : 0;
    renderAll();

    var cols = 0;
    rows.forEach(function (r) { if (r.length > cols) cols = r.length; });
    setStatus('ok', 'Đã tách ' + rows.length + ' dòng × ' + cols + ' cột từ ' + from + '.' +
      (engineReady ? '' : ' (chưa có engine nên chỉ tách theo tab — ô chứa dấu nháy kép có thể sai)'));
  }

  function autoDetectHeader() {
    if (!engineReady || !rows.length) return;
    try {
      var fields = activeFields();
      var idx = window.MAF.detectHeaderRow(rows, fields);
      headerIndex = (typeof idx === 'number') ? idx : -1;
    } catch (e) { log('detectHeaderRow lỗi: ' + msg(e)); }
  }

  // ------------------------------------------------------------ cấu hình
  function refreshConfig() {
    if (!window.maf) return;
    window.maf.getConfig().then(function (r) {
      if (!r) return;
      config = r.config; configSource = r.source || '';
      showConfigStat();
    }).catch(function (e) { log('getConfig lỗi: ' + msg(e)); });
  }

  function refreshPageState() {
    if (!window.maf) return;
    window.maf.pageState().then(renderPageBadge).catch(function () { });
  }

  function renderPageBadge(st) {
    var b = $('pageBadge');
    if (!st) { b.className = 'badge'; b.textContent = 'Trang: ?'; return; }
    pageUrl = st.url || pageUrl;
    if (st.error) { b.className = 'badge err'; b.textContent = 'Trang: ' + st.error; b.title = st.url || ''; return; }
    var form = activeForm();
    if (form) {
      b.className = 'badge ok';
      b.textContent = 'Form: ' + form.name + ' · ' + form.fields.length + ' trường';
    } else {
      b.className = 'badge warn';
      b.textContent = 'Trang chưa khớp form nào';
    }
    b.title = pageUrl || '';
  }

  function activeForm() {
    if (!config || !config.forms || !config.forms.length) return null;
    if (pageUrl) {
      for (var i = 0; i < config.forms.length; i++) {
        var f = config.forms[i];
        var marker = f.urlContains || f.urlRegex || '';
        if (marker && marker !== 'YOUR_FORM_PART_URL' &&
          pageUrl.toLowerCase().indexOf(String(marker).toLowerCase()) >= 0) return f;
      }
    }
    return config.forms.length === 1 ? config.forms[0] : config.forms[0];
  }

  function activeFields() {
    var f = activeForm();
    return f && f.fields ? f.fields : [];
  }

  function showConfigStat() {
    var form = activeForm();
    $('cfgStat').textContent = (form ? form.name + ' · ' + form.fields.length + ' trường' : 'chưa có cấu hình') +
      ' — nguồn: ' + shorten(configSource, 60);
    $('cfgStat').title = configSource || '';
  }

  function doImport() {
    if (!window.maf) return;
    window.maf.importConfig().then(function (r) {
      if (!r) return;
      if (r.canceled) { setStatus('', 'Đã hủy nhập cấu hình.'); return; }
      if (!r.ok) { setStatus('err', 'Nhập cấu hình thất bại: ' + r.error); return; }
      setStatus('ok', 'Đã nhập ' + r.forms + ' form vào ' + r.source);
      refreshConfig();
      refreshPageState();
    }).catch(function (e) { setStatus('err', 'Nhập cấu hình lỗi: ' + msg(e)); });
  }

  function doExport() {
    if (!window.maf) return;
    window.maf.exportConfig().then(function (r) {
      if (!r || r.canceled) return;
      setStatus(r.ok ? 'ok' : 'err', r.ok ? 'Đã xuất cấu hình ra ' + r.path : ('Xuất lỗi: ' + r.error));
    }).catch(function (e) { setStatus('err', 'Xuất cấu hình lỗi: ' + msg(e)); });
  }

  // ------------------------------------------------------------ vẽ bảng
  function renderAll() { renderGrid(); renderMatchStat(); }

  function renderGrid() {
    var box = $('grid');
    if (!rows.length) {
      box.innerHTML = '<div class="muted" style="padding:12px">Chưa có dữ liệu.</div>';
      $('parseStat').textContent = '';
      return;
    }
    var cols = 0;
    rows.forEach(function (r) { if (r.length > cols) cols = r.length; });

    var html = ['<table><thead><tr><th class="num"></th><th class="num">#</th>'];
    for (var c = 0; c < cols; c++) {
      var hn = headerIndex >= 0 ? cell(headerIndex, c) : '';
      html.push('<th title="' + esc(hn || ('Cột ' + (c + 1))) + '">' + colName(c) +
        (hn ? ' <span class="muted">' + esc(trunc(hn, 18)) + '</span>' : '') + '</th>');
    }
    html.push('</tr></thead><tbody>');

    for (var r = 0; r < rows.length; r++) {
      var isHeader = (r === headerIndex);
      var isSel = (r === selectedRow);
      var empty = rows[r].every(function (x) { return !String(x).trim(); });
      html.push('<tr data-r="' + r + '"' + (isHeader ? ' class="header"' : isSel ? ' class="selected"' : empty ? ' class="empty"' : '') + '>');
      html.push('<td><input type="radio" name="pick" data-r="' + r + '"' + (isSel ? ' checked' : '') + '></td>');
      html.push('<td class="num">' + (r + 1) + '</td>');
      for (var c2 = 0; c2 < cols; c2++) html.push('<td>' + esc(trunc(cell(r, c2), 40)) + '</td>');
      html.push('</tr>');
    }
    html.push('</tbody></table>');
    box.innerHTML = html.join('');

    $('parseStat').textContent = rows.length + ' dòng × ' + cols + ' cột' +
      (headerIndex >= 0 ? ' · tiêu đề ở dòng ' + (headerIndex + 1) : ' · KHÔNG có dòng tiêu đề') +
      ' · sẽ điền dòng ' + (selectedRow + 1);
  }

  function renderMatchStat() {
    var el = $('matchStat');
    if (!rows.length || !engineReady) { el.textContent = ''; return; }
    var fields = activeFields();
    if (!fields.length) { el.textContent = 'Chưa có cấu hình trường.'; return; }
    try {
      var header = headerIndex >= 0 ? rows[headerIndex] : null;
      var res = window.MAF.resolveColumns(fields, header) || [];
      var byHeader = 0, byIndex = 0, none = 0;
      res.forEach(function (m) {
        if (!m) return;
        if (m.via === 'header') byHeader++; else if (m.via === 'index') byIndex++; else none++;
      });
      el.textContent = 'Khớp: ' + byHeader + ' theo tiêu đề, ' + byIndex + ' theo vị trí' +
        (none ? ', ' + none + ' không khớp' : '');
      el.style.color = none ? '#b45309' : '#16a34a';
    } catch (e) { el.textContent = ''; }
  }

  // ------------------------------------------------------------ điền
  function doFill(dryRun, allRows) {
    if (!window.maf) return;
    if (!rows.length) { setStatus('warn', 'Chưa có dữ liệu. Bấm "Đọc clipboard" hoặc dán vào ô bên dưới.'); return; }

    var payload = {
      rows: rows,
      headerRow: headerIndex >= 0 ? rows[headerIndex] : null,
      dryRun: !!dryRun
    };
    var form = activeForm();
    if (form && form.name) payload.formId = form.name;

    if (allRows) {
      var idxs = [];
      for (var i = (headerIndex >= 0 ? headerIndex + 1 : 0); i < rows.length; i++) {
        if (!rows[i].every(function (x) { return !String(x).trim(); })) idxs.push(i);
      }
      if (!idxs.length) { setStatus('warn', 'Không có dòng dữ liệu nào để điền.'); return; }
      payload.rowIndexes = idxs;
    } else {
      payload.rowIndex = selectedRow;
    }

    setStatus('wait', dryRun ? 'Đang chạy thử (không ghi)…' : (allRows ? 'Điền ' + (payload.rowIndexes || []).length + ' dòng…' : 'Điền dòng ' + (selectedRow + 1) + '…'));
    setBusy(true);

    window.maf.fill(payload).then(function (res) {
      setBusy(false);
      renderFillResult(res, dryRun);
    }).catch(function (e) {
      setBusy(false);
      setStatus('err', 'Không điền được: ' + msg(e));
    });
  }

  function renderFillResult(res, dryRun) {
    var rep = res && (res.report || res.raw) ? (res.report || res.raw) : res;
    if (!rep) { setStatus('err', 'Engine không trả về báo cáo.'); return; }

    if (res && res.error && !rep.ok) { setStatus('err', res.error); return; }
    if (rep.error) { setStatus('err', rep.message || ('Lỗi: ' + rep.error)); renderReport(rep); return; }

    var ok = rep.ok || 0;
    var miss = (rep.missing || []).length;
    var fail = (rep.failed || []).length;
    var empty = (rep.emptyRequired || []).length;
    var kind = (fail || miss || ok === 0) ? (ok ? 'warn' : 'err') : 'ok';
    setStatus(kind, (dryRun ? '[CHẠY THỬ] ' : '') + (rep.message || (ok + ' trường đã điền')) +
      ' · ' + ok + ' OK' + (miss ? ', ' + miss + ' không thấy ô' : '') +
      (fail ? ', ' + fail + ' ghi lỗi' : '') + (empty ? ', ' + empty + ' thiếu dữ liệu' : '') +
      (rep.probe ? ' · trang có ' + rep.probe.labels + ' nhãn/' + rep.probe.inputs + ' ô nhập' : ''));
    renderReport(rep);
  }

  function renderReport(rep) {
    var box = $('report');
    if (!rep) { box.innerHTML = ''; return; }
    var html = [];

    function list(arr, title, withReason) {
      if (!arr || !arr.length) return;
      html.push('<div style="margin-top:6px"><strong>' + title + ' (' + arr.length + ')</strong><ul>');
      arr.forEach(function (r) {
        var v = (r.value != null && r.value !== '') ? r.value : (r.raw || '');
        html.push('<li><strong>' + esc(r.label || '') + '</strong>' +
          (v !== '' ? ' = "' + esc(trunc(String(v), 40)) + '"' : '') +
          (withReason && r.reason ? ' <span class="muted">— ' + esc(r.reason) + '</span>' : '') + '</li>');
      });
      html.push('</ul></div>');
    }

    list(rep.failed, 'Ghi không được', true);
    list(rep.missing, 'Không tìm thấy ô nhập (kiểm tra nhãn/tên cột trong cấu hình)', false);
    list(rep.emptyRequired, 'Thiếu dữ liệu bắt buộc', false);

    if (rep.rows && rep.rows.length) {
      var n = 0;
      rep.rows.forEach(function (rr) { n += (rr.fields || []).length; });
      html.push('<details style="margin-top:8px"><summary class="muted">Chi tiết ' + n + ' trường</summary><ul>');
      rep.rows.forEach(function (rr) {
        (rr.fields || []).forEach(function (f) {
          html.push('<li>dòng ' + ((rr.rowIndex || 0) + 1) + ' · ' + esc(f.label || '') +
            ' → cột ' + (f.col != null && f.col >= 0 ? f.col + 1 : '?') +
            ' (' + esc(f.via || '') + ') · ' +
            (f.success ? '<span style="color:#16a34a">✔ "' + esc(trunc(String(f.written || ''), 30)) + '"</span>'
              : '<span style="color:#dc2626">✖ ' + esc(f.status || f.reason || '') + '</span>') + '</li>');
        });
      });
      html.push('</ul></details>');
    }
    box.innerHTML = html.join('');
  }

  function doSelectNo() {
    if (!window.maf) return;
    setStatus('wait', 'Đang chọn "Không" cho các câu hỏi…');
    window.maf.selectNo().then(function (res) {
      var r = res && (res.raw || res.report) ? (res.raw || res.report) : res;
      if (r && r.error) { setStatus('err', r.message || r.error); return; }
      setStatus('ok', r && r.message ? r.message : 'Đã bấm "Không".');
    }).catch(function (e) { setStatus('err', 'Lỗi: ' + msg(e)); });
  }

  function doScan() {
    if (!window.maf) return;
    setStatus('wait', 'Đang quét các ô trên trang medinet…');
    window.maf.scan({}).then(function (res) {
      var r = res && (res.raw || res.report) ? (res.raw || res.report) : res;
      if (!r || r.error) { setStatus('err', (r && (r.message || r.error)) || 'Không quét được.'); return; }
      var items = r.items || [];
      setStatus('ok', 'Trang có ' + r.count + ' ô khả nghi / ' + items.length + ' mục quét được.');
      var html = ['<details open style="margin-top:6px"><summary class="muted">Kết quả quét (' + items.length + ')</summary>',
        '<table style="margin-top:4px"><thead><tr><th>Nhãn</th><th>Loại ô</th><th>Selector</th></tr></thead><tbody>'];
      items.slice(0, 300).forEach(function (it) {
        html.push('<tr><td>' + esc(trunc(it.label || '', 40)) + '</td>' +
          '<td>' + esc(it.target || it.kind || '') + '</td>' +
          '<td class="mono">' + esc(trunc(it.selector || '', 70)) + '</td></tr>');
      });
      html.push('</tbody></table></details>');
      $('report').innerHTML = html.join('');
    }).catch(function (e) { setStatus('err', 'Quét lỗi: ' + msg(e)); });
  }

  // ------------------------------------------------------------ tiện ích
  function cell(r, c) { var v = rows[r] ? rows[r][c] : ''; return v == null ? '' : String(v); }

  function colName(i) {
    var s = ''; i = i + 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function setStatus(kind, text) {
    var box = $('status');
    box.className = kind || '';
    box.innerHTML = '<div class="box">' + esc(text || '') + '</div>';
    if (window.maf && text) { try { window.maf.log(text.split('\n')[0]); } catch (e) { } }
  }

  function setBusy(v) {
    ['btnFill', 'btnFillAll', 'btnDry', 'btnNo', 'btnClip'].forEach(function (id) {
      var el = $(id); if (el) el.disabled = v;
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.substring(0, n) + '…' : s; }
  function shorten(s, n) { s = String(s || ''); return s.length > n ? '…' + s.substring(s.length - n) : s; }
  function msg(e) { return (e && e.message) ? e.message : String(e); }
  function log(m) { if (window.maf) { try { window.maf.log(m); } catch (e) { } } console.log('[panel] ' + m); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
