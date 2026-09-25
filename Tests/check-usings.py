#!/usr/bin/env python3
"""
Bắt lỗi CS0246 do THIẾU `using` cho các namespace KHÔNG nằm trong implicit usings.

Vì sao cần: project bật <ImplicitUsings>enable</ImplicitUsings>, nên System,
System.Collections.Generic, System.IO, System.Linq, System.Net.Http,
System.Threading, System.Threading.Tasks (và System.Drawing + System.Windows.Forms
khi UseWindowsForms=true) đều có sẵn mà không cần khai. Người viết rất dễ TƯỞNG
nhầm rằng các namespace khác cũng tự có — ví dụ lỗi thật đã gặp:

    AutoFillScriptBuilder.cs
      using System.Text.Json.Serialization;      <-- chỉ có Serialization
      ... JsonSerializer.Serialize(...)          <-- JsonSerializer ở System.Text.Json
      => CS0246 'JsonSerializer' could not be found

Bộ kiểm tra ngoặc/chuỗi không thấy được lỗi này vì file vẫn cân bằng.

Cách dùng:
    python3 Tests/check-usings.py                 # quét project WinForms gốc + MedinetBridge
    python3 Tests/check-usings.py --sdk web DIR   # dùng bảng implicit usings của Web SDK
Thoát 0 = sạch, 1 = có lỗi.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Implicit usings theo SDK (nguồn: Microsoft.NET.Sdk / Microsoft.NET.Sdk.Web)
# ---------------------------------------------------------------------------
IMPLICIT_BASE = {
    'System', 'System.Collections.Generic', 'System.IO', 'System.Linq',
    'System.Net.Http', 'System.Threading', 'System.Threading.Tasks',
}
IMPLICIT_WINFORMS = IMPLICIT_BASE | {'System.Drawing', 'System.Windows.Forms'}
IMPLICIT_WEB = IMPLICIT_BASE | {
    'System.Net.Http.Json', 'Microsoft.AspNetCore.Builder', 'Microsoft.AspNetCore.Hosting',
    'Microsoft.AspNetCore.Http', 'Microsoft.AspNetCore.Routing', 'Microsoft.Extensions.Configuration',
    'Microsoft.Extensions.DependencyInjection', 'Microsoft.Extensions.Hosting', 'Microsoft.Extensions.Logging',
}

# Namespace KHÔNG implicit -> kiểu nào thuộc nó, nhận diện bằng regex
NEED = {
    'System.Text.Json': [r'\bJsonSerializer\b', r'\bJsonDocument\b', r'\bJsonElement\b',
                         r'\bJsonNamingPolicy\b', r'\bJsonValueKind\b', r'\bJsonException\b',
                         r'\bJsonSerializerOptions\b', r'\bUtf8JsonWriter\b'],
    'System.Text.Json.Serialization': [r'\bJsonPropertyName\b', r'\bJsonIgnore\b',
                                       r'\bJsonIgnoreCondition\b', r'\bJsonStringEnumConverter\b',
                                       r'\bJsonNumberHandling\b', r'\bJsonConverter\b'],
    'System.Text': [r'\bStringBuilder\b', r'\bEncoding\b'],
    'System.Text.RegularExpressions': [r'\bRegex\b', r'\bRegexOptions\b'],
    'System.Globalization': [r'\bCultureInfo\b', r'\bNumberStyles\b', r'\bDateTimeStyles\b'],
    'System.Diagnostics': [r'\bProcess\.', r'\bProcessStartInfo\b', r'\bStopwatch\b',
                           r'\bFileVersionInfo\b', r'\bActivity\b'],
    'System.Reflection': [r'\bAssembly\.', r'\bBindingFlags\b', r'\bMethodInfo\b',
                          r'\bPropertyInfo\b', r'\bFieldInfo\b'],
    'System.Runtime.InteropServices': [r'\bDllImport\b', r'\bMarshal\.', r'\bStructLayout\b',
                                       r'\bCharSet\b', r'\bCallingConvention\b', r'\bGCHandle\b'],
    'System.ComponentModel': [r'\bISupportInitialize\b', r'\bIContainer\b', r'\bTypeDescriptor\b',
                              r'\bBackgroundWorker\b'],
    'System.Net': [r'\bHttpStatusCode\b', r'\bWebException\b', r'\bIPAddress\b', r'\bIPEndPoint\b'],
    'System.Data': [r'\bConnectionState\b', r'\bDataTable\b', r'\bDataRow\b'],
    'System.Data.Common': [r'\bDbConnection\b', r'\bDbCommand\b', r'\bDbDataReader\b'],
    'Microsoft.Web.WebView2.Core': [r'\bCoreWebView2\w*\b'],
    'Microsoft.Web.WebView2.WinForms': [r'\bWebView2\b'],
    'Microsoft.EntityFrameworkCore': [r'\bDbContext\b', r'\bDbSet\b', r'\bEntityState\b',
                                      r'\.Include\(', r'\bAsNoTracking\b'],
    'Microsoft.AspNetCore.Mvc': [r'\bIActionResult\b', r'\bHttpGet\b', r'\bHttpPost\b',
                                 r'\bFromBody\b', r'\bContentResult\b', r'\bJsonResult\b'],
}


def scan_file(path, implicit):
    raw = open(path, encoding='utf-8-sig').read()
    usings = set(re.findall(r'^\s*using\s+(?:static\s+)?([\w\.]+)\s*;', raw, re.M))

    # Bỏ comment và chuỗi để không đếm "JsonSerializer" trong text/log
    body = re.sub(r'/\*.*?\*/', '', raw, flags=re.S)
    body = re.sub(r'//[^\n]*', '', body)
    body = re.sub(r'"(?:\\.|[^"\\])*"', '""', body)
    body = re.sub(r"'(?:\\.|[^'\\])'", "'x'", body)

    problems = []
    for ns, pats in NEED.items():
        if ns in usings or ns in implicit:
            continue
        lines = []
        for pat in pats:
            for h in re.finditer(pat, body):
                pre = body[max(0, h.start() - 45):h.start()]
                # Đã fully-qualify (System.Text.Json.JsonSerializer...) thì hợp lệ
                if re.search(r'\b(System|Microsoft|global)[\w\.]*\.$', pre.rstrip()):
                    continue
                if pre.rstrip().endswith('.'):
                    continue
                lines.append(body[:h.start()].count('\n') + 1)
        if lines:
            problems.append((ns, sorted(set(lines))))
    return problems


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sdk = 'winforms'
    for a in sys.argv[1:]:
        if a.startswith('--sdk'):
            sdk = a.split('=', 1)[1] if '=' in a else 'web'
    implicit = IMPLICIT_WINFORMS if sdk == 'winforms' else IMPLICIT_WEB if sdk == 'web' else IMPLICIT_BASE

    if args:
        targets = []
        for a in args:
            p = a if os.path.isabs(a) else os.path.join(os.getcwd(), a)
            targets += glob.glob(os.path.join(p, '**', '*.cs'), recursive=True) if os.path.isdir(p) else [p]
    else:
        # Mặc định: project WinForms ở thư mục gốc + MedinetBridge (cùng SDK profile).
        targets = glob.glob(os.path.join(ROOT, '*.cs'))
        targets += glob.glob(os.path.join(ROOT, 'MedinetBridge', '*.cs'))

    targets = [t for t in sorted(set(targets)) if os.sep + 'obj' + os.sep not in t and os.sep + 'bin' + os.sep not in t]

    bad = 0
    for t in targets:
        probs = scan_file(t, implicit)
        rel = os.path.relpath(t, ROOT)
        if probs:
            bad += 1
            for ns, lines in probs:
                print(f'❌ {rel}: thiếu "using {ns};" — dùng ở dòng {lines[:6]}'
                      f'{" ..." if len(lines) > 6 else ""}')
        else:
            print(f'✅ {rel}')

    print(f'\nTổng: {len(targets)} file ({sdk}), {bad} file thiếu using.')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
