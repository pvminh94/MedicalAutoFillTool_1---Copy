/**
 * Dựng lại chuỗi tìm kiếm không dấu (hsba_requests.search_text) cho các phiếu đã có.
 * Chạy sau khi nâng cấp để tra cứu cũ luôn khớp:
 *
 *   npm run db:backfill-search
 */
import 'dotenv/config';
import { asc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { config } from '../src/config/env';
import * as schema from '../src/db/schema';
import { buildSearchText } from '../src/modules/hsba/hsba.service';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: config.database.url, max: 5 });
  const db = drizzle(pool, { schema });
  console.log('\n▸ Dựng lại chuỗi tìm kiếm không dấu cho phiếu sửa HSBA\n');

  const rows = await db
    .select({
      id: schema.hsbaRequests.id,
      code: schema.hsbaRequests.code,
      patientName: schema.hsbaRequests.patientName,
      patientCode: schema.hsbaRequests.patientCode,
      requesterName: schema.hsbaRequests.requesterName,
      departmentName: schema.hsbaRequests.departmentName,
      maKcb: schema.hsbaRequests.maKcb,
      maTheBhyt: schema.hsbaRequests.maTheBhyt,
      content: schema.hsbaRequests.content,
      reason: schema.hsbaRequests.reason,
    })
    .from(schema.hsbaRequests)
    .orderBy(asc(schema.hsbaRequests.id));

  let updated = 0;
  for (const row of rows) {
    const searchText = buildSearchText(row);
    const result = await db
      .update(schema.hsbaRequests)
      .set({ searchText })
      .where(sql`${schema.hsbaRequests.id} = ${row.id} and ${schema.hsbaRequests.searchText} is distinct from ${searchText}`);
    if ((result.rowCount ?? 0) > 0) updated += 1;
  }

  console.log(`  Đã xử lý ${rows.length} phiếu, cập nhật ${updated} phiếu.\n`);
  await pool.end();
}

main().catch((err: unknown) => {
  console.error('\n✖ Lỗi dựng chuỗi tìm kiếm:', (err as Error).message, '\n');
  process.exitCode = 1;
});
