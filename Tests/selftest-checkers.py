#!/usr/bin/env python3
"""
Tự kiểm chứng chính các bộ kiểm tra trong Tests/ (test cho test).

Nếu không có file này thì một "checker" hỏng vẫn báo ✅ và cho cảm giác an toàn giả.
Mỗi case dưới đây là MỘT LỖI THẬT đã xảy ra trong repo này.

Chạy: python3 Tests/selftest-checkers.py
"""
import importlib.util
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


csc = load('csc', 'csharp-syntax-check.py')

FAILS = []


def write_tmp(text):
    fd, path = tempfile.mkstemp(suffix='.cs')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(text)
    return path


def expect(name, src, must_contain=None, must_be_clean=False):
    path = write_tmp(src)
    try:
        errs = csc.check(path)
    finally:
        os.unlink(path)

    if must_be_clean:
        if errs:
            FAILS.append(f'{name}: báo nhầm {errs}')
            print(f'❌ {name}: báo nhầm {errs}')
        else:
            print(f'✅ {name}: không báo nhầm')
        return

    hit = [e for e in errs if must_contain in e]
    if hit:
        print(f'✅ {name}: bắt được -> {hit[0][:90]}')
    else:
        FAILS.append(f'{name}: KHÔNG bắt được (kết quả: {errs})')
        print(f'❌ {name}: KHÔNG bắt được (kết quả: {errs})')


print('--- pass 1: cân bằng ngoặc / chuỗi / comment ---')
expect('ngoặc nhọn chưa đóng',
       'namespace X;\nclass A { void B() { }\n', must_contain="chưa được đóng")
expect('chuỗi chưa đóng trước xuống dòng',
       'class A { string s = "abc;\n}\n', must_contain='chuỗi')
expect('comment /* chưa đóng',
       'class A { /* quên đóng\n}\n', must_contain='comment')
expect('chuỗi verbatim có "" escape',
       'class A { string p = @"C:\\temp""x"""; int n = 1; }\n', must_be_clean=True)
expect('chuỗi interpolated có {} lồng nhau',
       'class A { void F(int n) { var s = $"a {n + (n > 1 ? 2 : 3)} b {{esc}}"; } }\n',
       must_be_clean=True)
# C# hợp lệ: '\'' là ký tự nháy đơn, '\\' là ký tự backslash.
# (Case này từng bị viết SAI trong chính file test thành '\\\\'' — không phải C# hợp lệ,
#  và checker báo đúng. Bài học: test cho test cũng cần dữ liệu đầu vào chuẩn.)
expect("char literal escape '\\'' và '\\\\'",
       "class A { char c = '\\''; char b = '\\\\'; char d = '{'; char e = '}'; }\n",
       must_be_clean=True)
expect('ký tự } trong chuỗi không tính là ngoặc',
       'class A { string s = "}{"; }\n', must_be_clean=True)

print('--- pass 2: doc-comment thiếu dấu / (lỗi thật ở TsvParser.cs:151) ---')
expect('doc-comment thiếu /',
       'namespace X;\nclass A {\n    /// <summary>\n    * Dòng lỗi.\n    /// </summary>\n    int F() => 1;\n}\n',
       must_contain='doc-comment')
expect("block comment /* * */ hợp lệ thì KHÔNG báo",
       'namespace X;\n/*\n * Dòng sao hợp lệ.\n */\nclass A { int F() => 2 * 3; }\n',
       must_be_clean=True)
expect('doc-comment nhiều dòng đúng',
       'namespace X;\nclass A {\n    /// <summary>\n    /// Dòng 1.\n    /// </summary>\n    int F() => 1;\n}\n',
       must_be_clean=True)

print()
if FAILS:
    print(f'❌ {len(FAILS)} case tự-kiểm-chứng THẤT BẠI:')
    for f in FAILS:
        print('   • ' + f)
    sys.exit(1)
print('✅ Mọi case tự-kiểm-chứng đều đạt — checker đáng tin.')
