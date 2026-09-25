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
