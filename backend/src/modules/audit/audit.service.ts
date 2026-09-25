import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { auditLogs, departments, users } from '../../db/schema';
import { buildPage, type AdvancedQueryDto, type Paginated, parseFilters } from '../../common/dto/query.dto';

export interface AuditEntry {
  userId?: number | null;
  username?: string;
  fullName?: string;
  action: string;
  module: string;
  entity?: string;
  entityId?: string | number;
  description?: string;
  beforeData?: unknown;
  afterData?: unknown;
  departmentId?: number | null;
  ip?: string;
  userAgent?: string;
}

/**
 * Nhật ký kiểm toán — mọi thao tác ghi đều để lại vết: ai, làm gì, khi nào, từ đâu.
 */
import { pushFilters, type FilterTarget } from '../../common/filters/apply-filter';
/** Trường lọc nâng cao của nhật ký hệ thống (khớp sổ đăng ký trường lọc). */
const AUDIT_FILTERS: Record<string, FilterTarget> = {
  module: { expr: auditLogs.module, type: 'text' },
  action: { expr: auditLogs.action, type: 'text' },
  entity: { expr: auditLogs.entity, type: 'text' },
  username: { expr: auditLogs.username, type: 'text' },
  userId: { expr: auditLogs.userId, type: 'number' },
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DbService) {}

  /** Ghi một dòng nhật ký (không bao giờ được làm hỏng luồng nghiệp vụ) */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.db.db.insert(auditLogs).values({
        userId: entry.userId ?? null,
        username: entry.username ?? '',
        fullName: entry.fullName ?? '',
        action: entry.action,
        module: entry.module,
        entity: entry.entity ?? '',
        entityId: entry.entityId !== undefined ? String(entry.entityId) : '',
        description: entry.description ?? '',
        beforeData: (entry.beforeData ?? null) as never,
        afterData: (entry.afterData ?? null) as never,
        departmentId: entry.departmentId ?? null,
        ip: (entry.ip ?? '').slice(0, 64),
        userAgent: (entry.userAgent ?? '').slice(0, 400),
      });
    } catch (err) {
      this.logger.warn(`Không ghi được nhật ký kiểm toán: ${(err as Error).message}`);
    }
  }

  /** Tra cứu nhật ký với bộ lọc nâng cao */
  async search(query: AdvancedQueryDto): Promise<Paginated<Record<string, unknown>>> {
    const where: SQL[] = [];
    if (query.q?.trim()) {
      const like = `%${query.q.trim()}%`;
      where.push(
        or(
          ilike(auditLogs.description, like),
          ilike(auditLogs.username, like),
          ilike(auditLogs.fullName, like),
          ilike(auditLogs.entity, like),
          ilike(auditLogs.entityId, like),
        ) as SQL,
      );
    }
    pushFilters(where, parseFilters(query.filters), AUDIT_FILTERS);
    if (query.dateFrom) {
      const col = query.dateField === 'createdAt' || !query.dateField ? auditLogs.createdAt : auditLogs.createdAt;
      where.push(gte(col, new Date(`${query.dateFrom}T00:00:00`)));
    }
    if (query.dateTo) {
      where.push(lte(auditLogs.createdAt, new Date(`${query.dateTo}T23:59:59`)));
    }

    const condition = where.length > 0 ? and(...where) : undefined;

    const [countRow] = await this.db.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(condition);

    const rows = await this.db.db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        username: auditLogs.username,
        fullName: auditLogs.fullName,
        action: auditLogs.action,
        module: auditLogs.module,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        description: auditLogs.description,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
        departmentId: auditLogs.departmentId,
        departmentName: departments.name,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(departments, eq(departments.id, auditLogs.departmentId))
      .where(condition)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return buildPage(rows, countRow?.total ?? 0, query.page, query.pageSize);
  }

  /** Thống kê nhanh theo phân hệ — phục vụ trang tổng quan */
  async stats(days = 7) {
    const since = new Date(Date.now() - days * 86_400_000);
    const byModule = await this.db.db
      .select({ module: auditLogs.module, total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since))
      .groupBy(auditLogs.module)
      .orderBy(desc(sql`count(*)`));

    const byAction = await this.db.db
      .select({ action: auditLogs.action, total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since))
      .groupBy(auditLogs.action)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const [totalRow] = await this.db.db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs);

    return {
      days,
      total: totalRow?.total ?? 0,
      byModule,
      byAction,
    };
  }

  /** Nhật ký của một bản ghi cụ thể */
  async forEntity(module: string, entity: string, entityId: string | number) {
    return this.db.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        username: auditLogs.username,
        fullName: auditLogs.fullName,
        description: auditLogs.description,
        beforeData: auditLogs.beforeData,
        afterData: auditLogs.afterData,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.module, module),
          eq(auditLogs.entity, entity),
          eq(auditLogs.entityId, String(entityId)),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
  }

  /** Người dùng thao tác nhiều nhất */
  async topUsers(days = 30, limit = 10) {
    const since = new Date(Date.now() - days * 86_400_000);
    return this.db.db
      .select({
        userId: auditLogs.userId,
        username: auditLogs.username,
        fullName: auditLogs.fullName,
        total: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .where(and(gte(auditLogs.createdAt, since), inArray(sql`${auditLogs.userId} is not null`, [true])))
      .groupBy(auditLogs.userId, auditLogs.username, auditLogs.fullName)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  }

  /** Tra cứu người dùng kèm tên khoa — dùng chung cho trang nhật ký */
  async usersLookup(): Promise<{ id: number; username: string; fullName: string }[]> {
    return this.db.db
      .select({ id: users.id, username: users.username, fullName: users.fullName })
      .from(users)
      .orderBy(users.fullName);
  }
}
