/*!
 * ============================================================================
 *  MAF ENGINE — Medical Auto Fill  (engine điền form DUY NHẤT của dự án)
 * ============================================================================
 *  Dùng chung cho cả 4 bản: WinForms WebView2, MedinetBridge, Electron, Web.
 *  => Sửa 1 nơi, tất cả cùng đúng (trước đây engine bị nhân bản 3 lần nên
 *     Bridge dùng mapping hardcode lệch hoàn toàn với cấu hình trên Web).
 *
 *  Thiết kế chống "lúc điền được lúc không":
 *   1. KHÔNG dùng navigator.clipboard.readText() làm đường chính.
 *      (API này cần HTTPS + permission + user gesture; chạy http://may-chu:5000
 *       là KHÔNG TỒN TẠI -> trước đây luôn rơi vào textarea fallback.)
 *      Đường chính: sự kiện 'paste' -> e.clipboardData.getData('text') (luôn chạy,
 *      không cần quyền) HOẶC host (C#/Electron) đọc clipboard native rồi bơm vào.
 *   2. Đọc toàn bộ getBoundingClientRect() một lượt rồi mới tính -> hết layout
 *      thrashing (trước đây vừa đọc vừa query hàng nghìn node -> đơ UI).
 *   3. Khớp nhãn theo ĐIỂM (exact > bỏ đơn vị > tiền tố > chứa > token) thay vì
 *      so sánh bằng tuyệt đối, và chuẩn hoá bỏ dấu tiếng Việt.
 *   4. Ghi giá trị theo 4 tầng (DevExtreme option -> execCommand insertText ->
 *      native setter -> gán thẳng) và ĐỌC LẠI để xác nhận. Trước đây chỉ gán
 *      input.value nên widget DevExtreme/React ghi đè mất dữ liệu khi blur.
 *   5. Chờ form render (polling + MutationObserver) và retry những trường miss.
 *   6. Quét cả iframe cùng origin.
 *   7. Khớp cột theo TIÊU ĐỀ (header) nếu có, thay vì chỉ số cột cứng -> copy
 *      thiếu/thừa cột vẫn điền đúng.
 *   8. Báo cáo chi tiết từng trường về host (ok / miss / fail) để người dùng
 *      biết chính xác cái gì chưa được, thay vì im lặng.
 * ============================================================================
 */
(function (global) {
  'use strict';

  var VERSION = '2.0.0';

  // Nạp lại engine nhiều lần (mỗi lần navigation) thì chỉ cập nhật, không nhân đôi listener.
  if (global.MAF && global.MAF.__installed) {
    try { global.MAF.configure.__pendingConfig && global.MAF.configure(global.MAF.configure.__pendingConfig); } catch (e) { }
    return;
  }

  // ---------------------------------------------------------------------------
  // 0. TIỆN ÍCH CHUỖI / CHUẨN HOÁ
  // ---------------------------------------------------------------------------

  /** Ký tự rác hay lẫn trong dữ liệu copy từ Excel/Word/web. */
  var INVISIBLE_RE = /[\u00ad\u200b\u200c\u200d\u2060\ufeff\u2028\u2029]/g;

  /** Làm sạch giá trị thô: bỏ ký tự ẩn, NBSP -> space, collapse khoảng trắng. */
  function cleanValue(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    s = s.replace(INVISIBLE_RE, '');
    s = s.replace(/[\u00a0\u2007\u202f]/g, ' ');
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return s;
  }

  /** Bỏ dấu tiếng Việt + lowercase + bỏ ký tự không phải chữ số. */
  function norm(s) {
    s = cleanValue(s).toLowerCase();
    // đ/Đ không nằm trong bảng tổ hợp nên phải thế tay trước khi strip marks.
    s = s.replace(/đ/g, 'd').replace(/Đ/g, 'd');
    if (s.normalize) {
      s = s.normalize('NFD');
    }
    s = s.replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^0-9a-z\s]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * Đơn vị đo hay để trong ngoặc. CHỈ những ngoặc này mới được bỏ khi so khớp,
   * vì có những ngoặc là PHÂN BIỆT tên xét nghiệm: "ASAT(GOT)" khác "ASAT(GPT)".
   * Nếu bỏ hết ngoặc một cách mù quáng thì GOT và GPT khớp về cùng 1 nhãn
   * -> điền sai kết quả xét nghiệm (lỗi cực kỳ nguy hiểm).
   */
  var UNIT_WORDS = {
    'fl': 1, 'pg': 1, 'umol': 1, 'µmol': 1, 'mmol': 1, 'mg': 1, 'g': 1, 'dl': 1, 'l': 1,
    'ml': 1, 'ul': 1, 'µl': 1, 'iu': 1, 'u': 1, 'mmhg': 1, 'cm': 1, 'mm': 1, 'kg': 1,
    'phut': 1, 'giay': 1, 'ngay': 1, 'thang': 1, 'nam': 1, 'tuoi': 1, 'lan': 1, 'k': 1,
    'm': 1, 't': 1, 'leu': 1, 'ery': 1, '10 9': 1, '10 6': 1, '10 3': 1
  };

  function isUnitLike(inner) {
    var t = cleanValue(inner).trim();
    if (!t) return true;
    if (t.indexOf('/') >= 0) return true;              // g/dL, U/L, K/µL, M/µL, 10^9/L
    if (t === '%' || t === '‰') return true;
    if (/^[\d.,]+$/.test(t)) return false;             // "(2)" là số thứ tự, KHÔNG phải đơn vị
    var low = norm(t);
    if (UNIT_WORDS[low]) return true;
    // "mg/dL" đã dính '/'; còn lại như "(GOT)", "(GPT)", "(K)" phải giữ nguyên
    return false;
  }

  /** norm() + bỏ NGOẶC ĐƠN VỊ: "Huyết sắc tố (g/dL)" -> "huyet sac to". */
  function normNoUnits(s) {
    var t = cleanValue(s).toLowerCase();
    t = t.replace(/\(([^)]{0,24})\)/g, function (m, inner) { return isUnitLike(inner) ? ' ' : m; });
    t = t.replace(/\[[^\]]{0,24}\]/g, ' ');
    return norm(t);
  }

  /** norm() + bỏ mọi khoảng trắng: dùng để so khớp "chặt" kiểu makcb/ho ten. */
  function normSquash(s) {
    return norm(s).replace(/ /g, '');
  }

  /**
   * Từ nối tiếng Việt hay bị lược bỏ khi đặt tên biến/id trong form.
   * Nhờ vậy nhãn "Họ và tên" khớp được với input name="hoten",
   * và "Số lượng bạch cầu" khớp "soluongbachcau".
   */
  var STOPWORDS = {
    'va': 1, 'cua': 1, 'cac': 1, 'la': 1, 'o': 1, 'cho': 1, 'theo': 1,
    'hoac': 1, 'thi': 1, 'ma': 1, 'de': 1, 'cung': 1, 've': 1, 'voi': 1,
    'trong': 1, 'tren': 1, 'duoi': 1, 'khi': 1, 'nguoi': 1
  };

  /** norm() + bỏ từ nối + bỏ khoảng trắng (so khớp id/name/aria). */
  function normCompact(s) {
    var t = tokens(s);
    var keep = [];
    for (var i = 0; i < t.length; i++) if (!STOPWORDS[t[i]]) keep.push(t[i]);
    if (!keep.length) keep = t;      // toàn từ nối -> giữ nguyên để khỏi rỗng
    return keep.join('');
  }

  function tokens(s) {
    var n = norm(s);
    return n ? n.split(' ') : [];
  }

  function isBlank(v) {
    return cleanValue(v).trim() === '';
  }

  /** Giống nhau tới mức dùng thay cho nhau được (để verify sau khi ghi). */
  function looseEqual(a, b) {
    var x = norm(a), y = norm(b);
    if (x === y) return true;
    if (!x || !y) return false;
    // 1.500,5 (VN) == 1500.5 ; 1.5 == 1,5
    var xn = x.replace(/\s/g, '').replace(/,/g, '.');
    var yn = y.replace(/\s/g, '').replace(/,/g, '.');
    if (xn === yn) return true;
    var xf = parseFloat(xn), yf = parseFloat(yn);
    if (!isNaN(xf) && !isNaN(yf) && Math.abs(xf - yf) < 1e-9) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // 1. CẤU HÌNH
  // ---------------------------------------------------------------------------

  var DEFAULTS = {
    // Khớp cột Excel theo tiêu đề trước, rơi về excelIndex nếu không có tiêu đề.
    preferHeaderMatch: true,
    // Ngưỡng điểm khớp nhãn tối thiểu (0..1000). Dưới ngưỡng = coi như không tìm thấy.
    minMatchScore: 380,
    // Chờ form render xong tối đa bao nhiêu ms trước khi điền.
    readyTimeoutMs: 8000,
    readyPollMs: 120,
    // Số lần thử lại với những trường chưa điền được.
    maxAttempts: 3,
    retryDelayMs: 250,
    // Nghỉ giữa 2 trường để widget kịp xử lý (0 = nhanh nhất).
    perFieldDelayMs: 0,
    // Nghỉ giữa 2 dòng khi điền hàng loạt.
    perRowDelayMs: 400,
    // Tự điền khi người dùng Ctrl+V ngay trong trang.
    autoFillOnPaste: true,
    // Ctrl+B = chọn "Không" hàng loạt.
    enableSelectNoHotkey: true,
    selectNoKeywords: ['không', 'hầu như không', 'không nhớ rõ', 'không có', 'bình thường', 'không rõ'],
    // Chuẩn hoá số: "1.234,5" -> "1234.5" trước khi điền vào ô number.
    normalizeNumbers: true,
    // Tô đỏ những nhãn không tìm thấy ô nhập (hỗ trợ sửa mapping).
    highlightMissing: true,
    highlightMs: 6000,
    // Ghi log ra console.
    debug: false
  };

  var CONFIG = {
    options: clone(DEFAULTS),
    forms: [],
    // Cấu hình tạm do host đẩy xuống cho đúng 1 lần điền (không cần nằm trong forms).
    fields: null
  };

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function mergeOptions(src) {
    if (!src) return;
    for (var k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      if (src[k] === undefined || src[k] === null) continue;
      CONFIG.options[k] = src[k];
    }
    // Cho phép truyền thêm khóa lạ (không phá vỡ).
    for (var k2 in src) {
      if (Object.prototype.hasOwnProperty.call(src, k2) && DEFAULTS[k2] === undefined) {
        CONFIG.options[k2] = src[k2];
      }
    }
  }

  function log() {
    if (!CONFIG.options.debug) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[MAF]');
    if (global.console && console.log) console.log.apply(console, a);
  }

  /**
   * Nạp cấu hình. Chấp nhận nhiều hình dạng:
   *  { forms:[...], options:{...}, selectNoKeywords:[...] }
   *  { pasteMode:'tab', forms:[...] }            (định dạng cũ của Web/Bridge)
   *  [ {name,urlContains,fields:[...]} ]         (mảng form trần)
   */
  function configure(cfg) {
    configure.__pendingConfig = cfg;
    if (!cfg) return state();
    if (Array.isArray(cfg)) {
      CONFIG.forms = normalizeForms(cfg);
    } else {
      if (cfg.options) mergeOptions(cfg.options);
      if (cfg.selectNoKeywords) CONFIG.options.selectNoKeywords = cfg.selectNoKeywords;
      if (cfg.forms) CONFIG.forms = normalizeForms(cfg.forms);
      if (cfg.fields) CONFIG.fields = normalizeFields(cfg.fields);
      // Tương thích ngược định dạng cũ.
      if (cfg.pasteMode) CONFIG.options.pasteDelimiter = cfg.pasteMode === 'comma' ? ',' : '\t';
    }
    invalidateIndex();
    log('Đã nạp cấu hình:', CONFIG.forms.length, 'form');
    return state();
  }

  function normalizeForms(forms) {
    var out = [];
    for (var i = 0; i < (forms || []).length; i++) {
      var f = forms[i] || {};
      out.push({
        id: f.id !== undefined && f.id !== null ? String(f.id) : ('form-' + i),
        name: f.name || ('Form ' + (i + 1)),
        urlContains: f.urlContains || f.url || '',
        urlRegex: f.urlRegex || '',
        fields: normalizeFields(f.fields)
      });
    }
    return out;
  }

  /**
   * Chuẩn hoá 1 field mapping. Một field có thể có:
   *  labels[]        : các nhãn khả dĩ trên trang
   *  headerNames[]   : tên cột trong Excel để khớp theo tiêu đề (rất nên có)
   *  excelIndex      : vị trí cột dự phòng (0-based)
   *  selector        : CSS selector chỉ định thẳng ô nhập (chính xác nhất)
   *  controlType     : text | textarea | number | date | select | checkbox | radio | auto
   *  required        : true để cảnh báo khi bỏ trống
   *  transform       : 'trim' | 'upper' | 'lower' | 'date' | 'number' | 'none'
   */
  function normalizeFields(fields) {
    var out = [];
    for (var i = 0; i < (fields || []).length; i++) {
      var f = fields[i] || {};
      var labels = toArray(f.labels || f.label || f.name);
      var headers = toArray(f.headerNames || f.headers || f.header || f.excelHeader);
      // Nếu không khai header riêng thì dùng chính nhãn để khớp tiêu đề Excel.
      if (headers.length === 0) headers = labels.slice();
      out.push({
        key: f.key || ('f' + i),
        labels: labels,
        headerNames: headers,
        excelIndex: typeof f.excelIndex === 'number' ? f.excelIndex
          : (typeof f.column === 'number' ? f.column : (typeof f.excelIndex === 'string' && f.excelIndex !== '' ? parseInt(f.excelIndex, 10) : i)),
        selector: f.selector || f.css || '',
        controlType: (f.controlType || f.type || 'auto').toLowerCase(),
        required: !!f.required,
        transform: (f.transform || '').toLowerCase(),
        dateFormat: f.dateFormat || '',
        skipIfBlank: f.skipIfBlank !== false
      });
    }
    return out;
  }

  function toArray(v) {
    if (v === null || v === undefined) return [];
    if (Array.isArray(v)) {
      var a = [];
      for (var i = 0; i < v.length; i++) if (!isBlank(v[i])) a.push(String(v[i]));
      return a;
    }
    // Chuỗi có thể chứa nhiều nhãn cách nhau bằng ; hoặc |
    var parts = String(v).split(/[;|\n]/);
    var out = [];
    for (var j = 0; j < parts.length; j++) if (!isBlank(parts[j])) out.push(parts[j].trim());
    return out;
  }

  // ---------------------------------------------------------------------------
  // 2. NHẬN DIỆN FORM THEO URL
  // ---------------------------------------------------------------------------

  function activeForm(url) {
    var u = url || global.location && global.location.href || '';
    var best = null, bestLen = -1;
    for (var i = 0; i < CONFIG.forms.length; i++) {
      var f = CONFIG.forms[i];
      if (f.urlRegex) {
        try { if (new RegExp(f.urlRegex, 'i').test(u) && f.urlRegex.length > bestLen) { best = f; bestLen = f.urlRegex.length; } } catch (e) { }
      }
      if (f.urlContains && u.indexOf(f.urlContains) >= 0 && f.urlContains.length > bestLen) {
        best = f; bestLen = f.urlContains.length;
      }
    }
    return best;
  }

  function getForm(idOrName) {
    if (!idOrName) return activeForm();
    var k = String(idOrName).toLowerCase();
    for (var i = 0; i < CONFIG.forms.length; i++) {
      var f = CONFIG.forms[i];
      if (String(f.id).toLowerCase() === k || String(f.name).toLowerCase() === k) return f;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 3. PHÂN TÍCH DỮ LIỆU DÁN (TSV/CSV từ Excel)
  // ---------------------------------------------------------------------------

  /**
   * Phân tích khối text copy từ Excel/Google Sheets/CSV.
   * Trả về { rows, rowCount, colCount, delimiter, hasQuotes, ragged }.
   * - Hỗ trợ field bọc nháy "..." chứa tab/xuống dòng bên trong (Excel làm vậy
   *   khi ô có nội dung nhiều dòng) -> bản cũ split('\t') thô nên vỡ cột.
   * - Tự phát hiện delimiter: tab / ; / ,
   */
  function parseTable(text, opts) {
    opts = opts || {};
    var src = cleanValue(text);
    var rows = [];
    var delimiter = opts.delimiter || detectDelimiter(src);
    var hasQuotes = src.indexOf('"') >= 0;

    if (delimiter === '\t' || !hasQuotes) {
      // Đường nhanh: không có nháy -> tách dòng/cột trực tiếp.
      var lines = src.split('\n');
      for (var i = 0; i < lines.length; i++) {
        rows.push(lines[i].split(delimiter));
      }
    } else {
      // Đường đầy đủ: parse kiểu RFC4180 (có field bọc nháy, nháy thoát bằng "").
      rows = parseQuoted(src, delimiter);
    }

    // Chuẩn hoá từng ô + cắt dòng/cột rỗng thừa ở cuối.
    var maxCols = 0;
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) rows[r][c] = cleanValue(rows[r][c]).trim();
      if (rows[r].length > maxCols) maxCols = rows[r].length;
    }
    while (rows.length && isEmptyRow(rows[rows.length - 1])) rows.pop();
    for (var r2 = 0; r2 < rows.length; r2++) {
      while (rows[r2].length < maxCols) rows[r2].push('');
    }

    return {
      rows: rows,
      rowCount: rows.length,
      colCount: maxCols,
      delimiter: delimiter,
      hasQuotes: hasQuotes,
      ragged: false
    };
  }

  function isEmptyRow(row) {
    for (var i = 0; i < row.length; i++) if (!isBlank(row[i])) return false;
    return true;
  }

  function detectDelimiter(s) {
    var firstLine = s.split('\n')[0] || '';
    var tabs = countChar(firstLine, '\t');
    if (tabs > 0) return '\t';
    var semi = countChar(firstLine, ';');
    var comma = countChar(firstLine, ',');
    // Excel tiếng Việt hay xuất CSV bằng ';'
    if (semi >= comma && semi > 0) return ';';
    if (comma > 0) return ',';
    return '\t';
  }

  function countChar(s, ch) {
    var n = 0;
    for (var i = 0; i < s.length; i++) if (s.charAt(i) === ch) n++;
    return n;
  }

  function parseQuoted(src, delimiter) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"' && field === '') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /**
   * Đoán xem dòng đầu có phải tiêu đề không, bằng cách so với labels/headerNames
   * đã cấu hình. Trả về chỉ số dòng tiêu đề hoặc -1.
   */
  function detectHeaderRow(rows, fields) {
    if (!rows || !rows.length) return -1;
    var keys = {};
    var keyCount = 0;
    for (var i = 0; i < fields.length; i++) {
      var names = fields[i].headerNames.concat(fields[i].labels);
      for (var j = 0; j < names.length; j++) {
        var n = normSquash(names[j]);
        var nu = normSquash(normNoUnits(names[j]));
        if (n && !keys[n]) { keys[n] = 1; keyCount++; }
        if (nu && !keys[nu]) { keys[nu] = 1; keyCount++; }
      }
    }
    if (!keyCount) return -1;

    // Chỉ xét 2 dòng đầu: dòng 0 hoặc dòng 1 (Excel hay có 1 dòng tiêu đề bảng phía trên).
    for (var r = 0; r < Math.min(2, rows.length); r++) {
      var hit = 0, considered = 0;
      for (var c = 0; c < rows[r].length; c++) {
        var cell = cleanValue(rows[r][c]).trim();
        if (!cell) continue;
        // Ô chứa số thuần thì chắc chắn là dữ liệu, không phải tiêu đề.
        if (/^-?[\d.,\s%]+$/.test(cell)) return -1;
        considered++;
        var cs = normSquash(cell), cu = normSquash(normNoUnits(cell));
        if (keys[cs] || keys[cu]) hit++;
      }
      if (considered > 0 && hit / considered >= 0.5 && hit >= 2) return r;
    }
    return -1;
  }

  /**
   * Ghép field -> chỉ số cột thực tế.
   * Ưu tiên: selector/khớp tiêu đề (headerNames/labels) > excelIndex.
   * Trả về [{field, col, via}] với via = 'header' | 'index' | 'none'.
   */
  function resolveColumns(fields, headerRow) {
    var out = [];
    var headerNorm = null;
    if (headerRow && headerRow.length) {
      headerNorm = [];
      for (var c = 0; c < headerRow.length; c++) {
        headerNorm.push({
          raw: headerRow[c],
          squash: normSquash(headerRow[c]),
          noUnits: normSquash(normNoUnits(headerRow[c]))
        });
      }
    }

    var used = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var col = -1, via = 'none';

      if (headerNorm && CONFIG.options.preferHeaderMatch !== false) {
        col = matchHeader(f, headerNorm, used);
        if (col >= 0) via = 'header';
      }
      if (col < 0 && typeof f.excelIndex === 'number' && f.excelIndex >= 0) {
        // Nếu có tiêu đề mà tiêu đề KHÔNG khớp, vẫn tin excelIndex (hành vi cũ).
        col = f.excelIndex;
        via = 'index';
      }
      if (col >= 0) used[col] = f.key;
      out.push({ field: f, col: col, via: via });
    }
    return out;
  }

  function matchHeader(field, headerNorm, used) {
    var names = field.headerNames.concat(field.labels);
    var best = -1, bestScore = 0;
    for (var n = 0; n < names.length; n++) {
      var wantS = normSquash(names[n]);
      var wantU = normSquash(normNoUnits(names[n]));
      if (!wantS && !wantU) continue;
      for (var c = 0; c < headerNorm.length; c++) {
        if (used[c] && used[c] !== field.key) continue;
        var h = headerNorm[c];
        var score = 0;
        if (h.squash && wantS && h.squash === wantS) score = 1000;
        else if (h.noUnits && wantU && h.noUnits === wantU) score = 950;
        else if (h.squash && wantS && (h.squash.indexOf(wantS) === 0 || wantS.indexOf(h.squash) === 0)) score = 700;
        else if (h.noUnits && wantU && (h.noUnits.indexOf(wantU) === 0 || wantU.indexOf(h.noUnits) === 0)) score = 650;
        else if (h.squash && wantS && (h.squash.indexOf(wantS) > 0 || wantS.indexOf(h.squash) > 0)) score = 520;
        if (score > bestScore) { bestScore = score; best = c; }
      }
    }
    return bestScore >= 520 ? best : -1;
  }

  // ---------------------------------------------------------------------------
  // 4. CHUẨN HOÁ GIÁ TRỊ TRƯỚC KHI ĐIỀN
  // ---------------------------------------------------------------------------

  var VN_DATE_RE = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*$/;
  var ISO_DATE_RE = /^\s*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\s*$/;

  /** Excel copy ô ngày có thể ra số serial (45123) thay vì chuỗi ngày. */
  function excelSerialToDate(n) {
    if (isNaN(n) || n < 59 || n > 2958465) return null;
    var ms = Math.round((n - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return pad2(d.getUTCFullYear()) + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Đưa mọi định dạng ngày thường gặp về yyyy-mm-dd (chuẩn của <input type=date>). */
  function toIsoDate(v) {
    var s = cleanValue(v).trim();
    if (!s) return '';
    var m = ISO_DATE_RE.exec(s);
    if (m) return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
    m = VN_DATE_RE.exec(s);
    if (m) {
      var y = parseInt(m[3], 10);
      if (y < 100) y += y < 30 ? 2000 : 1900;   // 25 -> 2025, 98 -> 1998
      return y + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[1], 10));
    }
    // Chuỗi có tháng dạng chữ: "12/03/2024" đã xử lý; thử Date parse cuối cùng.
    var num = parseFloat(s.replace(',', '.'));
    if (!isNaN(num) && /^[\d.,]+$/.test(s)) {
      var iso = excelSerialToDate(num);
      if (iso) return iso;
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    return s; // không hiểu -> giữ nguyên để người dùng tự thấy sai
  }

  /** "1.234,56" / "1,234.56" / "12 345" -> "1234.56" */
  function toNumberString(v) {
    var s = cleanValue(v).trim();
    if (!s) return '';
    s = s.replace(/[^\d,.\-+]/g, '');
    if (!s) return '';
    var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,5
      else s = s.replace(/,/g, '');                                          // 1,234.5
    } else if (lastComma >= 0) {
      // "1,5" = số thập phân VN; "1,234" cũng có thể là 1234 -> coi dấu phẩy là thập phân
      // khi phần sau dấu phẩy không phải đúng 3 chữ số.
      var parts = s.split(',');
      if (parts.length === 2 && parts[1].length === 3) s = parts[0] + parts[1];
      else s = parts.join('.');
    }
    return s;
  }

  /**
   * Chuẩn hoá giá trị theo field + loại ô thực tế trên trang.
   * el có thể null (dry-run) -> chỉ áp theo field.
   */
  function transformValue(field, raw, el) {
    var v = cleanValue(raw);
    var type = (field && field.controlType) || 'auto';
    var elType = el ? String(el.getAttribute && el.getAttribute('type') || el.type || '').toLowerCase() : '';

    // Ô HTML type=date/datetime-local BẮT BUỘC nhận yyyy-mm-dd, không có ngoại lệ.
    if (elType === 'date' || elType === 'datetime-local') return toIsoDate(v);

    if (type === 'date' || type === 'datetime' || (field && field.transform === 'date')) {
      var trimmed = v.replace(/\s+/g, ' ').trim();
      // Excel copy ô ngày có thể ra SỐ SERIAL (45123) — thứ này không bao giờ là
      // ngày hợp lệ với người đọc, nên phải đổi.
      if (/^\d{4,6}(\.\d+)?$/.test(trimmed)) return toIsoDate(trimmed);
      // Còn lại: GIỮ NGUYÊN định dạng người dùng copy (dd/mm/yyyy). Nhiều form
      // medinet là ô text chờ đúng định dạng Việt Nam; ép ISO sẽ làm sai dữ liệu.
      if (field && field.dateFormat === 'iso') return toIsoDate(trimmed);
      return trimmed;
    }

    if (type === 'number' || elType === 'number' || (field && field.transform === 'number')) {
      return toNumberString(v);
    }
    // Ô number trong HTML luôn cần số chuẩn, kể cả field khai 'auto'.
    if (elType === 'number' && CONFIG.options.normalizeNumbers !== false) {
      var nn = toNumberString(v);
      if (nn !== '' && !isNaN(parseFloat(nn))) return nn;
    }

    var t = field ? field.transform : '';
    if (t === 'upper') v = v.toUpperCase();
    else if (t === 'lower') v = v.toLowerCase();

    // Mặc định: trim + collapse khoảng trắng (dữ liệu y tế không cần khoảng trắng thừa).
    v = v.replace(/\s+/g, ' ').trim();
    return v;
  }

  // ---------------------------------------------------------------------------
  // 5. QUÉT DOM (index nhãn + ô nhập), có cache
  // ---------------------------------------------------------------------------

  // QUÉT NHÃN: gộp chung 1 bộ selector (bản cũ chỉ quét label/span/td/th ở nhánh
  // "nhanh" nên form dạng <div>Nhãn</div><input> hoặc <td>Nhãn</td><td><input>
  // KHÔNG BAO GIỜ tìm thấy ô nhập -> "điền mà không ăn").
  // An toàn vì ta chỉ nhận element có TEXT RIÊNG (không tính text của con), nên
  // container lớn không bị khớp nhầm, và chi phí vẫn thấp.
  var LABEL_SELECTOR =
    'label, legend, th, td, dt, dd, caption, b, strong, p, span, div, li, a, small, em, i, font, ' +
    'h1, h2, h3, h4, h5, h6, .dx-field-label, .dx-texteditor-label, ' +
    '[class*="label"], [class*="Label"], [class*="caption"], [class*="title"], [class*="Title"]';
  /** Trần số nhãn thu thập, tránh trang có DOM khổng lồ làm chậm lần điền đầu. */
  var MAX_LABELS = 12000;
  /** Ô chứa toàn số/dấu câu là DỮ LIỆU trong bảng, không phải nhãn -> loại để gọn index. */
  var NUMERIC_ONLY_RE = /^[\d\s.,:%\/+\-()*]*$/;
  var INPUT_SELECTOR =
    'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [contenteditable=""]';

  var _index = null;      // { docs, labels, inputs, stamp }
  var _indexStamp = 0;    // tăng mỗi lần DOM đổi (MutationObserver)
  var _builtStamp = -1;
  var _observer = null;

  function invalidateIndex() { _indexStamp++; }

  function observeDom() {
    if (_observer || !global.MutationObserver) return;
    try {
      _observer = new MutationObserver(function (muts) {
        // Chỉ quan tâm thay đổi cấu trúc / thuộc tính ảnh hưởng tới label & input.
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'childList' || m.type === 'characterData') { _indexStamp++; return; }
          if (m.type === 'attributes' && m.target && m.target.nodeType === 1) { _indexStamp++; return; }
        }
      });
      _observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled', 'value', 'for', 'id'] });
    } catch (e) { _observer = null; }
  }

  /** Danh sách document: trang chính + mọi iframe cùng origin (đệ quy). */
  function collectDocuments() {
    var docs = [document];
    var seen = 0;
    while (seen < docs.length) {
      var doc = docs[seen++];
      var frames;
      try { frames = doc.querySelectorAll('iframe, frame'); } catch (e) { frames = []; }
      for (var i = 0; i < frames.length; i++) {
        var d = null;
        try { d = frames[i].contentDocument || (frames[i].contentWindow && frames[i].contentWindow.document); } catch (e) { d = null; }
        if (d && docs.indexOf(d) < 0) docs.push(d);
      }
    }
    return docs;
  }

  function isVisible(el, rect) {
    if (!el) return false;
    if (el.disabled) return false;
    var st = null;
    try { st = global.getComputedStyle(el); } catch (e) { st = null; }
    if (st) {
      if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
    }
    if (el.type === 'hidden') return false;
    if (!rect) return true;
    // Ô có kích thước 0 = đang ẩn (DevExtreme hay giấu input thật) -> vẫn chấp nhận
    // nếu nó thuộc widget nhìn thấy được; xử lý ở chỗ chọn candidate.
    return true;
  }

  /** Text "của riêng" element (không gồm text của con) — tránh khớp phải container lớn. */
  function ownText(el) {
    var s = '';
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3) s += nodes[i].nodeValue;
    }
    s = cleanValue(s).replace(/\s+/g, ' ').trim();
    return s;
  }

  function labelText(el) {
    var own = ownText(el);
    if (own) return own;
    // Element không có text riêng: lấy textContent nếu nó là "lá" (không chứa element con có text)
    var kids = el.children;
    if (!kids || kids.length === 0) {
      var t = cleanValue(el.textContent).replace(/\s+/g, ' ').trim();
      return t.length <= 160 ? t : '';
    }
    if (kids.length === 1) return labelText(kids[0]);
    return '';
  }

  function rectsOf(list) {
    // ĐỌC hàng loạt trước, TÍNH sau => không gây layout thrashing.
    for (var i = 0; i < list.length; i++) {
      var r = null;
      try { r = list[i].el.getBoundingClientRect(); } catch (e) { r = null; }
      list[i].rect = r ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    }
  }

  function buildIndex(wide) {
    observeDom();
    // Bộ selector đã gộp chung (không còn nhánh "rộng"/"hẹp") nên `wide` chỉ là
    // tham số tương thích ngược; cache không phụ thuộc vào nó.
    if (_index && _builtStamp === _indexStamp) return _index;

    var docs = collectDocuments();
    var labels = [];
    var inputs = [];

    for (var d = 0; d < docs.length; d++) {
      var doc = docs[d];
      var els;
      try { els = doc.querySelectorAll(LABEL_SELECTOR); } catch (e) { els = []; }
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var t = labelText(el);
        if (!t || t.length > 160) continue;
        if (NUMERIC_ONLY_RE.test(t)) continue;                 // ô dữ liệu, không phải nhãn
        // Bỏ qua nhãn nằm bên trong chính ô nhập (vd text trong contenteditable)
        if (el.closest && el.closest('input,textarea,select')) continue;
        labels.push({
          el: el, doc: doc, text: t,
          n: norm(t),
          nu: normSquash(normNoUnits(t)),
          ns: normSquash(t),
          nc: normCompact(t)
        });
        if (labels.length >= MAX_LABELS) break;
      }

      var ins;
      try { ins = doc.querySelectorAll(INPUT_SELECTOR); } catch (e) { ins = []; }
      for (var j = 0; j < ins.length; j++) {
        var inp = ins[j];
        if (!isVisible(inp, null)) continue;
        inputs.push({
          el: inp,
          doc: doc,
          tag: String(inp.tagName || '').toUpperCase(),
          type: String(inp.getAttribute && inp.getAttribute('type') || inp.type || '').toLowerCase(),
          id: inp.id || '',
          name: (inp.getAttribute && inp.getAttribute('name')) || '',
          placeholder: (inp.getAttribute && inp.getAttribute('placeholder')) || '',
          ariaLabel: (inp.getAttribute && inp.getAttribute('aria-label')) || '',
          readOnly: !!inp.readOnly,
          rect: null,
          nId: normSquash(inp.id),
          nName: normSquash(inp.name),
          nPh: normSquash(inp.placeholder),
          nAria: normSquash(inp.ariaLabel),
          // Bản "gọn" (bỏ từ nối) để khớp id/name viết liền kiểu hoten, ngaysinh
          cId: normCompact(inp.id),
          cName: normCompact(inp.name),
          cPh: normCompact(inp.placeholder),
          cAria: normCompact(inp.ariaLabel),
          // Nhãn hiển thị nằm ngay cạnh ô (DevExtreme hay để aria-label/title)
          cTitle: normCompact((inp.getAttribute && inp.getAttribute('title')) || '')
        });
      }
    }

    rectsOf(labels);
    rectsOf(inputs);

    // Loại nhãn có rect rỗng & không nhìn thấy (display:none) để khỏi khớp bậy.
    var labels2 = [];
    for (var k = 0; k < labels.length; k++) {
      var L = labels[k];
      if (!isVisible(L.el, L.rect)) continue;
      labels2.push(L);
    }

    // Tra cứu element -> entry trong O(1). Nhờ đó bước "tìm ô trong nhóm cha"
    // không phải duyệt toàn bộ ô nhập bằng contains() (O(n^2) với form dài:
    // 400 trường x 400 ô = 160.000 lần contains -> đơ UI vài giây).
    var byEl = new Map();
    for (var m = 0; m < inputs.length; m++) byEl.set(inputs[m].el, inputs[m]);

    _index = { docs: docs, labels: labels2, inputs: inputs, byEl: byEl, stamp: _indexStamp };
    buildLookupMaps(_index);
    _builtStamp = _indexStamp;
    log('Index DOM:', labels2.length, 'nhãn,', inputs.length, 'ô nhập,', docs.length, 'frame');
    return _index;
  }

  function pushMap(map, key, val) {
    if (!key) return;
    var a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    a.push(val);
  }

  /**
   * Dựng sẵn bảng tra "chuỗi chuẩn hoá -> phần tử".
   * KHÔNG có bước này thì mỗi trường phải duyệt toàn bộ nhãn của trang
   * (form 400 trường = 400 x ~1.200 nhãn = 480.000 lần so chuỗi -> đơ vài giây,
   *  và mỗi lần bấm Ctrl+V lại đơ lại). Với bảng tra, khớp đúng nhãn là O(1).
   */
  function buildLookupMaps(idx) {
    var lm = { n: new Map(), nu: new Map(), ns: new Map(), nc: new Map() };
    for (var i = 0; i < idx.labels.length; i++) {
      var L = idx.labels[i];
      pushMap(lm.n, L.n, L);
      pushMap(lm.nu, L.nu, L);
      pushMap(lm.ns, L.ns, L);
      pushMap(lm.nc, L.nc, L);
    }
    var im = {
      nId: new Map(), cId: new Map(), nName: new Map(), cName: new Map(),
      nAria: new Map(), cAria: new Map(), cTitle: new Map(), nPh: new Map(), cPh: new Map()
    };
    for (var j = 0; j < idx.inputs.length; j++) {
      var I = idx.inputs[j];
      pushMap(im.nId, I.nId, I);
      pushMap(im.cId, I.cId, I);
      pushMap(im.nName, I.nName, I);
      pushMap(im.cName, I.cName, I);
      pushMap(im.nAria, I.nAria, I);
      pushMap(im.cAria, I.cAria, I);
      pushMap(im.cTitle, I.cTitle, I);
      pushMap(im.nPh, I.nPh, I);
      pushMap(im.cPh, I.cPh, I);
    }
    idx.labelMaps = lm;
    idx.attrMaps = im;
  }

  // ---------------------------------------------------------------------------
  // 6. TÌM Ô NHẬP CHO 1 FIELD
  // ---------------------------------------------------------------------------

  /**
   * Trả về { el, via, score, label } hoặc null.
   * Thứ tự ưu tiên:
   *   selector (CSS chỉ định thẳng) > label[for] > id/name/aria/placeholder khớp nhãn
   *   > nhãn + ô duy nhất trong cùng nhóm cha > hình học (bên phải / bên dưới)
   *   > quét rộng (div/td/li) rồi lặp lại.
   */
  function findTarget(field, idx, opts) {
    opts = opts || {};
    idx = idx || buildIndex(false);
    var keys = (field.labels && field.labels.length ? field.labels : field.headerNames) || [];

    // --- 1. Selector chỉ định thẳng (chính xác tuyệt đối, nên dùng khi biết) ---
    if (field.selector) {
      for (var d = 0; d < idx.docs.length; d++) {
        try {
          var el = idx.docs[d].querySelector(field.selector);
          if (el) return { el: el, via: 'selector', score: 10000, label: field.selector };
        } catch (e) { /* selector sai cú pháp */ }
      }
    }

    var keyNorms = [];
    for (var i = 0; i < keys.length; i++) {
      var n = norm(keys[i]), ns = normSquash(keys[i]), nu = normSquash(normNoUnits(keys[i]));
      var nc = normCompact(keys[i]), ncu = normCompact(normNoUnits(keys[i]));
      if (n || ns || nu || nc) keyNorms.push({ raw: keys[i], n: n, ns: ns, nu: nu, nc: nc, ncu: ncu });
    }
    if (!keyNorms.length) return null;

    // --- 2. Khớp nhanh theo id / name / aria-label / title / placeholder ---
    // (form medinet rất hay đặt name="hoten", id="txtNgaySinh"; tra bảng O(1)
    //  thay vì duyệt mọi ô nhập cho từng trường)
    var attrHit = findAttrCandidate(keyNorms, idx);
    if (attrHit && attrHit.score >= 900) {
      return {
        el: attrHit.entry.el, via: 'attr', score: attrHit.score,
        label: attrHit.entry.id || attrHit.entry.name || attrHit.entry.placeholder || attrHit.key
      };
    }

    // --- 3. Nhãn hiển thị ---
    var minScore = opts.minScore || CONFIG.options.minMatchScore;

    // 3.1 Khớp ĐÚNG bằng bảng tra (rẻ). Nếu ra nhãn mà không suy được ô nhập
    //     thì mới chịu khó quét mờ ở 3.2.
    var res = tryCandidates(findLabelCandidates(keyNorms, idx), idx, minScore);
    if (res) return res;

    // 3.2 Khớp mờ (chứa / theo tập token) — đường đắt, chỉ chạy khi cần.
    return tryCandidates(fuzzyLabelCandidates(keyNorms, idx, minScore), idx, minScore);
  }

  /**
   * Với mỗi nhãn ứng viên (điểm cao trước), thử suy ra ô nhập theo 5 cách.
   * Trả về {el, via, score, label} hoặc null.
   */
  function tryCandidates(cands, idx, minScore) {
    if (!cands || !cands.length) return null;
    cands.sort(function (a, b) { return b.score - a.score; });
    var limit = Math.min(cands.length, 6);
    for (var ci = 0; ci < limit; ci++) {
      var L = cands[ci].L;
      var s = cands[ci].score;
      if (s < minScore) break;

      // a) <label for="..."> — chính xác tuyệt đối
      var forId = L.el.getAttribute && L.el.getAttribute('for');
      if (forId) {
        var byFor = null;
        try { byFor = L.doc.getElementById(forId); } catch (e) { byFor = null; }
        if (byFor) return { el: byFor, via: 'label-for', score: s + 50, label: L.text };
      }

      // b) Ô nhập DUY NHẤT trong nhóm cha của nhãn -> gần như chắc chắn đúng
      var byGroup = findInAncestor(L.el, idx);
      if (byGroup) return { el: byGroup.el, via: 'group', score: s + 20, label: L.text };

      // c) Ô nhập là ANH EM kế tiếp: <div>Nhãn</div><input>
      //    (rất phổ biến; bản cũ bỏ sót hoàn toàn trường hợp này)
      var bySib = findSiblingInput(L.el, idx);
      if (bySib) return { el: bySib.el, via: 'sibling', score: s + 15, label: L.text };

      // d) Hình học: ô bên phải cùng hàng, hoặc ngay bên dưới nhãn
      var byGeo = findNearest(L, idx);
      if (byGeo) return { el: byGeo.el, via: 'geo', score: s + byGeo.bonus, label: L.text };

      // e) aria-labelledby trỏ ngược về nhãn
      var byAria = findByAriaLabelledby(L.el, idx);
      if (byAria) return { el: byAria, via: 'aria-labelledby', score: s + 10, label: L.text };
    }
    return null;
  }

  /** Khớp ĐÚNG nhãn qua bảng tra: O(1) mỗi khóa. */
  function findLabelCandidates(keyNorms, idx) {
    var out = [];
    var seen = new Set();
    var tiers = [
      { map: idx.labelMaps.n, pick: function (k) { return k.n; }, score: 1000 },
      { map: idx.labelMaps.nu, pick: function (k) { return k.nu; }, score: 960 },
      { map: idx.labelMaps.ns, pick: function (k) { return k.ns; }, score: 950 },
      { map: idx.labelMaps.nc, pick: function (k) { return k.nc; }, score: 940 },
      { map: idx.labelMaps.nc, pick: function (k) { return k.ncu; }, score: 930 }
    ];
    for (var t = 0; t < tiers.length; t++) {
      for (var i = 0; i < keyNorms.length; i++) {
        var key = tiers[t].pick(keyNorms[i]);
        if (!key) continue;
        var arr = tiers[t].map.get(key);
        if (!arr) continue;
        for (var j = 0; j < arr.length; j++) {
          if (seen.has(arr[j])) continue;
          seen.add(arr[j]);
          out.push({ L: arr[j], score: tiers[t].score });
        }
      }
      if (out.length) return out;   // đã khớp đúng -> không cần xuống cấp thấp hơn
    }
    return out;
  }

  /** Khớp mờ: nhãn chứa khóa, hoặc đủ token. Chỉ dùng khi khớp đúng thất bại. */
  function fuzzyLabelCandidates(keyNorms, idx, minScore) {
    var out = [];
    for (var b = 0; b < idx.labels.length; b++) {
      var sc = scoreLabel(idx.labels[b], keyNorms);
      if (sc >= minScore) out.push({ L: idx.labels[b], score: sc });
      if (out.length >= 24) break;
    }
    return out;
  }

  /** Tra bảng thuộc tính ô nhập; trả {entry, score, key} hoặc null. */
  function findAttrCandidate(keyNorms, idx) {
    var tiers = [
      { map: idx.attrMaps.nId, pick: function (k) { return k.ns; }, w: 1 },
      { map: idx.attrMaps.cId, pick: function (k) { return k.nc; }, w: 0.99 },
      { map: idx.attrMaps.nName, pick: function (k) { return k.ns; }, w: 1 },
      { map: idx.attrMaps.cName, pick: function (k) { return k.nc; }, w: 0.99 },
      { map: idx.attrMaps.nAria, pick: function (k) { return k.ns; }, w: 0.98 },
      { map: idx.attrMaps.cAria, pick: function (k) { return k.nc; }, w: 0.97 },
      { map: idx.attrMaps.cTitle, pick: function (k) { return k.nc; }, w: 0.95 },
      { map: idx.attrMaps.nPh, pick: function (k) { return k.ns; }, w: 0.85 },
      { map: idx.attrMaps.cPh, pick: function (k) { return k.nc; }, w: 0.85 }
    ];
    var best = null;
    for (var t = 0; t < tiers.length; t++) {
      for (var i = 0; i < keyNorms.length; i++) {
        var key = tiers[t].pick(keyNorms[i]);
        if (!key) continue;
        var arr = tiers[t].map.get(key);
        if (!arr || !arr.length) continue;
        var score = Math.round(1000 * tiers[t].w);
        if (!best || score > best.score) best = { entry: arr[0], score: score, key: key };
      }
    }
    return best;
  }

  function scoreKeyVsKey(k, target) {
    if (!target || !k) return 0;
    if (k.ns && target === k.ns) return 1000;
    if (k.nc && target === k.nc) return 990;
    if (k.nu && target === k.nu) return 960;
    if (k.ncu && target === k.ncu) return 950;
    if (k.ns && target.indexOf(k.ns) === 0) return 820;
    if (k.nc && target.indexOf(k.nc) === 0 && k.nc.length >= 5) return 810;
    if (k.nu && target.indexOf(k.nu) === 0) return 780;
    if (k.nc && target.length >= 5 && k.nc.indexOf(target) === 0) return 760;
    if (k.ns && target.indexOf(k.ns) > 0) return 620;
    return 0;
  }

  /**
   * Tìm ô nhập nằm NGAY SAU nhãn trong cùng cấp (anh em), hoặc 1-2 cấp cha.
   * Bao phủ <div>Nhãn</div><input>, <td>Nhãn</td><td><input></td>,
   * <span>Nhãn</span><div class="dx-texteditor"><input></div>.
   */
  function findSiblingInput(labelEl, idx) {
    if (!labelEl || !labelEl.ownerDocument) return null;
    var doc = labelEl.ownerDocument;
    var node = labelEl;
    for (var up = 0; up < 3 && node; up++) {
      var parent = node.parentElement;
      if (!parent) break;
      var sib = node.nextElementSibling;
      var steps = 0;
      while (sib && steps < 5) {
        var found = pickInput(sib, idx);
        if (found) return found;
        sib = sib.nextElementSibling;
        steps++;
      }
      node = parent;
    }
    return null;
  }

  /** sib có phải ô nhập không, hoặc có chứa đúng 1 ô nhập không. */
  function pickInput(node, idx) {
    if (!node || node.nodeType !== 1) return null;
    var self = idx.byEl.get(node);
    if (self) return self;
    var inner = null, count = 0;
    try {
      var list = node.querySelectorAll(INPUT_SELECTOR);
      for (var j = 0; j < list.length; j++) {
        var entry = idx.byEl.get(list[j]);
        if (!entry) continue;
        count++;
        inner = entry;
        if (count > 1) return null;   // nhiều ô -> mơ hồ, để bước hình học quyết định
      }
    } catch (e) { return null; }
    return count === 1 ? inner : null;
  }

  function scoreLabel(labelEl, keyNorms) {
    var best = 0;
    for (var i = 0; i < keyNorms.length; i++) {
      var k = keyNorms[i];
      var s = 0;
      if (k.n && labelEl.n === k.n) s = 1000;
      else if (k.nu && labelEl.nu === k.nu) s = 960;
      else if (k.ns && labelEl.ns === k.ns) s = 950;
      else if (k.nc && labelEl.nc === k.nc) s = 940;
      else if (k.ncu && labelEl.nc === k.ncu) s = 930;
      else if (k.n && labelEl.n.indexOf(k.n) === 0) s = 800;
      else if (k.n && labelEl.n.indexOf(k.n) > 0) s = 700;
      else if (k.nu && labelEl.nu.indexOf(k.nu) >= 0 && k.nu.length >= 4) s = 640;
      else {
        // Khớp theo tập token: nhãn "Số lượng bạch cầu trung tính (K/µL)" vs key bỏ đơn vị
        var lt = tokens(labelEl.text), kt = tokens(k.raw);
        if (kt.length && lt.length) {
          var hit = 0;
          for (var a = 0; a < kt.length; a++) {
            for (var b = 0; b < lt.length; b++) if (lt[b] === kt[a]) { hit++; break; }
          }
          if (hit === kt.length && kt.length >= 2) s = 560;
          else if (hit >= 2 && hit / kt.length >= 0.6) s = 420;
        }
      }
      if (s > best) best = s;
    }
    return best;
  }

  /** Đi ngược tối đa 5 cấp cha; nếu trong khối đó có ĐÚNG 1 ô nhập -> lấy nó. */
  function findInAncestor(labelEl, idx) {
    var node = labelEl;
    for (var up = 0; up < 5 && node; up++) {
      node = node.parentElement;
      if (!node || node.nodeType !== 1) break;
      var tag = String(node.tagName || '').toUpperCase();
      if (tag === 'BODY' || tag === 'HTML') break;

      // Query trong NHÁNH CON nhỏ (rẻ) thay vì duyệt mọi ô nhập rồi contains() (đắt).
      var list;
      try { list = node.querySelectorAll(INPUT_SELECTOR); } catch (e) { break; }
      var found = null, count = 0;
      for (var i = 0; i < list.length; i++) {
        var entry = idx.byEl.get(list[i]);
        if (!entry) continue;              // ô bị ẩn/disabled -> đã bị loại từ vòng index
        count++;
        found = entry;
        if (count > 1) break;
      }
      if (count === 1 && found) {
        // Không nhận ô nằm trong chính nhãn (trường hợp <label><input></label>)
        if (labelEl.contains && labelEl.contains(found.el)) continue;
        return found;
      }
    }
    return null;
  }

  function findByAriaLabelledby(labelEl, idx) {
    if (!labelEl.id) return null;
    for (var i = 0; i < idx.inputs.length; i++) {
      var el = idx.inputs[i].el;
      var lb = el.getAttribute && el.getAttribute('aria-labelledby');
      if (lb && (' ' + lb + ' ').indexOf(' ' + labelEl.id + ' ') >= 0) return el;
    }
    return null;
  }

  /** Chấm điểm theo vị trí tương đối giữa nhãn và ô nhập. */
  function findNearest(label, idx) {
    var lr = label.rect;
    if (!lr || (lr.width === 0 && lr.height === 0)) return null;
    var lcy = lr.top + lr.height / 2;
    var rowTol = Math.max(16, lr.height * 0.9);
    var best = null, bestTotal = 0;

    for (var i = 0; i < idx.inputs.length; i++) {
      var inp = idx.inputs[i];
      var ir = inp.rect;
      if (!ir) continue;
      var icy = ir.top + (ir.height || 0) / 2;
      var bonus = 0;

      var sameRow = Math.abs(icy - lcy) <= rowTol;
      var toRight = ir.left >= lr.right - 12;
      var below = ir.top >= lr.bottom - 8 && ir.top <= lr.bottom + 90;
      var hOverlap = !(ir.right < lr.left - 12 || ir.left > lr.right + 12);

      if (sameRow && toRight) {
        bonus = 300 - Math.min(200, (ir.left - lr.right) / 8);
      } else if (below && hOverlap) {
        bonus = 220 - Math.min(160, (ir.top - lr.bottom) / 3);
      } else if (sameRow && !toRight) {
        bonus = 120 - Math.min(100, Math.abs(ir.left - lr.left) / 20);
      } else {
        continue;
      }

      if (inp.readOnly) bonus -= 120;
      if (ir.width === 0 || ir.height === 0) bonus -= 80;   // input ẩn của widget
      if (bonus > bestTotal) { bestTotal = bonus; best = inp; }
    }
    return best ? { el: best.el, bonus: Math.round(bestTotal) } : null;
  }

  // ---------------------------------------------------------------------------
  // 7. GHI GIÁ TRỊ (chống widget DevExtreme/React ghi đè)
  // ---------------------------------------------------------------------------

  function fire(el, type, init) {
    try {
      var ev;
      if (init && init.__ctor === 'InputEvent' && global.InputEvent) {
        ev = new InputEvent(type, { bubbles: true, cancelable: false, inputType: init.inputType, data: init.data });
      } else if (init && init.__ctor === 'KeyboardEvent' && global.KeyboardEvent) {
        ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: init.key });
      } else {
        ev = new Event(type, { bubbles: true, cancelable: false });
      }
      el.dispatchEvent(ev);
    } catch (e) {
      try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch (e2) { }
    }
  }

  function nativeValueSetter(el, value) {
    try {
      var proto = el.tagName === 'TEXTAREA' ? global.HTMLTextAreaElement : global.HTMLInputElement;
      var desc = proto && Object.getOwnPropertyDescriptor(proto.prototype, 'value');
      if (desc && desc.set) { desc.set.call(el, value); return true; }
    } catch (e) { }
    return false;
  }

  function selectAllContent(el) {
    try {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.select && el.select();
        if (el.setSelectionRange) { try { el.setSelectionRange(0, (el.value || '').length); } catch (e) { } }
      } else if (el.isContentEditable) {
        var doc = el.ownerDocument;
        var range = doc.createRange();
        range.selectNodeContents(el);
        var sel = doc.getSelection ? doc.getSelection() : (doc.defaultView && doc.defaultView.getSelection());
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      }
    } catch (e) { }
  }

  function readValue(el) {
    if (!el) return '';
    if (el.isContentEditable) return cleanValue(el.textContent || el.innerText || '');
    return cleanValue(el.value === undefined || el.value === null ? '' : el.value);
  }

  /** Tìm widget DevExtreme bao quanh el (nếu trang có dùng DevExtreme). */
  function dxInstance(el) {
    try {
      var node = el;
      while (node && node !== document.body) {
        if (node.className && String(node.className).indexOf('dx-widget') >= 0) break;
        node = node.parentElement;
      }
      if (!node) return null;
      var DX = global.DevExpress;
      if (DX && DX.ui) {
        var names = ['dxTextBox', 'dxTextArea', 'dxNumberBox', 'dxDateBox', 'dxSelectBox', 'dxTagBox', 'dxLookup', 'dxCheckBox', 'dxRadioGroup', 'dxHtmlEditor'];
        for (var i = 0; i < names.length; i++) {
          var ctor = DX.ui[names[i]];
          if (ctor && typeof ctor.getInstance === 'function') {
            try {
              var inst = ctor.getInstance(node);
              if (inst) return { name: names[i], inst: inst };
            } catch (e) { }
          }
        }
      }
      var jq = global.jQuery || global.$;
      if (jq && jq.fn) {
        var jn = ['dxTextBox', 'dxTextArea', 'dxNumberBox', 'dxDateBox', 'dxSelectBox', 'dxCheckBox'];
        for (var j = 0; j < jn.length; j++) {
          try {
            if (typeof jq(node)[jn[j]] === 'function') {
              var inst2 = jq(node)[jn[j]]('instance');
              if (inst2) return { name: jn[j], inst: inst2 };
            }
          } catch (e) { }
        }
      }
    } catch (e) { }
    return null;
  }

  function setSelectValue(sel, value) {
    var want = norm(value);
    var wantS = normSquash(value);
    var opts = sel.options || [];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var t = norm(o.textContent), ts = normSquash(o.textContent), v = normSquash(o.value);
      if ((ts && (ts === wantS || t === want)) || (v && v === wantS)) {
        sel.selectedIndex = i;
        fire(sel, 'input'); fire(sel, 'change');
        return true;
      }
    }
    // Không khớp -> thử khớp chứa
    for (var j = 0; j < opts.length; j++) {
      var o2 = opts[j];
      var t2 = norm(o2.textContent);
      if (t2 && want && (t2.indexOf(want) >= 0 || want.indexOf(t2) >= 0)) {
        sel.selectedIndex = j;
        fire(sel, 'input'); fire(sel, 'change');
        return true;
      }
    }
    return false;
  }

  /**
   * Ghi giá trị vào 1 ô, theo nhiều tầng, và ĐỌC LẠI để xác nhận.
   * Trả về { success, value, via[], reason }
   */
  function applyValue(el, rawValue, field) {
    var via = [];
    if (!el) return { success: false, via: via, reason: 'no-element' };

    var tag = String(el.tagName || '').toUpperCase();
    var type = String(el.getAttribute && el.getAttribute('type') || el.type || '').toLowerCase();
    var value = transformValue(field, rawValue, el);

    // --- select ---
    if (tag === 'SELECT') {
      var okSel = setSelectValue(el, value);
      via.push('select');
      return { success: okSel, value: value, via: via, reason: okSel ? '' : 'option-not-found' };
    }

    // --- checkbox / radio ---
    if (type === 'checkbox' || type === 'radio') {
      var want = norm(value);
      var shouldCheck = !(want === '' || want === 'false' || want === '0' || want === 'khong' || want === 'no');
      if (type === 'radio') {
        // radio: chỉ tick khi giá trị khớp value/label của nó
        var rv = normSquash(el.value || '');
        var lbl = el.parentElement ? labelText(el.parentElement) : '';
        var match = (rv && (rv === normSquash(value) || rv.indexOf(normSquash(value)) >= 0)) ||
          (lbl && norm(lbl).indexOf(want) >= 0 && want.length > 0);
        if (!match) return { success: false, value: value, via: ['radio-skip'], reason: 'radio-value-mismatch' };
        shouldCheck = true;
      }
      if (el.checked !== shouldCheck) {
        try { el.click(); } catch (e) { el.checked = shouldCheck; fire(el, 'change'); }
      }
      via.push(type);
      return { success: el.checked === shouldCheck, value: value, via: via, reason: '' };
    }

    // --- input type=date: nhiều trang cần đúng ISO ---
    if (type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      var iso = toIsoDate(value);
      if (iso) { value = iso; via.push('date-fix'); }
    }

    // --- Tầng 1: DevExtreme widget API (chuẩn nhất với medinet) ---
    var dx = dxInstance(el);
    if (dx && dx.inst && typeof dx.inst.option === 'function') {
      try {
        dx.inst.option('value', value);
        via.push('dx:' + dx.name);
        if (looseEqual(readValue(el), value)) {
          fire(el, 'change');
          return { success: true, value: value, via: via, reason: '' };
        }
      } catch (e) { }
    }

    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { } }
    selectAllContent(el);

    // --- Tầng 2: execCommand('insertText') = mô phỏng gõ thật ---
    // Đây là cách duy nhất khiến React/Vue/DevExtreme thấy đây là input thật của user.
    try {
      if (global.document && document.execCommand) {
        var done = document.execCommand('insertText', false, value);
        if (done) via.push('insertText');
      }
    } catch (e) { }
    if (looseEqual(readValue(el), value)) {
      fire(el, 'change'); blur(el);
      return { success: true, value: value, via: via, reason: '' };
    }

    // --- Tầng 3: native setter + InputEvent (thua React value-tracker) ---
    if (el.isContentEditable) {
      try { el.textContent = value; } catch (e) { }
      fire(el, 'input', { __ctor: 'InputEvent', inputType: 'insertText', data: value });
      via.push('contenteditable');
    } else if (nativeValueSetter(el, value)) {
      fire(el, 'input', { __ctor: 'InputEvent', inputType: 'insertText', data: value });
      via.push('nativeSetter');
    } else {
      el.value = value;
      fire(el, 'input', { __ctor: 'InputEvent', inputType: 'insertText', data: value });
      via.push('assign');
    }
    fire(el, 'change');
    fire(el, 'keyup', { __ctor: 'KeyboardEvent', key: 'Unidentified' });

    var okNow = looseEqual(readValue(el), value);
    if (!okNow && dx && dx.inst) {
      // Thử lại widget API sau khi đã gõ (một số widget chỉ nhận khi đang focus)
      try { dx.inst.option('value', value); via.push('dx-retry'); okNow = looseEqual(readValue(el), value); } catch (e) { }
    }
    blur(el);
    return { success: okNow, value: value, via: via, reason: okNow ? '' : 'value-reverted' };
  }

  function blur(el) {
    try { fire(el, 'blur'); } catch (e) { }
    try { el.blur && el.blur(); } catch (e) { }
  }

  // ---------------------------------------------------------------------------
  // 8. CHỜ FORM SẴN SÀNG + ĐIỀN
  // ---------------------------------------------------------------------------

  function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms || 0); });
  }

  /** Đếm số field tìm được ô nhập; dùng để biết DOM đã "lắng" chưa. */
  function probeFields(fields) {
    var idx = buildIndex(false);
    var found = 0;
    for (var i = 0; i < fields.length; i++) {
      if (findTarget(fields[i], idx)) found++;
    }
    return { found: found, total: fields.length, labels: idx.labels.length, inputs: idx.inputs.length };
  }

  /**
   * Chờ tới khi số field tìm được ổn định (2 lần đo liên tiếp giống nhau)
   * hoặc đạt mức tốt, hoặc hết giờ. Tránh điền lúc form đang render dở.
   */
  function waitForReady(fields, opts) {
    opts = opts || {};
    var timeout = opts.timeout || CONFIG.options.readyTimeoutMs;
    var interval = opts.poll || CONFIG.options.readyPollMs;
    var start = Date.now();
    var last = -1, stable = 0;

    return new Promise(function (resolve) {
      function tick() {
        var p;
        try { p = probeFields(fields); } catch (e) { p = { found: 0, total: fields.length, labels: 0, inputs: 0 }; }
        if (p.found === last) stable++; else stable = 0;
        last = p.found;
        var elapsed = Date.now() - start;
        // Dừng khi: tìm thấy hết, hoặc ổn định 3 lần đo, hoặc hết giờ.
        if (p.total > 0 && p.found >= p.total) return resolve(p);
        if (stable >= 3 && elapsed > interval * 4) return resolve(p);
        if (elapsed >= timeout) return resolve(p);
        setTimeout(tick, interval);
      }
      tick();
    });
  }

  /**
   * ĐIỀN CHÍNH.
   * payload:
   *   rows         : [[...],[...]] dữ liệu (bắt buộc, trừ khi truyền `text`)
   *   text         : chuỗi thô copy từ Excel (engine tự parse)
   *   headerRow    : dòng tiêu đề (mảng) — nếu bỏ trống sẽ tự dò trong rows
   *   rowIndex     : chỉ số dòng dữ liệu cần điền (mặc định 0)
   *   rowIndexes   : mảng nhiều dòng -> điền lần lượt (hàng đợi)
   *   fields       : mapping ghi đè (host đẩy xuống), nếu không có thì lấy theo form/URL
   *   formId       : chỉ định form trong CONFIG
   *   dryRun       : true = chỉ kiểm tra mapping, KHÔNG ghi
   *   delayMs      : nghỉ giữa các trường
   */
  function fill(payload) {
    payload = payload || {};
    var rows = payload.rows;
    if (!rows && payload.text !== undefined && payload.text !== null) {
      rows = parseTable(payload.text, { delimiter: payload.delimiter }).rows;
    }
    if (!rows || !rows.length) {
      return Promise.resolve(report({ ok: 0, missing: [], failed: [], filled: [], error: 'no-data' }));
    }

    var fields = resolveFields(payload);
    if (!fields.length) {
      return Promise.resolve(report({ ok: 0, missing: [], failed: [], filled: [], error: 'no-fields', hint: 'Không có mapping cho URL này. Mở Cài đặt để khai báo form.' }));
    }

    var headerRow = payload.headerRow;
    var autoHeader = -1;
    if (!headerRow && CONFIG.options.preferHeaderMatch !== false) {
      autoHeader = detectHeaderRow(rows, fields);
      if (autoHeader >= 0) headerRow = rows[autoHeader];
    }
    var plan = resolveColumns(fields, headerRow);

    var indexes = payload.rowIndexes;
    if (!indexes) {
      // CÓ dòng tiêu đề thì dữ liệu thật bắt đầu từ dòng NGAY SAU nó.
      // (bản cũ luôn lấy rows[0] -> dán khối Excel có tiêu đề là điền nguyên
      //  dòng tiêu đề vào form bệnh nhân)
      var first = typeof payload.rowIndex === 'number'
        ? payload.rowIndex
        : (autoHeader >= 0 ? autoHeader + 1 : 0);
      indexes = [first];
    }

    return waitForReady(fields, { timeout: payload.readyTimeoutMs }).then(function (probe) {
      var results = [];
      var chain = Promise.resolve();

      indexes.forEach(function (ri) {
        chain = chain.then(function () {
          var dataRow = rows[ri];
          if (!dataRow) return;
          return fillOneRow(dataRow, plan, payload, probe, ri).then(function (r) { results.push(r); });
        }).then(function () {
          if (indexes.length > 1) return sleep(CONFIG.options.perRowDelayMs);
        });
      });

      return chain.then(function () {
        var agg = aggregate(results);
        agg.probe = probe;
        agg.headerDetected = autoHeader >= 0 ? autoHeader : null;
        agg.rowsRequested = indexes.length;
        return report(agg);
      });
    });
  }

  function resolveFields(payload) {
    if (payload.fields && payload.fields.length) return normalizeFields(payload.fields);
    if (CONFIG.fields && CONFIG.fields.length) return CONFIG.fields;
    var form = payload.formId ? getForm(payload.formId) : activeForm(payload.url);
    if (form && form.fields && form.fields.length) return form.fields;
    // Không nhận diện được form: nếu chỉ có đúng 1 form thì dùng luôn (thân thiện hơn).
    if (CONFIG.forms.length === 1) return CONFIG.forms[0].fields;
    return [];
  }

  function fillOneRow(dataRow, plan, payload, probe, rowIndex) {
    var dry = !!payload.dryRun;
    var results = [];
    var chain = Promise.resolve();
    var idx = buildIndex(false);

    plan.forEach(function (p) {
      chain = chain.then(function () {
        var field = p.field;
        var raw = p.col >= 0 && p.col < dataRow.length ? dataRow[p.col] : '';
        var hasValue = !isBlank(raw);
        var target = null;
        try { target = findTarget(field, idx); } catch (e) { target = null; }

        var rec = {
          key: field.key,
          label: (field.labels && field.labels[0]) || field.key,
          col: p.col,
          via: p.via,
          raw: cleanValue(raw),
          found: !!target,
          foundVia: target ? target.via : '',
          foundScore: target ? target.score : 0,
          success: false,
          written: '',
          attempts: []
        };

        if (!hasValue) {
          rec.status = field.required ? 'empty-required' : 'empty';
          results.push(rec);
          return;
        }
        if (!target) {
          rec.status = 'missing';
          results.push(rec);
          return;
        }

        if (dry) {
          rec.status = 'dry-ok';
          rec.success = true;
          rec.written = transformValue(field, raw, target.el);
          results.push(rec);
          return;
        }

        var attempt = 0;
        function tryApply() {
          attempt++;
          var r = applyValue(target.el, raw, field);
          rec.attempts = rec.attempts.concat(r.via || []);
          rec.written = r.value;
          if (r.success) {
            rec.success = true;
            rec.status = 'ok';
            return Promise.resolve();   // PHẢI luôn trả Promise (bản nháp trả undefined -> crash)
          }
          if (attempt < CONFIG.options.maxAttempts) {
            return sleep(CONFIG.options.retryDelayMs).then(function () {
              // DOM có thể đã đổi sau lần ghi trước -> index lại
              idx = buildIndex(false);
              var t2 = findTarget(field, idx);
              if (t2) target = t2;
              return tryApply();
            });
          }
          rec.status = 'failed';
          rec.reason = r.reason || 'apply-failed';
          return Promise.resolve();
        }

        return tryApply().then(function () {
          results.push(rec);
          if (CONFIG.options.perFieldDelayMs > 0) return sleep(CONFIG.options.perFieldDelayMs);
        });
      });
    });

    return chain.then(function () {
      var out = { rowIndex: rowIndex, fields: results };
      if (!dry && CONFIG.options.highlightMissing) {
        try { markMissing(results); } catch (e) { }
      }
      return out;
    });
  }

  function aggregate(results) {
    var ok = 0, missing = [], failed = [], filled = [], empty = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      for (var j = 0; j < r.fields.length; j++) {
        var f = r.fields[j];
        if (f.success) { ok++; filled.push({ row: r.rowIndex, label: f.label, value: f.written, via: f.foundVia, attempts: f.attempts }); }
        else if (f.status === 'missing') missing.push({ row: r.rowIndex, label: f.label, raw: f.raw });
        else if (f.status === 'failed') failed.push({ row: r.rowIndex, label: f.label, raw: f.raw, reason: f.reason, attempts: f.attempts });
        else if (f.status === 'empty-required') empty.push({ row: r.rowIndex, label: f.label });
      }
    }
    return {
      ok: ok,
      filled: filled,
      missing: missing,
      failed: failed,
      emptyRequired: empty,
      rows: results,
      durationMs: 0
    };
  }

  function report(res) {
    res.engineVersion = VERSION;
    res.url = global.location ? global.location.href : '';
    res.form = (activeForm() || {}).name || null;
    res.timestamp = new Date().toISOString();
    if (res.missing && res.missing.length === 0 && res.failed && res.failed.length === 0 && res.ok > 0) {
      res.message = 'Đã điền ' + res.ok + ' trường.';
    } else if (res.error) {
      res.message = res.error === 'no-data' ? 'Không có dữ liệu để điền.'
        : res.error === 'no-fields' ? (res.hint || 'Không tìm thấy mapping cho trang này.')
          : 'Lỗi: ' + res.error;
    } else {
      var parts = [];
      if (res.ok) parts.push(res.ok + ' OK');
      if (res.missing && res.missing.length) parts.push(res.missing.length + ' không thấy ô nhập');
      if (res.failed && res.failed.length) parts.push(res.failed.length + ' ghi không được');
      if (res.emptyRequired && res.emptyRequired.length) parts.push(res.emptyRequired.length + ' thiếu dữ liệu');
      res.message = parts.length ? 'Điền xong: ' + parts.join(', ') + '.' : 'Không có trường nào được điền.';
    }
    lastResult = res;
    postToHost({ type: 'maf:result', payload: res });
    if (global.console) {
      if (res.ok || (res.missing && res.missing.length)) {
        console.log('[MAF] ' + res.message);
        if (res.missing && res.missing.length) console.warn('[MAF] Không tìm thấy ô nhập cho:', res.missing.map(function (m) { return m.label; }).join(' | '));
        if (res.failed && res.failed.length) console.warn('[MAF] Ghi thất bại:', res.failed.map(function (m) { return m.label + ' (' + m.reason + ')'; }).join(' | '));
      }
    }
    return res;
  }

  var lastResult = null;

  // ---------------------------------------------------------------------------
  // 9. BÁO KẾT QUẢ VỀ HOST (C# / Electron / Web)
  // ---------------------------------------------------------------------------

  var hostHandlers = [];

  function onResult(fn) {
    if (typeof fn === 'function') hostHandlers.push(fn);
  }

  function postToHost(obj) {
    var json;
    try { json = JSON.stringify(obj); } catch (e) { return; }
    // WebView2 (WinForms + Bridge)
    try {
      if (global.chrome && global.chrome.webview && global.chrome.webview.postMessage) {
        global.chrome.webview.postMessage(json);
        return;
      }
    } catch (e) { }
    // Electron preload bridge
    try {
      if (global.MAFHost && typeof global.MAFHost.postMessage === 'function') {
        global.MAFHost.postMessage(json);
        return;
      }
    } catch (e) { }
    // Web: tự xử lý trong trang
    for (var i = 0; i < hostHandlers.length; i++) {
      try { hostHandlers[i](obj); } catch (e) { }
    }
    try { global.dispatchEvent(new CustomEvent('maf:result', { detail: obj })); } catch (e) { }
  }

  // ---------------------------------------------------------------------------
  // 10. ĐÁNH DẤU Ô THIẾU (hỗ trợ người dùng sửa mapping)
  // ---------------------------------------------------------------------------

  function markMissing(results) {
    if (!CONFIG.options.highlightMissing) return;
    var names = [];
    for (var i = 0; i < results.length; i++) {
      for (var j = 0; j < results[i].fields.length; j++) {
        var f = results[i].fields[j];
        if (f.status === 'missing' || f.status === 'failed') names.push(f.label);
      }
    }
    if (!names.length) return;
    highlightLabels(names);
  }

  function highlightLabels(labels) {
    var idx = buildIndex(true);
    var shown = 0;
    for (var i = 0; i < labels.length && shown < 40; i++) {
      var want = normSquash(labels[i]);
      var wantU = normSquash(normNoUnits(labels[i]));
      for (var k = 0; k < idx.labels.length; k++) {
        var L = idx.labels[k];
        if (L.ns !== want && L.nu !== wantU) continue;
        if (!L.rect || (!L.rect.width && !L.rect.height)) continue;
        drawBox(L.el, L.rect, labels[i]);
        shown++;
        break;
      }
    }
    if (shown) {
      setTimeout(function () {
        var boxes = document.querySelectorAll('[data-maf-box]');
        for (var b = 0; b < boxes.length; b++) {
          try { boxes[b].parentNode.removeChild(boxes[b]); } catch (e) { }
        }
      }, CONFIG.options.highlightMs || 6000);
    }
    return shown;
  }

  function drawBox(el, rect, title) {
    try {
      var box = document.createElement('div');
      box.setAttribute('data-maf-box', '1');
      box.textContent = '⚠ ' + title;
      box.style.cssText = 'position:fixed;z-index:2147483000;background:#fff3cd;color:#7a4b00;' +
        'border:2px solid #e0a800;border-radius:4px;padding:2px 6px;font:11px/1.4 Segoe UI,Arial,sans-serif;' +
        'pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25);max-width:260px;overflow:hidden;' +
        'text-overflow:ellipsis;white-space:nowrap;' +
        'top:' + Math.max(0, rect.top - 20) + 'px;left:' + Math.max(0, rect.left) + 'px;';
      document.body.appendChild(box);
      try { el.style.outline = '2px dashed #e0a800'; } catch (e) { }
    } catch (e) { }
  }

  // ---------------------------------------------------------------------------
  // 11. CHỌN "KHÔNG" HÀNG LOẠT (Ctrl+B)
  // ---------------------------------------------------------------------------

  function selectAllNo(opts) {
    opts = opts || {};
    var keywords = (opts.keywords || CONFIG.options.selectNoKeywords || []).map(function (k) { return norm(k); });
    if (!keywords.length) return { clicked: 0, message: 'Chưa cấu hình từ khóa "Không".' };

    var idx = buildIndex(false);
    var clicked = 0, skipped = 0, seen = [];
    var nodes = [];
    for (var d = 0; d < idx.docs.length; d++) {
      var els;
      try { els = idx.docs[d].querySelectorAll('.dx-item-content, .dx-list-item-content, .dx-radiobutton, label, span, td, li'); } catch (e) { els = []; }
      for (var i = 0; i < els.length; i++) nodes.push({ el: els[i], doc: idx.docs[d] });
    }

    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n].el;
      var t = labelText(el);
      if (!t || t.length > 40) continue;
      var tn = norm(t);
      if (keywords.indexOf(tn) < 0) continue;

      var group = el.closest ? (el.closest('.dx-radiogroup .dx-item, .dx-radiobutton, .dx-item, label, td, li, .radio, .form-check') || el.parentElement) : el.parentElement;
      if (!group) continue;

      // Không xử lý 1 nhóm 2 lần
      var gid = groupKey(group);
      if (seen.indexOf(gid) >= 0) { skipped++; continue; }
      seen.push(gid);

      var radio = group.querySelector ? group.querySelector('input[type="radio"], input[type="checkbox"]') : null;
      var already = isChecked(group, radio);
      if (already) { skipped++; continue; }

      var target = radio || (group.querySelector ? group.querySelector('.dx-radio, .dx-radio-icon, .dx-radiobutton-icon, .dx-item-content') : null) || group;
      try {
        target.click();
        clicked++;
      } catch (e) { }

      // Verify: nếu click không ăn thì set checked thủ công + dispatch
      if (radio && !radio.checked) {
        try {
          radio.checked = true;
          fire(radio, 'input'); fire(radio, 'change');
        } catch (e) { }
      }
    }

    var res = { clicked: clicked, skipped: skipped, message: 'Đã chọn "' + (keywords[0] || 'Không') + '" cho ' + clicked + ' mục.' };
    log(res.message);
    postToHost({ type: 'maf:select-no', payload: res });
    return res;
  }

  function groupKey(el) {
    try {
      if (!el.__mafKey) el.__mafKey = 'k' + Math.random().toString(36).slice(2);
      return el.__mafKey;
    } catch (e) { return String(el); }
  }

  function isChecked(group, radio) {
    if (radio && radio.checked) return true;
    if (!group) return false;
    if (group.getAttribute && group.getAttribute('aria-checked') === 'true') return true;
    var cls = group.className ? String(group.className) : '';
    if (cls.indexOf('dx-state-checked') >= 0 || cls.indexOf('checked') >= 0 || cls.indexOf('active') >= 0) {
      // 'active' quá rộng -> chỉ tin khi là dx-*/radio
      if (cls.indexOf('dx-') >= 0 || cls.indexOf('radio') >= 0) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 12. CÔNG CỤ CHẨN ĐOÁN (rất cần khi "không hiểu vì sao không điền")
  // ---------------------------------------------------------------------------

  /** Dump toàn bộ nhãn + ô nhập gần nhất tìm được — dán vào Cài đặt để dò mapping. */
  function scan(opts) {
    opts = opts || {};
    var idx = buildIndex(true);
    var out = [];
    for (var i = 0; i < idx.labels.length; i++) {
      var L = idx.labels[i];
      if (opts.filter && norm(L.text).indexOf(norm(opts.filter)) < 0) continue;
      var t = null;
      try {
        var g = findInAncestor(L.el, idx);
        t = g ? g.el : (findNearest(L, idx) || {}).el;
      } catch (e) { t = null; }
      out.push({
        label: L.text,
        tag: String(L.el.tagName || '').toLowerCase(),
        cls: L.el.className ? String(L.el.className).slice(0, 60) : '',
        target: t ? describeEl(t) : null
      });
    }
    return { count: out.length, url: global.location ? global.location.href : '', items: out };
  }

  function describeEl(el) {
    if (!el) return null;
    return {
      tag: String(el.tagName || '').toLowerCase(),
      type: String(el.getAttribute && el.getAttribute('type') || el.type || ''),
      id: el.id || '',
      name: (el.getAttribute && el.getAttribute('name')) || '',
      cls: el.className ? String(el.className).slice(0, 80) : '',
      selector: cssPath(el)
    };
  }

  /** Sinh CSS selector ngắn gọn cho 1 element (để dán vào cột "Selector"). */
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + el.id;
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      var part = String(node.tagName || '').toLowerCase();
      if (node.id) { parts.unshift('#' + node.id); break; }
      var cls = node.className ? String(node.className).trim().split(/\s+/).slice(0, 2) : [];
      cls = cls.filter(function (c) { return c && c.indexOf('dx-state') < 0 && c.length < 30; });
      if (cls.length) part += '.' + cls.join('.');
      var parent = node.parentElement;
      if (parent) {
        var same = parent.children;
        var n = 0, pos = 0;
        for (var i = 0; i < same.length; i++) {
          if (String(same[i].tagName) === String(node.tagName)) { n++; if (same[i] === node) pos = n; }
        }
        if (n > 1) part += ':nth-of-type(' + pos + ')';
      }
      parts.unshift(part);
      node = parent;
      depth++;
    }
    return parts.join(' > ');
  }

  function state() {
    var form = activeForm();
    return {
      engineVersion: VERSION,
      url: global.location ? global.location.href : '',
      form: form ? form.name : null,
      formId: form ? form.id : null,
      forms: CONFIG.forms.length,
      fields: form ? form.fields.length : 0,
      hasClipboardApi: !!(global.navigator && navigator.clipboard && navigator.clipboard.readText),
      secureContext: !!global.isSecureContext,
      isWebView2: !!(global.chrome && global.chrome.webview),
      lastResult: lastResult ? { ok: lastResult.ok, missing: (lastResult.missing || []).length, failed: (lastResult.failed || []).length } : null
    };
  }

  // ---------------------------------------------------------------------------
  // 13. LẮNG NGHE SỰ KIỆN TRONG TRANG (đường dự phòng khi host không bơm data)
  // ---------------------------------------------------------------------------

  var installed = false;

  function installPageHooks() {
    if (installed) return;
    installed = true;

    // Sự kiện 'paste' CHO PHÉP đọc clipboard KHÔNG cần permission/HTTPS.
    // Đây là fix gốc rễ cho lỗi "navigator.clipboard.readText() không chạy trên http://".
    document.addEventListener('paste', function (e) {
      if (!CONFIG.options.autoFillOnPaste) return;
      var text = '';
      try {
        if (e.clipboardData) text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
      } catch (err) { text = ''; }
      if (!text || text.indexOf('\t') < 0 && text.indexOf('\n') < 0) return;   // không phải dữ liệu bảng
      // Nếu đang paste vào 1 ô nhập cụ thể của trang thì KHÔNG giành quyền.
      var ae = document.activeElement;
      var editable = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      if (editable && !CONFIG.options.autoFillEvenInsideField) return;

      var form = activeForm();
      if (!form) return;
      try { e.preventDefault(); } catch (err) { }
      var parsed = parseTable(text);
      log('Bắt paste trong trang:', parsed.rowCount, 'dòng x', parsed.colCount, 'cột');
      fill({ rows: parsed.rows });
    }, true);

    document.addEventListener('keydown', function (e) {
      var key = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'b' && CONFIG.options.enableSelectNoHotkey) {
        try { e.preventDefault(); } catch (err) { }
        selectAllNo();
      }
    }, true);
  }

  // ---------------------------------------------------------------------------
  // 14. PUBLIC API
  // ---------------------------------------------------------------------------

  var MAF = {
    version: VERSION,
    __installed: true,

    // Cấu hình
    configure: configure,
    getConfig: function () { return clone({ forms: CONFIG.forms, options: CONFIG.options }); },
    state: state,

    // Dữ liệu
    parseTable: parseTable,
    detectHeaderRow: function (rows, fields) {
      return detectHeaderRow(rows, fields && fields.length ? normalizeFields(fields) : resolveFields({}));
    },
    resolveColumns: function (fields, headerRow) { return resolveColumns(normalizeFields(fields), headerRow); },
    detectDelimiter: detectDelimiter,

    // Điền
    fill: fill,
    fillText: function (text, opts) {
      opts = opts || {};
      var p = parseTable(text, { delimiter: opts.delimiter });
      opts.rows = p.rows;
      return fill(opts);
    },
    dryRun: function (payload) { payload = payload || {}; payload.dryRun = true; return fill(payload); },
    selectAllNo: selectAllNo,

    // Chẩn đoán
    scan: scan,
    cssPath: cssPath,
    highlightLabels: highlightLabels,
    probe: function (fields) { return probeFields(normalizeFields(fields || resolveFields({}))); },
    waitForReady: function (fields, opts) { return waitForReady(normalizeFields(fields || resolveFields({})), opts); },
    invalidate: invalidateIndex,
    lastResult: function () { return lastResult; },

    // Tiện ích chuỗi (host C# có bản tương đương; giữ ở đây để test chung)
    util: { norm: norm, normNoUnits: normNoUnits, normSquash: normSquash, cleanValue: cleanValue, toIsoDate: toIsoDate, toNumberString: toNumberString, looseEqual: looseEqual },

    // Host bridge
    onResult: onResult,
    postToHost: postToHost,
    installPageHooks: installPageHooks
  };

  global.MAF = MAF;

  // Tự bật hook trong trang (WebView2/Electron inject vào mọi trang).
  try { installPageHooks(); } catch (e) { }

  // Trang có thể đã sẵn sàng từ trước khi script chạy.
  postToHost({ type: 'maf:ready', payload: state() });
})(typeof window !== 'undefined' ? window : globalThis);
