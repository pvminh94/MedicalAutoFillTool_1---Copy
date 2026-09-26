import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Ghép class Tailwind, tự xử lý xung đột */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Định dạng số theo kiểu Việt Nam */
export function formatNumber(value: unknown, decimals = 0): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Định dạng ngày dd/MM/yyyy */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Định dạng ngày giờ dd/MM/yyyy HH:mm */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** Bỏ dấu tiếng Việt (tìm kiếm không dấu) */
export function normalizeVN(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Chuẩn hoá dữ liệu danh sách trả về từ API.
 *
 * Một số endpoint trả mảng phẳng, một số trả dạng phân trang `{ items, total, … }`,
 * một số bọc trong khoá riêng (ví dụ `{ total, sessions }`). Hàm này luôn trả về mảng
 * để giao diện gọi `.map/.find` an toàn, tránh lỗi "Application error" phía trình duyệt.
 */
export function toList<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (key && Array.isArray(obj[key])) return obj[key] as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
  }
  return [];
}
