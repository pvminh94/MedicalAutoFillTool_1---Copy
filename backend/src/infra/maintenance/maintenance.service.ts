/**
 * Chế độ bảo trì — dùng khi phục hồi CSDL.
 *
 * Trong lúc bảo trì, mọi yêu cầu API (trừ kiểm tra tình trạng và chính yêu cầu phục hồi)
 * được trả ngay 503 + code MAINTENANCE thay vì treo chờ khoá bảng hoặc ghi vào dữ liệu
 * sắp bị thay thế. Giao diện nhận mã này sẽ hiện thông báo và tự tải lại khi xong.
 *
 * Trạng thái giữ trong bộ nhớ và sao sang cache (Redis) để nhiều tiến trình API cùng thấy.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CacheService } from '../cache/cache.service';

export interface MaintenanceState {
  active: boolean;
  reason: string;
  message: string;
  startedAt: string;
  by?: string;
}

const CACHE_KEY = 'maint:state';
/** Trạng thái tự hết hạn để không kẹt bảo trì nếu tiến trình bị tắt đột ngột */
const MAX_SECONDS = 60 * 60;
/** Đường dẫn luôn được phép */
const ALWAYS_ALLOWED = /^\/(health|ready|version)(\/|$)|^\/api\/system\/maintenance$/;
/** Chính yêu cầu phục hồi (đã vào trước khi bật bảo trì) không bị tính là đang chờ */
const RESTORE_PATH = /^\/api\/backups\/[^/]+\/restore$/;

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);
  private local: MaintenanceState | null = null;
  private remote: MaintenanceState | null = null;
  private remoteCheckedAt = 0;
  private inflightWrites = 0;

  constructor(private readonly cache: CacheService) {}

  current(): MaintenanceState | null {
    const now = Date.now();
    if (now - this.remoteCheckedAt > 2000) {
      this.remoteCheckedAt = now;
      void this.cache
        .get<MaintenanceState>(CACHE_KEY)
        .then((v) => (this.remote = v?.active ? v : null))
        .catch(() => undefined);
    }
    return this.local ?? this.remote;
  }

  async start(reason: string, message: string, by?: string): Promise<void> {
    this.local = { active: true, reason, message, startedAt: new Date().toISOString(), by };
    await this.cache.set(CACHE_KEY, this.local, MAX_SECONDS).catch(() => undefined);
    this.logger.warn(`BẬT chế độ bảo trì: ${message}`);
  }

  async end(): Promise<void> {
    this.local = null;
    this.remote = null;
    await this.cache.del(CACHE_KEY).catch(() => undefined);
    this.logger.warn('TẮT chế độ bảo trì');
  }

  /** Chờ các yêu cầu ghi đang xử lý dở hoàn tất (tối đa timeoutMs) */
  async drain(timeoutMs = 10_000): Promise<number> {
    const until = Date.now() + timeoutMs;
    while (this.inflightWrites > 0 && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.inflightWrites;
  }

  /** Middleware Express — gắn trong main.ts trước mọi route */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const url = (req.originalUrl || req.url || '').split('?')[0] ?? '';
      if (url === '/api/system/maintenance') {
        const s = this.current();
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, data: s ?? { active: false } });
        return;
      }
      if (ALWAYS_ALLOWED.test(url) || req.method === 'OPTIONS' || !url.startsWith('/api/')) return next();

      const state = this.current();
      if (state && !RESTORE_PATH.test(url)) {
        res.status(503).setHeader('Retry-After', '15');
        res.json({
          success: false,
          statusCode: 503,
          code: 'MAINTENANCE',
          message: state.message,
          maintenance: state,
        });
        return;
      }

      // Đếm yêu cầu ghi đang chạy để phục hồi chờ chúng xong rồi mới khoá bảng
      if (req.method !== 'GET' && req.method !== 'HEAD' && !RESTORE_PATH.test(url)) {
        this.inflightWrites++;
        let done = false;
        const finish = (): void => {
          if (!done) {
            done = true;
            this.inflightWrites--;
          }
        };
        res.on('finish', finish);
        res.on('close', finish);
      }
      next();
    };
  }
}
