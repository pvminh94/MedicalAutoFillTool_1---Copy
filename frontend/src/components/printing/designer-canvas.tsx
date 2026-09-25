'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  Lock,
  Magnet,
  Move,
  Redo2,
  Trash2,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  PAPER_SIZES_MM,
  paperDimensions,
  type PrintDocument,
  type PrintElement,
} from './print-types';

const MARGIN_PRESETS = [
  { label: 'Chuẩn (T15 P15 D15 T20)', values: { top: 15, right: 15, bottom: 15, left: 20 } },
  { label: 'Rộng lề trên (T30 T20)', values: { top: 30, right: 20, bottom: 20, left: 25 } },
  { label: 'Sát lề (10mm)', values: { top: 10, right: 10, bottom: 10, left: 10 } },
  { label: 'Đóng gáy trái (T25)', values: { top: 15, right: 15, bottom: 15, left: 35 } },
];

interface DesignerCanvasProps {
  doc: PrintDocument;
  pageIndex: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeElement: (id: string, patch: Partial<PrintElement>) => void;
  onCommit: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  showGrid: boolean;
  toggleGrid: () => void;
  snap: boolean;
  toggleSnap: () => void;
  /** Thêm phần tử mới (nhận hàm tạo để đặt đúng vị trí) */
  onAdd: (make: () => PrintElement) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Khung vẽ bản in: mỗi phần tử định vị theo milimét, kéo-thả và thay đổi kích thước
 * bằng chuột; có lưới, hít lưới, thu phóng và lớp phủ trạng thái.
 */
export function DesignerCanvas({
  doc,
  pageIndex,
  selectedId,
  onSelect,
  onChangeElement,
  onCommit,
  zoom,
  setZoom,
  showGrid,
  toggleGrid,
  snap,
  toggleSnap,
  onDuplicate,
  onRemove,
  onToggleLock,
  onToggleVisible,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: DesignerCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | {
    id: string;
    mode: 'move' | 'resize';
    handle: string;
    startX: number;
    startY: number;
    origin: PrintElement;
  }>(null);

  const page = doc.pages?.[pageIndex];
  const dims = paperDimensions(page?.paperSize ? { ...doc, paperSize: page.paperSize } : doc);
  const margins = page?.margins ?? doc.margins;
  const elements = page?.elements ?? [];
  const gridSize = doc.grid?.size ?? 5;
  const pxPerMm = 3.2 * zoom;

  const selected = useMemo(() => elements.find((e) => e.id === selectedId) ?? null, [elements, selectedId]);

  const applySnap = (value: number): number => (snap ? Math.round(value / gridSize) * gridSize : Math.round(value * 10) / 10);

  // Kéo thả / đổi kích thước bằng con trỏ (đơn vị mm)
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent): void => {
      const dx = (event.clientX - dragging.startX) / pxPerMm;
      const dy = (event.clientY - dragging.startY) / pxPerMm;
      const o = dragging.origin;

      if (dragging.mode === 'move') {
        onChangeElement(dragging.id, {
          x: Math.max(0, applySnap(o.x + dx)),
          y: Math.max(0, applySnap(o.y + dy)),
        });
        return;
      }

      const h = dragging.handle;
      let { x, y, w, hh } = { x: o.x, y: o.y, w: o.w, hh: o.h };
      if (h.includes('e')) w = Math.max(4, applySnap(o.w + dx));
      if (h.includes('s')) hh = Math.max(4, applySnap(o.h + dy));
      if (h.includes('w')) {
        const width = Math.max(4, applySnap(o.w - dx));
        x = applySnap(o.x + (o.w - width));
        w = width;
      }
      if (h.includes('n')) {
        const height = Math.max(4, applySnap(o.h - dy));
        y = applySnap(o.y + (o.h - height));
        hh = height;
      }
      onChangeElement(dragging.id, { x: Math.max(0, x), y: Math.max(0, y), w, h: hh });
    };

    const onUp = (): void => {
      setDragging(null);
      onCommit();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, pxPerMm, snap, gridSize]);

  const startDrag = (
    event: React.PointerEvent,
    element: PrintElement,
    mode: 'move' | 'resize',
    handle = '',
  ): void => {
    if (element.locked || doc.readOnly === true) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(element.id);
    setDragging({
      id: element.id,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...element },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thanh công cụ thiết kế */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-[var(--card)] px-3 py-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)">
            <Undo2 />
          </Button>
          <Button size="sm" variant="ghost" onClick={onRedo} disabled={!canRedo} title="Làm lại">
            <Redo2 />
          </Button>
        </div>
        <span className="h-5 w-px bg-[var(--border)]" />
        <Select
          className="h-8 w-28 text-xs"
          value={doc.paperSize}
          onChange={(e) => onChangeElement('__document__', { paperSize: e.target.value } as Partial<PrintElement>)}
        >
          {Object.keys(PAPER_SIZES_MM).map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          <option value="Custom">Tuỳ chỉnh</option>
        </Select>
        <Select
          className="h-8 w-32 text-xs"
          value={doc.orientation}
          onChange={(e) =>
            onChangeElement('__document__', { orientation: e.target.value } as unknown as Partial<PrintElement>)
          }
        >
          <option value="portrait">Dọc</option>
          <option value="landscape">Ngang</option>
        </Select>
        <Select
          className="h-8 w-52 text-xs"
          value=""
          onChange={(e) => {
            const preset = MARGIN_PRESETS.find((p) => p.label === e.target.value);
            if (preset) {
              onChangeElement('__document__', { margins: preset.values } as unknown as Partial<PrintElement>);
              onCommit();
            }
          }}
        >
          <option value="">Mẫu lề…</option>
          {MARGIN_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </Select>
        <span className="h-5 w-px bg-[var(--border)]" />
        <Button size="sm" variant={showGrid ? 'default' : 'outline'} onClick={toggleGrid} title="Hiện/ẩn lưới">
          <Grid3x3 />
        </Button>
        <Button size="sm" variant={snap ? 'default' : 'outline'} onClick={toggleSnap} title="Hít vào lưới">
          <Magnet />
        </Button>
        <span className="h-5 w-px bg-[var(--border)]" />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setZoom(Math.max(0.4, +(zoom - 0.2).toFixed(2)))}>
            <ZoomOut />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-[var(--muted-foreground)]">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="sm" variant="ghost" onClick={() => setZoom(Math.min(2.4, +(zoom + 0.2).toFixed(2)))}>
            <ZoomIn />
          </Button>
        </div>
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          Vùng in {Math.round(dims.width - margins.left - margins.right)} ×{' '}
          {Math.round(dims.height - margins.top - margins.bottom)} mm
        </span>
      </div>

      {/* Sân khấu */}
      <div
        className="relative min-h-0 flex-1 overflow-auto bg-[var(--muted)]/40 p-6"
        onClick={() => onSelect(null)}
      >
        <div
          ref={canvasRef}
          className="relative mx-auto bg-white shadow-lg"
          style={{
            width: dims.width * pxPerMm,
            height: dims.height * pxPerMm,
            backgroundImage: showGrid
              ? `linear-gradient(to right, rgba(148,163,184,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.28) 1px, transparent 1px)`
              : undefined,
            backgroundSize: showGrid ? `${gridSize * pxPerMm}px ${gridSize * pxPerMm}px` : undefined,
          }}
        >
          {/* Vùng lề */}
          <div
            className="pointer-events-none absolute border border-dashed border-rose-300/70"
            style={{
              left: margins.left * pxPerMm,
              top: margins.top * pxPerMm,
              width: (dims.width - margins.left - margins.right) * pxPerMm,
              height: (dims.height - margins.top - margins.bottom) * pxPerMm,
            }}
          />

          {elements.map((el) => {
            const isSelected = el.id === selectedId;
            const style = el.style ?? {};
            const scale = (style.fontSize ?? 12) * (pxPerMm / 3.7795); // pt → px
            return (
              <div
                key={el.id}
                className={cn(
                  'absolute cursor-move select-none',
                  isSelected ? 'outline outline-2 outline-offset-0 outline-sky-500' : 'hover:outline hover:outline-1 hover:outline-sky-300',
                  el.locked && 'cursor-not-allowed',
                )}
                style={{
                  left: el.x * pxPerMm,
                  top: el.y * pxPerMm,
                  width: el.w * pxPerMm,
                  height: Math.max(4, el.h * pxPerMm),
                  backgroundColor: style.backgroundColor ?? undefined,
                  color: style.color ?? '#111827',
                  fontSize: `${Math.max(6, scale)}px`,
                  fontWeight: style.bold ? 700 : 400,
                  fontStyle: style.italic ? 'italic' : 'normal',
                  textDecoration: [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
                  textAlign: style.align ?? 'left',
                  lineHeight: style.lineHeight ?? 1.3,
                  textTransform: style.textTransform === 'none' ? undefined : style.textTransform,
                  opacity: style.opacity ?? 1,
                  whiteSpace: style.wrap === false ? 'nowrap' : 'pre-wrap',
                  overflow: 'hidden',
                  borderTop: borderOf(style.border?.top, pxPerMm),
                  borderRight: borderOf(style.border?.right, pxPerMm),
                  borderBottom: borderOf(style.border?.bottom, pxPerMm),
                  borderLeft: borderOf(style.border?.left, pxPerMm),
                  borderRadius: (style.borderRadius ?? 0) * pxPerMm,
                  padding: `${(style.paddingY ?? 0) * pxPerMm}px ${(style.paddingX ?? 0) * pxPerMm}px`,
                  display: 'flex',
                  alignItems:
                    style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
                }}
                onPointerDown={(e) => startDrag(e, el, 'move')}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelect(el.id);
                }}
              >
                <div className={cn('w-full', el.type === 'line' && 'border-t border-current')} style={{ marginTop: el.type === 'line' ? el.h * pxPerMm * 0.5 : undefined }}>
                  {previewLabel(el)}
                </div>

                {el.locked ? (
                  <span className="absolute -top-2 -left-2 rounded bg-slate-700 p-0.5 text-white">
                    <Lock className="size-3" />
                  </span>
                ) : null}

                {isSelected && !el.locked ? (
                  <>
                    {(['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as const).map((handle) => (
                      <span
                        key={handle}
                        onPointerDown={(e) => startDrag(e, el, 'resize', handle)}
                        className={cn(
                          'absolute size-2.5 rounded-sm border border-white bg-sky-500',
                          handle === 'nw' && '-top-1.5 -left-1.5 cursor-nwse-resize',
                          handle === 'ne' && '-top-1.5 -right-1.5 cursor-nesw-resize',
                          handle === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                          handle === 'se' && '-bottom-1.5 -right-1.5 cursor-nwse-resize',
                          handle === 'n' && '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
                          handle === 's' && '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize',
                          handle === 'e' && 'top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize',
                          handle === 'w' && 'top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize',
                        )}
                      />
                    ))}
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <Move className="mr-1 inline size-3" />
                      {el.name ?? el.type} · {Math.round(el.x)}, {Math.round(el.y)} · {Math.round(el.w)}×{Math.round(el.h)} mm
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Thao tác nhanh với phần tử đang chọn */}
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 border-t bg-[var(--card)] px-3 py-2 text-xs">
          <span className="font-medium">
            {selected.name ?? selected.type} <span className="text-[var(--muted-foreground)]">({selected.id})</span>
          </span>
          <span className="h-4 w-px bg-[var(--border)]" />
          {[
            { icon: <AlignLeft />, value: 'left' },
            { icon: <AlignCenter />, value: 'center' },
            { icon: <AlignRight />, value: 'right' },
          ].map((a) => (
            <Button
              key={a.value}
              size="sm"
              variant={selected.style?.align === a.value ? 'default' : 'ghost'}
              onClick={() =>
                onChangeElement(selected.id, { style: { ...selected.style, align: a.value as 'left' } })
              }
            >
              {a.icon}
            </Button>
          ))}
          <Button
            size="sm"
            variant={selected.style?.bold ? 'default' : 'ghost'}
            className="font-bold"
            onClick={() => onChangeElement(selected.id, { style: { ...selected.style, bold: !selected.style?.bold } })}
          >
            B
          </Button>
          <Button
            size="sm"
            variant={selected.style?.italic ? 'default' : 'ghost'}
            className="italic"
            onClick={() => onChangeElement(selected.id, { style: { ...selected.style, italic: !selected.style?.italic } })}
          >
            I
          </Button>
          <Input
            type="color"
            className="h-8 w-10 p-1"
            value={selected.style?.color ?? '#111827'}
            onChange={(e) => onChangeElement(selected.id, { style: { ...selected.style, color: e.target.value } })}
          />
          <span className="h-4 w-px bg-[var(--border)]" />
          <Button size="sm" variant="ghost" onClick={() => onDuplicate(selected.id)} title="Nhân bản">
            <Copy />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onToggleLock(selected.id)} title="Khoá/mở khoá">
            {selected.locked ? <Unlock /> : <Lock />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleVisible(selected.id)}
            title="Ẩn/hiện khi in"
          >
            {selected.meta?.hidden === true ? <EyeOff /> : <Eye />}
          </Button>
          <Button size="sm" variant="ghost" className="text-[var(--danger)]" onClick={() => onRemove(selected.id)}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function borderOf(side: { width?: number; style?: string; color?: string } | undefined, pxPerMm: number): string | undefined {
  if (!side || side.style === 'none' || !side.width) return undefined;
  return `${Math.max(1, side.width * pxPerMm * 0.4)}px ${side.style === 'dashed' ? 'dashed' : side.style === 'dotted' ? 'dotted' : 'solid'} ${side.color ?? '#111827'}`;
}

/** Chữ hiển thị trên khung vẽ cho từng loại phần tử. */
function previewLabel(el: PrintElement): string {
  switch (el.type) {
    case 'field':
      return `{${el.binding?.path ?? 'trường'}}`;
    case 'table':
      return `▦ Bảng ${el.table?.columns.length ?? 0} cột · nguồn ${el.table?.dataSource ?? 'rows'} — ${(el.table?.columns ?? [])
        .map((c) => c.title)
        .join(' | ')}`;
    case 'image':
      return '🖼 Logo/ảnh';
    case 'qrcode':
      return '▣ QR';
    case 'signature':
      return '✍ Ô chữ ký';
    case 'pageNumber':
      return 'Trang {page}/{pages}';
    case 'datetime':
      return el.text ?? 'dd/MM/yyyy';
    case 'line':
      return '';
    case 'rect':
      return '';
    default:
      return el.text ?? '';
  }
}
