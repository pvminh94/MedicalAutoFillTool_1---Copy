import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMetadata } from '../decorators';
import type { AccessContext } from '../types/access-context';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * Tự động ghi nhật ký kiểm toán cho những endpoint có gắn @Audit(...).
 * Lấy mã bản ghi từ tham số đường dẫn (id) hoặc từ kết quả trả về (id/code).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<{
      user?: AccessContext;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      ip?: string;
      headers?: Record<string, string>;
      method: string;
      originalUrl: string;
    }>();
    const user = req.user;
    const started = Date.now();

    const write = (result: unknown, error?: Error): void => {
      const resultObj = (result ?? {}) as Record<string, unknown>;
      const entityId =
        req.params?.['id'] ??
        req.params?.['code'] ??
        (typeof resultObj['id'] === 'number' || typeof resultObj['id'] === 'string'
          ? String(resultObj['id'])
          : undefined);

      void this.audit.log({
        userId: user?.id ?? null,
        username: user?.username ?? '',
        fullName: user?.fullName ?? '',
        action: error ? `${meta.action}_FAILED` : meta.action,
        module: meta.module,
        entity: meta.entity,
        entityId: entityId ?? '',
        description: error
          ? `${meta.description ?? meta.action} — lỗi: ${error.message}`
          : (meta.description ?? `${meta.action} ${meta.entity}`),
        afterData: error ? undefined : { status: 'ok', ms: Date.now() - started },
        departmentId: user?.departmentId ?? null,
        ip: req.ip ?? '',
        userAgent: req.headers?.['user-agent'] ?? '',
      });
    };

    return next.handle().pipe(
      tap({
        next: (result) => write(result),
        error: (err: Error) => write(null, err),
      }),
    );
  }
}
