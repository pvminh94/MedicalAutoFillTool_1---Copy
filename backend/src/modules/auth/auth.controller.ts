import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  Audit,
  ClientInfo,
  CurrentUser,
  Public,
} from '../../common/decorators';
import type { AccessContext, ClientMeta } from '../../common/types/access-context';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  RefreshTokenDto,
  UpdateProfileDto,
} from './dto/auth.dto';

@ApiTags('Xác thực')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Audit({ module: 'AUTH', action: 'LOGIN', entity: 'user', description: 'Đăng nhập hệ thống' })
  @ApiOperation({ summary: 'Đăng nhập' })
  login(@Body() dto: LoginDto, @ClientInfo() meta: ClientMeta) {
    return this.authService.login(dto, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Làm mới token' })
  refresh(@Body() dto: RefreshTokenDto, @ClientInfo() meta: ClientMeta) {
    return this.authService.refresh(dto.refreshToken, meta);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @Audit({ module: 'AUTH', action: 'LOGOUT', entity: 'user', description: 'Đăng xuất' })
  @ApiOperation({ summary: 'Đăng xuất khỏi phiên hiện tại' })
  async logout(@CurrentUser() user: AccessContext) {
    await this.authService.logout(user.sessionId, user.id);
    return { message: 'Đã đăng xuất' };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Thông tin người dùng đang đăng nhập kèm quyền hiệu lực' })
  me(@CurrentUser() user: AccessContext) {
    return user;
  }

  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Hồ sơ cá nhân chi tiết' })
  profile(@CurrentUser() user: AccessContext) {
    return this.authService.profile(user.id);
  }

  @ApiBearerAuth()
  @Put('profile')
  @Audit({ module: 'AUTH', action: 'UPDATE', entity: 'user', description: 'Cập nhật hồ sơ cá nhân' })
  @ApiOperation({ summary: 'Cập nhật hồ sơ cá nhân' })
  updateProfile(@CurrentUser() user: AccessContext, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(200)
  @Audit({ module: 'AUTH', action: 'UPDATE', entity: 'user', description: 'Đổi mật khẩu' })
  @ApiOperation({ summary: 'Đổi mật khẩu' })
  changePassword(@CurrentUser() user: AccessContext, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('permissions')
  @ApiOperation({ summary: 'Danh mục toàn bộ quyền (nhóm theo phân hệ)' })
  permissions() {
    return this.authService.listPermissions();
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'Các phiên đăng nhập đang hoạt động' })
  sessions(@CurrentUser() user: AccessContext) {
    return this.authService.activeSessions(user.id);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Thu hồi một phiên đăng nhập' })
  async revokeSession(@CurrentUser() user: AccessContext, @Param('id') id: string) {
    await this.authService.revokeSession(user.id, id);
    return { message: 'Đã thu hồi phiên đăng nhập' };
  }

  @ApiBearerAuth()
  @Delete('sessions')
  @ApiOperation({ summary: 'Đăng xuất khỏi toàn bộ thiết bị' })
  async revokeAll(@CurrentUser() user: AccessContext, @Req() _req: Request) {
    const count = await this.authService.revokeAllSessions(user.id);
    return { message: `Đã thu hồi ${count} phiên đăng nhập` };
  }
}
