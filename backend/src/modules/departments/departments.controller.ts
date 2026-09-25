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
import { Audit, RequirePermissions } from '../../common/decorators';
import { DepartmentsService } from './departments.service';
import {
  CreateDepartmentDto,
  DepartmentQueryDto,
  ReorderDepartmentsDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

@ApiTags('Đơn vị / Khoa phòng')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @RequirePermissions('department.view')
  @ApiOperation({ summary: 'Danh sách đơn vị (lọc nâng cao + phân trang)' })
  list(@Query() query: DepartmentQueryDto) {
    return this.service.list(query);
  }

  @Get('tree')
  @RequirePermissions('department.view')
  @ApiOperation({ summary: 'Cây phân cấp đơn vị' })
  tree(@Query('includeInactive') includeInactive?: string) {
    return this.service.tree(includeInactive === 'true');
  }

  @Get('options')
  @ApiOperation({ summary: 'Danh sách gọn cho ô chọn' })
  options(@Query('reportable') reportable?: string) {
    return this.service.options(reportable === 'true');
  }

  @Get(':id')
  @RequirePermissions('department.view')
  @ApiOperation({ summary: 'Chi tiết một đơn vị' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/descendants')
  @RequirePermissions('department.view')
  @ApiOperation({ summary: 'Toàn bộ id trong nhánh (gồm chính nó)' })
  async descendants(@Param('id', ParseIntPipe) id: number) {
    return { ids: await this.service.descendantIds(id) };
  }

  @Post()
  @RequirePermissions('department.create')
  @Audit({ module: 'ADMIN', action: 'CREATE', entity: 'department', description: 'Thêm đơn vị/khoa' })
  @ApiOperation({ summary: 'Thêm đơn vị/khoa mới' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('department.update')
  @Audit({ module: 'ADMIN', action: 'UPDATE', entity: 'department', description: 'Sửa đơn vị/khoa' })
  @ApiOperation({ summary: 'Cập nhật đơn vị' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(id, dto);
  }

  @Patch('reorder')
  @RequirePermissions('department.update')
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự đơn vị' })
  reorder(@Body() dto: ReorderDepartmentsDto) {
    return this.service.reorder(dto);
  }

  @Delete(':id')
  @RequirePermissions('department.delete')
  @Audit({ module: 'ADMIN', action: 'DELETE', entity: 'department', description: 'Xoá đơn vị/khoa' })
  @ApiOperation({ summary: 'Xoá đơn vị (xoá mềm)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('department.delete')
  @ApiOperation({ summary: 'Khôi phục đơn vị đã xoá' })
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.service.restore(id);
  }
}
