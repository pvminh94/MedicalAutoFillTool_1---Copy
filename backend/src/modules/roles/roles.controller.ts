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
import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { Audit, RequirePermissions } from '../../common/decorators';
import { AdvancedQueryDto } from '../../common/dto/query.dto';
import { CreateRoleDto, RolesService, UpdateRoleDto } from './roles.service';

class SetPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];
}

class TogglePermissionDto {
  @IsString()
  permissionCode!: string;

  @IsBoolean()
  granted!: boolean;
}

class AssignUsersDto {
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];

  @IsOptional()
  @IsBoolean()
  granted?: boolean;
}

class DuplicateRoleDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

@ApiTags('Vai trò & phân quyền')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('role.view')
  @ApiOperation({ summary: 'Danh sách vai trò' })
  list(@Query() query: AdvancedQueryDto) {
    return this.service.list(query);
  }

  @Get('all')
  @ApiOperation({ summary: 'Toàn bộ vai trò đang hoạt động (cho ô chọn)' })
  all() {
    return this.service.all();
  }

  @Get('matrix')
  @RequirePermissions('role.view')
  @ApiOperation({ summary: 'Ma trận vai trò × quyền phục vụ giao diện phân quyền' })
  matrix() {
    return this.service.matrix();
  }

  @Get(':id')
  @RequirePermissions('role.view')
  @ApiOperation({ summary: 'Chi tiết vai trò kèm quyền và thành viên' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('role.create')
  @Audit({ module: 'ADMIN', action: 'CREATE', entity: 'role', description: 'Thêm vai trò' })
  @ApiOperation({ summary: 'Thêm vai trò mới' })
  create(@Body() dto: CreateRoleDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('role.update')
  @Audit({ module: 'ADMIN', action: 'UPDATE', entity: 'role', description: 'Sửa vai trò' })
  @ApiOperation({ summary: 'Cập nhật vai trò' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/permissions')
  @RequirePermissions('role.update')
  @Audit({ module: 'ADMIN', action: 'UPDATE', entity: 'role', description: 'Gán quyền cho vai trò' })
  @ApiOperation({ summary: 'Gán lại toàn bộ tập quyền của vai trò' })
  setPermissions(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPermissionsDto) {
    return this.service.setPermissions(id, dto.permissionCodes);
  }

  @Patch(':id/permissions')
  @RequirePermissions('role.update')
  @ApiOperation({ summary: 'Bật/tắt một quyền của vai trò' })
  togglePermission(@Param('id', ParseIntPipe) id: number, @Body() dto: TogglePermissionDto) {
    return this.service.togglePermission(id, dto.permissionCode, dto.granted);
  }

  @Post(':id/users')
  @RequirePermissions('user.assign-role')
  @Audit({ module: 'ADMIN', action: 'UPDATE', entity: 'role', description: 'Gán vai trò cho người dùng' })
  @ApiOperation({ summary: 'Gán vai trò cho nhiều người dùng' })
  assignUsers(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignUsersDto) {
    return this.service.assignToUsers(id, dto.userIds, dto.granted ?? true);
  }

  @Post(':id/duplicate')
  @RequirePermissions('role.create')
  @ApiOperation({ summary: 'Nhân bản vai trò' })
  duplicate(@Param('id', ParseIntPipe) id: number, @Body() dto: DuplicateRoleDto) {
    return this.service.duplicate(id, dto.code, dto.name);
  }

  @Delete(':id')
  @RequirePermissions('role.delete')
  @Audit({ module: 'ADMIN', action: 'DELETE', entity: 'role', description: 'Xoá vai trò' })
  @ApiOperation({ summary: 'Xoá vai trò' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
