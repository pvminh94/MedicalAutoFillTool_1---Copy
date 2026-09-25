import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { DB, type Database } from '../../db/db.service';
import {
  auditLogs,
  departments,
  hsbaRequests,
  reportEntries,
  scheduledJobs,
  users,
} from '../../db/schema';
import { CurrentUser } from '../../common/decorators';
import type { AccessContext } from '../../common/types/access-context';
import { resolvePeriod, eachDay, addDays, today } from '../../common/utils/date.util';

/**
 * Số liệu tổng quan cho trang chủ: mỗi người chỉ thấy phạm vi được phép
 * (theo vai trò và khoa được gán).
 */
@ApiTags('Bảng điều khiển')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get('summary')
  @ApiOperation({ summary: 'Số liệu tổng quan: hồ sơ, báo cáo, người dùng, tác vụ, nhật ký' })
  async summary(@CurrentUser() user: AccessContext, @Query('days') days?: string) {
    const span = Math.min(Math.max(Number(days ?? 14) || 14, 7), 90);
    const from = addDays(today(), -span + 1);
    const period = resolvePeriod('day', today());

    const scoped = !user.isSuperAdmin && user.dataScope !== 'ALL';

    const scopeCondition = user.departmentIds.length
      ? or(inArray(hsbaRequests.departmentId, user.departmentIds), eq(hsbaRequests.createdBy, user.id))
      : eq(hsbaRequests.createdBy, user.id);
    const hsbaWhere = scoped
      ? and(isNull(hsbaRequests.deletedAt), scopeCondition)
      : isNull(hsbaRequests.deletedAt);

    const [hsbaTotals] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${hsbaRequests.status} like 'CHO_%')::int`,
        completed: sql<number>`count(*) filter (where ${hsbaRequests.status} = 'HOAN_TAT')::int`,
        returned: sql<number>`count(*) filter (where ${hsbaRequests.status} = 'TRA_LAI')::int`,
        today: sql<number>`count(*) filter (where ${hsbaRequests.createdAt}::date = current_date)::int`,
      })
      .from(hsbaRequests)
      .where(hsbaWhere);

    const hsbaByDay = await this.db
      .select({
        day: sql<string>`${hsbaRequests.createdAt}::date::text`,
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${hsbaRequests.status} = 'HOAN_TAT')::int`,
      })
      .from(hsbaRequests)
      .where(
        scoped
          ? and(hsbaWhere, gte(hsbaRequests.createdAt, new Date(`${from}T00:00:00`)))
          : and(isNull(hsbaRequests.deletedAt), gte(hsbaRequests.createdAt, new Date(`${from}T00:00:00`))),
      )
      .groupBy(sql`${hsbaRequests.createdAt}::date`)
      .orderBy(asc(sql`${hsbaRequests.createdAt}::date`));

    const dayMap = new Map(hsbaByDay.map((r) => [r.day, r]));
    const hsbaTrend = eachDay(from, today()).map((d) => ({
      day: d,
      total: dayMap.get(d)?.total ?? 0,
      completed: dayMap.get(d)?.completed ?? 0,
    }));

    const [reportStats] = await this.db
      .select({
        departments: sql<number>`(select count(*)::int from ${departments} where report_enabled = true and active = true and deleted_at is null)`,
        entriesToday: sql<number>`(select count(*)::int from ${reportEntries} where entry_date = current_date)`,
        entriesPeriod: sql<number>`(select count(*)::int from ${reportEntries} where entry_date between ${period.from} and ${period.to})`,
        departmentsToday: sql<number>`(select count(distinct d.id)::int from ${departments} d join report_templates t on t.department_id = d.id join report_entries e on e.template_id = t.id where e.entry_date = current_date)`,
      })
      .from(departments)
      .limit(1);

    const reportsByDay = await this.db
      .select({
        day: sql<string>`${reportEntries.entryDate}::text`,
        cells: sql<number>`count(*)::int`,
      })
      .from(reportEntries)
      .where(sql`${reportEntries.entryDate} between ${from} and ${today()}`)
      .groupBy(reportEntries.entryDate)
      .orderBy(asc(reportEntries.entryDate));
    const reportDayMap = new Map(reportsByDay.map((r) => [r.day, r.cells]));

    const [userStats] = await this.db
      .select({
        users: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${users.active})::int`,
      })
      .from(users)
      .where(isNull(users.deletedAt));

    const [deptStats] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        reportable: sql<number>`count(*) filter (where ${departments.reportEnabled})::int`,
      })
      .from(departments)
      .where(isNull(departments.deletedAt));

    const jobs = await this.db
      .select({
        id: scheduledJobs.id,
        code: scheduledJobs.code,
        name: scheduledJobs.name,
        cron: scheduledJobs.cron,
        lastStatus: scheduledJobs.lastStatus,
        lastRunAt: scheduledJobs.lastRunAt,
        runCount: scheduledJobs.runCount,
        failCount: scheduledJobs.failCount,
        active: scheduledJobs.active,
      })
      .from(scheduledJobs)
      .where(eq(scheduledJobs.active, true))
      .orderBy(asc(scheduledJobs.nextRunAt))
      .limit(5);

    const recentAudit = await this.db
      .select({
        id: auditLogs.id,
        username: auditLogs.username,
        fullName: auditLogs.fullName,
        action: auditLogs.action,
        module: auditLogs.module,
        entity: auditLogs.entity,
        description: auditLogs.description,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(8);

    return {
      scope: {
        dataScope: user.dataScope,
        departmentIds: user.departmentIds,
        departmentId: user.departmentId,
        isSuperAdmin: user.isSuperAdmin,
      },
      hsba: {
        ...hsbaTotals,
        trend: hsbaTrend,
      },
      reports: {
        departments: reportStats?.departments ?? 0,
        departmentsToday: reportStats?.departmentsToday ?? 0,
        entriesToday: reportStats?.entriesToday ?? 0,
        entriesPeriod: reportStats?.entriesPeriod ?? 0,
        trend: eachDay(from, today()).map((d) => ({ day: d, cells: reportDayMap.get(d) ?? 0 })),
      },
      users: userStats ?? { users: 0, active: 0 },
      departments: deptStats ?? { total: 0, reportable: 0 },
      jobs,
      recentAudit,
    };
  }
}
