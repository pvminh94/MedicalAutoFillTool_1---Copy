using System.Text.Json;
using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Services;

public class ScriptBuilderService
{
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public string BuildAutoFillScript(List<FormProfile> forms)
    {
        var configObj = new
        {
            pasteMode = "tab",
            selectNoKeywords = new[] { "không", "hầu như không", "không nhớ rõ", "không có", "bình thường", "không rõ" },
            forms = forms.Select(f => new
            {
                id = f.Id,
                name = f.Name,
                urlContains = f.UrlContains,
                fields = f.Fields.Select(m => new
                {
                    excelIndex = m.ExcelIndex,
                    labels = m.Labels,
                    controlType = m.ControlType
                }).ToList()
            }).ToList()
        };

        var configJson = JsonSerializer.Serialize(configObj, _jsonOptions);

        return $@"
(function() {{
  if (window.__MAF_api) {{ window.__MAF_api.setConfig({configJson}); return; }}
  var CONFIG = {configJson};

  function setConfig(newConfig) {{ CONFIG = newConfig; console.log('[MAF] Đã cập nhật cấu hình.'); }}

  // ====== NHẬN DIỆN FORM ======
  function activeForm() {{
    var url = location.href || '';
    var found = null;
    (CONFIG.forms || []).forEach(function(f) {{
      if (f.urlContains && url.indexOf(f.urlContains) >= 0) found = f;
    }});
    return found;
  }}

  // ====== TÌM Ô NHẬP THEO LABEL ======
  function findInputByVisualLabel(labelConfig) {{
    var keys = (Array.isArray(labelConfig) ? labelConfig : [labelConfig]).map(function(l) {{ return String(l).toLowerCase().trim(); }});
    var els = Array.prototype.slice.call(document.querySelectorAll('label, span, div, td, th, p, b, strong'));
    var matches = els.filter(function(el) {{
      var t = el.innerText ? el.innerText.toLowerCase().trim() : '';
      return keys.indexOf(t) >= 0;
    }});
    if (matches.length === 0) return null;
    var targetLabel = matches[matches.length - 1];
    var container = targetLabel.closest('.dx-field, .form-group, .row, div') || targetLabel.parentElement;
    var input = container ? container.querySelector('input:not([type=""hidden""]), textarea') : null;
    if (!input) {{
      var lr = targetLabel.getBoundingClientRect();
      var inputs = Array.prototype.slice.call(document.querySelectorAll('input:not([type=""hidden""]), textarea'));
      var best = null, min = Infinity;
      inputs.forEach(function(inp) {{
        var ir = inp.getBoundingClientRect();
        var below = ir.top >= lr.bottom - 10 && ir.top <= (lr.bottom + 60) && ir.left >= (lr.left - 20) && ir.left <= (lr.left + 80);
        if (below) {{ var d = Math.abs(ir.top - lr.bottom); if (d < min) {{ min = d; best = inp; }} }}
      }});
      input = best;
    }}
    return input;
  }}

  function setValue(input, value) {{
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
    input.dispatchEvent(new Event('change', {{ bubbles: true }}));
    input.dispatchEvent(new Event('blur', {{ bubbles: true }}));
  }}

  // ====== PASTE TỪ CLIPBOARD ======
  function fillFromClipboard() {{
    var form = activeForm();
    if (!form) {{ console.warn('[MAF] Không nhận diện form.'); return; }}
    var sep = '\t';
    
    navigator.clipboard.readText().then(function(text) {{
      if (!text) return;
      var rows = text.split(/\r?\n/).map(function(r) {{ return r.split(sep); }});
      var data = rows[0];
      if (data.length <= 1) {{ fillSingleValue(text); return; }}
      var ok = 0, miss = 0;
      (form.fields || []).forEach(function(f) {{
        var raw = data[f.excelIndex];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        var inp = findInputByVisualLabel(f.labels);
        if (inp) {{ setValue(inp, String(raw).trim()); ok++; }} else miss++;
      }});
    }}).catch(function(e) {{
      console.warn('[MAF] Clipboard lỗi, tạo textarea fallback:', e);
      var form = activeForm();
      if (!form) return;
      var ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.left = '0';
      ta.style.top = '0';
      ta.style.width = '100%';
      ta.style.height = '200px';
      ta.style.zIndex = '999999';
      ta.style.fontSize = '16px';
      ta.placeholder = 'PASTE (Ctrl+V) dữ liệu Excel vào đây...';
      document.body.appendChild(ta);
      ta.focus();
      ta.onpaste = function() {{
        setTimeout(function() {{
          var text = ta.value;
          document.body.removeChild(ta);
          if (!text) return;
          var rows = text.split(/\r?\n/).map(function(r) {{ return r.split('\t'); }});
          var data = rows[0];
          var ok = 0, miss = 0;
          (form.fields || []).forEach(function(f) {{
            var raw = data[f.excelIndex];
            if (raw === undefined || raw === null || String(raw).trim() === '') return;
            var inp = findInputByVisualLabel(f.labels);
            if (inp) {{ setValue(inp, String(raw).trim()); ok++; }} else miss++;
          }});
        }}, 100);
      }};
      setTimeout(function() {{ if (ta.parentNode) document.body.removeChild(ta); }}, 15000);
    }});
  }}

  function fillSingleValue(text) {{
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {{
      setValue(el, text.trim());
    }}
  }}

  // ====== CHỌN KHÔNG HÀNG LOẠT ======
  function selectAllNo() {{
    var n = 0;
    var keywords = (CONFIG.selectNoKeywords || []).map(function(k) {{ return String(k).toLowerCase().trim(); }});
    Array.prototype.slice.call(document.querySelectorAll('.dx-item-content, .dx-list-item-content, span, label')).forEach(function(el) {{
      if (!el.innerText) return;
      var t = el.innerText.trim().toLowerCase();
      if (keywords.indexOf(t) >= 0) {{
        var container = el.closest('.dx-radio-button, .dx-item, td, tr') || el.parentElement;
        var radio = container ? container.querySelector('input[type=""radio""]') : null;
        if (radio) {{
          if (!radio.checked) {{ radio.click(); radio.checked = true; radio.dispatchEvent(new Event('change', {{ bubbles: true }})); n++; }}
        }} else {{
          var clickable = (container ? container.querySelector('.dx-radio, .dx-radio-value-container') : null) || el;
          var isChecked = container && (container.getAttribute('aria-checked') === 'true' || container.classList.contains('dx-state-checked'));
          if (!isChecked) {{ clickable.click(); n++; }}
        }}
      }}
    }});
  }}

  // ====== SỰ KIỆN ======
  window.addEventListener('paste', function(e) {{ setTimeout(fillFromClipboard, 10); }});
  window.addEventListener('keydown', function(e) {{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {{ e.preventDefault(); selectAllNo(); }}
  }});

  window.__MAF_api = {{ setConfig: setConfig, selectAllNo: selectAllNo, fillFromClipboard: fillFromClipboard }};
  console.log('[MAF] Sẵn sàng!');
}})();
";
    }
}