/**
 * Phân hệ BÁO CÁO CÔNG TÁC KHOA — mẫu báo cáo động.
 *
 * Cây cấu trúc:  ReportTemplate ─┬─< Section ─┬─< Block ─< ReportRow
 *                                │            └─< ReportRow  (dòng tự do, không thuộc nhóm)
 *                                └─< ColumnDef  (ĐỐI TƯỢNG / cột số liệu: nhập tay hoặc tính theo công thức)
 *
 * Số liệu:       ReportEntry (row × column × ngày) — duy nhất theo bộ khoá này.
 * Mọi thứ khai báo được từ giao diện: KHÔNG set cứng HS/TQ/TE… hay tên khoa.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { departments } from './org';
import { users } from './system';
import type { AggMode, ColumnKind } from './types';

/* ------------------------------------------------------------------ Mẫu báo cáo */
export const reportTemplates = pgTable(
  'report_templates',
  {
    id: serial('id').primaryKey(),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** Tiêu đề in trên báo cáo */
    title: text('title').default('BÁO CÁO CÔNG TÁC CHUYÊN MÔN').notNull(),
    subtitle: text('subtitle').default('').notNull(),
    /** Ghi chú chân báo cáo */
    footerNote: text('footer_note').default('').notNull(),
    /** Kỳ báo cáo mặc định: day | week | month | quarter | year | range */
    defaultPeriod: text('default_period').default('day').notNull(),
    /** Mẫu in dùng cho báo cáo này (liên kết phân hệ thiết kế bản in) */
    printTemplateId: integer('print_template_id'),
    /** Cấu hình hiển thị bảng: độ rộng, màu, cỡ chữ… */
    layout: jsonb('layout').$type<Record<string, unknown>>().default({}).notNull(),
    version: integer('version').default(1).notNull(),
    isDefault: boolean('is_default').default(true).notNull(),
    active: boolean('active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('report_templates_dept_code_uq').on(t.departmentId, t.code),
    index('report_templates_dept_idx').on(t.departmentId),
    index('report_templates_active_idx').on(t.active),
  ],
);

/* ------------------------------------------------------------------------- Mục */
export const reportSections = pgTable(
  'report_sections',
  {
    id: serial('id').primaryKey(),
    templateId: integer('template_id')
      .notNull()
      .references(() => reportTemplates.id, { onDelete: 'cascade' }),
    code: text('code').default('').notNull(),
    title: text('title').notNull(),
    /** Ghi chú / hướng dẫn nhập liệu hiển thị cho người nhập */
    note: text('note').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    /** Ngừng sử dụng thay vì xóa — bảo toàn toàn bộ số liệu lịch sử */
    archived: boolean('archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('report_sections_tmpl_idx').on(t.templateId),
    index('report_sections_order_idx').on(t.templateId, t.sortOrder),
  ],
);

/* ------------------------------------------------------------------ Nhóm dòng */
export const reportBlocks = pgTable(
  'report_blocks',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => reportSections.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    /** Cột gộp ô (rowspan) khi in báo cáo */
    rowSpan: integer('row_span').default(0).notNull(),
    note: text('note').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    archived: boolean('archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('report_blocks_section_idx').on(t.sectionId)],
);

/* ------------------------------------------------------------------------ Dòng */
export const reportRows = pgTable(
  'report_rows',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => reportSections.id, { onDelete: 'cascade' }),
    /** null = dòng tự do nằm trực tiếp trong mục */
    blockId: integer('block_id').references(() => reportBlocks.id, { onDelete: 'cascade' }),
    /** Nhãn nhóm hiển thị ở cột đầu (vd: "BHYT") */
    groupLabel: text('group_label').default('').notNull(),
    rowLabel: text('row_label').notNull(),
    /** Cách cộng dồn theo kỳ: SUM | FIRST | LAST | AVG | MIN | MAX */
    agg: text('agg').$type<AggMode>().default('SUM').notNull(),
    /** Đơn vị tính: ca, người, lượt, ngày… */
    unit: text('unit').default('').notNull(),
    /** Đánh dấu dòng tổng/tiêu đề nhóm để in đậm */
    isBold: boolean('is_bold').default(false).notNull(),
    isTotal: boolean('is_total').default(false).notNull(),
    /** Công thức ghi đè cho riêng dòng này (tùy chọn) */
    formula: text('formula').default('').notNull(),
    note: text('note').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    archived: boolean('archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('report_rows_section_idx').on(t.sectionId),
    index('report_rows_block_idx').on(t.blockId),
    index('report_rows_order_idx').on(t.sectionId, t.sortOrder),
  ],
);

/* -------------------------------------------------- ĐỐI TƯỢNG (cột số liệu) động */
export const reportColumns = pgTable(
  'report_columns',
  {
    id: serial('id').primaryKey(),
    templateId: integer('template_id')
      .notNull()
      .references(() => reportTemplates.id, { onDelete: 'cascade' }),
    /** Khoá cột dạng slug: hs, tq, te, dich_vu… */
    colKey: text('col_key').notNull(),
    /** Nhãn hiển thị: HS, TQ, TE */
    label: text('label').notNull(),
    /** Nhãn nhóm cột (ô gộp phía trên): 'BHYT', 'Viện phí'… */
    groupLabel: text('group_label').default('').notNull(),
    /** INPUT = nhập tay · CALC = tính theo công thức */
    kind: text('kind').$type<ColumnKind>().default('INPUT').notNull(),
    /** Công thức cho cột CALC, ví dụ: hs+tq+te hoặc hs*2 — hỗ trợ + - * / ( ) và số */
    formula: text('formula').default('').notNull(),
    /** Định dạng hiển thị: number | integer | percent | text */
    format: text('format').default('number').notNull(),
    /** Cột phục vụ TỔNG HỢP TOÀN VIỆN, gán theo chỉ tiêu chuẩn: kham | vao | ra | tu_vong | hien_con | '' */
    summaryKey: text('summary_key').default('').notNull(),
    /** Đơn vị tính hiển thị trên tiêu đề cột */
    unit: text('unit').default('').notNull(),
    width: integer('width').default(70).notNull(),
    align: text('align').default('center').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    archived: boolean('archived').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('report_columns_tmpl_key_uq').on(t.templateId, t.colKey),
    index('report_columns_tmpl_idx').on(t.templateId),
  ],
);

/* --------------------------------------------------------------------- Số liệu */
export const reportEntries = pgTable(
  'report_entries',
  {
    id: serial('id').primaryKey(),
    templateId: integer('template_id')
      .notNull()
      .references(() => reportTemplates.id, { onDelete: 'cascade' }),
    rowId: integer('row_id')
      .notNull()
      .references(() => reportRows.id, { onDelete: 'cascade' }),
    colKey: text('col_key').notNull(),
    entryDate: date('entry_date').notNull(),
    value: doublePrecision('value').default(0).notNull(),
    note: text('note').default('').notNull(),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // một ô số liệu chỉ có 1 giá trị cho mỗi (mẫu × dòng × cột × ngày)
    uniqueIndex('report_entries_uq').on(t.templateId, t.rowId, t.colKey, t.entryDate),
    index('report_entries_tmpl_date_idx').on(t.templateId, t.entryDate),
    index('report_entries_row_idx').on(t.rowId),
    index('report_entries_date_idx').on(t.entryDate),
  ],
);

/* ------------------------------------------------- Lịch sử sửa số liệu (audit ô) */
export const reportEntryAudits = pgTable(
  'report_entry_audits',
  {
    id: serial('id').primaryKey(),
    templateId: integer('template_id'),
    departmentId: integer('department_id'),
    rowId: integer('row_id'),
    rowLabel: text('row_label').default('').notNull(),
    colKey: text('col_key').default('').notNull(),
    colLabel: text('col_label').default('').notNull(),
    entryDate: date('entry_date'),
    oldValue: doublePrecision('old_value'),
    newValue: doublePrecision('new_value'),
    /** create | update | delete | bulk */
    action: text('action').default('update').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    username: text('username').default('').notNull(),
    fullName: text('full_name').default('').notNull(),
    ip: text('ip').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('report_entry_audits_dept_idx').on(t.departmentId),
    index('report_entry_audits_date_idx').on(t.entryDate),
    index('report_entry_audits_created_idx').on(t.createdAt),
    index('report_entry_audits_tmpl_idx').on(t.templateId),
    index('report_entry_audits_tmpl_date_idx').on(t.templateId, t.entryDate),
  ],
);

/* ------------------------------------------- Báo cáo đã chốt (lưu trữ / công bố) */
export const reportSnapshots = pgTable(
  'report_snapshots',
  {
    id: serial('id').primaryKey(),
    templateId: integer('template_id').references(() => reportTemplates.id, {
      onDelete: 'set null',
    }),
    departmentId: integer('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    periodMode: text('period_mode').notNull(),
    dateFrom: date('date_from').notNull(),
    dateTo: date('date_to').notNull(),
    periodLabel: text('period_label').default('').notNull(),
    /** Toàn bộ số liệu đã tính tại thời điểm chốt */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** DRAFT | APPROVED | LOCKED */
    status: text('status').default('DRAFT').notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('report_snapshots_dept_idx').on(t.departmentId),
    index('report_snapshots_period_idx').on(t.dateFrom, t.dateTo),
    index('report_snapshots_created_idx').on(t.createdAt),
    index('report_snapshots_tmpl_status_idx').on(t.templateId, t.status),
  ],
);

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type ReportSection = typeof reportSections.$inferSelect;
export type ReportBlock = typeof reportBlocks.$inferSelect;
export type ReportRow = typeof reportRows.$inferSelect;
export type ReportColumn = typeof reportColumns.$inferSelect;
export type ReportEntry = typeof reportEntries.$inferSelect;
