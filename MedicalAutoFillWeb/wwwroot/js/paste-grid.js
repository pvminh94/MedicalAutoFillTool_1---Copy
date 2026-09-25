/*!
 * PasteGrid — bảng dán dữ liệu kiểu Excel, KHÔNG phụ thuộc thư viện ngoài.
 *
 * Thay cho Handsontable ở bản cũ. Lý do phải thay:
 *  1. Bản cũ tải Handsontable từ cdn.jsdelivr.net. Mạng bệnh viện chặn/mất internet
 *     => `Handsontable` undefined => TOÀN BỘ script của trang ném lỗi => không có
 *     bảng để Ctrl+V. Đây là nguyên nhân số 1 của "không copy paste được".
 *  2. licenseKey 'non-commercial-and-evaluation' là SAI giấy phép khi dùng trong
 *     bệnh viện (Handsontable 14 bản thương mại phải mua).
 * File này ~10KB, tự host, không licence, chạy offline 100%.
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_RENDER_ROWS = 200;   // chỉ render phần đầu để không đơ trình duyệt

  function mount(container, opts) {
    opts = opts || {};
    var minCols = opts.minCols || 8;
    var minRows = opts.minRows || 6;
    var data = [];             // mảng 2 chiều
    var sel = { row: 0, col: 0 };
    var headerRow = -1;        // -1 = không có dòng tiêu đề
    var listeners = {};

    var wrap = document.createElement('div');
    wrap.className = 'pg-wrap';
    var table = document.createElement('table');
    table.className = 'pg-table';
    wrap.appendChild(table);
    container.innerHTML = '';
    container.appendChild(wrap);

    // ------------------------------------------------------------- dữ liệu
    function colCount() {
      var m = minCols;
      for (var i = 0; i < data.length; i++) if (data[i].length > m) m = data[i].length;
      return m;
    }

    function ensure(r, c) {
      while (data.length <= r) data.push([]);
      for (var i = 0; i < data.length; i++) while (data[i].length <= c) data[i].push('');
    }

    function setData(rows, keepSelection) {
      data = [];
      for (var i = 0; i < (rows || []).length; i++) {
        var src = rows[i] || [];
        var line = [];
        for (var j = 0; j < src.length; j++) line.push(src[j] == null ? '' : String(src[j]));
        data.push(line);
      }
      var cols = colCount();
      for (var k = 0; k < data.length; k++) while (data[k].length < cols) data[k].push('');
      if (!keepSelection) sel = { row: 0, col: 0 };
      render();
      emit('change', api);
    }

    function getData() {
      // Trả về bản sao đã cắt cột/dòng trống thừa ở cuối (đúng thứ web app cần gửi đi).
      var rows = [];
      var maxC = 0;
      for (var i = 0; i < data.length; i++) {
        var line = data[i].slice();
        while (line.length && line[line.length - 1] === '') line.pop();
        var has = false;
        for (var j = 0; j < line.length; j++) if (line[j] !== '') { has = true; break; }
        if (has || i <= headerRow) rows.push(line);
        if (line.length > maxC) maxC = line.length;
      }
      while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
      for (var k = 0; k < rows.length; k++) while (rows[k].length < maxC) rows[k].push('');
      return rows;
    }

    function getCell(r, c) { return (data[r] && data[r][c] != null) ? data[r][c] : ''; }

    // ------------------------------------------------------------- vẽ
    function render() {
      var cols = colCount();
      var rowCount = Math.max(data.length, minRows);
      var renderRows = Math.min(rowCount, MAX_RENDER_ROWS);

      var html = [];
      html.push('<colgroup><col class="pg-rowhead">');
      for (var c = 0; c < cols; c++) html.push('<col>');
      html.push('</colgroup>');

      // Dòng tiêu đề cột (A, B, C... hoặc tên cột nếu có dòng tiêu đề)
      html.push('<thead><tr><th class="pg-corner"></th>');
      for (var c2 = 0; c2 < cols; c2++) {
        var name = headerRow >= 0 ? getCell(headerRow, c2) : '';
        html.push('<th data-col="' + c2 + '" title="' + esc(name || ('Cột ' + (c2 + 1))) + '">' +
          '<span class="pg-letter">' + colName(c2) + '</span>' +
          (name ? '<span class="pg-hname">' + esc(trunc(name, 26)) + '</span>' : '') + '</th>');
      }
      html.push('</tr></thead><tbody>');

      for (var r = 0; r < renderRows; r++) {
        var isHeader = (r === headerRow);
        html.push('<tr data-row="' + r + '"' + (isHeader ? ' class="pg-headerrow"' : '') + '>');
        html.push('<th class="pg-rowhead">' + (r + 1) + (isHeader ? ' ▾' : '') + '</th>');
        for (var c3 = 0; c3 < cols; c3++) {
          var v = getCell(r, c3);
          var cls = 'pg-cell';
          if (r === sel.row && c3 === sel.col) cls += ' pg-sel';
          else if (r === sel.row) cls += ' pg-selrow';
          html.push('<td class="' + cls + '" data-row="' + r + '" data-col="' + c3 + '">' +
            '<input type="text" value="' + esc(v) + '" tabindex="-1" autocomplete="off" spellcheck="false"></td>');
        }
        html.push('</tr>');
      }
      if (rowCount > renderRows) {
        html.push('<tr class="pg-more"><td colspan="' + (cols + 1) + '">… còn ' +
          (rowCount - renderRows) + ' dòng nữa (vẫn được gửi đi đầy đủ)</td></tr>');
      }
      html.push('</tbody>');
      table.innerHTML = html.join('');
    }

    function colName(i) {
      var s = '';
      i = i + 1;
      while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
      return s;
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function trunc(s, n) { return s.length > n ? s.substring(0, n - 1) + '…' : s; }

    function inputAt(r, c) {
      var td = table.querySelector('td[data-row="' + r + '"][data-col="' + c + '"]');
      return td ? td.querySelector('input') : null;
    }

    function select(r, c, focusIt) {
      var cols = colCount();
      sel.row = Math.max(0, Math.min(r, Math.max(data.length - 1, 0)));
      sel.col = Math.max(0, Math.min(c, cols - 1));
      render();
      if (focusIt !== false) {
        var inp = inputAt(sel.row, sel.col);
        if (inp) { try { inp.focus({ preventScroll: false }); } catch (e) { try { inp.focus(); } catch (e2) { } } }
      }
      emit('select', api);
    }

    // ------------------------------------------------------------- sự kiện
    table.addEventListener('mousedown', function (e) {
      var td = e.target.closest ? e.target.closest('td[data-row]') : null;
      if (!td) return;
      var r = parseInt(td.getAttribute('data-row'), 10);
      var c = parseInt(td.getAttribute('data-col'), 10);
      select(r, c);
    });

    table.addEventListener('dblclick', function (e) {
      var th = e.target.closest ? e.target.closest('th[data-col]') : null;
      if (!th) return;
      // Double-click vào tiêu đề cột = đánh dấu dòng tiêu đề ở ô đang chọn
      setHeaderRow(sel.row);
    });

    // Gõ phím trong ô
    table.addEventListener('input', function (e) {
      var inp = e.target;
      var td = inp.closest ? inp.closest('td[data-row]') : null;
      if (!td) return;
      var r = parseInt(td.getAttribute('data-row'), 10);
      var c = parseInt(td.getAttribute('data-col'), 10);
      ensure(r, c);
      data[r][c] = inp.value;
      emit('change', api);
    });

    table.addEventListener('keydown', function (e) {
      var inp = e.target;
      var td = inp.closest ? inp.closest('td[data-row]') : null;
      if (!td) return;
      var r = parseInt(td.getAttribute('data-row'), 10);
      var c = parseInt(td.getAttribute('data-col'), 10);
      var cols = colCount();

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          select(r + 1, c);
          break;
        case 'Tab': {
          e.preventDefault();
          var nc = c + (e.shiftKey ? -1 : 1);
          select(r, nc < 0 ? 0 : nc);
          break;
        }
        case 'ArrowUp':
          e.preventDefault(); select(r - 1, c);
          break;
        case 'ArrowDown':
          e.preventDefault(); select(r + 1, c);
          break;
        case 'ArrowLeft':
          if (inp.selectionStart === 0) { e.preventDefault(); select(r, c - 1); }
          break;
        case 'ArrowRight':
          if (inp.selectionStart >= (inp.value || '').length) { e.preventDefault(); select(r, c + 1); }
          break;
        case 'Delete':
        case 'Backspace':
          if (e.shiftKey || e.key === 'Delete') {
            e.preventDefault();
            ensure(r, c);
            data[r][c] = '';
            render();
            var again = inputAt(r, c); if (again) again.focus();
            emit('change', api);
          }
          break;
      }
    });

    // DÁN từ Excel — trái tim của trang này.
    table.addEventListener('paste', function (e) {
      var text = '';
      try {
        if (e.clipboardData) text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
      } catch (err) { text = ''; }
      if (!text) return;                       // để trình duyệt tự xử lý
      e.preventDefault();

      var rows;
      if (global.MAF && global.MAF.parseTable) {
        rows = global.MAF.parseTable(text).rows;   // dùng engine chung: hiểu cả ô có nháy/xuống dòng
      } else {
        rows = text.replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.split('\t'); });
      }
      if (!rows || !rows.length) return;

      var startR = sel.row, startC = sel.col;
      ensure(startR + rows.length - 1, startC + (rows[0] ? rows[0].length - 1 : 0));
      for (var i = 0; i < rows.length; i++) {
        for (var j = 0; j < rows[i].length; j++) {
          data[startR + i][startC + j] = rows[i][j] == null ? '' : String(rows[i][j]).trim();
        }
      }
      render();
      select(startR, startC, false);
      emit('change', api);
      emit('paste', { api: api, rows: rows.length, cols: rows[0] ? rows[0].length : 0 });
    });

    // COPY ngược ra Excel
    table.addEventListener('copy', function (e) {
      try {
        var row = data[sel.row];
        if (!row) return;
        e.preventDefault();
        e.clipboardData.setData('text/plain', row.join('\t'));
      } catch (err) { }
    });

    // ------------------------------------------------------------ public
    function setHeaderRow(i) {
      headerRow = (i == null || i < 0) ? -1 : i;
      render();
      emit('change', api);
    }

    var api = {
      version: VERSION,
      setData: setData,
      getData: getData,
      getCell: getCell,
      get rowCount() { return data.length; },
      get colCount() { return colCount(); },
      get selectedRow() { return sel.row; },
      get selectedCol() { return sel.col; },
      get headerRowIndex() { return headerRow; },
      setHeaderRow: setHeaderRow,
      select: select,
      clear: function () { data = []; headerRow = -1; sel = { row: 0, col: 0 }; render(); emit('change', api); },
      focus: function () { var inp = inputAt(sel.row, sel.col); if (inp) inp.focus(); else { wrap.tabIndex = 0; wrap.focus(); } },
      on: function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
      addRows: function (n) { ensure(data.length + n - 1, colCount() - 1); render(); emit('change', api); }
    };

    function emit(evt, payload) {
      var ls = listeners[evt] || [];
      for (var i = 0; i < ls.length; i++) { try { ls[i](payload); } catch (e) { if (global.console) console.error(e); } }
    }

    render();
    return api;
  }

  global.PasteGrid = { mount: mount, version: VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
