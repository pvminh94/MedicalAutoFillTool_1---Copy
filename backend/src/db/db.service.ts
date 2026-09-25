/**
 * Kết nối CSDL PostgreSQL qua Drizzle ORM.
 *
 * Drizzle được chọn vì: (1) sinh migration hoàn toàn cục bộ, không phụ thuộc
 * tải engine ngoài; (2) cho phép viết SQL thuần khi cần truy vấn tổng hợp phức tạp
 * (báo cáo theo kỳ, tổng hợp toàn viện) mà vẫn giữ an toàn kiểu dữ liệu.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool, PoolClient } from 'pg';
import { config } from '../config/env';
import * as schema from './schema';

export const DB = 'DB_CONNECTION';
export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Kiểu dùng chung cho cả `db` và transaction */
export type Executor = Database | Tx;

@Injectable()
export class DbService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DbService.name);
  readonly pool: Pool;
  readonly db: Database;

  constructor(@Inject(DB) db: Database) {
    this.db = db;
    this.pool = (db as unknown as { $client: Pool }).$client;
  }

  async onModuleInit(): Promise<void> {
    const started = Date.now();
    try {
      await this.db.execute(sql`select 1`);
      const v = await this.db.execute<{ version: string }>(sql`select version() as version`);
      const row = (v as unknown as { rows: { version: string }[] }).rows?.[0];
      this.logger.log(
        `Đã kết nối CSDL (${Date.now() - started}ms) — ${String(row?.version ?? '').slice(0, 60)}`,
      );
    } catch (err) {
      this.logger.error(
        `KHÔNG kết nối được CSDL. Kiểm tra DATABASE_URL trong .env.\n${(err as Error).message}`,
      );
      throw err;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }

  /** Thực thi trong một giao dịch */
  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(tx));
  }

  /** Mượn một kết nối riêng (dùng cho COPY / LISTEN hoặc khoá tư vấn) */
  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  /**
   * Khoá tư vấn theo khoá nghiệp vụ — chống 2 tiến trình cùng sinh mã phiếu
   * hoặc cùng ghi một ô số liệu.
   */
  async withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.withClient(async (client) => {
      await client.query('select pg_advisory_lock(hashtext($1))', [key]);
      try {
        return await fn();
      } finally {
        await client.query('select pg_advisory_unlock(hashtext($1))', [key]);
      }
    });
  }

  /** Thông tin sức khoẻ CSDL dùng cho /health */
  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const t = Date.now();
    try {
      await this.db.execute(sql`select 1`);
      return { ok: true, latencyMs: Date.now() - t };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - t, error: (err as Error).message };
    }
  }
}

/** Nhà máy tạo kết nối — dùng trong AppModule */
export function createDbConnection(): Database {
  const pool = new Pool({
    connectionString: config.database.url,
    max: config.database.poolMax,
    idleTimeoutMillis: config.database.idleTimeoutMs,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
    application_name: 'qlbs-api',
  });
  pool.on('error', (err) => {
    // Không để lỗi kết nối nhàn rỗi làm sập tiến trình
    new Logger('DbPool').error(`Lỗi kết nối nhàn rỗi: ${err.message}`);
  });
  return drizzle(pool, {
    schema,
    logger: config.database.logQueries
      ? { logQuery: (q) => new Logger('SQL').debug(q) }
      : false,
  });
}
