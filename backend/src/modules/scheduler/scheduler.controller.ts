import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Audit, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AdvancedQueryDto } from '../../common/dto/query.dto';
import type { AccessContext } from '../../common/types/access-context';
import { SchedulerService, type UpsertJobDto } from './scheduler.service';

class CreateJobDto implements UpsertJobDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() handler!: string;
  @IsString() cron!: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() allowOverlap?: boolean;
  @IsOptional() @IsInt() @Min(1) timeoutSec?: number;
  @IsOptional() @IsInt() @Min(0) maxRetries?: number;
}

class UpdateJobDto implements Partial<UpsertJobDto> {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() handler?: string;
  @IsOptional() @IsString() cron?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() allowOverlap?: boolean;
  @IsOptional() @IsInt() timeoutSec?: number;
  @IsOptional() @IsInt() maxRetries?: number;
}

@ApiTags('Tác vụ định kỳ')
@ApiBearerAuth()
@Controller('jobs')
export class SchedulerController {
  constructor(private readonly service: SchedulerService) {}

  @Get()
  @RequirePermissions('job.view')
  @ApiOperation({ summary: 'Danh sách tác vụ định kỳ' })
  list(@Query() query: AdvancedQueryDto) {
    return this.service.list(query);
  }

  @Get('handlers')
  @RequirePermissions('job.view')
  @ApiOperation({ summary: 'Danh mục hàm xử lý có sẵn' })
  handlers() {
    return this.service.availableHandlers();
  }

  @Get('stats')
  @RequirePermissions('job.view')
  @ApiOperation({ summary: 'Thống kê tác vụ và lần chạy gần nhất' })
  stats() {
    return this.service.stats();
  }

  @Get('runs')
  @RequirePermissions('job.view')
  @ApiOperation({ summary: 'Lịch sử chạy tác vụ' })
  allRuns(@Query() query: AdvancedQueryDto) {
    return this.service.allRuns(query);
  }

  @Get(':id')
  @RequirePermissions('job.view')
  @ApiOperation({ summary: 'Chi tiết tác vụ kèm lịch sử chạy' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('job.create')
  @Audit({ module: 'SYSTEM', action: 'CREATE', entity: 'job', description: 'Thêm tác vụ định kỳ' })
  @ApiOperation({ summary: 'Thêm tác vụ định kỳ' })
  create(@Body() dto: CreateJobDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('job.update')
  @Audit({ module: 'SYSTEM', action: 'UPDATE', entity: 'job', description: 'Sửa tác vụ định kỳ' })
  @ApiOperation({ summary: 'Cập nhật tác vụ' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle')
  @RequirePermissions('job.update')
  @ApiOperation({ summary: 'Bật/tắt tác vụ' })
  toggle(@Param('id', ParseIntPipe) id: number, @Body('active') active: boolean) {
    return this.service.toggle(id, !!active);
  }

  @Post(':id/run')
  @RequirePermissions('job.run')
  @Audit({ module: 'SYSTEM', action: 'RUN', entity: 'job', description: 'Chạy tác vụ ngay' })
  @ApiOperation({ summary: 'Chạy tác vụ ngay lập tức' })
  runNow(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessContext) {
    return this.service.runNow(id, user.id);
  }

  @Post('sync')
  @RequirePermissions('job.update')
  @ApiOperation({ summary: 'Nạp lại toàn bộ lịch định kỳ vào hàng đợi' })
  sync() {
    return this.service.syncSchedules();
  }

  @Delete(':id')
  @RequirePermissions('job.delete')
  @Audit({ module: 'SYSTEM', action: 'DELETE', entity: 'job', description: 'Xoá tác vụ định kỳ' })
  @ApiOperation({ summary: 'Xoá tác vụ' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
