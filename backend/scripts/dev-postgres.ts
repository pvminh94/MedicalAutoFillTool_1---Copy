/**
 * PostgreSQL nhúng cho môi trường phát triển / chạy thử — KHÔNG cần Docker.
 *
 * Dùng PGlite (PostgreSQL 18 biên dịch sang WebAssembly) và mở cổng TCP đúng
 * giao thức PostgreSQL, nên mọi công cụ (psql, Drizzle, pg) kết nối được như thật.
 *
 *   npm run dev:postgres          → chạy ở cổng 5432, dữ liệu trong ./.data/pgdata
 *   PG_PORT=5433 npm run dev:postgres
 *
 * ⚠ Chỉ dùng cho phát triển. Môi trường thật dùng PostgreSQL + Redis qua Docker.
 */
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
  const port = Number(process.env.PG_PORT ?? 55432);
  const host = process.env.PG_HOST ?? '127.0.0.1';
  const dataDir =
    process.env.PG_DATA_DIR ?? path.resolve(process.cwd(), '..', '.data', 'pgdata');

  fs.mkdirSync(dataDir, { recursive: true });

  let PGlite: typeof import('@electric-sql/pglite').PGlite;
  let PGLiteSocketServer: typeof import('@electric-sql/pglite-socket').PGLiteSocketServer;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
    ({ PGLiteSocketServer } = await import('@electric-sql/pglite-socket'));
  } catch {
    console.error(
      '\n✗ Chưa cài PGlite. Chạy:  npm install   (gói @electric-sql/pglite nằm trong devDependencies)\n',
    );
    process.exit(1);
  }

  console.log('▸ Đang khởi động PostgreSQL nhúng (PGlite)...');
  const db = await PGlite.create({ dataDir });
  const version = await db.query<{ version: string }>('select version() as version');
  const versionText = (version.rows[0]?.version ?? '').split(' on ')[0];

  const server = new PGLiteSocketServer({ db, port, host });
  await server.start();

  const url = `postgresql://postgres:postgres@${host}:${port}/postgres`;
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  PostgreSQL nhúng đã sẵn sàng (chỉ dùng khi phát triển)    ║
╚════════════════════════════════════════════════════════════╝
  Phiên bản : ${versionText}
  Dữ liệu   : ${dataDir}
  Địa chỉ   : ${host}:${port}

  Thêm dòng sau vào backend/.env:

  DATABASE_URL=${url}

  Sau đó:  npm run db:migrate && npm run db:seed && npm run dev
`);

  const shutdown = async (): Promise<void> => {
    console.log('\n▸ Đang dừng PostgreSQL nhúng...');
    await server.stop().catch(() => undefined);
    await db.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main().catch((err) => {
  console.error('Không khởi động được PostgreSQL nhúng:', err);
  process.exit(1);
});
