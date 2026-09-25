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
import { Audit, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AdvancedQueryDto } from '../../common/dto/query.dto';
import type { AccessContext } from '../../common/types/access-context';
import {
  CreateUtilityDto,
  UpdateUtilityDto,
  UtilitiesService,
} from './utilities.service';

@ApiTags('Tiện ích mở rộng')
@ApiBearerAuth()
@Controller('utilities')
export class UtilitiesController {
  constructor(private readonly service: UtilitiesService) {}

  @Get()
  @RequirePermissions('utility.view')
  @ApiOperation({ summary: 'Danh sách tiện ích' })
  list(@Query() query: AdvancedQueryDto) {
    return this.service.list(query);
  }

  @Get('menu')
  @ApiOperation({ summary: 'Menu tiện ích của người dùng hiện tại (đã lọc theo quyền)' })
  menu(@CurrentUser() user: AccessContext, @Query('placement') placement?: 'sidebar' | 'dashboard') {
    return this.service.menuFor(user, placement);
  }

  @Get(':id')
  @RequirePermissions('utility.view')
  @ApiOperation({ summary: 'Chi tiết tiện ích' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('utility.create')
  @Audit({ module: 'UTILITY', action: 'CREATE', entity: 'utility', description: 'Thêm tiện ích' })
  @ApiOperation({ summary: 'Thêm tiện ích mới' })
  create(@Body() dto: CreateUtilityDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('utility.update')
  @Audit({ module: 'UTILITY', action: 'UPDATE', entity: 'utility', description: 'Sửa tiện ích' })
  @ApiOperation({ summary: 'Cập nhật tiện ích' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUtilityDto) {
    return this.service.update(id, dto);
  }

  @Patch('reorder')
  @RequirePermissions('utility.update')
  @ApiOperation({ summary: 'Sắp xếp thứ tự tiện ích' })
  reorder(@Body() body: { items: { id: number; sortOrder: number }[] }) {
    return this.service.reorder(body.items);
  }

  @Delete(':id')
  @RequirePermissions('utility.delete')
  @Audit({ module: 'UTILITY', action: 'DELETE', entity: 'utility', description: 'Xoá tiện ích' })
  @ApiOperation({ summary: 'Xoá tiện ích' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
