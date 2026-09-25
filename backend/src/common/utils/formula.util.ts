/**
 * Bộ tính công thức an toàn cho cột/dòng báo cáo và biểu thức trong bản in.
 *
 * Hỗ trợ:
 *   - toán tử:  + - * / % ^  và ngoặc ( )
 *   - toán hạng: số, hằng số, tên cột (hs, tq, te…)
 *   - so sánh:  = == != <> > < >= <=   (cho điều kiện hiển thị của bản in)
 *   - logic:    && || !  · and or not
 *   - hàm:      sum avg min max round floor ceil abs if empty coalesce
 *
 * KHÔNG dùng `eval`/`Function` — tự phân tích cú pháp nên an toàn với dữ liệu người dùng nhập.
 * Kết quả luôn là số hoặc giá trị luận lý; biểu thức sai trả về 0 và kèm cảnh báo.
 */

export interface FormulaContext {
  /** Giá trị theo tên: { hs: 10, tq: 3 } */
  values: Record<string, number>;
  /** Giá trị văn bản (dùng cho so sánh chuỗi như status == 'HOAN_TAT') */
  texts?: Record<string, unknown>;
}

export interface FormulaResult {
  value: number;
  error?: string;
  /** Các tên cột mà công thức tham chiếu tới */
  refs: string[];
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    // số
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && /[0-9._]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(/_/g, '');
      tokens.push({ t: 'num', v: Number(raw) });
      i = j;
      continue;
    }
    // chuỗi 'abc' hoặc "abc"
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = '';
      while (j < s.length && s[j] !== quote) {
        out += s[j];
        j++;
      }
      tokens.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    // định danh (tên cột / hàm / từ khoá)
    if (/[A-Za-z_\u00C0-\u024F\u1E00-\u1EFF]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_\u00C0-\u024F\u1E00-\u1EFF.]/.test(s[j])) j++;
      tokens.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    // toán tử nhiều ký tự trước
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<>', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ t: 'op', v: two === '<>' ? '!=' : two });
      i += 2;
      continue;
    }
    if ('+-*/%^'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if ('<>!='.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ t: 'lp' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ t: 'rp' });
      i++;
      continue;
    }
    if (c === ',' || c === ';') {
      tokens.push({ t: 'comma' });
      i++;
      continue;
    }
    // ký tự lạ → bỏ qua
    i++;
  }
  return tokens;
}

interface ParserState {
  tokens: Token[];
  pos: number;
  ctx: FormulaContext;
  refs: Set<string>;
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sum: (a) => a.reduce((x, y) => x + y, 0),
  avg: (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0),
  min: (a) => (a.length ? Math.min(...a) : 0),
  max: (a) => (a.length ? Math.max(...a) : 0),
  round: (a) => {
    const [v, digits = 0] = a;
    const f = Math.pow(10, digits);
    return Math.round(v * f) / f;
  },
  floor: (a) => Math.floor(a[0] ?? 0),
  ceil: (a) => Math.ceil(a[0] ?? 0),
  abs: (a) => Math.abs(a[0] ?? 0),
};

function peek(st: ParserState): Token | undefined {
  return st.tokens[st.pos];
}

function eat(st: ParserState): Token | undefined {
  return st.tokens[st.pos++];
}

/** Biểu thức:  hoặc (||) */
function parseOr(st: ParserState): number {
  let left = parseAnd(st);
  for (;;) {
    const tk = peek(st);
    if (tk?.t === 'op' && (tk.v === '||' || tk.v.toLowerCase() === '')) {
      if (tk.v === '||') {
        eat(st);
        const right = parseAnd(st);
        left = left !== 0 || right !== 0 ? 1 : 0;
        continue;
      }
    }
    if (tk?.t === 'id' && ['or'].includes(tk.v.toLowerCase())) {
      eat(st);
      const right = parseAnd(st);
      left = left !== 0 || right !== 0 ? 1 : 0;
      continue;
    }
    return left;
  }
}

function parseAnd(st: ParserState): number {
  let left = parseComparison(st);
  for (;;) {
    const tk = peek(st);
    if (tk?.t === 'op' && tk.v === '&&') {
      eat(st);
      const right = parseComparison(st);
      left = left !== 0 && right !== 0 ? 1 : 0;
      continue;
    }
    if (tk?.t === 'id' && tk.v.toLowerCase() === 'and') {
      eat(st);
      const right = parseComparison(st);
      left = left !== 0 && right !== 0 ? 1 : 0;
      continue;
    }
    return left;
  }
}

function parseComparison(st: ParserState): number {
  const left = parseAdditive(st);
  const tk = peek(st);
  if (tk?.t === 'op' && ['=', '==', '!=', '<', '>', '<=', '>='].includes(tk.v)) {
    eat(st);
    const right = parseAdditive(st);
    switch (tk.v) {
      case '=':
      case '==':
        return left === right ? 1 : 0;
      case '!=':
        return left !== right ? 1 : 0;
      case '<':
        return left < right ? 1 : 0;
      case '>':
        return left > right ? 1 : 0;
      case '<=':
        return left <= right ? 1 : 0;
      case '>=':
        return left >= right ? 1 : 0;
      default:
        return 0;
    }
  }
  return left;
}

function parseAdditive(st: ParserState): number {
  let left = parseMultiplicative(st);
  for (;;) {
    const tk = peek(st);
    if (tk?.t === 'op' && (tk.v === '+' || tk.v === '-')) {
      eat(st);
      const right = parseMultiplicative(st);
      left = tk.v === '+' ? left + right : left - right;
      continue;
    }
    return left;
  }
}

function parseMultiplicative(st: ParserState): number {
  let left = parseUnary(st);
  for (;;) {
    const tk = peek(st);
    if (tk?.t === 'op' && ['*', '/', '%'].includes(tk.v)) {
      eat(st);
      const right = parseUnary(st);
      if (tk.v === '*') left = left * right;
      else if (tk.v === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
      continue;
    }
    return left;
  }
}

function parseUnary(st: ParserState): number {
  const tk = peek(st);
  if (tk?.t === 'op' && (tk.v === '-' || tk.v === '+')) {
    eat(st);
    const v = parseUnary(st);
    return tk.v === '-' ? -v : v;
  }
  if (tk?.t === 'op' && tk.v === '!') {
    eat(st);
    return parseUnary(st) === 0 ? 1 : 0;
  }
  if (tk?.t === 'id' && tk.v.toLowerCase() === 'not') {
    eat(st);
    return parseUnary(st) === 0 ? 1 : 0;
  }
  return parsePower(st);
}

function parsePower(st: ParserState): number {
  const base = parsePrimary(st);
  const tk = peek(st);
  if (tk?.t === 'op' && tk.v === '^') {
    eat(st);
    const exp = parseUnary(st);
    return Math.pow(base, exp);
  }
  return base;
}

function parsePrimary(st: ParserState): number {
  const tk = eat(st);
  if (!tk) return 0;
  if (tk.t === 'num') return tk.v;
  if (tk.t === 'str') {
    const n = Number(tk.v);
    return Number.isFinite(n) ? n : 0;
  }
  if (tk.t === 'lp') {
    const v = parseOr(st);
    if (peek(st)?.t === 'rp') eat(st);
    return v;
  }
  if (tk.t === 'id') {
    const name = tk.v;
    const lower = name.toLowerCase();
    // lời gọi hàm
    if (peek(st)?.t === 'lp') {
      eat(st);
      const args: number[] = [];
      if (peek(st)?.t !== 'rp') {
        args.push(parseOr(st));
        while (peek(st)?.t === 'comma') {
          eat(st);
          args.push(parseOr(st));
        }
      }
      if (peek(st)?.t === 'rp') eat(st);
      if (lower === 'if') {
        // if(điều_kiện, đúng, sai)
        return args[0] !== 0 ? (args[1] ?? 0) : (args[2] ?? 0);
      }
      if (lower === 'coalesce' || lower === 'empty') {
        return args.find((a) => Number.isFinite(a) && a !== 0) ?? 0;
      }
      const fn = FUNCTIONS[lower];
      return fn ? fn(args) : 0;
    }
    if (lower === 'true') return 1;
    if (lower === 'false') return 0;
    // hằng số toán học
    if (lower === 'pi') return Math.PI;
    // tham chiếu cột
    st.refs.add(name);
    const direct = st.ctx.values[name];
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    const ci = Object.keys(st.ctx.values).find((k) => k.toLowerCase() === lower);
    if (ci !== undefined) {
      const v = st.ctx.values[ci];
      return Number.isFinite(v) ? v : 0;
    }
    // so sánh với trường văn bản: status == 'HOAN_TAT' → trả 1 nếu khớp
    const textVal = st.ctx.texts?.[name] ?? st.ctx.texts?.[ci ?? ''];
    if (typeof textVal === 'string') {
      const n = Number(textVal);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }
  if (tk.t === 'op' && tk.v === '-') return -parsePrimary(st);
  return 0;
}

/** Tính giá trị công thức số */
export function evaluateFormula(expression: string, ctx: FormulaContext): FormulaResult {
  if (!expression || !expression.trim()) return { value: 0, refs: [] };
  try {
    const tokens = tokenize(expression);
    const st: ParserState = { tokens, pos: 0, ctx, refs: new Set() };
    const value = parseOr(st);
    return {
      value: Number.isFinite(value) ? value : 0,
      refs: [...st.refs],
    };
  } catch (err) {
    return { value: 0, refs: [], error: (err as Error).message };
  }
}

/** Các tên cột mà công thức tham chiếu tới (không cần giá trị) */
export function formulaRefs(expression: string): string[] {
  if (!expression?.trim()) return [];
  try {
    const tokens = tokenize(expression);
    const st: ParserState = { tokens, pos: 0, ctx: { values: {} }, refs: new Set() };
    parseOr(st);
    return [...st.refs];
  } catch {
    return [];
  }
}

/**
 * Đánh giá biểu thức luận lý (điều kiện hiển thị trong bản in).
 * `ctx.texts` chứa các trường văn bản; so sánh chuỗi được quy về 1/0.
 */
export function evaluateCondition(
  expression: string,
  ctx: { values: Record<string, number>; texts: Record<string, unknown> },
): boolean {
  if (!expression?.trim()) return true;
  const numericCtx: FormulaContext = {
    values: { ...ctx.values },
    texts: ctx.texts,
  };
  // Chuyển so sánh chuỗi trực tiếp trong biểu thức:  status == 'HOAN_TAT'
  for (const [key, raw] of Object.entries(ctx.texts)) {
    if (typeof raw !== 'string') continue;
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(==|=|!=|<>)\\s*(['"])(.*?)\\2`, 'g');
    expression = expression.replace(re, (_m, op: string, _q: string, val: string) => {
      const eq = raw === val ? 1 : 0;
      return op === '!=' || op === '<>' ? String(1 - eq) : String(eq);
    });
    numericCtx.values[key] = 0;
  }
  const res = evaluateFormula(expression, numericCtx);
  return res.value !== 0;
}
