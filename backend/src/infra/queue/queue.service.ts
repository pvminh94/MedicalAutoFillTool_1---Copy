/**
 * Hàng đợi công việc + tác vụ định kỳ.
 *
 * Hai chế độ (biến môi trường `QUEUE_DRIVER`):
 *   bullmq → hàng đợi Redis, chạy được nhiều tiến trình, bền vững qua khởi động lại,
 *            lịch định kỳ do Redis giữ (khuyến nghị cho production)
 *   inline → chạy ngay trong tiến trình bằng bộ định thời Node (chạy thử / máy đơn)
 *
 * Tác vụ được đăng ký động theo mã (`registerHandler`) nên quản trị có thể thêm
 * tác vụ mới từ giao diện mà không cần sửa mã nguồn.
 */
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type { ConnectionOptions, Job, Queue, Worker } from 'bullmq';
import { config } from '../../config/env';

export interface JobContext {
  /** Mã tác vụ (bản ghi trong bảng scheduled_jobs) */
  code: string;
  /** Tham số truyền vào */
  payload: Record<string, unknown>;
  /** queue = theo lịch · manual = bấm chạy ngay */
  trigger: 'queue' | 'manual' | 'api';
  /** Người bấm chạy (nếu có) */
  userId?: number;
  /** Mã lần chạy trong bảng job_runs */
  runId?: number;
}

export interface JobResult {
  message?: string;
  [key: string]: unknown;
}

export type JobHandler = (ctx: JobContext) => Promise<JobResult | void>;

interface InlineSchedule {
  cron: string;
  timezone: string;
  timer: NodeJS.Timeout;
}

/** Tính khoảng chờ (ms) tới lần khớp cron kế tiếp — hỗ trợ cú pháp cron 5 trường */
function nextRunDelay(cron: string, timezone: string, from = new Date()): number {
  const parts = cron.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek] =
    parts.length === 6 ? parts.slice(1) : parts;
  if (minute === undefined || hour === undefined) return 60_000;

  const match = (field: string, value: number, max: number): boolean => {
    if (field === '*') return true;
    return field.split(',').some((piece) => {
      const [range, stepRaw] = piece.split('/');
      const step = stepRaw ? Number(stepRaw) : 1;
      if (!Number.isFinite(step) || step <= 0) return false;
      if (range === '*') return value % step === 0;
      if (range.includes('-')) {
        const [a, b] = range.split('-').map(Number);
        return value >= a && value <= b && (value - a) % step === 0;
      }
      const n = Number(range);
      return Number.isFinite(n) && n <= max && value === n;
    });
  };

  // Duyệt từng phút trong 366 ngày tới — đủ chính xác và rẻ cho việc lập lịch
  const probe = new Date(from.getTime());
  probe.setSeconds(0, 0);
  probe.setMinutes(probe.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    const local = new Date(probe.toLocaleString('en-US', { timeZone: timezone }));
    if (
      match(minute, local.getMinutes(), 59) &&
      match(hour, local.getHours(), 23) &&
      match(dayOfMonth, local.getDate(), 31) &&
      match(month, local.getMonth() + 1, 12) &&
      match(dayOfWeek, local.getDay(), 6)
    ) {
      return Math.max(1_000, probe.getTime() - Date.now());
    }
    probe.setMinutes(probe.getMinutes() + 1);
  }
  return 60_000;
}

@Injectable()
export class QueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly schedules = new Map<string, InlineSchedule>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: ConnectionOptions | null = null;

  get driver(): 'bullmq' | 'inline' {
    return this.queue ? 'bullmq' : 'inline';
  }

  async onModuleInit(): Promise<void> {
    if (config.queue.driver === 'bullmq') {
      try {
        const { Queue: BullQueue, Worker: BullWorker } = await import('bullmq');
        const url = new URL(config.redis.url);
        this.connection = {
          host: url.hostname,
          port: Number(url.port || 6379),
          password: config.redis.password ?? (url.password || undefined),
          db: config.redis.db,
          maxRetriesPerRequest: null,
        };
        this.queue = new BullQueue('qlbs-jobs', {
          connection: this.connection,
          prefix: config.queue.prefix,
        });
        this.worker = new BullWorker(
          'qlbs-jobs',
          async (job: Job) => this.dispatch(String(job.name), {
            code: String(job.name),
            payload: (job.data ?? {}) as Record<string, unknown>,
            trigger: 'queue',
            runId: (job.data as { runId?: number })?.runId,
          }),
          { connection: this.connection, prefix: config.queue.prefix, concurrency: config.queue.concurrency },
        );
        this.worker.on('failed', (job, err) =>
          this.logger.error(`Tác vụ ${job?.name ?? '?'} thất bại: ${err.message}`),
        );
        await this.queue.waitUntilReady();
        this.logger.log(`Hàng đợi: BullMQ (Redis) — tiền tố "${config.queue.prefix}"`);
      } catch (err) {
        this.logger.warn(
          `Không khởi tạo được BullMQ (${(err as Error).message}) — chuyển sang chế độ trong tiến trình.`,
        );
        this.queue = null;
        this.connection = null;
      }
    } else {
      this.logger.log('Hàng đợi: trong tiến trình (inline)');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const [, s] of this.schedules) clearTimeout(s.timer);
    this.schedules.clear();
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }

  /* ------------------------------------------------------------- Đăng ký xử lý */

  registerHandler(code: string, handler: JobHandler): void {
    this.handlers.set(code, handler);
  }

  hasHandler(code: string): boolean {
    return this.handlers.has(code);
  }

  listHandlers(): string[] {
    return [...this.handlers.keys()].sort();
  }

  private async dispatch(code: string, ctx: JobContext): Promise<JobResult | void> {
    const handler = this.handlers.get(code);
    if (!handler) {
      throw new Error(`Chưa đăng ký hàm xử lý cho tác vụ "${code}"`);
    }
    return handler(ctx);
  }

  /* ------------------------------------------------------------------ Đẩy việc */

  /** Đưa một tác vụ vào hàng đợi (hoặc chạy ngay ở chế độ inline) */
  async enqueue(
    code: string,
    payload: Record<string, unknown> = {},
    opts: { delayMs?: number; runId?: number } = {},
  ): Promise<{ mode: 'queued' | 'inline'; id?: string }> {
    if (this.queue) {
      const job = await this.queue.add(code, { ...payload, runId: opts.runId }, {
        delay: opts.delayMs,
        removeOnComplete: 500,
        removeOnFail: 1_000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      });
      return { mode: 'queued', id: String(job.id) };
    }
    // Chế độ inline: chạy bất đồng bộ để không chặn phản hồi HTTP
    setTimeout(() => {
      void this.dispatch(code, { code, payload, trigger: opts.runId ? 'manual' : 'queue', runId: opts.runId })
        .catch((err) => this.logger.error(`Tác vụ ${code}: ${(err as Error).message}`));
    }, opts.delayMs ?? 0);
    return { mode: 'inline' };
  }

  /** Chạy ngay và chờ kết quả (dùng cho nút "Chạy ngay" trên giao diện) */
  async runNow(code: string, payload: Record<string, unknown> = {}, userId?: number): Promise<JobResult | void> {
    return this.dispatch(code, { code, payload, trigger: 'manual', userId });
  }

  /* ------------------------------------------------------------- Lịch định kỳ */

  /**
   * Đăng ký / cập nhật lịch chạy định kỳ.
   * BullMQ: dùng Job Scheduler nếu có (v5.16+) hoặc tuỳ chọn repeat.
   */
  async upsertSchedule(job: {
    code: string;
    cron: string;
    timezone: string;
    payload?: Record<string, unknown>;
    active: boolean;
  }): Promise<void> {
    await this.removeSchedule(job.code);
    if (!job.active) return;

    if (this.queue) {
      const q = this.queue as unknown as {
        upsertJobScheduler?: (
          id: string,
          repeat: { pattern: string; tz?: string },
          tmpl?: { name: string; data?: unknown; opts?: unknown },
        ) => Promise<unknown>;
      };
      if (typeof q.upsertJobScheduler === 'function') {
        await q.upsertJobScheduler(
          job.code,
          { pattern: job.cron, tz: job.timezone },
          { name: job.code, data: job.payload ?? {}, opts: { removeOnComplete: 100, removeOnFail: 200 } },
        );
      } else {
        // Phiên bản BullMQ cũ hơn: dùng tuỳ chọn repeat
        await (this.queue as unknown as {
          add: (name: string, data: unknown, opts: unknown) => Promise<unknown>;
        }).add(
          job.code,
          job.payload ?? {},
          { repeat: { pattern: job.cron, tz: job.timezone }, jobId: `repeat:${job.code}` },
        );
      }
      return;
    }

    // Chế độ inline: tự lên lịch bằng setTimeout
    const tick = async (): Promise<void> => {
      try {
        await this.dispatch(job.code, {
          code: job.code,
          payload: job.payload ?? {},
          trigger: 'queue',
        });
      } catch (err) {
        this.logger.error(`Tác vụ định kỳ ${job.code}: ${(err as Error).message}`);
      } finally {
        const delay = nextRunDelay(job.cron, job.timezone);
        const timer = setTimeout(() => void tick(), delay);
        this.schedules.set(job.code, { cron: job.cron, timezone: job.timezone, timer });
      }
    };
    const delay = nextRunDelay(job.cron, job.timezone);
    const timer = setTimeout(() => void tick(), delay);
    this.schedules.set(job.code, { cron: job.cron, timezone: job.timezone, timer });
  }

  async removeSchedule(code: string): Promise<void> {
    const existing = this.schedules.get(code);
    if (existing) {
      clearTimeout(existing.timer);
      this.schedules.delete(code);
    }
    if (this.queue) {
      const q = this.queue as unknown as {
        removeJobScheduler?: (id: string) => Promise<unknown>;
        getRepeatableJobs?: () => Promise<{ key: string; name: string }[]>;
        removeRepeatableByKey?: (key: string) => Promise<unknown>;
      };
      if (typeof q.removeJobScheduler === 'function') {
        await q.removeJobScheduler(code).catch(() => undefined);
      }
      if (typeof q.getRepeatableJobs === 'function') {
        const repeats = (await q.getRepeatableJobs().catch(() => [])) ?? [];
        for (const r of repeats) {
          if (r.name === code && typeof q.removeRepeatableByKey === 'function') {
            await q.removeRepeatableByKey(r.key).catch(() => undefined);
          }
        }
      }
    }
  }

  /** Danh sách lịch đang chạy trong tiến trình này (chế độ inline) */
  activeInlineSchedules(): string[] {
    return [...this.schedules.keys()];
  }

  async stats(): Promise<{ driver: string; counts: Record<string, number> }> {
    if (!this.queue) {
      return { driver: 'inline', counts: { schedules: this.schedules.size, handlers: this.handlers.size } };
    }
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
    return { driver: 'bullmq', counts: counts as unknown as Record<string, number> };
  }

  /** Xoá sạch hàng đợi (dùng khi bảo trì) */
  async drain(): Promise<void> {
    if (!this.queue) return;
    await this.queue.obliterate({ force: true }).catch(() => undefined);
  }
}
