import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { DB, type Database } from '../../db/db.service';
import { notifications } from '../../db/schema';
import { CurrentUser } from '../../common/decorators';
import type { AccessContext } from '../../common/types/access-context';

/**
 * Thông báo trong ứng dụng. Mọi phân hệ đều có thể tạo thông báo bằng cách ghi
 * vào bảng `notifications` (xem HsbaQueueHandlers) — giao diện chỉ cần đọc ở đây.
 */
@ApiTags('Thông báo')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  @ApiOperation({ summary: 'Thông báo của tôi' })
  async list(
    @CurrentUser() user: AccessContext,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    const where = [eq(notifications.userId, user.id)];
    if (unreadOnly === 'true') where.push(isNull(notifications.readAt));
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...where))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(Number(limit ?? 50) || 50, 200));
    const [count] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)::int`,
      })
      .from(notifications)
      .where(eq(notifications.userId, user.id));
    return {
      items: rows,
      total: count?.total ?? 0,
      unread: count?.unread ?? 0,
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu đã đọc' })
  async read(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessContext) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return { read: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu đã đọc tất cả' })
  async readAll(@CurrentUser() user: AccessContext) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { read: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xoá thông báo' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessContext) {
    await this.db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return { deleted: true };
  }
}
