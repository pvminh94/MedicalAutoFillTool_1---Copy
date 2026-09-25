#!/usr/bin/env python3
"""
Sinh Shared/default-profiles.json từ BuiltinProfiles.cs.

Vì sao: danh sách ~40 trường của form KSKDK đã có trong BuiltinProfiles.cs (WinForms).
Bản Electron cũng cần đúng danh sách đó. Thay vì gõ lại lần thứ 5 (chắc chắn lệch nhau
theo thời gian — đó chính là bệnh của repo gốc: 4 bản sao logic/map), file JSON được
SINH RA từ nguồn C#, kèm chế độ --check để CI phát hiện khi ai đó sửa một bên.

Chạy:
    python3 Tests/generate-default-profiles.py          # ghi lại JSON
    python3 Tests/generate-default-profiles.py --check  # chỉ so sánh, thoát 1 nếu lệch
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'BuiltinProfiles.cs')
OUT = os.path.join(ROOT, 'Shared', 'default-profiles.json')

HEADER = """{
  "$schema-note": "FILE NÀY ĐƯỢC SINH TỰ ĐỘNG từ BuiltinProfiles.cs — ĐỪNG SỬA TAY.",
  "$regen": "python3 Tests/generate-default-profiles.py",
  "$purpose": "Cấu hình form mặc định dùng chung cho các bản không có CSDL (Electron, script DevTools). Bản WinForms đọc BuiltinProfiles.cs, bản Web đọc SQLite do DbSeeder seed.",
  "version": 2,
"""

FORM_RE = re.compile(
    r'public\s+static\s+FormProfile\s+(\w+)\s*\(\s*\)\s*\{(?P<body>.*?)\n\s{4}\}',
    re.DOTALL)
NAME_RE = re.compile(r'Name\s*=\s*"((?:[^"\\]|\\.)*)"')
URLC_RE = re.compile(r'UrlContains\s*=\s*"((?:[^"\\]|\\.)*)"')
DESC_RE = re.compile(r'Description\s*=\s*"((?:[^"\\]|\\.)*)"')
FIELD_RE = re.compile(
    r'p\.Fields\.Add\(\s*F\(\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(?P<args>.*?)\)\s*\)\s*;',
    re.DOTALL)
STR_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')


def unescape(s):
    return (s.replace('\\"', '"').replace('\\\\', '\\')
             .replace('\\n', '\n').replace('\\t', '\t').replace('\\r', ''))


def parse():
    with open(SRC, 'r', encoding='utf-8-sig') as f:
        src = f.read()

    forms = []
    for m in FORM_RE.finditer(src):
        method, body = m.group(1), m.group('body')
        name_m, urlc_m, desc_m = NAME_RE.search(body), URLC_RE.search(body), DESC_RE.search(body)

        fields = []
        for fm in FIELD_RE.finditer(body):
            idx = int(fm.group(1))
            ctype = fm.group(2)
            labels = [unescape(x) for x in STR_RE.findall(fm.group('args'))]
            fields.append({
                'excelIndex': idx,
                'controlType': ctype,
                'labels': labels,
                # Quy tắc của BuiltinProfiles.F(): HeaderNames = Labels khi không khai riêng.
                'headerNames': list(labels),
            })

        forms.append({
            'id': method,
            'name': unescape(name_m.group(1)) if name_m else method,
            'urlContains': unescape(urlc_m.group(1)) if urlc_m else '',
            'description': unescape(desc_m.group(1)) if desc_m else None,
            'fields': fields,
        })

    if not forms:
        raise SystemExit('KHÔNG parse được form nào từ %s — regex trong script này đã lỗi thời.' % SRC)
    return forms


def render(forms):
    """HEADER là phần mở đầu có ghi chú (json.dumps không chèn được comment),
    nên nối tay mảng "forms" đã thụt lề 2 khoảng vào sau nó."""
    arr = json.dumps(forms, ensure_ascii=False, indent=2).replace('\n', '\n  ')
    return HEADER + '  "forms": ' + arr + '\n}\n'


def main():
    forms = parse()
    text = render(forms)

    total = sum(len(f['fields']) for f in forms)
    if '--check' in sys.argv:
        if not os.path.exists(OUT):
            print('❌ Thiếu %s (chạy script không có --check để sinh).' % os.path.relpath(OUT, ROOT))
            return 1
        with open(OUT, 'r', encoding='utf-8') as f:
            old = f.read()
        if old != text:
            print('❌ Shared/default-profiles.json LỆCH với BuiltinProfiles.cs.')
            print('   Chạy: python3 Tests/generate-default-profiles.py')
            return 1
        print('✅ default-profiles.json khớp BuiltinProfiles.cs (%d form, %d trường).' % (len(forms), total))
        return 0

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('✅ Đã sinh %s — %d form, %d trường.' % (os.path.relpath(OUT, ROOT), len(forms), total))
    for f in forms:
        print('   • %-14s %2d trường  url~"%s"' % (f['id'], len(f['fields']), f['urlContains']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
