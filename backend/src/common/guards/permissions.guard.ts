import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from '../decorators';
import type { AccessContext } from '../types/access-context';

/**
 * Kiểm tra quyền hạn chi tiết (PBAC): mỗi endpoint khai báo mã quyền cần có.
 * Quản trị tối cao (SUPER_ADMIN) bỏ qua toàn bộ kiểm tra.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AccessContext }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Chưa đăng nhập');
    if (user.isSuperAdmin) return true;

    const mode =
      this.reflector.getAllAndOverride<'all' | 'any'>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const owned = new Set(user.permissions);
    const ok = mode === 'all' ? required.every((p) => owned.has(p)) : required.some((p) => owned.has(p));

    if (!ok) {
      throw new ForbiddenException(
        `Tài khoản không có quyền thực hiện thao tác này (cần: ${required.join(', ')})`,
      );
    }
    return true;
  }
}
