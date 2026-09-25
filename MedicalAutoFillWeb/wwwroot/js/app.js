/*!
 * app.js — logic trang dán dữ liệu (không phụ thuộc jQuery/CDN).
 *
 * Điểm khác bản cũ:
 *  - Không còn Handsontable (CDN + license sai) -> dùng PasteGrid tự host.
 *  - Tự nhận diện DÒNG TIÊU ĐỀ và báo cho người dùng khớp được bao nhiêu cột
 *    (bản cũ điền theo index cột cứng => lệch cột là nguyên nhân "paste không ăn").
 *  - Có kiểm tra sống còn của Bridge ngay trên trang, kèm hướng dẫn xử lý.
 *  - Mọi lỗi đều hiện thông báo đọc được, không còn "Failed to fetch" khó hiểu.
 */
(function () {
  'use strict';

  var grid = null;
  var forms = [];
  var currentForm = null;
  var busy = false;

  var $ = function (id) { return document.getElementById(id); };

  function start() {
    if (typeof PasteGrid === 'undefined') {
      showStatus('err', 'Không nạp được /js/paste-grid.js — không thể dán dữ liệu. Kiểm tra thư mục wwwroot/js.');
      return;
    }

    grid = PasteGrid.mount($('grid'), { minCols: 36, minRows: 8 });
    grid.on('change', updateStats);
    grid.on('paste', onPasted);

    $('btnHeader').addEventListener('click', function () {
      if (!grid) return;
      grid.setHeaderRow(grid.selectedRow);
      updateStats();
      detectMatches();
    });
    $('btnClearHeader').addEventListener('click', function () {
      if (!grid) return;
      grid.setHeaderRow(-1);
      updateStats();
    });
    $('btnAddRows').addEventListener('click', function () { if (grid) grid.addRows(20); });
    $('btnClear').addEventListener('click', function () {
      if (!grid) return;
      if (!confirm('Xóa toàn bộ dữ liệu trong bảng?')) return;
      grid.clear();
      $('matchInfo').textContent = '';
      updateStats();
    });

    $('btnReloadForms').addEventListener('click', loadForms);
    $('formSelect').addEventListener('change', function () { selectForm(this.value); });

    $('btnFill').addEventListener('click', function () { send(false); });
    $('btnDryRun').addEventListener('click', function () { send(true); });
    $('btnSelectNo').addEventListener('click', selectNo);

    // Phím tắt như bản cũ (người dùng đã quen): Ctrl+Enter = gửi, Ctrl+B = chọn "Không".
    // Đăng ký trên document của TRANG NÀY nên không ảnh hưởng ứng dụng khác
    // (khác với bản Electron cũ dùng globalShortcut -> cướp Ctrl+B của cả Windows).
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey || e.altKey) return;
      var k = String(e.key || '').toLowerCase();
      if (e.key === 'Enter') { e.preventDefault(); if (!busy) send(false); }
      else if (k === 'b') { e.preventDefault(); if (!busy) selectNo(); }
      else if (k === 'r') { e.preventDefault(); detectMatches(); }
    });

    setEngineBadge();
    loadForms();
    pollBridge();
    setInterval(pollBridge, 15000);
  }

  // ------------------------------------------------------------------ engine
  function engineOk() { return typeof window.MAF !== 'undefined' && typeof window.MAF.parseTable === 'function'; }

  function setEngineBadge() {
    var b = $('engineBadge');
    if (!b) return;
    if (engineOk()) {
      b.className = 'badge ok';
      b.textContent = 'Engine: ' + (window.MAF.VERSION || '?');
    } else {
      b.className = 'badge warn';
      b.textContent = 'Engine: chưa nạp (vẫn dán được, nhưng không tự nhận tiêu đề)';
    }
  }

  // ------------------------------------------------------------------ forms
  function loadForms() {
    fetch('/Home/GetForms', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        forms = Array.isArray(list) ? list : [];
        var sel = $('formSelect');
        sel.innerHTML = '';
        if (!forms.length) {
          sel.innerHTML = '<option value="">(chưa có form nào — vào "Cấu hình form" để thêm)</option>';
          $('formHint').textContent = 'Chưa có cấu hình form. Bấm "Cấu hình form" ở menu trên.';
          currentForm = null;
          return;
        }
        forms.forEach(function (f) {
          var o = document.createElement('option');
          o.value = f.id != null ? f.id : '';
          o.textContent = (f.displayName || f.name || ('Form #' + f.id)) +
            ' — ' + (f.fields ? f.fields.length : 0) + ' trường';
          sel.appendChild(o);
        });
        selectForm(sel.value);
      })
      .catch(function (err) {
        showStatus('err', 'Không đọc được danh sách form từ máy chủ: ' + msg(err));
      });
  }

  function selectForm(id) {
    var found = null;
    for (var i = 0; i < forms.length; i++) if (String(forms[i].id) === String(id)) found = forms[i];
    currentForm = found;

    var hint = $('formHint');
    if (!found) { hint.textContent = 'Chọn form cần điền.'; return; }
    var nf = found.fields ? found.fields.length : 0;
    var withHeader = 0;
    if (found.fields) found.fields.forEach(function (f) { if (f.headerNames && f.headerNames.length) withHeader++; });
    hint.innerHTML = '<span class="mono">' + esc(found.url || '') + '</span> · <strong>' + nf +
      '</strong> trường, trong đó <strong>' + withHeader + '</strong> trường có tên cột Excel để ghép theo tiêu đề.';
    detectMatches();
  }

  // ------------------------------------------------------------- nhận diện
  function rowsNow() { return grid ? grid.getData() : []; }

  function onPasted(info) {
    // Vừa dán: tự tìm dòng tiêu đề nếu engine có mặt.
    if (engineOk() && grid.headerRowIndex < 0) {
      var rows = rowsNow();
      var fields = currentForm && currentForm.fields ? currentForm.fields : [];
      try {
        var idx = window.MAF.detectHeaderRow(rows, fields);
        if (idx >= 0) grid.setHeaderRow(idx);
      } catch (e) { /* engine lỗi thì bỏ qua, người dùng tự đánh dấu */ }
    }
    updateStats();
    detectMatches();
    showStatus('ok', 'Đã dán ' + info.rows + ' dòng × ' + info.cols + ' cột. ' +
      (grid.headerRowIndex >= 0
        ? 'Dòng tiêu đề = dòng ' + (grid.headerRowIndex + 1) + '.'
        : 'Chưa xác định được dòng tiêu đề — hãy chọn dòng tên cột rồi bấm "Đánh dấu dòng tiêu đề".'));
  }

  function detectMatches() {
    var box = $('matchInfo');
    if (!box || !grid) return;
    var rows = rowsNow();
    if (!rows.length) { box.textContent = ''; return; }
    if (!engineOk() || !currentForm || !currentForm.fields || !currentForm.fields.length) {
      box.textContent = 'Dán dữ liệu để xem mức độ khớp cột.';
      return;
    }
    try {
      var headerIdx = grid.headerRowIndex;
      // API engine: resolveColumns(fields, headerRowArray) -> [{field, col, via}]
      var header = headerIdx >= 0 ? (rows[headerIdx] || null) : null;
      var res = window.MAF.resolveColumns(currentForm.fields, header) || [];
      var byHeader = 0, byIndex = 0, none = 0, noneNames = [];
      res.forEach(function (m) {
        if (!m) return;
        if (m.via === 'header') byHeader++;
        else if (m.via === 'index') byIndex++;
        else {
          none++;
          var f = m.field || {};
          noneNames.push((f.labels && f.labels[0]) || f.key || ('cột ' + f.index));
        }
      });
      var text = 'Khớp cột: ' + byHeader + ' theo tiêu đề Excel, ' + byIndex + ' theo vị trí cột cấu hình' +
        (none ? ', ' + none + ' chưa khớp được ô nào' : '') +
        (header ? '' : ' — KHÔNG có dòng tiêu đề nên phải đoán theo vị trí!');
      if (noneNames.length) {
        text += ' (thiếu: ' + noneNames.slice(0, 8).join(', ') + (noneNames.length > 8 ? ' …' : '') + ')';
      }
      box.textContent = text;
      box.style.color = (none || !header) ? '#b45309' : '#16a34a';
    } catch (e) {
      box.textContent = 'Không phân tích được: ' + msg(e);
    }
  }

  function updateStats() {
    if (!grid) return;
    $('gridStats').textContent = grid.rowCount + ' dòng · ' + grid.colCount + ' cột' +
      (grid.headerRowIndex >= 0 ? ' · tiêu đề ở dòng ' + (grid.headerRowIndex + 1) : '');
  }

  // ------------------------------------------------------------------ gửi
  function send(dryRun) {
    if (busy) return;
    if (!grid) return;
    var rows = rowsNow();
    if (!rows.length) { showStatus('warn', 'Bảng đang trống. Hãy dán dữ liệu từ Excel trước.'); return; }
    if (!currentForm) { showStatus('warn', 'Chưa chọn form. Hãy chọn form ở mục 1.'); return; }

    var headerIdx = grid.headerRowIndex;
    var selected = grid.selectedRow;

    busy = true;
    setButtonsDisabled(true);
    showStatus('wait', dryRun ? 'Đang chạy thử…' : 'Đang gửi lên Medinet…');

    var body = {
      formId: currentForm.id,
      rows: rows,
      headerRowIndex: headerIdx,
      headerRow: headerIdx >= 0 ? (rows[headerIdx] || null) : null,
      selectedRow: selected,
      dryRun: !!dryRun,
      reloadFirst: !!$('chkReload').checked
    };

    fetch('/Home/FillMedinet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); })
      .then(function (res) {
        var j = res.json || {};
        if (res.status >= 400 && !j.message) j.message = 'Máy chủ trả về lỗi HTTP ' + res.status;
        renderResult(j, dryRun);
      })
      .catch(function (err) {
        showStatus('err', 'Không gọi được máy chủ: ' + msg(err) +
          '. Kiểm tra app web còn chạy không (thường ở cổng 5000).');
      })
      .finally(function () { busy = false; setButtonsDisabled(false); });
  }

  function selectNo() {
    if (busy) return;
    busy = true;
    showStatus('wait', 'Đang chọn "Không" cho các câu hỏi trên form medinet…');
    fetch('/Home/SelectNoMedinet', { method: 'POST', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (j) { renderResult(j, false); })
      .catch(function (e) { showStatus('err', 'Không gọi được máy chủ: ' + msg(e)); })
      .finally(function () { busy = false; });
  }

  function renderResult(j, dryRun) {
    if (!j) { showStatus('err', 'Máy chủ không trả về dữ liệu.'); return; }
    var rep = j.report || null;

    if (!rep) {
      showStatus(j.success ? 'ok' : 'err', j.message || (j.success ? 'Đã gửi lệnh.' : 'Không thành công.'));
      $('reportBox').innerHTML = '';
      return;
    }

    if (rep.error) {
      showStatus('err', rep.message || ('Lỗi engine: ' + rep.error));
      renderReport(rep);
      return;
    }

    var okN = rep.ok || 0;
    var failN = (rep.failed || []).length;
    var missN = (rep.missing || []).length;
    var emptyN = (rep.emptyRequired || []).length;

    if (dryRun) {
      showStatus(missN > 0 || okN === 0 ? 'warn' : 'ok',
        (rep.message || 'Đã chạy thử.') + ' — chưa ghi gì vào trang medinet.');
    } else if (j.success === false) {
      showStatus('err', j.message || rep.message || 'Điền không thành công.');
    } else {
      showStatus(failN > 0 || missN > 0 ? 'warn' : 'ok', j.message || rep.message || 'Đã gửi lệnh điền.');
    }

    renderReport(rep);
    if (missN === 0 && failN === 0 && okN === 0) {
      $('reportBox').innerHTML += '<div class="notice warn" style="margin-top:8px">' +
        'Không có trường nào được điền. Thường là do Bridge đang mở trang medinet khác với form đã chọn.</div>';
    }
  }

  /** Báo cáo engine: {ok, filled[], missing[], failed[], emptyRequired[], rows[{rowIndex,fields[]}], probe, url, durationMs} */
  function renderReport(rep) {
    var box = $('reportBox');
    if (!box) return;
    if (!rep) { box.innerHTML = ''; return; }

    var html = [];
    html.push('<div class="row" style="gap:8px">');
    html.push('<span class="badge ok">Điền được: ' + (rep.ok || 0) + '</span>');
    html.push('<span class="badge err">Không thấy ô: ' + (rep.missing || []).length + '</span>');
    html.push('<span class="badge err">Ghi bị từ chối: ' + (rep.failed || []).length + '</span>');
    html.push('<span class="badge warn">Thiếu dữ liệu: ' + (rep.emptyRequired || []).length + '</span>');
    if (rep.durationMs) html.push('<span class="badge idle">' + rep.durationMs + ' ms</span>');
    if (rep.headerDetected != null) {
      html.push('<span class="badge idle">Tiêu đề: dòng ' + (rep.headerDetected >= 0 ? rep.headerDetected + 1 : 'không thấy') + '</span>');
    }
    if (rep.form) html.push('<span class="badge idle">Form: ' + esc(rep.form) + '</span>');
    html.push('</div>');

    if (rep.probe) {
      html.push('<div class="small muted" style="margin-top:6px">Trang medinet có ' +
        rep.probe.labels + ' nhãn và ' + rep.probe.inputs + ' ô nhập; engine khớp được ' +
        rep.probe.found + '/' + rep.probe.total + ' trường.</div>');
    }
    if (rep.url) html.push('<div class="small muted mono">' + esc(trunc(String(rep.url), 110)) + '</div>');
    if (rep.error) html.push('<div class="notice err" style="margin-top:8px">' + esc(rep.error) + '</div>');

    function list(arr, title, cls, withReason) {
      if (!arr || !arr.length) return;
      html.push('<div style="margin-top:8px"><strong class="' + cls + '">' + title + ' (' + arr.length + ')</strong><ul>');
      arr.forEach(function (r) {
        var v = r.value != null && r.value !== '' ? r.value : (r.raw || '');
        html.push('<li><strong>' + esc(r.label || '') + '</strong>' +
          (v !== '' ? ' = "' + esc(trunc(String(v), 40)) + '"' : '') +
          (withReason && r.reason ? ' <span class="muted">— ' + esc(r.reason) + '</span>' : '') +
          (r.via ? ' <span class="muted mono">[' + esc(r.via) + ']</span>' : '') + '</li>');
      });
      html.push('</ul></div>');
    }

    list(rep.failed, 'GHI KHÔNG ĐƯỢC (trang web từ chối giá trị)', 'fail', true);
    list(rep.missing, 'KHÔNG TÌM THẤY Ô NHẬP (sai nhãn/tên cột, hoặc form chưa mở)', 'fail', false);
    list(rep.emptyRequired, 'THIẾU DỮ LIỆU BẮT BUỘC (cột Excel trống)', '', false);

    // Chạy thử: hiện bảng chi tiết từng trường để người dùng dò mapping.
    if (rep.rows && rep.rows.length) {
      var details = [];
      rep.rows.forEach(function (rr) {
        (rr.fields || []).forEach(function (f) { f._row = rr.rowIndex; details.push(f); });
      });
      if (details.length) {
        html.push('<details style="margin-top:10px"><summary class="small">Chi tiết từng trường (' +
          details.length + ')</summary><table class="list fields-preview" style="margin-top:6px"><thead><tr>' +
          '<th>Dòng</th><th>Trường</th><th>Cột Excel</th><th>Khớp theo</th><th>Giá trị</th>' +
          '<th>Tìm thấy ô</th><th>Kết quả</th></tr></thead><tbody>');
        details.forEach(function (f) {
          var st = f.success ? '<span style="color:#16a34a">✔ đã ghi</span>'
            : f.status === 'missing' ? '<span style="color:#dc2626">✖ không thấy ô</span>'
              : f.status === 'failed' ? '<span style="color:#dc2626">✖ ' + esc(f.reason || 'ghi lỗi') + '</span>'
                : f.status === 'empty-required' ? '<span style="color:#d97706">○ thiếu dữ liệu</span>'
                  : '<span class="muted">○ trống</span>';
          html.push('<tr><td>' + ((f._row != null ? f._row : 0) + 1) + '</td>' +
            '<td>' + esc(f.label || '') + '</td>' +
            '<td>' + (f.col != null && f.col >= 0 ? f.col + 1 : '—') + '</td>' +
            '<td>' + esc(f.via || '') + '</td>' +
            '<td>' + esc(trunc(String(f.written != null && f.written !== '' ? f.written : (f.raw || '')), 40)) + '</td>' +
            '<td>' + (f.found ? '<span style="color:#16a34a">có</span> <span class="mono small">' + esc(f.foundVia || '') + '</span>' : '<span style="color:#dc2626">không</span>') + '</td>' +
            '<td>' + st + '</td></tr>');
        });
        html.push('</tbody></table></details>');
      }
    }

    box.innerHTML = html.join('');
  }

  // ---------------------------------------------------------------- bridge
  function pollBridge() {
    var b = $('bridgeBadge');
    if (!b) return;
    fetch('/Home/BridgeStatus', { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.reachable) {
          b.className = 'badge ok';
          b.textContent = 'Bridge: sẵn sàng' + (j.engine ? ' (engine ' + j.engine + ')' : '') +
            (j.formDetected === false ? ' — CHƯA mở đúng form' : '');
          b.title = j.url || '';
          if (j.formDetected === false) { b.className = 'badge warn'; }
        } else {
          b.className = 'badge err';
          b.textContent = 'Bridge: không phản hồi';
          b.title = (j && j.message) || 'MedinetBridge.exe chưa chạy trên máy chủ';
        }
      })
      .catch(function () {
        b.className = 'badge err';
        b.textContent = 'Bridge: không kiểm tra được';
      });
  }

  // ---------------------------------------------------------------- helper
  function setButtonsDisabled(v) {
    ['btnFill', 'btnDryRun', 'btnSelectNo'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = v;
    });
  }

  function showStatus(kind, text) {
    var box = $('statusBox');
    if (!box) return;
    var cls = kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : kind === 'warn' ? 'warn' : 'idle';
    var label = kind === 'ok' ? 'Thành công' : kind === 'err' ? 'Thất bại'
      : kind === 'warn' ? 'Cần lưu ý' : kind === 'wait' ? 'Đang xử lý…' : 'Chưa thực hiện';
    box.className = 'card-inner ' + cls;
    box.style.borderLeft = '4px solid ' + (cls === 'ok' ? '#16a34a' : cls === 'err' ? '#dc2626' : cls === 'warn' ? '#d97706' : '#9aa5b1');
    box.style.padding = '8px 10px';
    box.style.borderRadius = '4px';
    box.innerHTML = '<span class="badge ' + cls + '">' + esc(label) + '</span>' +
      '<div class="msg">' + esc(text) + '</div>';
  }

  function msg(e) { return (e && e.message) ? e.message : String(e); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function trunc(s, n) { return s.length > n ? s.substring(0, n) + '…' : s; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
