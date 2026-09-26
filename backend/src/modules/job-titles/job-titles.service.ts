/**
 * Danh mục chức danh. Người dùng lưu TÊN chức danh (users.title), nên khi đổi tên
 * một chức danh, mọi người dùng đang mang tên cũ được cập nhật theo.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { buildPage, type Paginated } from '../../common/dto/query.dto';
import { DbService } from '../../db/db.service';
import { jobTitles, users } from '../../db/schema';
import type { CreateJobTitleDto, JobTitleQueryDto, UpdateJobTitleDto } from './job-titles.dto';

const SORTABLE = {
  code: jobTitles.code,
  name: jobTitles.name,
  sortOrder: jobTitles.sortOrder,
  createdAt: jobTitles.createdAt,
} as const;

@Injectable()
export class JobTitlesService {
  constructor(private readonly db: DbService) {}

  /** Số người dùng (chưa xoá) đang mang từng chức danh, theo tên không phân biệt hoa thường */
  private userCountExpr() {
    return sql<number>`(select count(*)::int from ${users} u where u.deleted_at is null and lower(btrim(u.title)) = lower(${jobTitles.name}))`;
  }

  async list(query: JobTitleQueryDto): Promise<Paginated<Record<string, unknown>>> {
    const where: SQL[] = [];
    if (query.q?.trim()) {
      const like = `%${query.q.trim()}%`;
      where.push(or(ilike(jobTitles.name, like), ilike(jobTitles.code, like), ilike(jobTitles.note, like)) as SQL);
    }
    if (query.activeOnly) where.push(eq(jobTitles.active, true));
    const condition = where.length ? and(...where) : undefined;
    const [{ total } = { total: 0 }] = await this.db.db
      .select({ total: sql<number>`count(*)::int` })
      .from(jobTitles)
      .where(condition);
    const sortCol = SORTABLE[(query.sortBy ?? '') as keyof typeof SORTABLE];
    const order = sortCol
      ? [query.sortDir === 'asc' ? asc(sortCol) : desc(sortCol)]
      : [asc(jobTitles.sortOrder), asc(jobTitles.name)];
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.all ? 10_000 : Math.min(500, Math.max(1, query.pageSize ?? 20));
    const rows = await this.db.db
      .select({
        id: jobTitles.id,
        code: jobTitles.code,
        name: jobTitles.name,
        sortOrder: jobTitles.sortOrder,
        active: jobTitles.active,
        note: jobTitles.note,
        userCount: this.userCountExpr(),
        createdAt: jobTitles.createdAt,
        updatedAt: jobTitles.updatedAt,
      })
      .from(jobTitles)
      .where(condition)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return buildPage(rows, total, page, pageSize);
  }

  /** Danh sách gọn cho ô chọn (chỉ chức danh đang dùng) */
  options() {
    return this.db.db
      .select({ id: jobTitles.id, code: jobTitles.code, name: jobTitles.name })
      .from(jobTitles)
      .where(eq(jobTitles.active, true))
      .orderBy(asc(jobTitles.sortOrder), asc(jobTitles.name));
  }

  async findOne(id: number) {
    const [row] = await this.db.db.select().from(jobTitles).where(eq(jobTitles.id, id)).limit(1);
    if (!row) throw new NotFoundException('Không tìm thấy chức danh');
    return row;
  }

  private async assertUnique(code: string | undefined, name: string | undefined, exceptId?: number) {
    const conds: SQL[] = [];
    if (code) conds.push(eq(sql`lower(${jobTitles.code})`, code.toLowerCase()));
    if (name) conds.push(eq(sql`lower(${jobTitles.name})`, name.toLowerCase()));
    if (!conds.length) return;
    const where = exceptId ? and(or(...conds), ne(jobTitles.id, exceptId)) : or(...conds);
    const [dup] = await this.db.db.select({ code: jobTitles.code, name: jobTitles.name }).from(jobTitles).where(where).limit(1);
    if (!dup) return;
    if (code && dup.code.toLowerCase() === code.toLowerCase()) throw new ConflictException(`Mã chức danh "${code}" đã tồn tại`);
    throw new ConflictException(`Chức danh "${dup.name}" đã tồn tại`);
  }

  async create(dto: CreateJobTitleDto) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    await this.assertUnique(code, name);
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const [m] = await this.db.db.select({ max: sql<number>`coalesce(max(${jobTitles.sortOrder}), 0)::int` }).from(jobTitles);
      sortOrder = (m?.max ?? 0) + 1;
    }
    const [row] = await this.db.db
      .insert(jobTitles)
      .values({ code, name, sortOrder, active: dto.active ?? true, note: dto.note ?? '' })
      .returning();
    return row;
  }

  async update(id: number, dto: UpdateJobTitleDto) {
    const current = await this.findOne(id);
    const code = dto.code?.trim().toUpperCase();
    const name = dto.name?.trim();
    await this.assertUnique(code, name, id);
    return this.db.db.transaction(async (tx) => {
      const [row] = await tx
        .update(jobTitles)
        .set({
          ...(code ? { code } : {}),
          ...(name ? { name } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          updatedAt: new Date(),
        })
        .where(eq(jobTitles.id, id))
        .returning();
      let renamedUsers = 0;
      if (name && name !== current.name) {
        const res = await tx
          .update(users)
          .set({ title: name, updatedAt: new Date() })
          .where(sql`lower(btrim(${users.title})) = lower(${current.name})`)
          .returning({ id: users.id });
        renamedUsers = res.length;
      }
      return { ...row, renamedUsers };
    });
  }

  async remove(id: number) {
    const current = await this.findOne(id);
    const [{ n } = { n: 0 }] = await this.db.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(sql`${users.deletedAt} is null`, sql`lower(btrim(${users.title})) = lower(${current.name})`));
    if (n > 0) {
      throw new ConflictException(
        `Đang có ${n} người dùng mang chức danh "${current.name}" — hãy đổi chức danh của họ trước, hoặc tắt "Đang sử dụng" để ẩn khỏi danh sách chọn`,
      );
    }
    await this.db.db.delete(jobTitles).where(eq(jobTitles.id, id));
    return { message: `Đã xoá chức danh "${current.name}"` };
  }

  /** Dùng khi nhập danh sách nhân viên: thêm các chức danh chưa có (trả về tên đã thêm) */
  async ensureNames(names: string[]): Promise<string[]> {
    const wanted = [...new Map(names.map((n) => n.trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
    if (!wanted.length) return [];
    const existing = await this.db.db.select({ name: jobTitles.name, code: jobTitles.code }).from(jobTitles);
    const have = new Set(existing.map((e) => e.name.toLowerCase()));
    const codes = new Set(existing.map((e) => e.code.toUpperCase()));
    const [m] = await this.db.db.select({ max: sql<number>`coalesce(max(${jobTitles.sortOrder}), 0)::int` }).from(jobTitles);
    let sort = m?.max ?? 0;
    const added: string[] = [];
    let seq = existing.length;
    for (const name of wanted) {
      if (have.has(name.toLowerCase())) continue;
      let code: string;
      do code = `CD${String(++seq).padStart(3, '0')}`;
      while (codes.has(code));
      codes.add(code);
      await this.db.db.insert(jobTitles).values({ code, name, sortOrder: ++sort }).onConflictDoNothing();
      added.push(name);
    }
    return added;
  }
}
