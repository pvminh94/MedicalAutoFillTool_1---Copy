/**
 * Kết xuất báo cáo: Excel · Word · PDF.
 *
 * PDF dùng lại chính khung thiết kế bản in (toạ độ mm) nên báo cáo in ra luôn
 * khớp với bản in cấu hình được; nếu mẫu báo cáo có gắn `printTemplateId` thì
 * dùng luôn thiết kế người dùng đã vẽ.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { printTemplates, type PrintDocument, type PrintElement } from '../../db/schema';
import { renderPrintDocument } from '../../infra/rendering/pdf-renderer';
import { formatVN } from '../../common/utils/date.util';
import type { ReportBuildResult, ReportRowResult } from './reports.service';

export interface ExportResult {
  fileName: string;
  buffer: Buffer;
  mime: string;
  pages?: number;
}

/** Bảng dữ liệu phẳng dùng chung cho cả 3 định dạng */
export interface FlatRow {
  sectionTitle: string;
  blockLabel: string;
  groupLabel: string;
  rowLabel: string;
  isBold: boolean;
  isTotal: boolean;
  note: string;
  values: Record<string, number>;
  formatted: Record<string, string>;
}

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const;

@Injectable()
export class ReportsExportService {
  private readonly logger = new Logger(ReportsExportService.name);

  constructor(private readonly db: DbService) {}

  private flatten(report: ReportBuildResult): FlatRow[] {
    const rows: FlatRow[] = [];
    for (const section of report.sections) {
      for (const block of section.blocks) {
        for (const row of block.rows) {
          rows.push({
            sectionTitle: section.title,
            blockLabel: block.label,
            groupLabel: row.groupLabel,
            rowLabel: row.rowLabel,
            isBold: row.isBold,
            isTotal: row.isTotal,
            note: row.note,
            values: Object.fromEntries(row.cells.map((c) => [c.colKey, c.value])),
            formatted: Object.fromEntries(row.cells.map((c) => [c.colKey, c.formatted])),
          });
        }
      }
    }
    return rows;
  }

  private fileBase(report: ReportBuildResult): string {
    const code = report.template.code.replace(/[^\w-]+/g, '_');
    const dept = report.template.departmentName.replace(/\s+/g, '_');
    const range = `${report.period.from}_${report.period.to}`;
    return `BAO_CAO_${code}_${dept}_${range}`;
  }

  /* --------------------------------------------------------------- EXCEL */

  async exportExcel(report: ReportBuildResult): Promise<ExportResult> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QLBS — Phần mềm Quản lý Bệnh viện';
    wb.created = new Date();
    const ws = wb.addWorksheet(report.template.name.slice(0, 28) || 'Bao cao');

    const columns = report.columns;
    const totalCols = columns.length + 1;

    // Tiêu đề
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = report.template.title.toUpperCase();
    titleCell.font = { name: 'Times New Roman', size: 15, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    ws.mergeCells(2, 1, 2, totalCols);
    ws.getCell(2, 1).value = `Khoa: ${report.template.departmentName}   •   Kỳ báo cáo: ${report.period.label}`;
    ws.getCell(2, 1).font = { name: 'Times New Roman', size: 11, italic: true };
    ws.getCell(2, 1).alignment = { horizontal: 'center' };

    // Nhóm cột + dòng tiêu đề cột
    const hasGroups = columns.some((c) => c.groupLabel);
    const headerRowIndex = hasGroups ? 5 : 4;
    if (hasGroups) {
      ws.mergeCells(4, 1, headerRowIndex, 1);
      const labelCell = ws.getCell(4, 1);
      labelCell.value = 'Chỉ tiêu';
      labelCell.font = { name: 'Times New Roman', size: 11, bold: true };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      labelCell.border = this.thinBorder();

      let col = 2;
      for (const c of columns) {
        const cell = ws.getCell(4, col);
        cell.value = c.groupLabel ?? '';
        cell.font = { name: 'Times New Roman', size: 11, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = this.thinBorder();
        col += 1;
      }
      // Gộp ô cho các cột cùng nhóm
      let groupStart = 0;
      for (let i = 1; i <= columns.length; i++) {
        const current = columns[i]?.groupLabel ?? null;
        const start = columns[groupStart]?.groupLabel ?? '';
        if (i === columns.length || current !== start) {
          if (i - groupStart > 1 && start) ws.mergeCells(4, groupStart + 2, 4, i + 1);
          groupStart = i;
        }
      }
      ws.getRow(4).height = 18;
    }

    const headerRow = ws.getRow(headerRowIndex);
    const firstHeader = ws.getCell(headerRowIndex, 1);
    firstHeader.value = 'Chỉ tiêu';
    firstHeader.font = { name: 'Times New Roman', size: 11, bold: true };
    firstHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    firstHeader.border = this.thinBorder();

    columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 2);
      cell.value = c.unit ? `${c.label}\n(${c.unit})` : c.label;
      cell.font = { name: 'Times New Roman', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = this.thinBorder();
      ws.getColumn(i + 2).width = Math.max(9, Math.round(c.width / 6));
    });
    ws.getColumn(1).width = 42;
    headerRow.height = 30;

    // Dữ liệu
    const flat = this.flatten(report);
    let rowIndex = headerRowIndex + 1;
    let lastSection = '';
    for (const row of flat) {
      if (row.sectionTitle && row.sectionTitle !== lastSection) {
        lastSection = row.sectionTitle;
        const secRow = ws.getRow(rowIndex);
        ws.mergeCells(rowIndex, 1, rowIndex, totalCols);
        const cell = secRow.getCell(1);
        cell.value = row.sectionTitle;
        cell.font = { name: 'Times New Roman', size: 11, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
        cell.border = this.thinBorder();
        rowIndex += 1;
      }
      const excelRow = ws.getRow(rowIndex);
      const labelCell = excelRow.getCell(1);
      labelCell.value = [row.groupLabel, row.rowLabel].filter(Boolean).join(' — ');
      labelCell.font = { name: 'Times New Roman', size: 11, bold: row.isBold || row.isTotal };
      labelCell.border = this.thinBorder();
      labelCell.alignment = { vertical: 'middle', wrapText: true };

      columns.forEach((c, i) => {
        const cell = excelRow.getCell(i + 2);
        cell.value = row.values[c.colKey] ?? 0;
        cell.numFmt = c.format === 'percent' ? '0.0%' : c.format === 'integer' ? '#,##0' : '#,##0.##';
        cell.font = { name: 'Times New Roman', size: 11, bold: row.isBold || row.isTotal };
        cell.alignment = { horizontal: c.align as 'left' | 'center' | 'right', vertical: 'middle' };
        cell.border = this.thinBorder();
      });
      rowIndex += 1;
    }

    // Dòng tổng
    const totalRow = ws.getRow(rowIndex);
    const totalLabel = totalRow.getCell(1);
    totalLabel.value = 'TỔNG CỘNG';
    totalLabel.font = { name: 'Times New Roman', size: 11, bold: true };
    totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    totalLabel.border = this.thinBorder();
    columns.forEach((c, i) => {
      const cell = totalRow.getCell(i + 2);
      cell.value = report.totals[c.colKey] ?? 0;
      cell.numFmt = c.format === 'percent' ? '0.0%' : '#,##0.##';
      cell.font = { name: 'Times New Roman', size: 11, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = this.thinBorder();
      cell.alignment = { horizontal: c.align as 'left' | 'center' | 'right' };
    });
    rowIndex += 2;

    ws.mergeCells(rowIndex, 1, rowIndex, totalCols);
    ws.getCell(rowIndex, 1).value =
      report.template.footerNote ||
      `Số liệu ${report.entryCount} ô · ${report.completeness.daysWithData}/${report.period.days || '—'} ngày có số liệu`;
    ws.getCell(rowIndex, 1).font = { name: 'Times New Roman', size: 10, italic: true };
    rowIndex += 2;
    ws.mergeCells(rowIndex, 1, rowIndex, totalCols);
    ws.getCell(rowIndex, 1).value = `Ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`;
    ws.getCell(rowIndex, 1).font = { name: 'Times New Roman', size: 11, italic: true };
    ws.getCell(rowIndex, 1).alignment = { horizontal: 'right' };

    ws.views = [{ state: 'frozen', ySplit: headerRowIndex }];
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { fileName: `${this.fileBase(report)}.xlsx`, buffer, mime: MIME.xlsx };
  }

  private thinBorder(): Partial<ExcelJS.Borders> {
    const side = { style: 'thin' as const, color: { argb: 'FF94A3B8' } };
    return { top: side, left: side, bottom: side, right: side };
  }

  /* ---------------------------------------------------------------- WORD */

  async exportWord(report: ReportBuildResult): Promise<ExportResult> {
    const columns = report.columns;
    const flat = this.flatten(report);

    const headerCells = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'Chỉ tiêu', bold: true })] })],
        rowSpan: 1,
        shading: { fill: 'E2E8F0' },
      }),
      ...columns.map(
        (c) =>
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: c.unit ? `${c.label} (${c.unit})` : c.label, bold: true })],
              }),
            ],
            shading: { fill: 'E2E8F0' },
          }),
      ),
    ];

    const bodyRows: TableRow[] = [];
    let lastSection = '';
    for (const row of flat) {
      if (row.sectionTitle && row.sectionTitle !== lastSection) {
        lastSection = row.sectionTitle;
        bodyRows.push(
          new TableRow({
            children: [
              new TableCell({
                columnSpan: columns.length + 1,
                shading: { fill: 'EFF6FF' },
                children: [new Paragraph({ children: [new TextRun({ text: row.sectionTitle, bold: true })] })],
              }),
            ],
          }),
        );
      }
      bodyRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: [row.groupLabel, row.rowLabel].filter(Boolean).join(' — '),
                      bold: row.isBold || row.isTotal,
                    }),
                  ],
                }),
              ],
            }),
            ...columns.map(
              (c) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment:
                        c.align === 'left'
                          ? AlignmentType.LEFT
                          : c.align === 'right'
                            ? AlignmentType.RIGHT
                            : AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: row.formatted[c.colKey] ?? '',
                          bold: row.isBold || row.isTotal,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          ],
        }),
      );
    }

    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'FEF3C7' },
            children: [new Paragraph({ children: [new TextRun({ text: 'TỔNG CỘNG', bold: true })] })],
          }),
          ...columns.map(
            (c) =>
              new TableCell({
                shading: { fill: 'FEF3C7' },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: (report.totals[c.colKey] ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 }),
                        bold: true,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        ],
      }),
    );

    const doc = new Document({
      creator: 'QLBS',
      title: report.template.title,
      description: `${report.template.name} — ${report.period.label}`,
      sections: [
        {
          properties: {
            page: { margin: { top: 720, right: 720, bottom: 720, left: 900 } },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: report.template.departmentName.toUpperCase(), bold: true, size: 24 })],
            }),
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: report.template.title.toUpperCase(), bold: true })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `Kỳ báo cáo: ${report.period.label}`, italics: true })],
            }),
            new Paragraph({ text: '' }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
            }),
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({
                  text:
                    report.template.footerNote ||
                    `Số liệu: ${report.entryCount} ô · ${report.completeness.daysWithData}/${report.period.days || '—'} ngày có số liệu`,
                  italics: true,
                  size: 20,
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `Ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`,
                  italics: true,
                }),
              ],
            }),
          ],
        },
      ],
    });

    void BorderStyle;
    const buffer = Buffer.from(await Packer.toBuffer(doc));
    return { fileName: `${this.fileBase(report)}.docx`, buffer, mime: MIME.docx };
  }

  /* ----------------------------------------------------------------- PDF */

  /** Sinh thiết kế bản in tự động từ cấu trúc báo cáo */
  buildPrintDocument(report: ReportBuildResult): PrintDocument {
    const columns = report.columns;
    const tableWidth = 165;
    const labelWidth = 55;
    const valueWidth = (tableWidth - labelWidth) / Math.max(1, columns.length);
    const flat = this.flatten(report);

    const elements: PrintElement[] = [
      {
        id: 'dept',
        type: 'text',
        x: 25,
        y: 12,
        w: 165,
        h: 7,
        text: (report.template.departmentName || '').toUpperCase(),
        style: { fontSize: 12, bold: true, align: 'center' },
      },
      {
        id: 'title',
        type: 'text',
        x: 25,
        y: 19,
        w: 165,
        h: 9,
        text: report.template.title.toUpperCase(),
        style: { fontSize: 15, bold: true, align: 'center' },
      },
      {
        id: 'subtitle',
        type: 'text',
        x: 25,
        y: 28,
        w: 165,
        h: 6,
        text: report.template.subtitle || `Kỳ báo cáo: ${report.period.label}`,
        style: { fontSize: 11, italic: true, align: 'center' },
      },
      {
        id: 'table',
        type: 'table',
        x: 25,
        y: 38,
        w: tableWidth,
        h: 10,
        table: {
          dataSource: 'rows',
          repeatHeader: true,
          zebra: true,
          columns: [
            {
              id: 'label',
              title: 'Chỉ tiêu',
              width: labelWidth,
              align: 'left',
              binding: { source: 'field', path: 'label' },
            },
            ...columns.map((c) => ({
              id: c.colKey,
              title: c.unit ? `${c.label}\n(${c.unit})` : c.label,
              width: valueWidth,
              align: (c.align === 'left' ? 'left' : c.align === 'right' ? 'right' : 'center') as
                | 'left'
                | 'center'
                | 'right',
              binding: {
                source: 'field',
                path: c.colKey,
                format:
                  c.format === 'percent'
                    ? ({ type: 'percent', decimals: 1 } as const)
                    : ({ type: 'number', decimals: c.format === 'integer' ? 0 : 2 } as const),
              },
            })),
          ],
        },
      },
    ];

    const data = {
      rows: flat.map((r) => ({
        label: [r.sectionTitle && !r.blockLabel ? r.sectionTitle : '', r.groupLabel, r.rowLabel]
          .filter(Boolean)
          .join(' — '),
        ...r.values,
      })),
    };
    void data;

    return {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 15, right: 20, bottom: 18, left: 25 },
      pages: [{ id: 'page-1', name: 'Báo cáo', elements }],
      footer: {
        height: 10,
        elements: [
          {
            id: 'page',
            type: 'pageNumber',
            x: 100,
            y: -10,
            w: 85,
            h: 6,
            anchor: 'footer',
            repeatOnEveryPage: true,
            style: { fontSize: 10, italic: true, align: 'right' },
            meta: { label: 'Trang {page}/{pages}' },
          },
        ],
      },
    };
  }

  /** Dữ liệu dòng cho bảng trong bản in */
  buildPrintRows(report: ReportBuildResult): Record<string, unknown>[] {
    return this.flatten(report).map((r) => ({
      label: [r.groupLabel, r.rowLabel].filter(Boolean).join(' — '),
      ...r.values,
    }));
  }

  async exportPdf(report: ReportBuildResult): Promise<ExportResult> {
    const rows = this.buildPrintRows(report);
    let document = this.buildPrintDocument(report);
    let templateCode = 'AUTO';

    // Ưu tiên mẫu in đã gắn cho mẫu báo cáo
    if (report.template.printTemplateId) {
      const [tpl] = await this.db.db
        .select({ code: printTemplates.code, document: printTemplates.document })
        .from(printTemplates)
        .where(eq(printTemplates.id, report.template.printTemplateId));
      if (tpl) {
        document = tpl.document;
        templateCode = tpl.code;
      } else {
        this.logger.warn(`Mẫu in #${report.template.printTemplateId} không tồn tại — dùng bố cục tự động`);
      }
    }
    if (!document) throw new NotFoundException('Không dựng được bố cục bản in cho báo cáo');

    const result = await renderPrintDocument(document, {
      data: {
        report: {
          ...report.template,
          periodLabel: report.period.label,
          periodFrom: formatVN(report.period.from),
          periodTo: formatVN(report.period.to),
          totals: report.totals,
        },
        totals: report.totals,
      },
      rows,
      fileName: this.fileBase(report),
    });

    return {
      fileName: `${this.fileBase(report)}.pdf`,
      buffer: result.buffer,
      mime: MIME.pdf,
      pages: result.pages,
    };
  }

  /** Kết xuất cả 3 định dạng trong một lần (dùng cho tác vụ nền) */
  async exportAll(report: ReportBuildResult): Promise<Record<string, ExportResult>> {
    const [xlsx, docx, pdf] = await Promise.all([
      this.exportExcel(report),
      this.exportWord(report),
      this.exportPdf(report),
    ]);
    return { xlsx, docx, pdf };
  }
}
