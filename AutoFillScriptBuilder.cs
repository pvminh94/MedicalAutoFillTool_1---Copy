using System.Text.Json;

namespace MedicalAutoFillTool;

/// <summary>
/// Sinh ra mã JavaScript chung, hoàn toàn điều khiển bởi AppConfig.
/// Khi web đổi label / thêm trường, chỉ cần sửa cấu hình trong giao diện Cài đặt - không cần sửa code.
/// </summary>
public static class AutoFillScriptBuilder
{
    public static string Build(AppConfig config)
    {
        var configJson = JsonSerializer.Serialize(config, AppJson.Options);
        return Template.Replace("__CONFIG_JSON__", configJson);
    }

    private const string Template = @"
(function () {
  // Đã nạp rồi trong trang này thì chỉ cập nhật cấu hình (tránh trùng listener sau khi lưu Cài đặt).
  if (window.__MAF_api) { window.__MAF_api.setConfig(__CONFIG_JSON__); return; }

  var CONFIG = __CONFIG_JSON__;

  function setConfig(newConfig) { CONFIG = newConfig; console.log('[MAF] Đã cập nhật cấu hình.'); }

  // ---- Nhận diện form đang mở theo URL ----
  function activeForm() {
    var url = location.href || '';
    var found = null;
    (CONFIG.forms || []).forEach(function (f) {
      if (f.urlContains && url.indexOf(f.urlContains) >= 0) found = f;
    });
    return found;
  }

  // ---- Tìm ô nhập theo nhãn hiển thị (label) ----
  function findInputByVisualLabel(labelConfig) {
    var keys = (Array.isArray(labelConfig) ? labelConfig : [labelConfig]).map(function (l) { return String(l).toLowerCase().trim(); });
    var els = Array.prototype.slice.call(document.querySelectorAll('label, span, div, td, th, p, b, strong'));
    var matches = els.filter(function (el) {
      var t = el.innerText ? el.innerText.toLowerCase().trim() : '';
      return keys.indexOf(t) >= 0;
    });
    if (matches.length === 0) return null;

    var targetLabel = matches[matches.length - 1];
    var container = targetLabel.closest('.dx-field, .form-group, .row, div') || targetLabel.parentElement;
    var input = container ? container.querySelector('input:not([type=""hidden""]), textarea') : null;

    if (!input) {
      var lr = targetLabel.getBoundingClientRect();
      var inputs = Array.prototype.slice.call(document.querySelectorAll('input:not([type=""hidden""]), textarea'));
      var best = null, min = Infinity;
      inputs.forEach(function (inp) {
        var ir = inp.getBoundingClientRect();
        var below = ir.top >= lr.bottom - 10 && ir.top <= (lr.bottom + 60) && ir.left >= (lr.left - 20) && ir.left <= (lr.left + 80);
        if (below) { var d = Math.abs(ir.top - lr.bottom); if (d < min) { min = d; best = inp; } }
      });
      input = best;
    }
    return input;
  }

  function setValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ---- Điền dữ liệu từ clipboard (Excel) ----
  function fillFromClipboard() {
    var form = activeForm();
    if (!form) { console.warn('[MAF] Không nhận diện form cho URL này. Vào Cài đặt thêm cấu hình.'); return; }
    var sep = CONFIG.pasteMode === 'comma' ? ',' : '\t';
    navigator.clipboard.readText().then(function (text) {
      if (!text) return;
      if (text.indexOf(sep) < 0 && text.indexOf('\n') < 0) return;
      var rows = text.split(/\r?\n/).map(function (r) { return r.split(sep); });
      var data = rows[0];
      var ok = 0, miss = 0;
      (form.fields || []).forEach(function (f) {
        var raw = data[f.excelIndex];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        var inp = findInputByVisualLabel(f.labels);
        if (inp) { setValue(inp, String(raw).trim()); ok++; } else miss++;
      });
      console.log('[MAF] Đã điền ' + ok + ' trường' + (miss ? ' (bỏ qua ' + miss + ' chưa tìm được)' : '') + '.');
    }).catch(function (e) { console.error('[MAF] Lỗi đọc clipboard:', e); });
  }

  // ---- Tự động chọn radio tương ứng Khong - Hau nhu khong ----
  function selectAllNo() {
    var n = 0;
    var keywords = (CONFIG.selectNoKeywords || []).map(function (k) { return String(k).toLowerCase().trim(); });
    Array.prototype.slice.call(document.querySelectorAll('.dx-item-content, .dx-list-item-content, span, label')).forEach(function (el) {
      if (!el.innerText) return;
      var t = el.innerText.trim().toLowerCase();
      if (keywords.indexOf(t) >= 0) {
        var container = el.closest('.dx-radio-button, .dx-item, td, tr') || el.parentElement;
        var radio = container ? container.querySelector('input[type=""radio""]') : null;
        if (radio) {
          if (!radio.checked) {
            radio.click(); radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            n++;
          }
        } else {
          var clickable = (container ? container.querySelector('.dx-radio, .dx-radio-value-container') : null) || el;
          var isChecked = container && (container.getAttribute('aria-checked') === 'true' || container.classList.contains('dx-state-checked'));
          if (!isChecked) { clickable.click(); n++; }
        }
      }
    });
    console.log('[MAF] Đã chọn ""Không"" cho ' + n + ' mục.');
  }

  window.addEventListener('paste', function (e) {
    setTimeout(fillFromClipboard, 0);
  });

  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault(); selectAllNo();
    }
  });

  window.__MAF_api = { setConfig: setConfig, selectAllNo: selectAllNo, fillFromClipboard: fillFromClipboard };
  console.log('[MAF] Tiện ích tự động đã sẵn sàng.');
})();
";
}