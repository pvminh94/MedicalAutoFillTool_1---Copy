'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eye,
  FileCode2,
  Layers,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DesignerCanvas } from './designer-canvas';
import { DesignerInspector } from './designer-inspector';
import {
  ELEMENT_TYPES,
  emptyDocument,
  nextId,
  normalizeDocument,
  paperDimensions,
  type PrintDocument,
  type PrintElement,
  type PrintPage,
} from './print-types';

interface DesignerProps {
  document: PrintDocument;
  readOnly?: boolean;
  /** Gọi khi bấm Lưu (kèm thiết kế hiện tại) */
  onSave: (document: PrintDocument) => void;
  saving?: boolean;
  /** Nút phụ ở góc phải thanh trên (ví dụ: Ban hành) */
  extraActions?: React.ReactNode;
}

type SideTab = 'pages' | 'elements' | 'json' | 'add';

/**
 * Trình thiết kế bản in: khung vẽ milimét + bảng thuộc tính đầy đủ + quản lý nhiều trang,
 * xem trước PDF ngay trong trình duyệt và xem/sửa JSON gốc.
 */
export function PrintDesigner({ document: initial, readOnly, onSave, saving, extraActions }: DesignerProps) {
  const [doc, setDoc] = useState<PrintDocument>(() => normalizeDocument(initial));
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [sideTab, setSideTab] = useState<SideTab>('add');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(normalizeDocument(initial), null, 2));
  const [dirty, setDirty] = useState(false);

  const history = useRef<PrintDocument[]>([]);
  const future = useRef<PrintDocument[]>([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const normalized = normalizeDocument(initial);
    setDoc(normalized);
    setJsonText(JSON.stringify(normalized, null, 2));
    history.current = [];
    future.current = [];
    setDirty(false);
    setSelectedId(null);
    setPageIndex(0);
  }, [initial]);

  // Trang hiện tại (tự tạo nếu thiết kế cũ chỉ có 1 trang phẳng)
  const pages: PrintPage[] = useMemo(() => {
    if (doc.pages?.length) return doc.pages;
    return [{ id: 'page1', name: 'Trang 1', elements: (doc.elements as PrintElement[]) ?? [] }];
  }, [doc]);
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const elements = page?.elements ?? [];
  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const dims = paperDimensions(doc);

  const snapshot = useCallback((next: PrintDocument) => {
    history.current = [...history.current.slice(-40), doc];
    future.current = [];
    setDoc(next);
    setDirty(true);
  }, [doc]);

  const updatePage = useCallback(
    (updater: (p: PrintPage) => PrintPage, record = true) => {
      const nextPages = pages.map((p, i) => (i === pageIndex ? updater(p) : p));
      const next: PrintDocument = { ...doc, pages: nextPages };
      if (record) snapshot(next);
      else {
        setDoc(next);
        setDirty(true);
      }
      setJsonText(JSON.stringify(next, null, 2));
    },
    [doc, pageIndex, pages, snapshot],
  );

  /** Sửa phần tử hoặc thuộc tính tài liệu (id `__document__`). */
  const changeElement = useCallback(
    (id: string, patch: Partial<PrintElement>) => {
      if (id === '__document__') {
        snapshot({ ...doc, ...(patch as unknown as Partial<PrintDocument>) });
        return;
      }
      updatePage(
        (p) => ({ ...p, elements: p.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)) }),
        false,
      );
    },
    [doc, snapshot, updatePage],
  );

  /** Chốt một bước chỉnh sửa để có thể hoàn tác. */
  const commit = useCallback(() => {
    history.current = [...history.current.slice(-40), doc];
    future.current = [];
    forceRender((v) => v + 1);
  }, [doc]);

  const undo = (): void => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current = [...future.current, doc];
    setDoc(previous);
    setJsonText(JSON.stringify(previous, null, 2));
    setDirty(true);
  };

  const redo = (): void => {
    const next = future.current.pop();
    if (!next) return;
    history.current = [...history.current, doc];
    setDoc(next);
    setJsonText(JSON.stringify(next, null, 2));
    setDirty(true);
  };

  const addElement = (make: () => PrintElement): void => {
    // Canh giữa ngang trong vùng in để dễ thấy ngay
    const el = make();
    el.x = Math.max(0, Math.round((dims.width - doc.margins.left - doc.margins.right - el.w) / 2) + doc.margins.left);
    updatePage((p) => ({ ...p, elements: [...p.elements, el] }));
    setSelectedId(el.id);
    toast.success(`Đã thêm: ${el.name ?? el.type}`);
  };

  const duplicateElement = (id: string): void => {
    const source = elements.find((e) => e.id === id);
    if (!source) return;
    const copy: PrintElement = { ...source, id: nextId(source.type), x: source.x + 5, y: source.y + 5 };
    updatePage((p) => ({ ...p, elements: [...p.elements, copy] }));
    setSelectedId(copy.id);
  };

  const removeElement = (id: string): void => {
    updatePage((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleLock = (id: string): void => {
    const el = elements.find((e) => e.id === id);
    if (el) changeElement(id, { locked: !el.locked });
  };

  const toggleVisible = (id: string): void => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const hidden = el.meta?.hidden !== true;
    changeElement(id, { meta: { ...(el.meta ?? {}), hidden } });
  };

  const addPage = (): void => {
    const next: PrintPage = { id: nextId('page'), name: `Trang ${pages.length + 1}`, elements: [] };
    snapshot({ ...doc, pages: [...pages, next] });
    setPageIndex(pages.length);
    toast.success('Đã thêm trang mới');
  };

  const duplicatePage = (): void => {
    const copy: PrintPage = {
      ...page,
      id: nextId('page'),
      name: `${page.name ?? 'Trang'} (bản sao)`,
      elements: page.elements.map((el) => ({ ...el, id: nextId(el.type) })),
    };
    const nextPages = [...pages];
    nextPages.splice(pageIndex + 1, 0, copy);
    snapshot({ ...doc, pages: nextPages });
    setPageIndex(pageIndex + 1);
  };

  const removePage = (): void => {
    if (pages.length === 1) {
      toast.error('Bản in phải có ít nhất một trang');
      return;
    }
    snapshot({ ...doc, pages: pages.filter((_, i) => i !== pageIndex) });
    setPageIndex(Math.max(0, pageIndex - 1));
  };

  const preview = async (): Promise<void> => {
    setPreviewing(true);
    try {
      const response = await apiFetch<Response>('/print/preview', {
        method: 'POST',
        body: { document: doc, data: {}, rows: [] },
        raw: true,
      });
      const blob = await response.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      toast.error(`Không xem trước được: ${(err as Error).message}`);
    } finally {
      setPreviewing(false);
    }
  };

  const applyJson = (): void => {
    try {
      const parsed = JSON.parse(jsonText) as PrintDocument;
      snapshot(parsed);
      toast.success('Đã áp dụng thiết kế từ JSON');
    } catch (err) {
      toast.error(`JSON không hợp lệ: ${(err as Error).message}`);
    }
  };

  const importJson = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(String(reader.result ?? ''));
      toast.success('Đã nạp tệp JSON — bấm "Áp dụng JSON" để dùng');
    };
    reader.readAsText(file);
  };

  const downloadJson = (): void => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = 'thiet-ke-ban-in.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-[78vh] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-[var(--card)]">
      {/* Thanh trên */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Badge tone={dirty ? 'warning' : 'muted'}>
          {doc.paperSize} · {doc.orientation === 'portrait' ? 'dọc' : 'ngang'} ·{' '}
          {Math.round(dims.width)}×{Math.round(dims.height)} mm
        </Badge>
        <Badge tone="info">{elements.length} phần tử / trang {pageIndex + 1}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void preview()} loading={previewing}>
            <Eye /> Xem trước PDF
          </Button>
          {extraActions}
          <Button size="sm" variant="outline" onClick={() => { resetDocument(emptyDocument()); }}>
            Thiết kế trống
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            loading={saving}
            onClick={() => {
              onSave(doc);
              setDirty(false);
            }}
          >
            <Save /> Lưu thiết kế
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Cột trái: trang · phần tử · thêm · JSON */}
        <div className="flex w-72 shrink-0 flex-col border-r">
          <div className="flex shrink-0 gap-1 border-b px-2 py-1.5">
            {(
              [
                { key: 'add', label: 'Thêm', icon: <Plus className="size-3.5" /> },
                { key: 'pages', label: 'Trang', icon: <Layers className="size-3.5" /> },
                { key: 'elements', label: 'Phần tử', icon: <Copy className="size-3.5" /> },
                { key: 'json', label: 'JSON', icon: <FileCode2 className="size-3.5" /> },
              ] as { key: SideTab; label: string; icon: React.ReactNode }[]
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSideTab(t.key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                  sideTab === t.key
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sideTab === 'add' ? (
              <div className="space-y-1.5">
                <p className="px-1 text-[11px] text-[var(--muted-foreground)]">
                  Bấm để thêm phần tử vào trang {pageIndex + 1}, sau đó kéo thả và chỉnh thuộc tính bên phải.
                </p>
                {ELEMENT_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    disabled={readOnly}
                    onClick={() => addElement(t.make)}
                    className="w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)] disabled:opacity-50"
                  >
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">{t.hint}</div>
                  </button>
                ))}
              </div>
            ) : null}

            {sideTab === 'pages' ? (
              <div className="space-y-2">
                {pages.map((p, i) => (
                  <div
                    key={p.id}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-2 text-sm',
                      i === pageIndex ? 'border-[var(--primary)] bg-[var(--accent)]' : 'hover:bg-[var(--accent)]/60',
                    )}
                    onClick={() => {
                      setPageIndex(i);
                      setSelectedId(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.name ?? `Trang ${i + 1}`}</span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">{p.elements.length} phần tử</span>
                    </div>
                    <Input
                      className="mt-1.5 h-7 text-xs"
                      value={p.name ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const nextPages = pages.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x));
                        setDoc({ ...doc, pages: nextPages });
                        setDirty(true);
                      }}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={addPage}>
                    <Plus /> Thêm trang
                  </Button>
                  <Button size="sm" variant="outline" onClick={duplicatePage} title="Nhân bản trang">
                    <Copy />
                  </Button>
                  <Button size="sm" variant="outline" className="text-[var(--danger)]" onClick={removePage} title="Xoá trang">
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ) : null}

            {sideTab === 'elements' ? (
              <div className="space-y-1">
                {elements.length === 0 ? (
                  <p className="px-1 text-[11px] text-[var(--muted-foreground)]">
                    Trang này chưa có phần tử nào — chuyển sang tab “Thêm”.
                  </p>
                ) : null}
                {[...elements]
                  .sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || a.y - b.y)
                  .map((el) => (
                    <div
                      key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
                        el.id === selectedId ? 'border-[var(--primary)] bg-[var(--accent)]' : 'hover:bg-[var(--accent)]/60',
                      )}
                    >
                      <span className="flex-1 truncate">
                        {el.name ?? el.type}
                        <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">{el.type}</span>
                      </span>
                      {el.meta?.hidden === true ? <span title="Ẩn khi in">🚫</span> : null}
                      {el.locked ? <span title="Đã khoá">🔒</span> : null}
                      <span className="tabular-nums text-[10px] text-[var(--muted-foreground)]">
                        {Math.round(el.x)},{Math.round(el.y)}
                      </span>
                    </div>
                  ))}
              </div>
            ) : null}

            {sideTab === 'json' ? (
              <div className="flex h-full flex-col gap-2">
                <textarea
                  className="min-h-0 flex-1 rounded-lg border bg-[var(--background)] p-2 font-mono text-[11px]"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={applyJson}>
                    Áp dụng JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadJson}>
                    <Save /> Tải tệp
                  </Button>
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-[var(--accent)]">
                    <Upload className="size-3.5" /> Nạp tệp
                    <input
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) importJson(file);
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Khung vẽ */}
        <DesignerCanvas
          doc={doc}
          pageIndex={pageIndex}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChangeElement={changeElement}
          onCommit={commit}
          zoom={zoom}
          setZoom={setZoom}
          showGrid={doc.grid?.show !== false}
          toggleGrid={() => changeElement('__document__', { grid: { ...(doc.grid ?? {}), show: doc.grid?.show === false } } as unknown as Partial<PrintElement>)}
          snap={doc.grid?.snap !== false}
          toggleSnap={() => changeElement('__document__', { grid: { ...(doc.grid ?? {}), snap: doc.grid?.snap === false } } as unknown as Partial<PrintElement>)}
          onAdd={addElement}
          onDuplicate={duplicateElement}
          onRemove={removeElement}
          onToggleLock={toggleLock}
          onToggleVisible={toggleVisible}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.current.length > 0}
          canRedo={future.current.length > 0}
        />
      </div>

      {/* Cột phải: thuộc tính */}
      <div className="flex min-h-0 flex-1 border-t">
        <div className="w-full min-h-0">
          <DesignerInspector doc={doc} element={selected} onChange={changeElement} onCommit={commit} />
        </div>
      </div>

      {/* Xem trước PDF */}
      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="flex h-full w-full max-w-5xl flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="text-sm font-medium">Xem trước bản in</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => window.open(previewUrl, '_blank')}>
                  Mở tab mới
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
                  <X />
                </Button>
              </div>
            </div>
            <iframe title="Xem trước bản in" src={previewUrl} className="min-h-0 flex-1 bg-white" />
          </Card>
        </div>
      ) : null}
    </div>
  );

  function resetDocument(next: PrintDocument): void {
    snapshot(next);
    setSelectedId(null);
    setPageIndex(0);
    toast.success('Đã tạo thiết kế trống');
  }
}

/** Nút chọn khổ giấy nhanh (dùng ở nơi khác nếu cần). */
export function PaperSizeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">Khổ giấy</Label>
      <Select className="h-8 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        {['A4', 'A5', 'A3', 'Letter', 'Legal', 'Custom'].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </div>
  );
}
