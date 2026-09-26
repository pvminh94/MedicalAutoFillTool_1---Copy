/**
 * Ghi / xoay vòng tệp sao lưu JSON nén — dùng chung cho tác vụ `db.backup` và cho
 * bản an toàn tạo NGAY TRONG giao dịch phục hồi (sau khi đã khoá bảng).
 */
import { sql } from 'drizzle-orm';
import { once } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

/** Đối tượng thực thi SQL (db.db hoặc tx của drizzle) */
export interface SqlExecutor {
  execute: (query: ReturnType<typeof sql.raw>) => Promise<unknown>;
}

const PAGE = 2000;

export const BACKUP_FILE_RE = /^qlbs-.*\.json(\.gz)?$/;

export function backupFileName(label?: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const clean = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `qlbs-${stamp}${clean ? `-${clean}` : ''}.json.gz`;
}

/**
 * Đọc mọi bảng trong schema public qua `exec` và ghi ra `fullPath` (gzip, dạng luồng).
 * Gọi bên trong một giao dịch để có ảnh chụp nhất quán.
 */
export async function writeBackup(
  exec: SqlExecutor,
  fullPath: string,
): Promise<{ counts: Record<string, number>; totalRows: number; size: number }> {
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.partial`;
  const gzip = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(tmpPath);
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    gzip.on('error', reject);
  });
  gzip.pipe(out);
  const write = async (chunk: string): Promise<void> => {
    if (!gzip.write(chunk)) await once(gzip, 'drain');
  };

  const counts: Record<string, number> = {};
  let totalRows = 0;
  try {
    const res = await exec.execute(
      sql.raw(
        "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
      ),
    );
    const tables = ((res as { rows?: { table_name: string }[] }).rows ?? [])
      .map((r) => r.table_name)
      .filter((t) => /^[a-z_][a-z0-9_]*$/.test(t));

    await write(`{"format":"qlbs-backup","version":2,"createdAt":${JSON.stringify(new Date().toISOString())},"tables":{`);
    for (let ti = 0; ti < tables.length; ti++) {
      const table = tables[ti]!;
      await write(`${ti ? ',' : ''}${JSON.stringify(table)}:[`);
      let n = 0;
      // Đọc tuần tự theo vị trí vật lý (ctid) — mỗi lô tiếp nối lô trước, không dùng OFFSET
      // (OFFSET quét lại từ đầu mỗi lô → chậm theo bình phương số dòng với bảng lớn).
      let last = '(0,0)';
      for (;;) {
        const page = await exec.execute(
          sql.raw(`select ctid::text as "__qlbs_ctid", * from "${table}" where ctid > '${last}'::tid order by ctid limit ${PAGE}`),
        );
        const rows = ((page as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
        for (const row of rows) {
          last = String(row['__qlbs_ctid']);
          delete row['__qlbs_ctid'];
          await write(`${n ? ',' : ''}${JSON.stringify(row)}`);
          n++;
        }
        if (rows.length < PAGE) break;
      }
      await write(']');
      counts[table] = n;
      totalRows += n;
    }
    await write(`},"counts":${JSON.stringify(counts)}}`);
    gzip.end();
    await done;
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    gzip.destroy();
    out.destroy();
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
  return { counts, totalRows, size: fs.statSync(fullPath).size };
}

/** Giữ lại `keep` tệp mới nhất, trả danh sách tệp đã xoá. `protect` không bao giờ bị xoá. */
export function rotateBackups(dir: string, keep: number, protect: string[] = []): string[] {
  const olds = fs
    .readdirSync(dir)
    .filter((f) => BACKUP_FILE_RE.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(keep)
    .filter((o) => !protect.includes(o.f));
  for (const o of olds) fs.rmSync(path.join(dir, o.f), { force: true });
  return olds.map((o) => o.f);
}

export function formatBytes(size: number): string {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}
