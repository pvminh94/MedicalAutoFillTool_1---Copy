/**
 * Bộ máy render bản in: PrintDocument (JSON, toạ độ mm) → PDF.
 *
 * Đặc điểm:
 *  - Toạ độ tuyệt đối trên trang, đơn vị mm (1 mm = 2.8346 pt) → in ra chính xác.
 *  - Nhúng font TTF nên hiển thị đúng tiếng Việt có dấu.
 *  - Hỗ trợ: văn bản, trường dữ liệu, bảng động (tự phân trang), đường kẻ, khung,
 *    hình ảnh, chữ ký, số trang, điều kiện hiển thị, biểu thức trong chuỗi {…}.
 *  - Bảng tự động xuống trang: lặp lại dòng tiêu đề ở mỗi trang.
 */
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, degrees, rgb, type RGB } from 'pdf-lib';
import type {
  ElementStyle,
  PrintDocument,
  PrintElement,
  TableColumnSpec,
} from '../../db/schema/printing';
import { evaluateFormula } from '../../common/utils/formula.util';
import { formatVN } from '../../common/utils/date.util';

export const MM = 2.834645669; // 1 mm tính bằng point

const PAPER_MM: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export interface RenderContext {
  /** Dữ liệu phân cấp: { request: {...}, signature: {...}, system: {...} } */
  data: Record<string, unknown>;
  /** Dòng dữ liệu cho phần tử bảng */
  rows?: Record<string, unknown>[];
  /** Tên tệp gợi ý */
  fileName?: string;
}

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

const logger = new Logger('PdfRenderer');
let fontBytes: Record<string, Buffer> | null = null;

function fontDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'assets', 'fonts'),
    path.resolve(process.cwd(), 'assets', 'fonts'),
    path.resolve(process.cwd(), 'backend', 'assets', 'fonts'),
    path.resolve(__dirname, '..', '..', '..', '..', 'assets', 'fonts'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

function loadFontBytes(): Record<string, Buffer> {
  if (fontBytes) return fontBytes;
  const dir = fontDir();
  const read = (name: string): Buffer => {
    const full = path.join(dir, name);
    return fs.existsSync(full) ? fs.readFileSync(full) : Buffer.alloc(0);
  };
  const regular = read('Roboto-Regular.ttf');
  fontBytes = {
    regular,
    bold: read('Roboto-Medium.ttf').length > 0 ? read('Roboto-Medium.ttf') : regular,
    italic: read('Roboto-Italic.ttf').length > 0 ? read('Roboto-Italic.ttf') : regular,
    boldItalic:
      read('Roboto-MediumItalic.ttf').length > 0 ? read('Roboto-MediumItalic.ttf') : regular,
  };
  if (regular.length === 0) {
    logger.warn(`Không tìm thấy font tại ${dir} — chữ tiếng Việt có thể hiển thị sai`);
  }
  return fontBytes;
}

async function embedFonts(doc: PDFDocument): Promise<FontSet> {
  doc.registerFontkit(fontkit);
  const bytes = loadFontBytes();
  return {
    regular: await doc.embedFont(bytes.regular, { subset: true }),
    bold: await doc.embedFont(bytes.bold, { subset: true }),
    italic: await doc.embedFont(bytes.italic, { subset: true }),
    boldItalic: await doc.embedFont(bytes.boldItalic, { subset: true }),
  };
}

function pickFont(base: 'regular' | 'bold' | 'italic' | 'boldItalic', fonts: FontSet): PDFFont {
  return fonts[base];
}

function fontFor(style: ElementStyle | undefined, fonts: FontSet): PDFFont {
  const bold = style?.bold === true;
  const italic = style?.italic === true;
  if (bold && italic) return pickFont('boldItalic', fonts);
  if (bold) return pickFont('bold', fonts);
  if (italic) return pickFont('italic', fonts);
  return pickFont('regular', fonts);
}

function colorOf(value: string | undefined, fallback: RGB): RGB {
  if (!value) return fallback;
  const hex = value.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  );
}

/* ------------------------------------------------------------- Truy xuất dữ liệu */

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function formatValue(raw: unknown, format?: { type?: string; pattern?: string; decimals?: number; fallback?: string; prefix?: string; suffix?: string; expression?: string }): string {
  if (raw === undefined || raw === null || raw === '') {
    if (format?.expression) {
      const res = evaluateFormula(format.expression, { values: {} });
      return String(res.value);
    }
    return format?.fallback ?? '';
  }
  const type = format?.type ?? 'text';
  let out: string;
  switch (type) {
    case 'number':
    case 'integer': {
      const n = Number(typeof raw === 'string' ? raw.replace(/[^\d.-]/g, '') : raw);
      if (!Number.isFinite(n)) {
        out = String(raw);
        break;
      }
      const decimals = type === 'integer' ? 0 : (format?.decimals ?? 0);
      out = n.toLocaleString('vi-VN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      break;
    }
    case 'currency': {
      const n = Number(raw);
      out = Number.isFinite(n)
        ? `${n.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ`
        : String(raw);
      break;
    }
    case 'percent': {
      const n = Number(raw);
      out = Number.isFinite(n) ? `${(n * 100).toFixed(format?.decimals ?? 1)}%` : String(raw);
      break;
    }
    case 'date': {
      out = formatVN(String(raw).slice(0, 10));
      break;
    }
    case 'datetime': {
      const d = new Date(String(raw));
      out = Number.isNaN(d.getTime())
        ? String(raw)
        : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      break;
    }
    case 'bool':
      out = raw ? 'Có' : 'Không';
      break;
    default:
      out = String(raw);
  }
  return `${format?.prefix ?? ''}${out}${format?.suffix ?? ''}`;
}

/** Thay thế {đường.dẫn} trong chuỗi bằng dữ liệu thật */
function interpolate(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{([a-zA-Z0-9_.\[\]]+)\}/g, (_m, expr: string) => {
    const value = getByPath(data, expr);
    if (value === undefined || value === null) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.includes('T') ? formatValue(value, { type: 'datetime' }) : formatVN(value.slice(0, 10));
    }
    return String(value);
  });
}

/* --------------------------------------------------------------- Vẽ văn bản */

interface TextBlock {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width > maxWidth && line) {
        out.push(line);
        // Từ quá dài: cắt theo ký tự
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = word;
        }
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  return out;
}

function drawBorders(
  page: PDFPage,
  style: ElementStyle | undefined,
  x: number,
  yTop: number,
  w: number,
  h: number,
): void {
  const border = style?.border;
  if (!border) return;
  const line = (side: 'top' | 'right' | 'bottom' | 'left'): void => {
    const spec = border[side];
    if (!spec || spec.style === 'none' || !spec.width) return;
    const color = colorOf(spec.color, rgb(0, 0, 0));
    const thickness = Math.max(0.2, spec.width) * MM;
    const dash = spec.style === 'dashed' ? [3, 2] : spec.style === 'dotted' ? [1, 1.5] : undefined;
    if (side === 'top') page.drawLine({ start: { x, y: yTop }, end: { x: x + w, y: yTop }, thickness, color, dashArray: dash });
    if (side === 'bottom') page.drawLine({ start: { x, y: yTop - h }, end: { x: x + w, y: yTop - h }, thickness, color, dashArray: dash });
    if (side === 'left') page.drawLine({ start: { x, y: yTop }, end: { x, y: yTop - h }, thickness, color, dashArray: dash });
    if (side === 'right') page.drawLine({ start: { x: x + w, y: yTop }, end: { x: x + w, y: yTop - h }, thickness, color, dashArray: dash });
  };
  (['top', 'right', 'bottom', 'left'] as const).forEach(line);
}

function drawTextElement(
  page: PDFPage,
  el: PrintElement,
  text: string,
  fonts: FontSet,
  originX: number,
  originY: number,
): void {
  const style = el.style ?? {};
  let fontSize = (style.fontSize ?? 12) * 1; // pt
  const x = originX + el.x * MM;
  const yTop = originY - el.y * MM;
  const w = el.w * MM;
  const h = el.h * MM;
  const paddingX = (style.paddingX ?? 0) * MM;
  const paddingY = (style.paddingY ?? 0) * MM;
  const innerW = Math.max(1, w - paddingX * 2);
  const innerH = Math.max(1, h - paddingY * 2);

  if (style.backgroundColor) {
    page.drawRectangle({
      x,
      y: yTop - h,
      width: w,
      height: h,
      color: colorOf(style.backgroundColor, rgb(1, 1, 1)),
      opacity: style.opacity ?? 1,
    });
  }

  const transform = style.textTransform;
  if (transform === 'uppercase') text = text.toUpperCase();
  if (transform === 'lowercase') text = text.toLowerCase();

  let font = fontFor(style, fonts);
  let block: TextBlock = {
    lines: wrapText(text, font, fontSize, innerW),
    fontSize,
    lineHeight: style.lineHeight ?? 1.35,
  };

  // Tự thu nhỏ cỡ chữ cho vừa ô
  if (style.autoShrink !== false) {
    let guard = 0;
    while (
      block.lines.length * block.fontSize * block.lineHeight > innerH / 1 &&
      fontSize > 5 &&
      guard++ < 20
    ) {
      fontSize -= 0.5;
      block = {
        lines: wrapText(text, font, fontSize, innerW),
        fontSize,
        lineHeight: style.lineHeight ?? 1.35,
      };
    }
  }

  const lineHeightPt = block.fontSize * block.lineHeight;
  const totalHeight = block.lines.length * lineHeightPt;
  const valign = style.verticalAlign ?? 'top';
  let cursorY =
    valign === 'middle'
      ? yTop - paddingY - (innerH - totalHeight) / 2
      : valign === 'bottom'
        ? yTop - paddingY - (innerH - totalHeight)
        : yTop - paddingY;

  const align = style.align ?? 'left';
  const color = colorOf(style.color, rgb(0, 0, 0));

  for (const line of block.lines) {
    if (line !== '') {
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      const drawX =
        align === 'center'
          ? x + paddingX + (innerW - lineWidth) / 2
          : align === 'right'
            ? x + w - paddingX - lineWidth
            : x + paddingX;
      page.drawText(line, {
        x: drawX,
        y: cursorY - block.fontSize,
        size: block.fontSize,
        font,
        color,
        opacity: style.opacity ?? 1,
      });
      if (style.underline) {
        page.drawLine({
          start: { x: drawX, y: cursorY - block.fontSize - 1.2 },
          end: { x: drawX + lineWidth, y: cursorY - block.fontSize - 1.2 },
          thickness: 0.5,
          color,
        });
      }
    }
    cursorY -= lineHeightPt;
  }

  drawBorders(page, style, x, yTop, w, h);
}

/* ------------------------------------------------------------------- Bảng động */

function tableRowValues(
  row: Record<string, unknown>,
  columns: TableColumnSpec[],
  index: number,
): string[] {
  return columns.map((col) => {
    const binding = col.binding;
    if (!binding) return '';
    if (binding.source === 'index') return String(index + 1);
    if (binding.path) {
      const raw = getByPath(row, binding.path);
      return formatValue(raw, binding.format);
    }
    return '';
  });
}

function drawTable(
  doc: PDFDocument,
  pages: PDFPage[],
  pageIndex: number,
  el: PrintElement,
  rows: Record<string, unknown>[],
  fonts: FontSet,
  originX: number,
  originY: number,
  contentBottom: number,
): number {
  const page = pages[pageIndex];
  const spec = el.table;
  const columns = spec?.columns ?? [];
  const x = originX + el.x * MM;
  let cursorY = originY - el.y * MM;
  const totalWidth = el.w * MM;
  const declared = columns.reduce((sum, c) => sum + (c.width ?? 1), 0) || 1;
  const colWidths = columns.map((c) => ((c.width ?? 1) / declared) * totalWidth);

  const headerStyle: ElementStyle = {
    bold: true,
    fontSize: 11,
    align: 'center',
    backgroundColor: '#f1f5f9',
    ...spec?.headerStyle,
    border: spec?.headerStyle?.border ?? {
      top: { width: 0.25, style: 'solid', color: '#000000' },
      bottom: { width: 0.25, style: 'solid', color: '#000000' },
      left: { width: 0.25, style: 'solid', color: '#000000' },
      right: { width: 0.25, style: 'solid', color: '#000000' },
    },
  };
  const bodyStyle: ElementStyle = {
    fontSize: 11,
    ...spec?.bodyStyle,
    border: spec?.bodyStyle?.border ?? {
      top: { width: 0.2, style: 'solid', color: '#94a3b8' },
      bottom: { width: 0.2, style: 'solid', color: '#94a3b8' },
      left: { width: 0.2, style: 'solid', color: '#94a3b8' },
      right: { width: 0.2, style: 'solid', color: '#94a3b8' },
    },
  };
  const headerHeight = ((headerStyle.fontSize ?? 11) * 1.6 + 4) * 1;

  const drawHeader = (target: PDFPage, y: number): number => {
    let cellX = x;
    columns.forEach((col, i) => {
      const cell: PrintElement = {
        id: `${el.id}-h-${i}`,
        type: 'text',
        x: (cellX - originX) / MM,
        y: (originY - y) / MM,
        w: colWidths[i] / MM,
        h: headerHeight / MM,
        text: col.title,
        style: headerStyle,
      };
      drawTextElement(target, cell, col.title, fonts, originX, originY);
      cellX += colWidths[i];
    });
    return y - headerHeight;
  };

  cursorY = drawHeader(page, cursorY);
  let currentPage = pageIndex;

  rows.forEach((row, idx) => {
    const values = tableRowValues(row, columns, idx);
    // Chiều cao dòng theo nội dung dài nhất
    let rowHeight = ((bodyStyle.fontSize ?? 11) * 1.35 + 5) * 1;
    columns.forEach((col, i) => {
      const fs = bodyStyle.fontSize ?? 11;
      const font = fontFor(bodyStyle, fonts);
      const innerW = colWidths[i] - 2;
      const lines = wrapText(values[i] ?? '', font, fs, innerWidthColumn(innerW));
      rowHeight = Math.max(rowHeight, lines.length * fs * 1.35 + 5);
    });

    if (cursorY - rowHeight < contentBottom) {
      // Sang trang mới
      const currentSize = pages[0].getSize();
      const next = doc.addPage([currentSize.width, currentSize.height]);
      pages.push(next);
      currentPage = pages.length - 1;
      cursorY = originY;
      if (spec?.repeatHeader !== false) cursorY = drawHeader(next, cursorY);
    }

    const target = pages[currentPage];
    let cellX = x;
    columns.forEach((col, i) => {
      const cellStyle: ElementStyle = {
        ...bodyStyle,
        align: col.align ?? bodyStyle.align ?? 'left',
        backgroundColor: spec?.zebra && idx % 2 === 1 ? '#f8fafc' : bodyStyle.backgroundColor,
      };
      const cell: PrintElement = {
        id: `${el.id}-c-${idx}-${i}`,
        type: 'text',
        x: (cellX - originX) / MM,
        y: (originY - cursorY) / MM,
        w: colWidths[i] / MM,
        h: rowHeight / MM,
        text: values[i] ?? '',
        style: cellStyle,
      };
      drawTextElement(target, cell, values[i] ?? '', fonts, originX, originY);
      cellX += colWidths[i];
    });
    cursorY -= rowHeight;
  });

  return cursorY;
}

function innerWidthColumn(width: number): number {
  return Math.max(4, width - 2);
}

/* ------------------------------------------------------------------- Render */

export interface RenderResult {
  buffer: Buffer;
  pages: number;
  widthMm: number;
  heightMm: number;
}

export async function renderPrintDocument(
  document: PrintDocument,
  ctx: RenderContext,
): Promise<RenderResult> {
  const doc = await PDFDocument.create();
  doc.setTitle(ctx.fileName ?? 'QLBS');
  doc.setProducer('QLBS — Phần mềm Quản lý Bệnh viện');
  doc.setCreator('QLBS');
  const fonts = await embedFonts(doc);

  const pagesSpec = document.pages && document.pages.length > 0 ? document.pages : null;
  const baseSize = (() => {
    const size = pagesSpec?.[0]?.paperSize ?? document.paperSize;
    const orientation = pagesSpec?.[0]?.orientation ?? document.orientation;
    if (size === 'Custom' && document.customSize) {
      return [document.customSize.width, document.customSize.height] as [number, number];
    }
    const entry = PAPER_MM[String(size)] ?? PAPER_MM['A4'];
    return (orientation === 'landscape' ? [entry[1], entry[0]] : [entry[0], entry[1]]) as [number, number];
  })();

  const widthMm = baseSize[0];
  const heightMm = baseSize[1];
  const pagePts: [number, number] = [widthMm * MM, heightMm * MM];

  const margins = pagesSpec?.[0]?.margins ?? document.margins ?? { top: 15, right: 15, bottom: 15, left: 20 };
  const contentBottom = margins.bottom * MM;

  const data = { ...ctx.data };
  const now = new Date();
  data['system'] = {
    day: String(now.getDate()).padStart(2, '0'),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    year: String(now.getFullYear()),
    date: formatVN(now.toISOString().slice(0, 10)),
    datetime: now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    page: '',
    pages: '',
    ...(data['system'] as Record<string, unknown> | undefined),
  };

  // Gộp phần tử của mọi trang + phần tử tiêu đề/chân trang khai báo ở cấp tài liệu
  const declared: PrintElement[] = [
    ...(pagesSpec ? pagesSpec.flatMap((p) => p.elements ?? []) : []),
    ...(document.header?.elements ?? []),
    ...(document.footer?.elements ?? []),
  ].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const repeatElements = declared.filter((el) => el.repeatOnEveryPage === true && el.type !== 'table');
  const usesTotal = (el: PrintElement): boolean =>
    typeof el.text === 'string' && el.text.includes('{system.pages}');
  // Phần tử cần biết tổng số trang → vẽ sau khi đã chốt số trang
  const lateElements = declared.filter(
    (el) => !repeatElements.includes(el) && usesTotal(el),
  );
  const onceElements = declared.filter(
    (el) => !repeatElements.includes(el) && !lateElements.includes(el),
  );

  const pages: PDFPage[] = [doc.addPage(pagePts)];

  /**
   * Toạ độ y tuyệt đối (mm). Phần tử neo chân trang được phép khai báo y âm
   * để tính ngược từ đáy trang — nhờ đó đổi khổ giấy không phải chỉnh lại bố cục.
   */
  const anchorY = (el: PrintElement): number => {
    if (el.anchor === 'footer' && el.y < 0) return heightMm + el.y;
    if (el.anchor === 'header' && el.y < 0) return -el.y;
    return el.y;
  };

  const isVisible = (el: PrintElement): boolean => {
    if (!el.visibleWhen) return true;
    const res = evaluateFormula(interpolate(el.visibleWhen, data), { values: {}, texts: data });
    return res.value !== 0;
  };

  /** Vẽ một phần tử lên một trang cụ thể */
  const drawOne = async (
    page: PDFPage,
    rawEl: PrintElement,
    pageIndex: number,
    totalPages: number,
  ): Promise<void> => {
    const adjustedY = anchorY(rawEl);
    const el: PrintElement = adjustedY === rawEl.y ? rawEl : { ...rawEl, y: adjustedY };
    const system = data['system'] as Record<string, unknown>;
    system['page'] = String(pageIndex + 1);
    system['pages'] = String(totalPages);
    const originX = 0; // toạ độ tuyệt đối trên trang
    const originY = pagePts[1];

    switch (el.type) {
      case 'text': {
        drawTextElement(page, el, interpolate(el.text ?? '', data), fonts, originX, originY);
        break;
      }
      case 'field': {
        const raw = el.binding?.path ? getByPath(data, el.binding.path) : undefined;
        const value = formatValue(raw, el.binding?.format as never);
        const label = (el.meta?.['label'] as string | undefined) ?? '';
        drawTextElement(page, el, value || interpolate(label, data), fonts, originX, originY);
        break;
      }
      case 'line': {
        const style = el.style ?? {};
        const color = colorOf(style.color, rgb(0, 0, 0));
        const side = style.border?.bottom ?? style.border?.top;
        const thickness = Math.max(0.2, side?.width ?? 0.3) * MM;
        const y = originY - el.y * MM;
        const dash =
          side?.style === 'dashed' ? [3, 2] : side?.style === 'dotted' ? [1, 1.5] : undefined;
        page.drawLine({
          start: { x: el.x * MM, y },
          end: { x: (el.x + (el.w || widthMm - el.x)) * MM, y },
          thickness,
          color,
          dashArray: dash,
        });
        break;
      }
      case 'rect': {
        page.drawRectangle({
          x: el.x * MM,
          y: originY - (el.y + el.h) * MM,
          width: el.w * MM,
          height: el.h * MM,
          borderColor: colorOf(el.style?.color, rgb(0, 0, 0)),
          borderWidth: Math.max(0.2, el.style?.border?.top?.width ?? 0.3) * MM,
          color: el.style?.backgroundColor ? colorOf(el.style.backgroundColor, rgb(1, 1, 1)) : undefined,
          opacity: el.style?.opacity ?? 1,
        });
        break;
      }
      case 'image': {
        const bytes = el.image?.path
          ? (() => {
              const full = path.resolve(el.image?.path ?? '');
              return fs.existsSync(full) ? fs.readFileSync(full) : null;
            })()
          : el.image?.src
            ? (() => {
                const b64 = el.image?.src ?? '';
                const rawB64 = b64.includes(',') ? b64.split(',')[1] : b64;
                try {
                  return Buffer.from(rawB64, 'base64');
                } catch {
                  return null;
                }
              })()
            : null;
        if (bytes) {
          const isPng = bytes.subarray(0, 4).toString('hex') === '89504e47';
          const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          page.drawImage(img, {
            x: el.x * MM,
            y: originY - (el.y + el.h) * MM,
            width: el.w * MM,
            height: el.h * MM,
          });
        }
        break;
      }
      case 'pageNumber':
      case 'datetime': {
        const template =
          (el.meta?.['label'] as string | undefined) ??
          (el.type === 'datetime' ? '{system.datetime}' : 'Trang {page}/{pages}');
        const text = template
          .replace(/\{page\}/g, String(pageIndex + 1))
          .replace(/\{pages\}/g, String(totalPages))
          .replace(/\{total\}/g, String(totalPages));
        drawTextElement(page, el, interpolate(text, data), fonts, originX, originY);
        break;
      }
      default: {
        if (el.text) drawTextElement(page, el, interpolate(el.text, data), fonts, originX, originY);
      }
    }
  };

  // 1) Phần tử chỉ xuất hiện một lần — bảng có thể tự động thêm trang
  for (const el of onceElements) {
    if (!isVisible(el)) continue;
    if (el.type === 'table') {
      drawTable(doc, pages, pages.length - 1, el, ctx.rows ?? [], fonts, 0, pagePts[1], contentBottom);
      continue;
    }
    await drawOne(pages[0], el, 0, Math.max(1, pages.length));
  }

  // 2) Phần tử cần tổng số trang (bảng tổng, 'Trang x/y' ở cuối văn bản…)
  for (const el of lateElements) {
    if (!isVisible(el)) continue;
    await drawOne(pages[0], el, 0, pages.length);
  }

  // 3) Phần tử lặp lại trên mọi trang (tiêu đề, chân trang, số trang…)
  const totalPages = pages.length;
  for (let index = 0; index < pages.length; index++) {
    for (const el of repeatElements) {
      if (!isVisible(el)) continue;
      await drawOne(pages[index], el, index, totalPages);
    }
  }

  const bytes = await doc.save();
  return {
    buffer: Buffer.from(bytes),
    pages: pages.length,
    widthMm,
    heightMm,
  };
}
