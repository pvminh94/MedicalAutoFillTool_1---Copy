/**
 * Tiện ích ngày tháng — chuẩn Việt Nam (tuần bắt đầu Thứ Hai, múi giờ Asia/Ho_Chi_Minh).
 * Làm việc trên chuỗi 'YYYY-MM-DD' để tránh sai lệch múi giờ của kiểu Date.
 */
import type { PeriodMode } from '../../db/schema/types';

export type ISODate = string;

const pad = (n: number): string => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: ISODate | string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function today(): ISODate {
  return toISO(new Date());
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISO(s) ?? new Date();
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(s: ISODate, months: number): ISODate {
  const d = parseISO(s) ?? new Date();
  d.setMonth(d.getMonth() + months);
  return toISO(d);
}

/** Tuần Thứ Hai → Chủ Nhật */
export function weekRange(s: ISODate): { from: ISODate; to: ISODate } {
  const d = parseISO(s) ?? new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Thứ Hai
  const from = new Date(d);
  from.setDate(d.getDate() - dow);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  return { from: toISO(from), to: toISO(to) };
}

export function monthRange(s: ISODate): { from: ISODate; to: ISODate } {
  const d = parseISO(s) ?? new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toISO(from), to: toISO(to) };
}

export function quarterRange(s: ISODate): { from: ISODate; to: ISODate } {
  const d = parseISO(s) ?? new Date();
  const q = Math.floor(d.getMonth() / 3);
  const from = new Date(d.getFullYear(), q * 3, 1);
  const to = new Date(d.getFullYear(), q * 3 + 3, 0);
  return { from: toISO(from), to: toISO(to) };
}

export function yearRange(s: ISODate): { from: ISODate; to: ISODate } {
  const d = parseISO(s) ?? new Date();
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

export interface ResolvedPeriod {
  from: ISODate;
  to: ISODate;
  label: string;
  mode: PeriodMode;
  /** Số ngày trong kỳ (bao gồm cả hai đầu) */
  days: number;
}

export function formatVN(s: ISODate | null | undefined): string {
  const d = parseISO(s ?? undefined);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function dateRangeLabel(from: ISODate, to: ISODate, mode?: PeriodMode): string {
  if (mode === 'all') return 'Toàn bộ thời gian';
  if (from === to) return `Ngày ${formatVN(from)}`;
  if (mode === 'month') {
    const d = parseISO(from);
    return d ? `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` : `Từ ${formatVN(from)} đến ${formatVN(to)}`;
  }
  if (mode === 'quarter') {
    const d = parseISO(from);
    return d ? `Quý ${Math.floor(d.getMonth() / 3) + 1}/${d.getFullYear()}` : '';
  }
  if (mode === 'year') {
    const d = parseISO(from);
    return d ? `Năm ${d.getFullYear()}` : '';
  }
  if (mode === 'week') {
    return `Tuần từ ${formatVN(from)} đến ${formatVN(to)}`;
  }
  return `Từ ${formatVN(from)} đến ${formatVN(to)}`;
}

/**
 * Quy đổi "kỳ báo cáo" thành khoảng ngày cụ thể.
 * `dateFrom`/`dateTo` chỉ dùng khi mode = 'range'.
 */
export function resolvePeriod(
  mode: PeriodMode | string,
  ref?: ISODate,
  dateFrom?: ISODate,
  dateTo?: ISODate,
): ResolvedPeriod {
  const base = ref ?? today();
  let from = base;
  let to = base;

  switch (mode) {
    case 'yesterday': {
      from = to = addDays(base, -1);
      break;
    }
    case 'week': {
      ({ from, to } = weekRange(base));
      break;
    }
    case 'month': {
      ({ from, to } = monthRange(base));
      break;
    }
    case 'quarter': {
      ({ from, to } = quarterRange(base));
      break;
    }
    case 'year': {
      ({ from, to } = yearRange(base));
      break;
    }
    case 'range': {
      const f = dateFrom ?? base;
      const t = dateTo ?? f;
      from = f <= t ? f : t;
      to = f <= t ? t : f;
      break;
    }
    case 'all': {
      return { from: '1900-01-01', to: '2199-12-31', label: 'Toàn bộ thời gian', mode: 'all', days: 0 };
    }
    case 'day':
    default:
      from = to = base;
  }

  const a = parseISO(from);
  const b = parseISO(to);
  const days = a && b ? Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1 : 1;
  return {
    from,
    to,
    label: dateRangeLabel(from, to, mode as PeriodMode),
    mode: mode as PeriodMode,
    days,
  };
}

/** Danh sách mọi ngày trong khoảng — dùng để tô nền ô thiếu số liệu */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 10_000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Tuần ISO (tuần chứa ngày đó, bắt đầu Thứ Hai) — dùng cho mã kỳ */
export function isoWeekNumber(s: ISODate): number {
  const d = parseISO(s);
  if (!d) return 0;
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 86_400_000));
}

export function formatDateTimeVN(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  const tz = 'Asia/Ho_Chi_Minh';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
  return parts;
}

/** Ngày dạng chữ cho bản in: "ngày 25 tháng 09 năm 2026" */
export function fullDateVN(d: Date | string | null | undefined = new Date()): string {
  const dt = typeof d === 'string' ? (parseISO(d) ?? new Date(d)) : d;
  if (!dt || Number.isNaN(dt.getTime())) return '';
  return `ngày ${dt.getDate()} tháng ${pad(dt.getMonth() + 1)} năm ${dt.getFullYear()}`;
}
