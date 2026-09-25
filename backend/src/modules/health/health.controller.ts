import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/decorators';
import { APP_ROOT, config } from '../../config/env';
import { DbService } from '../../db/db.service';
import { CacheService } from '../../infra/cache/cache.service';
import { QueueService } from '../../infra/queue/queue.service';

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  [key: string]: unknown;
}

@ApiTags('Hệ thống')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly db: DbService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Kiểm tra tình trạng hệ thống' })
  async health() {
    const db = await this.db.health();
    const cache = await this.cache.health();
    const queue = await this.queue.stats();
    const ok = db.ok && cache.ok;
    return {
      status: ok ? 'ok' : 'degraded',
      app: 'qlbs',
      env: config.env,
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      timezone: config.timezone,
      node: process.version,
      checks: {
        database: { ok: db.ok, latencyMs: db.latencyMs, error: db.error } as CheckResult,
        cache: { ok: cache.ok, latencyMs: cache.latencyMs, backend: cache.backend } as CheckResult,
        queue: { ok: true, ...queue } as CheckResult,
      },
      storage: {
        dir: config.storage.dir,
        exports: config.storage.exportsDir,
        backups: config.storage.backupsDir,
      },
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Sẵn sàng nhận lưu lượng (dùng cho health check của Docker)' })
  async ready() {
    const db = await this.db.health();
    if (!db.ok) {
      return { status: 'not-ready', reason: 'CSDL chưa sẵn sàng' };
    }
    return { status: 'ready' };
  }

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Thông tin phiên bản' })
  version() {
    return {
      name: 'QLBS — Phần mềm Quản lý Bệnh viện',
      version: '1.0.0',
      apiPrefix: config.apiPrefix,
      appRoot: APP_ROOT,
      startedAt: new Date(this.startedAt).toISOString(),
    };
  }

  @Public()
  @Get('system/info')
  @ApiOperation({ summary: 'Thông tin cấu hình hệ thống (không lộ bí mật)' })
  async info() {
    const [tables] = await this.db.db.execute<{ total: number }>(
      sql`select count(*)::int as total from information_schema.tables where table_schema = 'public'`,
    ).then((r) => (r as unknown as { rows: { total: number }[] }).rows ?? []);
    return {
      database: {
        tables: tables?.total ?? 0,
        poolMax: config.database.poolMax,
      },
      cache: this.cache.stats(),
      queue: await this.queue.stats(),
      features: {
        swagger: config.swagger,
        queueDriver: config.queue.driver,
        cacheDriver: config.redis.driver,
      },
    };
  }
}
