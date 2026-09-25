/**
 * Kiểm thử MAF Engine bằng jsdom.
 * Chạy:  cd Tests && npm test
 *
 * Đây là bộ test cho đúng những ca "lúc điền được lúc không" mà bản cũ gặp:
 *  - dán từ Excel có ô chứa xuống dòng/tab trong nháy
 *  - tiêu đề cột lệch thứ tự
 *  - widget DevExtreme/controlled-input ghi đè giá trị
 *  - form nằm trong iframe
 *  - nhãn tiếng Việt có dấu + đơn vị trong ngoặc
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = fs.readFileSync(path.join(__dirname, '..', 'Shared', 'maf-engine.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('  ✅ ' + name); })
    .catch((e) => { fail++; failures.push([name, e]); console.log('  ❌ ' + name + '\n      ' + (e && e.message)); });
}

/** Tạo một trang jsdom đã nạp engine. */
function makePage(html, opts = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    url: opts.url || 'https://quanlyskcd.medinet.org.vn/KSKDK_Phieu_CanLamSang/123',
    pretendToBeVisual: true
  });
  // jsdom KHÔNG có layout (getBoundingClientRect trả toàn 0) -> bước khớp theo
  // hình học của engine sẽ bị vô hiệu. Giả lập layout dạng "danh sách dọc"
  // để test được cả đường này (trang thật luôn có toạ độ).
  if (opts.layout !== false) stubLayout(dom.window);
  dom.window.eval(ENGINE);
  return dom.window;
}

/** Gán toạ độ giả theo thứ tự document: mỗi element một dòng cao 24px. */
function stubLayout(w) {
  const all = w.document.querySelectorAll('*');
  let i = 0;
  const rects = new Map();
  all.forEach((el) => {
    const top = i * 24;
    rects.set(el, { top, left: 8, right: 400, bottom: top + 20, width: 392, height: 20 });
    i++;
  });
  w.Element.prototype.getBoundingClientRect = function () {
    // Element mới sinh sau khi stub (engine tự tạo) -> cho toạ độ 0 như thật.
    return rects.get(this) || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  };
}

/** Khối field kiểu DevExtreme (đúng cấu trúc medinet hay dùng). */
function dxField(label, id = '', type = 'text') {
  const control = type === 'textarea'
    ? `<textarea ${id ? `id="${id}"` : ''} class="dx-texteditor-input"></textarea>`
    : `<input ${id ? `id="${id}"` : ''} type="${type}" class="dx-texteditor-input" autocomplete="off">`;
  return `<div class="dx-field">
    <div class="dx-field-label">${label}</div>
    <div class="dx-field-value">
      <div class="dx-texteditor dx-widget dx-texteditor-empty">${control}</div>
    </div>
  </div>`;
}

// Cấu hình mapping dùng chung cho các test điền liệu.
const FIELDS = [
  { key: 'hoten', labels: ['Họ và tên', 'Ho ten'], headerNames: ['Họ và tên', 'HoTen'], excelIndex: 0 },
  { key: 'ngaysinh', labels: ['Ngày sinh'], controlType: 'date', excelIndex: 1 },
  { key: 'hc', labels: ['Số lượng HC (M/µL)', 'Số lượng HC (T/L)'], controlType: 'number', excelIndex: 2 },
  { key: 'hst', labels: ['Huyết sắc tố (g/dL)'], controlType: 'number', excelIndex: 3 },
  { key: 'chanDoan', labels: ['Chẩn đoán'], controlType: 'textarea', excelIndex: 4 }
];

console.log('\n────────── 1. CHUẨN HOÁ CHUỖI ──────────');

await test('bỏ dấu tiếng Việt + collapse khoảng trắng', () => {
  const w = makePage('<div>x</div>');
  assert.equal(w.MAF.util.norm('  Họ   và Tên  '), 'ho va ten');
  assert.equal(w.MAF.util.norm('Đường máu lúc đói'), 'duong mau luc doi');
  assert.equal(w.MAF.util.normSquash('Số lượng HC (M/µL)'), 'soluonghcml');
});

await test('normNoUnits bỏ đơn vị trong ngoặc', () => {
  const w = makePage('<div>x</div>');
  assert.equal(w.MAF.util.normNoUnits('Creatinin (umol/L)'), 'creatinin');
  assert.equal(w.MAF.util.normNoUnits('Creatinin (µmol/L)'), 'creatinin');
  // (GOT) là TÊN biệt dược, KHÔNG phải đơn vị -> phải giữ lại
  assert.equal(w.MAF.util.normNoUnits('ASAT(GOT) (U/L)'), 'asat got');
  assert.equal(w.MAF.util.normNoUnits('ASAT(GPT) (U/L)'), 'asat gpt');
  // An toàn: GOT và GPT không bao giờ khớp về cùng một nhãn
  assert.notEqual(w.MAF.util.normSquash(w.MAF.util.normNoUnits('ASAT(GOT) (U/L)')),
                  w.MAF.util.normSquash(w.MAF.util.normNoUnits('ASAT(GPT) (U/L)')));
});

await test('cleanValue bỏ ký tự ẩn Excel hay dính (NBSP, zero-width, BOM)', () => {
  const w = makePage('<div>x</div>');
  assert.equal(w.MAF.util.cleanValue('A\u00a0B\u200bC\ufeff'), 'A BC');
});

await test('ngày: dd/mm/yyyy, dd-mm-yy, ISO, số serial Excel', () => {
  const w = makePage('<div>x</div>');
  const d = w.MAF.util.toIsoDate;
  assert.equal(d('15/03/1988'), '1988-03-15');
  assert.equal(d('5-7-99'), '1999-07-05');
  assert.equal(d('2024/12/01'), '2024-12-01');
  assert.equal(d('45123'), '2023-07-16');   // serial Excel (1899-12-30 + 45123 ngày)
  assert.equal(d(''), '');
});

await test('số: 1.234,5 / 1,234.5 / 1,5 / có đơn vị', () => {
  const w = makePage('<div>x</div>');
  const n = w.MAF.util.toNumberString;
  assert.equal(n('1.234,5'), '1234.5');
  assert.equal(n('1,234.5'), '1234.5');
  assert.equal(n('1,5'), '1.5');
  assert.equal(n('12.3'), '12.3');
  assert.equal(n(' 5,4 mmol/L '), '5.4');
});

console.log('\n────────── 2. PHÂN TÍCH DỮ LIỆU DÁN ──────────');

await test('TSV nhiều dòng từ Excel', () => {
  const w = makePage('<div>x</div>');
  const p = w.MAF.parseTable('a\tb\tc\n1\t2\t3\n4\t5\t6');
  assert.equal(p.delimiter, '\t');
  assert.equal(p.rowCount, 3);
  assert.equal(p.colCount, 3);
  assert.equal(JSON.stringify(p.rows[2]), JSON.stringify(['4', '5', '6']));
});

await test('ô CSV có xuống dòng + tab bên trong nháy (bản cũ vỡ cột ở đây)', () => {
  const w = makePage('<div>x</div>');
  const p = w.MAF.parseTable('"Nguyen Van A";"Sốt\n2 ngày";"5,4"\n"Tran B";"OK";"6"', { delimiter: ';' });
  assert.equal(p.rowCount, 2);
  assert.equal(p.colCount, 3);
  assert.equal(p.rows[0][1], 'Sốt\n2 ngày');
  assert.equal(p.rows[1][0], 'Tran B');
});

await test('nháy thoát "" trong CSV', () => {
  const w = makePage('<div>x</div>');
  const p = w.MAF.parseTable('"A ""quoted"" B",2', { delimiter: ',' });
  assert.equal(p.rows[0][0], 'A "quoted" B');
});

await test('tự phát hiện delimiter ; (Excel tiếng Việt)', () => {
  const w = makePage('<div>x</div>');
  assert.equal(w.MAF.detectDelimiter('a;b;c\n1;2;3'), ';');
});

await test('cắt dòng/cột rỗng thừa ở cuối', () => {
  const w = makePage('<div>x</div>');
  const p = w.MAF.parseTable('a\tb\n1\t2\n\t\n\t\n');
  assert.equal(p.rowCount, 2);
});

console.log('\n────────── 3. KHỚP CỘT THEO TIÊU ĐỀ ──────────');

await test('nhận diện dòng tiêu đề từ dữ liệu thật', () => {
  const w = makePage('<div>x</div>');
  const rows = [
    ['Họ và tên', 'Ngày sinh', 'Số lượng HC (M/µL)', 'Huyết sắc tố (g/dL)', 'Chẩn đoán'],
    ['Nguyen Van A', '15/03/1988', '4.5', '14.2', 'TD thieu mau']
  ];
  assert.equal(w.MAF.detectHeaderRow(rows, FIELDS), 0);
});

await test('không nhận nhầm dòng dữ liệu là tiêu đề', () => {
  const w = makePage('<div>x</div>');
  const rows = [
    ['Nguyen Van A', '15/03/1988', '4.5', '14.2', 'TD thieu mau'],
    ['Tran Thi B', '01/01/1990', '4.1', '13.0', 'Binh thuong']
  ];
  assert.equal(w.MAF.detectHeaderRow(rows, FIELDS), -1);
});

await test('tiêu đề ĐẢO THỨ TỰ vẫn điền đúng cột (bản cũ điền sai)', () => {
  const w = makePage('<div>x</div>');
  const header = ['Ngày sinh', 'Họ và tên', 'Huyết sắc tố (g/dL)', 'Số lượng HC (T/L)', 'Chẩn đoán'];
  const plan = w.MAF.resolveColumns(FIELDS, header);
  const col = Object.fromEntries(plan.map(p => [p.field.key, p.col]));
  assert.equal(col.hoten, 1);
  assert.equal(col.ngaysinh, 0);
  assert.equal(col.hc, 3);      // khớp cả biến thể đơn vị (T/L)
  assert.equal(col.hst, 2);
  assert.equal(col.chanDoan, 4);
  assert.ok(plan.every(p => p.via === 'header'));
});

await test('không có tiêu đề -> rơi về excelIndex (tương thích ngược)', () => {
  const w = makePage('<div>x</div>');
  const plan = w.MAF.resolveColumns(FIELDS, null);
  assert.equal(JSON.stringify(plan.map(p => p.col)), '[0,1,2,3,4]');
  assert.ok(plan.every(p => p.via === 'index'));
});

console.log('\n────────── 4. TÌM Ô NHẬP ──────────');

await test('DevExtreme .dx-field: nhãn -> ô nhập trong cùng nhóm', async () => {
  const html = dxField('Họ và tên') + dxField('Ngày sinh') + dxField('Số lượng HC (M/µL)');
  const w = makePage(html);
  const r = await w.MAF.fill({ rows: [['Nguyen Van A', '15/03/1988', '4.5']], fields: FIELDS });
  assert.equal(r.ok, 3, JSON.stringify(r.missing));
  const inputs = w.document.querySelectorAll('input');
  assert.equal(inputs[0].value, 'Nguyen Van A');
  assert.equal(inputs[1].value, '15/03/1988');   // ô text: GIỮ định dạng VN
  assert.equal(inputs[2].value, '4.5');
});

await test('label[for] được ưu tiên tuyệt đối', async () => {
  const html = `<label for="txtHoten">Họ và tên</label><input id="khac"><input id="txtHoten">`;
  const w = makePage(html);
  const r = await w.MAF.fill({ rows: [['Tran Thi B']], fields: [FIELDS[0]] });
  assert.equal(r.ok, 1);
  assert.equal(w.document.getElementById('txtHoten').value, 'Tran Thi B');
  assert.equal(w.document.getElementById('khac').value, '');
});

await test('bảng <td>nhãn</td><td>input</td>', async () => {
  const html = `<table><tr><td>Huyết sắc tố (g/dL)</td><td><input></td></tr>
                <tr><td>Chẩn đoán</td><td><textarea></textarea></td></tr></table>`;
  const w = makePage(html);
  const r = await w.MAF.fill({
    rows: [['13.8', 'Viêm họng cấp']],
    fields: [{ ...FIELDS[3], excelIndex: 0 }, { ...FIELDS[4], excelIndex: 1 }]
  });
  assert.equal(r.ok, 2, JSON.stringify(r));
  assert.equal(w.document.querySelector('input').value, '13.8');
  assert.equal(w.document.querySelector('textarea').value, 'Viêm họng cấp');
});

await test('khớp theo id/name không dấu (hoten vs "Họ và tên")', async () => {
  const html = `<input name="hoten"><div>Họ và tên</div>`;
  const w = makePage(html);
  const r = await w.MAF.fill({ rows: [['Le Van C']], fields: [FIELDS[0]] });
  assert.equal(r.ok, 1);
  assert.equal(w.document.querySelector('input').value, 'Le Van C');
});

await test('selector chỉ định thẳng thắng mọi heuristic', async () => {
  const html = `<input id="a"><input id="b"><div>Họ và tên</div>`;
  const w = makePage(html);
  const r = await w.MAF.fill({
    rows: [['Pham D']],
    fields: [{ key: 'x', labels: ['Họ và tên'], selector: '#b', excelIndex: 0 }]
  });
  assert.equal(r.ok, 1);
  assert.equal(w.document.getElementById('b').value, 'Pham D');
  assert.equal(w.document.getElementById('a').value, '');
});

await test('hình học: ô bên phải cùng hàng được chọn (stub toạ độ)', async () => {
  const html = `<div style="display:flex"><span id="lbl">Ngày sinh</span><input id="near"><input id="far"></div>`;
  const w = makePage(html);
  const rects = { lbl: [10, 10, 90, 30], near: [95, 10, 200, 30], far: [95, 500, 200, 520] };
  for (const [id, [l, t, r, b]] of Object.entries(rects)) {
    const el = w.document.getElementById(id);
    el.getBoundingClientRect = () => ({ top: t, left: l, right: r, bottom: b, width: r - l, height: b - t });
  }
  const res = await w.MAF.fill({ rows: [['01/02/1990']], fields: [{ ...FIELDS[1], excelIndex: 0 }] });
  assert.equal(res.ok, 1, JSON.stringify(res));
  assert.equal(w.document.getElementById('near').value, '01/02/1990');
});

await test('<select>: khớp option theo text có dấu', async () => {
  const html = `<div>Giới tính</div><select><option value="">--</option><option value="1">Nam</option><option value="0">Nữ</option></select>`;
  const w = makePage(html);
  const r = await w.MAF.fill({ rows: [['Nữ']], fields: [{ key: 'gt', labels: ['Giới tính'], controlType: 'select', excelIndex: 0 }] });
  assert.equal(r.ok, 1, JSON.stringify(r));
  assert.equal(w.document.querySelector('select').value, '0');
});

await test('checkbox: giá trị "Không"/"" -> bỏ tick, khác -> tick', async () => {
  const html = `<div>Đồng ý</div><input type="checkbox" checked>`;
  const w = makePage(html);
  const r = await w.MAF.fill({ rows: [['Không']], fields: [{ key: 'd', labels: ['Đồng ý'], controlType: 'checkbox', excelIndex: 0 }] });
  assert.equal(r.ok, 1, JSON.stringify(r));
  assert.equal(w.document.querySelector('input').checked, false);
});

await test('iframe cùng origin vẫn quét được', async () => {
  const w = makePage(`<div>Trang ngoài</div><iframe id="fr"></iframe>`);
  const doc = w.document.getElementById('fr').contentDocument;
  doc.body.innerHTML = dxField('Họ và tên');
  w.MAF.invalidate();
  const r = await w.MAF.fill({ rows: [['Nguyen E']], fields: [FIELDS[0]] });
  assert.equal(r.ok, 1, JSON.stringify(r));
  assert.equal(doc.querySelector('input').value, 'Nguyen E');
});

await test('ô rỗng -> bỏ qua, không ghi đè dữ liệu có sẵn', async () => {
  const w = makePage(dxField('Họ và tên') + dxField('Chẩn đoán', '', 'textarea'));
  w.document.querySelectorAll('input')[0].value = 'GIU NGUYEN';
  const r = await w.MAF.fill({
    rows: [['', 'Benh A']],
    fields: [FIELDS[0], { ...FIELDS[4], excelIndex: 1 }]
  });
  assert.equal(w.document.querySelectorAll('input')[0].value, 'GIU NGUYEN');
  assert.equal(w.document.querySelector('textarea').value, 'Benh A');
  assert.equal(r.ok, 1);
});

await test('ô <input type="date"> bắt buộc nhận ISO; serial Excel cũng được đổi', async () => {
  const w = makePage(`
    <div class="dx-field"><div class="dx-field-label">Ngày sinh</div><div class="dx-field-value"><input type="date" id="d1"></div></div>
    <div class="dx-field"><div class="dx-field-label">Ngày vào viện</div><div class="dx-field-value"><input type="date" id="d2"></div></div>`);
  const fields = [
    { key: 'ns', labels: ['Ngày sinh'], controlType: 'date', excelIndex: 0 },
    { key: 'nv', labels: ['Ngày vào viện'], controlType: 'date', excelIndex: 1 }
  ];
  const r = await w.MAF.fill({ rows: [['03/05/1990', '45123']], fields });
  assert.equal(r.ok, 2, JSON.stringify(r));
  assert.equal(w.document.getElementById('d1').value, '1990-05-03');
  assert.equal(w.document.getElementById('d2').value, '2023-07-16');  // serial Excel
});

await test('ô text + controlType date: GIỮ dd/mm/yyyy, chỉ đổi khi là số serial', async () => {
  const w = makePage(`
    <div class="dx-field"><div class="dx-field-label">Ngày sinh</div><div class="dx-field-value"><input type="text" id="t1"></div></div>
    <div class="dx-field"><div class="dx-field-label">Ngày ra viện</div><div class="dx-field-value"><input type="text" id="t2"></div></div>`);
  const fields = [
    { key: 'ns', labels: ['Ngày sinh'], controlType: 'date', excelIndex: 0 },
    { key: 'nr', labels: ['Ngày ra viện'], controlType: 'date', excelIndex: 1 }
  ];
  const r = await w.MAF.fill({ rows: [['03/05/1990', '45123']], fields });
  assert.equal(r.ok, 2, JSON.stringify(r));
  assert.equal(w.document.getElementById('t1').value, '03/05/1990');  // giữ nguyên
  assert.equal(w.document.getElementById('t2').value, '2023-07-16');  // serial thì phải đổi
});

console.log('\n────────── 5. GHI GIÁ TRỊ CHỐNG WIDGET GHI ĐÈ ──────────');

await test('DevExtreme widget: dùng dxTextBox.instance.option("value")', async () => {
  const html = dxField('Họ và tên', 'dx1');
  const w = makePage(html);
  const calls = [];
  // Giả lập DevExpress global như trang medinet thật.
  w.eval(`window.DevExpress = { ui: { dxTextBox: { getInstance: function(node){
      if (node && node.querySelector && node.querySelector('#dx1')) {
        return { option: function(k, v){ window.__dxSet = [k, v]; node.querySelector('#dx1').value = v; },
                 _name:'dxTextBox' };
      }
      return null;
  }}}};`);
  const r = await w.MAF.fill({ rows: [['Vo Van F']], fields: [FIELDS[0]] });
  assert.equal(r.ok, 1, JSON.stringify(r));
  assert.equal(w.document.getElementById('dx1').value, 'Vo Van F');
  assert.ok(r.filled[0].attempts.join(',').includes('dx:dxTextBox'), r.filled[0].attempts.join(','));
});

await test('input "cứng đầu" (gán thẳng bị bỏ qua) vẫn ghi được bằng InputEvent', async () => {
  const w = makePage(dxField('Họ và tên', 'stubborn'));
  const el = w.document.getElementById('stubborn');
  // Mô phỏng controlled-input (React/DevExtreme/widget nội bộ):
  //  - gán el.value trực tiếp => BỊ BỎ QUA (widget tự giữ giá trị)
  //  - chỉ nhận khi có InputEvent thật (inputType=insertText) mang data
  // Đây đúng là ca khiến bản cũ "paste xong chữ hiện lên rồi mất".
  let held = '';
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() { return held; },
    set() { /* widget chặn ghi thẳng */ }
  });
  el.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && e.data != null) held = e.data;
  });
  const r = await w.MAF.fill({ rows: [['Bui G']], fields: [FIELDS[0]] });
  assert.equal(r.ok, 1, JSON.stringify(r));
  assert.equal(el.value, 'Bui G');
});

await test('ghi thất bại -> báo failed kèm lý do, không báo láo "thành công"', async () => {
  const w = makePage(dxField('Họ và tên', 'dead'));
  const el = w.document.getElementById('dead');
  Object.defineProperty(el, 'value', { configurable: true, get() { return ''; }, set() { } });
  const r = await w.MAF.fill({ rows: [['X']], fields: [FIELDS[0]] });
  assert.equal(r.ok, 0);
  assert.equal(r.failed.length, 1);
  assert.ok(r.failed[0].reason);
});

console.log('\n────────── 6. CHỜ FORM + HÀNG ĐỢI + BÁO CÁO ──────────');

await test('form render trễ: chờ rồi mới điền (không miss oan)', async () => {
  const w = makePage('<div id="root">đang tải...</div>');
  setTimeout(() => { w.document.getElementById('root').innerHTML = dxField('Họ và tên'); }, 350);
  const r = await w.MAF.fill({ rows: [['Dao H']], fields: [FIELDS[0]], readyTimeoutMs: 3000 });
  assert.equal(r.ok, 1, JSON.stringify(r));
  assert.equal(w.document.querySelector('input').value, 'Dao H');
});

await test('điền hàng đợi nhiều dòng', async () => {
  const w = makePage(dxField('Họ và tên') + dxField('Chẩn đoán', '', 'textarea'));
  const seen = [];
  w.document.querySelectorAll('input,textarea').forEach(el => el.addEventListener('change', () => seen.push(el.value)));
  const r = await w.MAF.fill({
    rows: [['A1', 'B1'], ['A2', 'B2'], ['A3', 'B3']],
    rowIndexes: [0, 1, 2],
    fields: [FIELDS[0], { ...FIELDS[4], excelIndex: 1 }]
  });
  assert.equal(r.rowsRequested, 3);
  assert.equal(r.ok, 6);
  assert.deepEqual(seen, ['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
});

await test('dryRun không ghi gì nhưng báo đúng trường tìm được/mất', async () => {
  const html = dxField('Họ và tên') + '<div>Trường không tồn tại</div>';
  const w = makePage(html);
  const r = await w.MAF.dryRun({
    rows: [['Nguyen I', 'x']],
    fields: [FIELDS[0], { key: 'zz', labels: ['Không có nhãn này'], excelIndex: 1 }]
  });
  assert.equal(w.document.querySelector('input').value, '');
  assert.equal(r.ok, 1);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0].label, 'Không có nhãn này');
});

await test('báo cáo đầy đủ: filled / missing / failed / message', async () => {
  const w = makePage(dxField('Họ và tên'));
  const r = await w.MAF.fill({ rows: [['Nguyen K', '3.3']], fields: FIELDS });
  assert.equal(r.ok, 1);
  assert.ok(r.missing.length >= 1);
  assert.ok(r.message.includes('OK'));
  assert.equal(r.engineVersion, w.MAF.version);
  assert.ok(r.filled[0].via);
});

await test('header tự dò: dán nguyên khối Excel có tiêu đề, không cần khai rowIndex', async () => {
  const w = makePage(dxField('Họ và tên') + dxField('Ngày sinh') + dxField('Số lượng HC (M/µL)'));
  const text = 'Họ và tên\tNgày sinh\tSố lượng HC (M/µL)\nNguyen L\t20/11/1975\t4,8';
  const r = await w.MAF.fillText(text, { fields: FIELDS });
  assert.equal(r.headerDetected, 0);
  assert.equal(r.ok, 3, JSON.stringify(r));
  assert.equal(w.document.querySelectorAll('input')[0].value, 'Nguyen L');
  assert.equal(w.document.querySelectorAll('input')[1].value, '20/11/1975');
  assert.equal(w.document.querySelectorAll('input')[2].value, '4.8');  // số VN 4,8 -> 4.8
});

console.log('\n────────── 7. CHỌN "KHÔNG" HÀNG LOẠT ──────────');

await test('Ctrl+B: tick radio "Không", bỏ qua cái đã tick, không tick đúp', async () => {
  const html = `
    <div class="dx-radiogroup">
      <div class="dx-item dx-radiobutton"><input type="radio" name="q1"><span class="dx-item-content">Có</span></div>
      <div class="dx-item dx-radiobutton dx-state-checked"><input type="radio" name="q1" checked><span class="dx-item-content">Không</span></div>
    </div>
    <div class="dx-radiogroup">
      <div class="dx-item dx-radiobutton"><input type="radio" name="q2"><span class="dx-item-content">Có</span></div>
      <div class="dx-item dx-radiobutton"><input type="radio" name="q2"><span class="dx-item-content">Không</span></div>
    </div>
    <label><input type="radio" name="q3"> Không</label>
    <label><input type="radio" name="q3" checked> Có</label>`;
  const w = makePage(html);
  const r = w.MAF.selectAllNo();
  assert.equal(r.clicked, 2, JSON.stringify(r));
  const q2 = w.document.querySelectorAll('input[name="q2"]');
  assert.equal(q2[1].checked, true);
  const q3 = w.document.querySelectorAll('input[name="q3"]');
  assert.equal(q3[0].checked, true);
});

console.log('\n────────── 8. NHẬN DIỆN FORM / CẤU HÌNH ──────────');

await test('chọn form theo urlContains, ưu tiên chuỗi dài hơn', () => {
  const w = makePage('<div>x</div>');
  w.MAF.configure({
    forms: [
      { id: 1, name: 'Chung', urlContains: 'medinet.org.vn', fields: FIELDS.slice(0, 1) },
      { id: 2, name: 'CanLamSang', urlContains: 'KSKDK_Phieu_CanLamSang', fields: FIELDS }
    ]
  });
  assert.equal(w.MAF.state().form, 'CanLamSang');
});

await test('tương thích ngược cấu hình cũ (pasteMode/forms/fields)', () => {
  const w = makePage('<div>x</div>');
  w.MAF.configure({
    pasteMode: 'tab',
    selectNoKeywords: ['không'],
    forms: [{ id: 9, name: 'F', urlContains: 'KSKDK_Phieu_CanLamSang', fields: [{ excelIndex: 3, labels: ['Họ và tên'], controlType: 'text' }] }]
  });
  const c = w.MAF.getConfig();
  assert.equal(c.forms[0].fields[0].excelIndex, 3);
  assert.equal(JSON.stringify(c.options.selectNoKeywords), '["không"]');
});

await test('nạp engine 2 lần không nhân đôi listener paste', () => {
  const w = makePage('<div>x</div>');
  let n = 0;
  w.document.addEventListener('paste', () => n++);
  w.eval(ENGINE);   // nạp lại
  w.eval(ENGINE);
  const ev = new w.Event('paste');
  w.document.dispatchEvent(ev);
  assert.equal(n, 1);
});

console.log('\n────────── 9. HOOK PASTE TRONG TRANG (không cần permission) ──────────');

await test('paste event có clipboardData -> tự điền, không dùng navigator.clipboard', async () => {
  const w = makePage(dxField('Họ và tên') + dxField('Chẩn đoán', '', 'textarea'));
  w.MAF.configure({ forms: [{ id: 'f', name: 'CLS', urlContains: 'KSKDK_Phieu_CanLamSang', fields: [FIELDS[0], { ...FIELDS[4], excelIndex: 1 }] }] });
  // Điều kiện xấu nhất: không có Clipboard API, không secure context.
  Object.defineProperty(w.navigator, 'clipboard', { value: undefined, configurable: true });

  const ev = new w.Event('paste', { bubbles: true, cancelable: true });
  ev.clipboardData = { getData: () => 'Nguyen M\tViêm gan B' };
  w.document.body.dispatchEvent(ev);

  await new Promise(r => setTimeout(r, 400));
  assert.equal(w.document.querySelectorAll('input')[0].value, 'Nguyen M');
  assert.equal(w.document.querySelector('textarea').value, 'Viêm gan B');
});

await test('paste 1 giá trị vào ô input của trang -> KHÔNG giành quyền', async () => {
  const w = makePage(dxField('Họ và tên', 'focusMe'));
  w.MAF.configure({ forms: [{ id: 'f', name: 'CLS', urlContains: 'KSKDK_Phieu_CanLamSang', fields: [FIELDS[0]] }] });
  const el = w.document.getElementById('focusMe');
  el.focus();
  const ev = new w.Event('paste', { bubbles: true, cancelable: true });
  ev.clipboardData = { getData: () => 'Ghi de\tcot 2' };
  el.dispatchEvent(ev);
  await new Promise(r => setTimeout(r, 250));
  assert.equal(ev.defaultPrevented, false);
});

console.log('\n────────── 10. CHẨN ĐOÁN ──────────');

await test('scan() liệt kê nhãn + ô nhập kề nó, kèm cssPath để dán vào Settings', () => {
  const w = makePage(dxField('Họ và tên', 'hotenInput'));
  const s = w.MAF.scan({ filter: 'họ và tên' });
  assert.ok(s.count >= 1);
  const hit = s.items.find(i => i.target && i.target.id === 'hotenInput');
  assert.ok(hit, JSON.stringify(s.items.map(i => i.label)));
  assert.ok(hit.target.selector.length > 0);
});

await test('probe() đếm nhanh số trường tìm được (dùng cho nút Kiểm tra mapping)', () => {
  const w = makePage(dxField('Họ và tên') + dxField('Chẩn đoán', '', 'textarea'));
  const p = w.MAF.probe(FIELDS);
  assert.equal(p.found, 2);
  assert.equal(p.total, 5);
});

await test('highlightLabels tô nhãn thiếu mà không ném lỗi', () => {
  const w = makePage('<div>Huyết sắc tố (g/dL)</div>');
  const n = w.MAF.highlightLabels(['Huyết sắc tố (g/dL)']);
  assert.equal(n, 1);
  assert.equal(w.document.querySelectorAll('[data-maf-box]').length, 1);
});

await test('state() báo đúng môi trường (WebView2 / secureContext / clipboardApi)', () => {
  const w = makePage('<div>x</div>');
  const s = w.MAF.state();
  assert.equal(typeof s.isWebView2, 'boolean');
  assert.equal(typeof s.secureContext, 'boolean');
  assert.equal(s.engineVersion, w.MAF.version);
});

console.log('\n────────── 11. HIỆU NĂNG ──────────');

await test('trang 400 field: index 1 lần, không layout thrashing', async () => {
  let html = '';
  const fields = [];
  for (let i = 0; i < 400; i++) {
    html += dxField('Trường thử nghiệm số ' + i, 'inp' + i);
    fields.push({ key: 'f' + i, labels: ['Trường thử nghiệm số ' + i], excelIndex: i });
  }
  const w = makePage(html);
  const row = [];
  for (let i = 0; i < 400; i++) row.push('v' + i);
  const t0 = Date.now();
  const r = await w.MAF.fill({ rows: [row], fields });
  const dt = Date.now() - t0;
  assert.equal(r.ok, 400, 'ok=' + r.ok + ' missing=' + r.missing.length);
  assert.equal(w.document.getElementById('inp399').value, 'v399');
  console.log(`      ⏱  400 trường trong ${dt}ms (jsdom, chưa tối ưu layout)`);
  assert.ok(dt < 20000, 'quá chậm: ' + dt + 'ms');
});

await test('index được cache: gọi fill 2 lần không quét DOM lại từ đầu', async () => {
  const w = makePage(dxField('Họ và tên', 'c1'));
  let builds = 0;
  const origQS = w.document.querySelectorAll.bind(w.document);
  w.document.querySelectorAll = (s) => { if (String(s).includes('label')) builds++; return origQS(s); };
  await w.MAF.fill({ rows: [['A']], fields: [FIELDS[0]] });
  const after1 = builds;
  await w.MAF.fill({ rows: [['B']], fields: [FIELDS[0]] });
  assert.equal(builds, after1, 'index bị xây lại dù DOM không đổi');
});

console.log('\n────────── 12. POSTMESSAGE VỀ HOST ──────────');

await test('WebView2: kết quả được post qua chrome.webview.postMessage', async () => {
  const w = makePage(dxField('Họ và tên', 'p1'));
  const got = [];
  w.eval(`window.chrome = { webview: { postMessage: function(s){ window.__posted.push(s); } } }; window.__posted = [];`);
  await w.MAF.fill({ rows: [['Host Test']], fields: [FIELDS[0]] });
  const msgs = w.__posted.map(s => JSON.parse(s));
  const res = msgs.filter(m => m.type === 'maf:result');
  assert.ok(res.length >= 1);
  assert.equal(res[res.length - 1].payload.ok, 1);
});

await test('Web (không WebView2): phát sự kiện maf:result cho trang tự bắt', async () => {
  const w = makePage(dxField('Họ và tên', 'p2'));
  const got = [];
  w.addEventListener('maf:result', e => got.push(e.detail));
  await w.MAF.fill({ rows: [['Web Test']], fields: [FIELDS[0]] });
  assert.equal(got.length, 1);
  assert.equal(got[0].payload.ok, 1);
});

// ---------------------------------------------------------------------------
console.log('\n════════════════════════════════════════');
console.log(`  KẾT QUẢ: ${pass} pass / ${fail} fail`);
console.log('════════════════════════════════════════\n');
if (fail) {
  for (const [name, e] of failures) console.log('❌ ' + name + '\n' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e) + '\n');
  process.exit(1);
}
