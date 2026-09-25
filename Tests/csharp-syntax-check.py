#!/usr/bin/env python3
"""
Kiểm tra cú pháp C# ở mức cấu trúc (không cần .NET SDK).

Vì sao cần: repo này build trên Windows (WinForms + WebView2), còn CI/sandbox Linux
không cài được .NET SDK nên KHÔNG biên dịch được. Bộ kiểm này bắt được nhóm lỗi
phổ biến nhất khi sửa tay hàng loạt: ngoặc nhọn/ngoặc đơn không cân bằng, chuỗi
chưa đóng, comment /* */ quên đóng.

Lexer hiểu đúng:
  // comment           /* comment */
  "chuỗi"              @"chuỗi verbatim với "" escape"
  $"interpolated {x}"  $@"..."  @$"..."   (có {} lồng nhau, {{ là escape)
  'c'                  '\\n'

Chạy:  python3 Tests/csharp-syntax-check.py [đường dẫn ...]
       mặc định quét mọi file .cs trong repo (bỏ qua bin/obj).
Thoát 0 = sạch, 1 = có lỗi.
"""
import sys, os

PAIRS = {')': '(', ']': '[', '}': '{'}
OPENERS = set('([{')


def check(path):
    with open(path, 'r', encoding='utf-8-sig', errors='replace') as f:
        src = f.read()

    stack = []          # (ký tự mở, số dòng)
    errors = []
    i, n, line = 0, len(src), 1
    interp_depth = []   # stack đánh dấu đang trong {} của chuỗi interpolated

    def peek(k=1):
        return src[i + k] if i + k < n else ''

    while i < n:
        c = src[i]
        if c == '\n':
            line += 1
            i += 1
            continue

        # ---- comment dòng ----
        if c == '/' and peek() == '/':
            while i < n and src[i] != '\n':
                i += 1
            continue

        # ---- comment khối ----
        if c == '/' and peek() == '*':
            i += 2
            while i < n and not (src[i] == '*' and peek() == '/'):
                if src[i] == '\n':
                    line += 1
                i += 1
            if i >= n:
                errors.append(f"dòng {line}: comment /* chưa đóng")
                break
            i += 2
            continue

        # ---- chuỗi verbatim / interpolated ----
        prefix = ''
        j = i
        while j < n and src[j] in '$@':
            prefix += src[j]
            j += 1
        if j < n and src[j] == '"' and prefix and len(prefix) <= 2:
            verbatim = '@' in prefix
            interpolated = '$' in prefix
            i = j + 1
            brace_stack = []      # ngoặc {} bên trong chuỗi interpolated
            while i < n:
                ch = src[i]
                if ch == '\n':
                    line += 1
                    if not verbatim and not interpolated:
                        errors.append(f"dòng {line - 1}: chuỗi thường chưa đóng trước khi xuống dòng")
                        break
                    i += 1
                    continue
                if interpolated and brace_stack and ch in ')]}':
                    # đang inside {expr}: để lexer chính xử lý ngoặc
                    pass
                if ch == '"' and not (verbatim and peek() == '"'):
                    if interpolated and brace_stack:
                        # bên trong {expr} vẫn có thể có chuỗi -> bỏ qua, xử lý đệ quy đơn giản
                        i += 1
                        continue
                    i += 1
                    break
                if ch == '"' and verbatim and peek() == '"':
                    i += 2
                    continue
                if not verbatim and ch == '\\':
                    i += 2
                    continue
                if interpolated and ch == '{':
                    if peek() == '{':
                        i += 2
                        continue
                    brace_stack.append(line)
                    i += 1
                    continue
                if interpolated and ch == '}':
                    if peek() == '}':
                        i += 2
                        continue
                    if brace_stack:
                        brace_stack.pop()
                    else:
                        errors.append(f"dòng {line}: '}}' thừa trong chuỗi interpolated")
                    i += 1
                    continue
                i += 1
            else:
                errors.append(f"dòng {line}: chuỗi chưa đóng (hết file)")
            if interpolated and brace_stack:
                errors.append(f"dòng {brace_stack[0]}: '{{' trong chuỗi interpolated chưa đóng")
            continue

        # ---- chuỗi thường ----
        if c == '"':
            i += 1
            closed = False
            while i < n:
                ch = src[i]
                if ch == '\n':
                    errors.append(f"dòng {line}: chuỗi \" chưa đóng trước khi xuống dòng")
                    break
                if ch == '\\':
                    i += 2
                    continue
                if ch == '"':
                    i += 1
                    closed = True
                    break
                i += 1
            if not closed and i >= n:
                errors.append(f"dòng {line}: chuỗi chưa đóng (hết file)")
            continue

        # ---- ký tự ----
        if c == "'":
            i += 1
            while i < n and src[i] != "'":
                if src[i] == '\\':
                    i += 1
                if src[i] == '\n':
                    errors.append(f"dòng {line}: ký tự ' chưa đóng")
                    break
                i += 1
            i += 1
            continue

        # ---- ngoặc ----
        if c in OPENERS:
            stack.append((c, line))
            i += 1
            continue
        if c in PAIRS:
            if not stack:
                errors.append(f"dòng {line}: '{c}' không có ngoặc mở tương ứng")
            elif stack[-1][0] != PAIRS[c]:
                errors.append(f"dòng {line}: '{c}' không khớp với '{stack[-1][0]}' mở ở dòng {stack[-1][1]}")
                stack.pop()
            else:
                stack.pop()
            i += 1
            continue

        i += 1

    for ch, ln in stack:
        errors.append(f"dòng {ln}: '{ch}' chưa được đóng")

    return errors


def main():
    args = sys.argv[1:]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = []
    if args:
        for a in args:
            if os.path.isdir(a):
                for dp, dn, fn in os.walk(a):
                    dn[:] = [d for d in dn if d not in ('bin', 'obj', 'node_modules', '.git', 'publish')]
                    files += [os.path.join(dp, f) for f in fn if f.endswith('.cs')]
            elif a.endswith('.cs'):
                files.append(a)
    else:
        for dp, dn, fn in os.walk(root):
            dn[:] = [d for d in dn if d not in ('bin', 'obj', 'node_modules', '.git', 'publish')]
            files += [os.path.join(dp, f) for f in fn if f.endswith('.cs')]

    files = sorted(set(files))
    bad = 0
    for f in files:
        errs = check(f)
        rel = os.path.relpath(f, root)
        if errs:
            bad += 1
            print(f"❌ {rel}")
            for e in errs[:12]:
                print(f"     {e}")
        else:
            print(f"✅ {rel}")
    print(f"\nTổng: {len(files)} file, {bad} file có lỗi cấu trúc.")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
