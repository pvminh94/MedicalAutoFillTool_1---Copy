import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit, RequirePermissions } from '../../common/decorators';
import { CreateJobTitleDto, JobTitleQueryDto, UpdateJobTitleDto } from './job-titles.dto';
import { JobTitlesService } from './job-titles.service';

@ApiTags('Danh mục chức danh')
@ApiBearerAuth()
@Controller('job-titles')
export class JobTitlesController {
  constructor(private readonly service: JobTitlesService) {}

  @Get()
  @RequirePermissions('job_title.view')
  @ApiOperation({ summary: 'Danh sách chức danh (tìm kiếm + phân trang)' })
  list(@Query() query: JobTitleQueryDto) {
    return this.service.list(query);
  }

  @Get('options')
  @ApiOperation({ summary: 'Danh sách gọn cho ô chọn chức danh' })
  options() {
    return this.service.options();
  }

  @Get(':id')
  @RequirePermissions('job_title.view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('job_title.create')
  @Audit({ module: 'ADMIN', action: 'CREATE', entity: 'job_title', description: 'Thêm chức danh' })
  create(@Body() dto: CreateJobTitleDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('job_title.update')
  @Audit({ module: 'ADMIN', action: 'UPDATE', entity: 'job_title', description: 'Sửa chức danh' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobTitleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('job_title.delete')
  @Audit({ module: 'ADMIN', action: 'DELETE', entity: 'job_title', description: 'Xoá chức danh' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
