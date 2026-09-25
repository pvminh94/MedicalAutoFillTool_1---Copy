import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { AdvancedQueryDto } from '../../common/dto/query.dto';
import { AuditService } from './audit.service';

@ApiTags('Nhật ký kiểm toán')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit.log.view')
  @ApiOperation({ summary: 'Tra cứu nhật ký kiểm toán (lọc nâng cao + phân trang)' })
  search(@Query() query: AdvancedQueryDto) {
    return this.auditService.search(query);
  }

  @Get('stats')
  @RequirePermissions('audit.log.view')
  @ApiOperation({ summary: 'Thống kê nhật ký theo phân hệ và thao tác' })
  stats(@Query('days') days?: string) {
    return this.auditService.stats(days ? Number(days) : 7);
  }

  @Get('top-users')
  @RequirePermissions('audit.log.view')
  @ApiOperation({ summary: 'Người dùng thao tác nhiều nhất' })
  topUsers(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.auditService.topUsers(days ? Number(days) : 30, limit ? Number(limit) : 10);
  }

  @Get('entity')
  @RequirePermissions('audit.log.view')
  @ApiOperation({ summary: 'Nhật ký của một bản ghi cụ thể' })
  forEntity(
    @Query('module') module: string,
    @Query('entity') entity: string,
    @Query('entityId') entityId: string,
  ) {
    return this.auditService.forEntity(module, entity, entityId);
  }
}
