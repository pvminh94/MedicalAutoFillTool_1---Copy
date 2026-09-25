/**
 * Phân hệ VẬN HÀNH — tiện ích mở rộng, tác vụ định kỳ, nhập/xuất dữ liệu, tệp đính kèm.
 *
 * `utilities` cho phép quản trị tự tạo thêm chức năng mới (biểu mẫu, liên kết, báo cáo…)
 * mà không cần sửa mã nguồn — mở rộng hệ thống theo thời gian.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
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
import type { DataJobKind, JobStatus, UtilityKind } from './types';

/* ------------------------------------------------------------------- Tiện ích */
export const utilities = pgTable(
  'utilities',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    /** Tên icon (lucide-react) hiển thị trên menu */
    icon: text('icon').default('Puzzle').notNull(),
    /** BUILTIN = gắn với phân hệ có sẵn · FORM = biểu mẫu tự tạo · REPORT · LINK · IFRAME */
    kind: text('kind').$type<UtilityKind>().default('BUILTIN').notNull(),
    /** Đường dẫn giao diện (nội bộ) hoặc URL ngoài (LINK/IFRAME) */
    route: text('route').default('').notNull(),
    /** Cấu hình riêng: định nghĩa trường biểu mẫu, tham số báo cáo, màu sắc… */
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    /** Quyền cần có để thấy tiện ích này (để trống = mọi người dùng đã đăng nhập) */
    permissionCode: text('permission_code').default('').notNull(),
    /** Giới hạn theo khoa (rỗng = toàn viện) */
    departmentIds: jsonb('department_ids').$type<number[]>().default([]).notNull(),
    /** Vị trí hiển thị: sidebar | dashboard | both */
    placement: text('placement').default('sidebar').notNull(),
    badge: text('badge').default('').notNull(),
    color: text('color').default('#0ea5e9').notNull(),
    openInNewTab: boolean('open_in_new_tab').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('utilities_code_uq').on(t.code),
    index('utilities_active_idx').on(t.active),
    index('utilities_placement_idx').on(t.placement),
  ],
);

/* ---------------------------------------------------------- Tác vụ định kỳ (cron) */
export const scheduledJobs = pgTable(
  'scheduled_jobs',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    /** Tên hàm xử lý có sẵn trong hệ thống: backup.db | report.daily-digest | cache.warm … */
    handler: text('handler').notNull(),
    /** Biểu thức cron 5 hoặc 6 trường */
    cron: text('cron').notNull(),
    timezone: text('timezone').default('Asia/Ho_Chi_Minh').notNull(),
    /** Tham số truyền vào hàm xử lý */
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    active: boolean('active').default(true).notNull(),
    /** Cho phép chạy chồng nếu lần trước chưa xong */
    allowOverlap: boolean('allow_overlap').default(false).notNull(),
    timeoutSec: integer('timeout_sec').default(600).notNull(),
    maxRetries: integer('max_retries').default(2).notNull(),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status').$type<JobStatus>().default('PENDING').notNull(),
    lastError: text('last_error').default('').notNull(),
    lastDurationMs: integer('last_duration_ms').default(0).notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    runCount: integer('run_count').default(0).notNull(),
    failCount: integer('fail_count').default(0).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('scheduled_jobs_code_uq').on(t.code),
    index('scheduled_jobs_active_idx').on(t.active),
  ],
);

export const jobRuns = pgTable(
  'job_runs',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id').references(() => scheduledJobs.id, { onDelete: 'cascade' }),
    jobCode: text('job_code').default('').notNull(),
    status: text('status').$type<JobStatus>().default('RUNNING').notNull(),
    /** queue = chạy tự động theo lịch · manual = bấm chạy ngay */
    trigger: text('trigger').default('queue').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms').default(0).notNull(),
    message: text('message').default('').notNull(),
    errorStack: text('error_stack').default('').notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    triggeredBy: integer('triggered_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('job_runs_job_idx').on(t.jobId),
    index('job_runs_started_idx').on(t.startedAt),
    index('job_runs_status_idx').on(t.status),
  ],
);

/* -------------------------------------------------------- Nhập / xuất dữ liệu */
export const dataJobs = pgTable(
  'data_jobs',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').$type<DataJobKind>().notNull(),
    /** Phân hệ: HSBA | REPORT | USERS | DEPARTMENTS | TEMPLATES … */
    module: text('module').notNull(),
    format: text('format').default('xlsx').notNull(),
    fileName: text('file_name').default('').notNull(),
    filePath: text('file_path').default('').notNull(),
    fileSize: integer('file_size').default(0).notNull(),
    status: text('status').$type<JobStatus>().default('PENDING').notNull(),
    totalRows: integer('total_rows').default(0).notNull(),
    processedRows: integer('processed_rows').default(0).notNull(),
    failedRows: integer('failed_rows').default(0).notNull(),
    /** Chi tiết lỗi từng dòng: [{ row, message }] */
    errors: jsonb('errors').$type<{ row: number; message: string }[]>().default([]).notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().default({}).notNull(),
    message: text('message').default('').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('data_jobs_kind_idx').on(t.kind, t.module),
    index('data_jobs_created_idx').on(t.createdAt),
    index('data_jobs_status_idx').on(t.status),
  ],
);

/* --------------------------------------------------------------- Tệp đính kèm */
export const attachments = pgTable(
  'attachments',
  {
    id: serial('id').primaryKey(),
    /** Phân hệ sở hữu: HSBA | REPORT | UTILITY */
    module: text('module').notNull(),
    /** Bản ghi sở hữu */
    ownerId: integer('owner_id').notNull(),
    fileName: text('file_name').notNull(),
    originalName: text('original_name').default('').notNull(),
    mimeType: text('mime_type').default('').notNull(),
    size: integer('size').default(0).notNull(),
    /** Đường dẫn tương đối trong thư mục lưu trữ */
    path: text('path').notNull(),
    checksum: text('checksum').default('').notNull(),
    uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('attachments_owner_idx').on(t.module, t.ownerId),
    index('attachments_created_idx').on(t.createdAt),
  ],
);

/* ------------------------------------------------- Lịch sử sao lưu / phục hồi */
export const backups = pgTable(
  'backups',
  {
    id: serial('id').primaryKey(),
    fileName: text('file_name').notNull(),
    filePath: text('file_path').default('').notNull(),
    sizeBytes: integer('size_bytes').default(0).notNull(),
    /** manual | scheduled */
    trigger: text('trigger').default('manual').notNull(),
    status: text('status').$type<JobStatus>().default('SUCCESS').notNull(),
    message: text('message').default('').notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('backups_created_idx').on(t.createdAt)],
);

export type Utility = typeof utilities.$inferSelect;
export type NewUtility = typeof utilities.$inferInsert;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type DataJob = typeof dataJobs.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Backup = typeof backups.$inferSelect;

/* Giữ tham chiếu để tránh lỗi unused-import khi mở rộng về sau */
export const _opsRefs = { departments, sql };
