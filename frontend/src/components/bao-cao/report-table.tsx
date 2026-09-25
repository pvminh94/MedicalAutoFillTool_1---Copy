'use client';

import { Fragment } from 'react';
import { TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { cn, formatNumber } from '@/lib/utils';

/**
 * Cấu trúc một báo cáo đã tính (dùng chung cho màn xem báo cáo và bản chốt số liệu).
 * Đây chính là `payload` lưu trong bản chốt nên xem lại số liệu đã chốt luôn khớp
 * với thời điểm chốt.
 */
export interface ReportCell {
  colKey: string;
  value: number;
  formatted?: string;
}

export interface ReportRowView {
  rowId: number;
  rowLabel: string;
  unit?: string;
  isBold?: boolean;
  isTotal?: boolean;
  cells: ReportCell[];
}

export interface ReportBlockView {
  id: number | null;
  label: string;
  rows: ReportRowView[];
}

export interface ReportSectionView {
  id: number;
  title: string;
  rows?: ReportRowView[];
  blocks: ReportBlockView[];
}

export interface ReportColumnView {
  colKey: string;
  label: string;
  groupLabel?: string;
  align?: string;
  kind?: string;
}

export interface ReportDataView {
  columns: ReportColumnView[];
  sections: ReportSectionView[];
  totals: Record<string, number>;
}

/** Bảng số liệu báo cáo: mục → nhóm → dòng, kèm dòng tổng cộng. */
export function ReportTable({ data, compact }: { data: ReportDataView; compact?: boolean }) {
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th className="sticky left-0 z-10 bg-[var(--card)]">Chỉ tiêu</Th>
          {data.columns.map((col) => (
            <Th key={col.colKey} className="text-center">
              {!compact ? (
                <div className="text-[11px] font-normal text-[var(--muted-foreground)]">
                  {col.groupLabel || '\u00A0'}
                </div>
              ) : null}
              <div>{col.label}</div>
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.sections.map((section) => (
          <Fragment key={section.id}>
            <tr className="bg-[var(--muted)]/60">
              <Td className="font-semibold uppercase">{section.title}</Td>
              {data.columns.map((col) => (
                <Td key={col.colKey} />
              ))}
            </tr>
            {[
              ...(section.rows && section.rows.length
                ? [{ id: null as number | null, label: '', rows: section.rows }]
                : []),
              ...section.blocks,
            ].map((block, bi) => (
              <Fragment key={`${section.id}-${bi}`}>
                {block.label ? (
                  <tr className="bg-[var(--muted)]/30">
                    <Td className="pl-5 font-medium italic">{block.label}</Td>
                    {data.columns.map((col) => (
                      <Td key={col.colKey} />
                    ))}
                  </tr>
                ) : null}
                {block.rows.map((row) => (
                  <Tr
                    key={row.rowId}
                    className={cn(row.isBold && 'font-semibold', row.isTotal && 'bg-[var(--accent)]/40')}
                  >
                    <Td className="sticky left-0 z-10 bg-[var(--card)] pl-5">
                      {row.rowLabel}
                      {row.unit ? (
                        <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">({row.unit})</span>
                      ) : null}
                    </Td>
                    {data.columns.map((col) => {
                      const cell = row.cells.find((c) => c.colKey === col.colKey);
                      return (
                        <Td
                          key={col.colKey}
                          className={cn(
                            'tabular-nums',
                            col.align === 'left' ? 'text-left' : 'text-right',
                            col.kind === 'CALC' && 'text-[var(--muted-foreground)]',
                          )}
                        >
                          {cell?.formatted ?? ''}
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </Fragment>
            ))}
          </Fragment>
        ))}
        <Tr className="bg-[var(--muted)] font-bold">
          <Td className="sticky left-0 z-10 bg-[var(--card)]">TỔNG CỘNG</Td>
          {data.columns.map((col) => (
            <Td
              key={col.colKey}
              className={cn('tabular-nums', col.align === 'left' ? 'text-left' : 'text-right')}
            >
              {formatNumber(data.totals[col.colKey] ?? 0)}
            </Td>
          ))}
        </Tr>
      </tbody>
    </TableWrap>
  );
}
