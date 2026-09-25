import type { ParsedFilter } from '../dto/query.dto';

/** Chuyển giá trị theo kiểu dữ liệu cột */
export function coerceValue(raw: string, kind: 'number' | 'int' | 'boolean' | 'string'): unknown {
  const v = raw.trim();
  switch (kind) {
    case 'number': {
      const n = Number(v.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    }
    case 'int': {
      const n = parseInt(v.replace(/[^\d-]/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return ['1', 'true', 'yes', 'on', 'có'].includes(v.toLowerCase());
    default:
      return v;
  }
}

/**
 * Lấy điều kiện lọc theo một trường từ danh sách bộ lọc đã phân tích.
 * Dùng ở tầng service để ánh xạ tên trường → cột CSDL (danh sách trắng).
 */
export function filtersOf(filters: ParsedFilter[], field: string): ParsedFilter[] {
  return filters.filter((f) => f.field === field);
}

export function firstFilterValue(filters: ParsedFilter[], field: string): string | undefined {
  return filters.find((f) => f.field === field)?.value;
}

/** Làm sạch từ khoá tìm kiếm trước khi đưa vào truy vấn LIKE */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/** Số nguyên an toàn từ chuỗi truy vấn */
export function toInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Đối tượng rỗng? */
export function isEmptyObject(v: unknown): boolean {
  return !!v && typeof v === 'object' && Object.keys(v as object).length === 0;
}

/** Rút gọn đối tượng chỉ giữ các khoá được phép */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/** Bỏ các giá trị undefined/rỗng */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/** So sánh hai đối tượng để tìm phần thay đổi (phục vụ nhật ký kiểm toán) */
export function diffObjects<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
  ignore: string[] = ['updatedAt'],
): { before: Partial<T>; after: Partial<T>; changed: boolean } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (ignore.includes(k)) continue;
    const bv = (before as Record<string, unknown> | undefined)?.[k];
    const av = (after as Record<string, unknown> | undefined)?.[k];
    const same =
      bv === av ||
      JSON.stringify(bv ?? null) === JSON.stringify(av ?? null);
    if (!same) {
      (b as Record<string, unknown>)[k] = bv;
      (a as Record<string, unknown>)[k] = av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
