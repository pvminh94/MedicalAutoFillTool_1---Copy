/**
 * Sinh điều kiện WHERE từ bộ lọc nâng cao (`field:op:value`).
 *
 * Dùng chung cho mọi danh sách: mỗi service chỉ cần khai báo bảng ánh xạ
 * `tên trường → { biểu thức SQL, kiểu dữ liệu }`, phần còn lại (ép kiểu, toán tử
 * like/in/nin/isnull…) do hàm này lo. Nhờ vậy bộ lọc ở backend luôn khớp với
 * sổ đăng ký trường lọc (`filter-registry.ts`) mà giao diện đang hiển thị.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { ParsedFilter } from '../dto/query.dto';

export type FilterValueType = 'text' | 'number' | 'bool' | 'date' | 'enum';

export interface FilterTarget {
  /** Cột hoặc biểu thức SQL cần lọc */
  expr: SQL | unknown;
  type: FilterValueType;
  /** Với kiểu text: so khớp không phân biệt hoa/thường (mặc định true) */
  caseInsensitive?: boolean;
}

/** Ép giá trị chuỗi từ URL sang kiểu dữ liệu của cột. */
export function coerceFilterValue(value: string, type: FilterValueType): string | number | boolean | null {
  const raw = String(value ?? '').trim();
  switch (type) {
    case 'number': {
      const n = Number(raw.replace(/\s/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return ['1', 'true', 'yes', 'on', 'có'].includes(raw.toLowerCase());
    case 'date':
    case 'enum':
    case 'text':
    default:
      return raw;
  }
}

/**
 * Điều kiện WHERE cho một bộ lọc. Trả về `undefined` nếu giá trị không hợp lệ
 * (ví dụ lọc số nhưng người dùng nhập chữ) — khi đó điều kiện được bỏ qua thay vì
 * làm cả truy vấn trả về rỗng.
 */
export function filterSql(target: FilterTarget, f: ParsedFilter): SQL | undefined {
  const col = sql`${target.expr}`;
  const values = (f.values.length ? f.values : [f.value]).filter((v) => v !== '');

  if (f.op === 'isnull') {
    return target.type === 'text'
      ? sql`(${col} is null or ${col}::text = '')`
      : sql`${col} is null`;
  }
  if (f.op === 'notnull') {
    return target.type === 'text'
      ? sql`(${col} is not null and ${col}::text <> '')`
      : sql`${col} is not null`;
  }

  if (f.op === 'in' || f.op === 'nin') {
    if (!values.length) return undefined;
    const list = sql.join(
      values.map((v) => {
        const coerced = coerceFilterValue(v, target.type);
        return coerced === null ? sql`null` : sql`${coerced}`;
      }),
      sql`, `,
    );
    const not = f.op === 'nin' ? sql`not ` : sql``;
    const castText = target.type === 'text' || target.type === 'enum';
    return castText
      ? sql`${not}${col}::text in (${list})`
      : sql`${not}${col} in (${list})`;
  }

  const coerced = coerceFilterValue(f.value, target.type);
  if (coerced === null) return undefined;

  if (f.op === 'like') {
    // Tìm gần đúng: luôn so trên dạng chuỗi, không phân biệt hoa/thường
    return sql`${col}::text ilike ${`%${String(coerced)}%`}`;
  }

  const insensitive = target.type === 'text' && target.caseInsensitive !== false;
  const left = insensitive ? sql`lower(${col}::text)` : col;
  const right = insensitive ? String(coerced).toLowerCase() : coerced;

  switch (f.op) {
    case 'eq':
      return sql`${left} = ${right}`;
    case 'ne':
      return sql`${left} <> ${right}`;
    case 'gt':
      return sql`${col} > ${coerced}`;
    case 'gte':
      return sql`${col} >= ${coerced}`;
    case 'lt':
      return sql`${col} < ${coerced}`;
    case 'lte':
      return sql`${col} <= ${coerced}`;
    default:
      return sql`${left} = ${right}`;
  }
}

/**
 * Áp một danh sách bộ lọc vào mảng điều kiện WHERE theo bảng ánh xạ trường.
 * Trường không có trong bảng ánh xạ sẽ bị bỏ qua (không lọc bừa theo cột lạ).
 */
export function pushFilters(
  where: SQL[],
  filters: ParsedFilter[],
  map: Record<string, FilterTarget>,
): void {
  for (const f of filters) {
    const target = map[f.field];
    if (!target) continue;
    const condition = filterSql(target, f);
    if (condition) where.push(condition);
  }
}
