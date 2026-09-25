import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { AccessContext, ClientMeta } from '../types/access-context';

/* ------------------------------------------------------------------ Bỏ qua xác thực */
export const IS_PUBLIC_KEY = 'qlbs:isPublic';
/** Đánh dấu endpoint không cần đăng nhập */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/* ----------------------------------------------------------------------- Quyền hạn */
export const PERMISSIONS_KEY = 'qlbs:permissions';
export const PERMISSIONS_MODE_KEY = 'qlbs:permissionsMode';

export interface PermissionRequirement {
  codes: string[];
  /** all = phải có đủ · any = chỉ cần một */
  mode: 'all' | 'any';
}

/**
 * Yêu cầu quyền truy cập.
 * @example @RequirePermissions('hsba.request.create')
 * @example @RequirePermissions(['hsba.request.approve','hsba.request.return'], 'any')
 */
export function RequirePermissions(
  codes: string | string[],
  mode: 'all' | 'any' = 'all',
): MethodDecorator & ClassDecorator {
  const list = Array.isArray(codes) ? codes : [codes];
  const decorator = (
    target: object,
    key?: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void => {
    SetMetadata(PERMISSIONS_KEY, list)(target, key as string, descriptor as PropertyDescriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, mode)(target, key as string, descriptor as PropertyDescriptor);
  };
  return decorator as MethodDecorator & ClassDecorator;
}

/* ---------------------------------------------------------- Ngữ cảnh người dùng */
export const CurrentUser = createParamDecorator(
  (data: keyof AccessContext | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AccessContext }>();
    const user = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

export const ClientInfo = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientMeta => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ ip?: string; headers?: Record<string, string>; socket?: { remoteAddress?: string } }>();
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip =
      (forwarded ? String(forwarded).split(',')[0].trim() : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      '';
    return { ip, userAgent: String(req.headers?.['user-agent'] ?? '') };
  },
);

/* ------------------------------------------------------------------ Ghi kiểm toán */
export const AUDIT_KEY = 'qlbs:audit';
export interface AuditMetadata {
  module: string;
  action: string;
  entity: string;
  description?: string;
}

/**
 * Ghi nhật ký kiểm toán cho thao tác.
 * @example @Audit({ module: 'HSBA', action: 'CREATE', entity: 'hsba_request' })
 */
export function Audit(meta: AuditMetadata): MethodDecorator {
  return SetMetadata(AUDIT_KEY, meta);
}

/* ------------------------------------------------------------- Bỏ qua giới hạn khoa */
export const BYPASS_SCOPE_KEY = 'qlbs:bypassScope';
/** Cho phép truy cập dữ liệu ngoài phạm vi khoa (chỉ dùng cho endpoint hệ thống) */
export const BypassDataScope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(BYPASS_SCOPE_KEY, true);
