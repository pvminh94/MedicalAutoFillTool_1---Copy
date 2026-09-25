import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Audit, CurrentUser, Public, RequirePermissions } from '../../common/decorators';
import type { AccessContext } from '../../common/types/access-context';
import { SettingsService, type SettingItem } from './settings.service';

class SettingItemDto implements SettingItem {
  @IsString()
  key!: string;

  value!: unknown;

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  valueType?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

class SetManySettingsDto {
  @IsArray()
  items!: SettingItemDto[];
}

@ApiTags('Cấu hình hệ thống')
@Controller()
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Public()
  @Get('settings/public')
  @ApiOperation({ summary: 'Cấu hình công khai (tên bệnh viện, logo…) — không cần đăng nhập' })
  publicSettings() {
    return this.service.publicSettings();
  }

  @ApiBearerAuth()
  @Get('settings')
  @RequirePermissions('setting.view')
  @ApiOperation({ summary: 'Toàn bộ cấu hình (nhóm theo nhóm)' })
  all() {
    return this.service.all();
  }

  @ApiBearerAuth()
  @Put('settings')
  @RequirePermissions('setting.update')
  @Audit({ module: 'SYSTEM', action: 'UPDATE', entity: 'setting', description: 'Cập nhật cấu hình' })
  @ApiOperation({ summary: 'Lưu nhiều cấu hình cùng lúc' })
  setMany(@Body() dto: SetManySettingsDto, @CurrentUser() user: AccessContext) {
    return this.service.setMany(dto.items, user.id);
  }

  @ApiBearerAuth()
  @Put('settings/:key')
  @RequirePermissions('setting.update')
  @Audit({ module: 'SYSTEM', action: 'UPDATE', entity: 'setting', description: 'Cập nhật cấu hình' })
  @ApiOperation({ summary: 'Lưu một cấu hình' })
  set(
    @Param('key') key: string,
    @Body() body: { value: unknown; group?: string; label?: string; isPublic?: boolean },
    @CurrentUser() user: AccessContext,
  ) {
    return this.service.set({ key, ...body }, user.id);
  }

  @ApiBearerAuth()
  @Delete('settings/:key')
  @RequirePermissions('setting.update')
  @Audit({ module: 'SYSTEM', action: 'DELETE', entity: 'setting', description: 'Xoá cấu hình' })
  @ApiOperation({ summary: 'Xoá một cấu hình' })
  remove(@Param('key') key: string) {
    return this.service.remove(key);
  }

  @ApiBearerAuth()
  @Post('settings/reset')
  @RequirePermissions('setting.update')
  @Audit({ module: 'SYSTEM', action: 'UPDATE', entity: 'setting', description: 'Khôi phục cấu hình mặc định' })
  @ApiOperation({ summary: 'Khôi phục toàn bộ cấu hình mặc định' })
  reset(@CurrentUser() user: AccessContext) {
    return this.service.resetToDefaults(user.id);
  }
}
