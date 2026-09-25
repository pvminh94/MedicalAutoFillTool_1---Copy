#!/usr/bin/env python3
"""
Cổng kiểm tra tổng hợp cho repo — chạy được trên Linux, KHÔNG cần .NET SDK.

Vì sao: repo build trên Windows (WinForms/WebView2) nên sandbox Linux không biên dịch
được. Script này gom mọi lỗi "không cần compiler vẫn bắt được", đúng nhóm lỗi đã
từng làm repo gốc hỏng:
  1. C# mất cân bằng ngoặc / chuỗi chưa đóng          (gọi csharp-syntax-check.py)
  2. csproj tham chiếu file KHÔNG TỒN TẠI             (EmbeddedResource/ApplicationIcon/Content)
     -> lỗi thật đã gặp: project ở thư mục gốc dùng "..\\Shared\\maf-engine.js"
        trỏ ra NGOÀI repo => CS1566 khi build.
  3. JS sai cú pháp                                   (node --check)
  4. JSON không parse được
  5. Shared/default-profiles.json lệch BuiltinProfiles.cs
  6. View .cshtml gọi action không tồn tại trong controller
  7. Engine thiếu hàm mà host (C#/JS) đang gọi

Chạy: python3 Tests/check-all.py
"""
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'bin', 'obj', 'node_modules', '.git', 'dist', 'publish', 'wwwroot/lib'}
FAILS = []
CHECKS = 0


def fail(check, msg):
    FAILS.append(f'[{check}] {msg}')


def walk(exts):
    out = []
    for dp, dn, fn in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT).replace(os.sep, '/')
        dn[:] = [d for d in dn if d not in ('bin', 'obj', 'node_modules', '.git', 'dist', 'publish', 'lib')]
        if rel.startswith('MedicalAutoFillWeb/wwwroot/lib'):
            continue
        for f in fn:
            if any(f.endswith(e) for e in exts):
                out.append(os.path.join(dp, f))
    return sorted(out)


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=isinstance(cmd, str))


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')


# ------------------------------------------------------------------ 1. C#
def check_csharp():
    global CHECKS
    CHECKS += 1
    r = run([sys.executable, os.path.join(ROOT, 'Tests', 'csharp-syntax-check.py')])
    bad = [ln for ln in r.stdout.splitlines() if ln.startswith('❌') or ln.strip().startswith('dòng ')]
    if r.returncode != 0 or bad:
        fail('C#', '\n      ' + '\n      '.join(bad[:20]) if bad else 'csharp-syntax-check.py trả về ' + str(r.returncode))
        return False
    n = len([ln for ln in r.stdout.splitlines() if ln.startswith('✅')])
    print(f'  ✅ C#: {n} file cân bằng ngoặc/chuỗi')
    return True


# ------------------------------------------------------------------ 2. csproj
def check_csproj():
    global CHECKS
    CHECKS += 1
    projects = walk(['.csproj'])
    problems = []
    refs_ok = 0

    for p in projects:
        pdir = os.path.dirname(p)
        try:
            tree = ET.parse(p)
        except ET.ParseError as e:
            problems.append(f'{rel(p)}: XML không parse được — {e}')
            continue

        for el in tree.iter():
            tag = el.tag.split('}')[-1]
            # PackageReference/ProjectReference KHÔNG phải đường dẫn file theo nghĩa này:
            # PackageReference = tên gói NuGet; ProjectReference kiểm tra riêng bên dưới.
            if tag not in ('EmbeddedResource', 'Content', 'None', 'Compile', 'ApplicationIcon', 'ProjectReference'):
                continue

            if tag == 'ApplicationIcon':
                # csproj viết đường dẫn kiểu Windows ("a\b.ico") — phải đổi sang / để
                # kiểm tra được trên Linux.
                path = (el.text or '').strip().replace('\\', '/')
                if path and not os.path.exists(os.path.join(pdir, path)):
                    problems.append(f'{rel(p)}: <ApplicationIcon>{path}</ApplicationIcon> không tồn tại')
                elif path:
                    refs_ok += 1
                continue

            inc = el.get('Include')
            if not inc or '*' in inc:
                continue
            inc = inc.replace('\\', '/')          # đường dẫn Windows -> posix
            target = inc if os.path.isabs(inc) else os.path.normpath(os.path.join(pdir, inc))
            if not os.path.exists(target):
                problems.append(f'{rel(p)}: <{tag} Include="{inc}"> KHÔNG TỒN TẠI '
                                f'(đã thử {os.path.relpath(target, ROOT)})')
            else:
                refs_ok += 1
                # EmbeddedResource phải có LogicalName để host tìm được
                if tag == 'EmbeddedResource':
                    ln = el.find('{%s}LogicalName' % el.tag.split('}')[0].strip('{')) if '}' in el.tag else el.find('LogicalName')
                    if ln is None:
                        problems.append(f'{rel(p)}: EmbeddedResource "{inc}" thiếu <LogicalName> — '
                                        f'host tìm theo tên "maf-engine.js" sẽ không thấy')

    if problems:
        fail('csproj', '\n      ' + '\n      '.join(problems[:20]))
        return False
    print(f'  ✅ csproj: {len(projects)} project, {refs_ok} tham chiếu file đều tồn tại')
    return True


# ------------------------------------------------------------------ 3. JS
def check_js():
    global CHECKS
    CHECKS += 1
    files = walk(['.js', '.mjs'])
    files = [f for f in files if 'node_modules' not in f and os.sep + 'lib' + os.sep not in f]
    bad = []
    for f in files:
        r = run(['node', '--check', f])
        if r.returncode != 0:
            bad.append(f'{rel(f)}: {r.stderr.strip().splitlines()[0] if r.stderr.strip() else "syntax error"}')
    if bad:
        fail('JS', '\n      ' + '\n      '.join(bad[:20]))
        return False
    print(f'  ✅ JS: {len(files)} file qua `node --check`')
    return True


# ------------------------------------------------------------------ 4. JSON
def check_json():
    global CHECKS
    CHECKS += 1
    files = walk(['.json'])
    files = [f for f in files if 'node_modules' not in f and 'package-lock' not in f and os.sep + 'lib' + os.sep not in f]
    bad = []
    for f in files:
        try:
            with open(f, encoding='utf-8-sig') as fh:
                json.load(fh)
        except Exception as e:
            bad.append(f'{rel(f)}: {e}')
    if bad:
        fail('JSON', '\n      ' + '\n      '.join(bad[:20]))
        return False
    print(f'  ✅ JSON: {len(files)} file parse được')
    return True


# ------------------------------------------------------------------ 5. profiles sync
def check_profiles():
    global CHECKS
    CHECKS += 1
    r = run([sys.executable, os.path.join(ROOT, 'Tests', 'generate-default-profiles.py'), '--check'])
    if r.returncode != 0:
        fail('profiles', r.stdout.strip() or r.stderr.strip())
        return False
    print('  ✅ ' + r.stdout.strip().splitlines()[0].replace('✅ ', ''))
    return True


# ------------------------------------------------------------------ 6. view ↔ action
def check_views():
    global CHECKS
    CHECKS += 1
    web = os.path.join(ROOT, 'MedicalAutoFillWeb')
    if not os.path.isdir(web):
        print('  ⏭  bỏ qua kiểm tra view (không có MedicalAutoFillWeb)')
        return True

    # Gom tên action từ controller
    actions = set()
    for f in walk(['.cs']):
        if 'Controllers' not in f:
            continue
        src = open(f, encoding='utf-8-sig').read()
        actions.update(re.findall(r'public\s+(?:async\s+)?(?:Task<)?IActionResult>?\s+(\w+)\s*\(', src))

    # Gom các đường dẫn /Home/Xxx trong view + js
    called = {}
    for f in walk(['.cshtml', '.js']):
        if 'node_modules' in f:
            continue
        src = open(f, encoding='utf-8-sig', errors='replace').read()
        for m in re.finditer(r'/Home/(\w+)', src):
            called.setdefault(m.group(1), set()).add(rel(f))

    missing = {a: fs for a, fs in called.items() if a not in actions}
    if missing:
        lines = [f'{a} ← được gọi trong {", ".join(sorted(fs)[:3])}' for a, fs in sorted(missing.items())]
        fail('view↔action', '\n      ' + '\n      '.join(lines))
        return False
    print(f'  ✅ Web: {len(called)} endpoint được gọi, tất cả đều có action trong controller')
    return True


# ------------------------------------------------------------------ 7. engine API
def check_engine_api():
    global CHECKS
    CHECKS += 1
    engine_path = os.path.join(ROOT, 'Shared', 'maf-engine.js')
    if not os.path.exists(engine_path):
        fail('engine', 'thiếu Shared/maf-engine.js')
        return False
    src = open(engine_path, encoding='utf-8').read()

    # Các hàm engine export ra window.MAF
    exported = set(re.findall(r'^\s{4}(\w+):\s', src, re.MULTILINE))
    exported |= set(re.findall(r'^\s{4}(\w+)\s*:\s*function', src, re.MULTILINE))

    # Host JS gọi MAF.xxx(...)
    used_js = set()
    for f in walk(['.js', '.cshtml']):
        if 'node_modules' in f or f == engine_path:
            continue
        s = open(f, encoding='utf-8-sig', errors='replace').read()
        used_js.update(re.findall(r'\bMAF\.(\w+)\s*\(', s))
        used_js.update(re.findall(r'window\.MAF\.(\w+)\s*\(', s))

    # Host C# gọi "MAF.xxx(" trong chuỗi script
    used_cs = set()
    for f in walk(['.cs']):
        s = open(f, encoding='utf-8-sig').read()
        used_cs.update(re.findall(r'MAF\.(\w+)\s*\(', s))

    known_extra = {'VERSION', 'util', 'host'}
    missing = sorted((used_js | used_cs) - exported - known_extra)
    if missing:
        fail('engine', f'host gọi MAF.{", MAF.".join(missing)} nhưng engine không export')
        return False
    print(f'  ✅ Engine: {len(exported)} API, host (JS+C#) gọi {len(used_js | used_cs)} hàm — tất cả đều tồn tại')
    return True


# ------------------------------------------------------------------ 8. self-test
def check_selftest():
    """Chạy Tests/selftest-checkers.py — kiểm chứng chính các checker ở trên.

    Không có bước này thì một checker hỏng vẫn in ✅ và tạo cảm giác an toàn giả.
    """
    global CHECKS
    CHECKS += 1
    r = run([sys.executable, os.path.join(ROOT, 'Tests', 'selftest-checkers.py')])
    if r.returncode != 0:
        bad = [ln for ln in (r.stdout + r.stderr).splitlines() if ln.startswith('❌') or ln.strip().startswith('•')]
        fail('self-test', '\n      ' + '\n      '.join(bad[:10]))
        return False
    n = len([ln for ln in r.stdout.splitlines() if ln.startswith('✅')])
    print(f'  ✅ Self-test: {n} case kiểm chứng chính các checker đều đạt')
    return True


# ------------------------------------------------------------------ 9. glob nuốt project con
def check_root_glob():
    """Project Ở THƯ MỤC GỐC có glob **\*.cs nuốt source của các project con không?

    Lỗi thật của repo này: MedicalAutoFillTool.csproj nằm ở gốc, còn
    MedicalAutoFillWeb/ và MedinetBridge/ là thư mục con. SDK glob "**\*.cs" nên
    project gốc biên dịch LUÔN cả Program.cs của Bridge (trùng [STAThread] Main)
    và Controllers của Web (thiếu Microsoft.AspNetCore -> CS0246 'HttpGet'),
    cùng các file *.AssemblyInfo.cs trong obj/ của chúng (trùng attribute).
    Kết quả: `dotnet build` ở thư mục gốc không bao giờ thành công.
    """
    global CHECKS
    CHECKS += 1

    root_projects = [f for f in os.listdir(ROOT) if f.endswith('.csproj')]
    if not root_projects:
        print('  ⏭  không có project .csproj ở thư mục gốc — bỏ qua')
        return True

    sub_dirs = set()
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in ('bin', 'obj', 'node_modules', '.git', 'dist', 'publish', 'lib')]
        if dp == ROOT:
            continue
        if any(f.endswith('.csproj') for f in fn):
            sub_dirs.add(os.path.relpath(dp, ROOT).split(os.sep)[0])

    if not sub_dirs:
        print('  ⏭  không có project con — bỏ qua')
        return True

    problems = []
    for proj in root_projects:
        text = open(os.path.join(ROOT, proj), encoding='utf-8-sig').read()
        m = re.search(r'<DefaultItemExcludes>(.*?)</DefaultItemExcludes>', text, re.DOTALL)
        excludes = m.group(1) if m else ''
        for d in sorted(sub_dirs):
            # Chấp nhận "Dir\**", "Dir/**" hoặc "Dir;**"
            pat = re.escape(d) + r'[\\/]'
            if not re.search(pat, excludes):
                problems.append(f'{proj}: thư mục con "{d}/" có project .csproj nhưng CHƯA bị loại khỏi '
                                f'glob mặc định -> project gốc sẽ biên dịch luôn source của nó '
                                f'(trùng Main / thiếu reference / trùng AssemblyInfo trong obj/)')
    if problems:
        fail('glob-project-con', '\n      ' + '\n      '.join(problems))
        return False
    print(f'  ✅ Project gốc đã loại trừ {len(sub_dirs)} thư mục project con khỏi glob (**\*.cs)')
    return True


# ------------------------------------------------------------------ 10. thiếu using
def check_usings():
    """CS0246 do thiếu `using` cho namespace KHÔNG nằm trong implicit usings.

    Lỗi thật đã gặp: AutoFillScriptBuilder.cs chỉ `using System.Text.Json.Serialization;`
    nhưng gọi `JsonSerializer.Serialize(...)` (kiểu này ở System.Text.Json) -> CS0246.
    """
    global CHECKS
    CHECKS += 1
    r = run([sys.executable, os.path.join(ROOT, 'Tests', 'check-usings.py')])
    if r.returncode != 0:
        bad = [ln for ln in r.stdout.splitlines() if ln.startswith('❌')]
        fail('thiếu-using', '\n      ' + '\n      '.join(bad[:10]))
        return False
    n = len([ln for ln in r.stdout.splitlines() if ln.startswith('✅')])
    print(f'  ✅ Using: {n} file WinForms/Bridge không thiếu using nào ngoài implicit')
    return True


# ------------------------------------------------------------------ 11. bẫy API WinForms/WebView2
API_TRAPS = [
    # (regex, thông báo) — mỗi mục là MỘT LỖI BIÊN DỊCH THẬT mà CI đã bắt được.
    #
    # Riêng nhóm AcceleratorKeyPressed đã ngốn 3 vòng CI vì tưởng "chỉ cần tìm
    # đúng object nào có event đó". Sự thật (kiểm chứng bằng tài liệu đúng phiên
    # bản SDK 1.0.2535.41 + bản decompile DLL + dự án thật trên GitHub):
    #   CoreWebView2.AcceleratorKeyPressed    -> CS1061, không tồn tại
    #   WebView2.AcceleratorKeyPressed        -> CS1061, không tồn tại
    #   _webView.CoreWebView2Controller       -> CS1061, controller là field
    #                                            private `_coreWebView2Controller`
    #                                            ở MỌI phiên bản SDK
    # Cách ĐÚNG, nguyên văn Remarks của lớp WebView2 (WinForms): phím accelerator
    # bấm trong control sẽ "fire standard key press events such as OnKeyDown", và
    # đặt Handled của EventArgs = true thì chặn được hành vi mặc định của trình
    # duyệt. Tức là _webView.KeyDown += ... — xem HookBrowserHotkeys() trong Form1.cs.
    (r'\b(?:core|CoreWebView2)\s*\??\.\s*AcceleratorKeyPressed\b',
     "AcceleratorKeyPressed KHÔNG có trên CoreWebView2 (CS1061) — nó thuộc CoreWebView2Controller. "
     "Từ app WinForms dùng _webView.KeyDown += ... (HookBrowserHotkeys trong Form1.cs)"),
    (r'\b(?:_webView|webView|wv|web|browser|ctrl|control)\s*\??\.\s*AcceleratorKeyPressed\b',
     "Control WebView2 của WinForms KHÔNG có event AcceleratorKeyPressed public "
     "(CS1061 — đã xác nhận trên SDK 1.0.2535.41, dù tài liệu vài trang gợi ý ngược lại). "
     "Dùng _webView.KeyDown += ... rồi e.Handled = true; e.SuppressKeyPress = true;"),
    (r'\.CoreWebView2Controller\b',
     "Control WebView2 WinForms GIỮ PRIVATE controller (field _coreWebView2Controller) ở MỌI "
     "phiên bản SDK -> truy cập công khai là CS1061. Chỉ còn reflection (rủi ro vỡ âm thầm) "
     "hoặc dùng _webView.KeyDown += ... — chọn KeyDown."),
    (r'CoreWebView2\??\s*\.\s*Dispose\s*\(',
     "CoreWebView2 KHÔNG implement IDisposable (CS1061). Dispose chính control WebView2 là đủ."),
    (r'new\s+ToolStripTextBox\s*\{[^}]*\bSpring\b',
     "ToolStripTextBox không có thuộc tính Spring trong object initializer (CS0117). "
     "Muốn ô chiếm hết chỗ trống thì tự tính Width khi thanh đổi kích thước."),
]


def check_api_traps():
    """Quét các cách dùng API sai mà compiler từng báo — tránh tái phạm."""
    global CHECKS
    CHECKS += 1
    hits = []
    for f in walk(['.cs']):
        src = open(f, encoding='utf-8-sig', errors='replace').read()
        body = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
        body = re.sub(r'//[^\n]*', '', body)          # bỏ comment (nơi ghi chú về chính cái bẫy)
        for pat, msg in API_TRAPS:
            for m in re.finditer(pat, body, re.DOTALL):
                line = body[:m.start()].count('\n') + 1
                hits.append(f'{rel(f)}:{line} — {msg}')
    if hits:
        fail('api-trap', '\n      ' + '\n      '.join(dict.fromkeys(hits)))
        return False
    print(f'  ✅ API: không dính {len(API_TRAPS)} bẫy WinForms/WebView2 từng gây lỗi biên dịch')
    return True


def main():
    print('=' * 74)
    print('KIỂM TRA TỔNG HỢP (không cần .NET SDK)')
    print('=' * 74)
    results = [
        check_csharp(),
        check_csproj(),
        check_js(),
        check_json(),
        check_profiles(),
        check_views(),
        check_engine_api(),
        check_selftest(),
        check_root_glob(),
        check_usings(),
        check_api_traps(),
    ]
    print('-' * 74)
    if FAILS:
        print(f'❌ {len(FAILS)}/{CHECKS} nhóm kiểm tra CÓ LỖI:\n')
        for f in FAILS:
            print('  • ' + f)
        print('\nSửa xong chạy lại: python3 Tests/check-all.py')
        return 1
    print(f'✅ TẤT CẢ {CHECKS} NHÓM KIỂM TRA ĐỀU ĐẠT')
    return 0


if __name__ == '__main__':
    sys.exit(main())
