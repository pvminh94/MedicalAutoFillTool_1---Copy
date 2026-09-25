import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Bọc mọi phản hồi thành công vào cấu trúc thống nhất:
 *   { success: true, data: <dữ liệu>, timestamp }
 * Giữ nguyên phản hồi nhị phân (xuất tệp) và những phản hồi đã tự bọc.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T> | T> {
    return next.handle().pipe(
      map((data) => {
        const res = context.switchToHttp().getResponse<{ headersSent?: boolean; getHeader?: (k: string) => unknown }>();
        // Phản hồi tải tệp (đã set Content-Disposition) hoặc stream → không bọc
        const disposition = res.getHeader?.('content-disposition');
        if (disposition) return data;
        if (data instanceof Buffer || data instanceof Uint8Array) return data;
        if (data instanceof StreamableFile) return data;
        if (data && typeof data === 'object' && 'success' in (data as object)) {
          return data;
        }
        return { success: true as const, data, timestamp: new Date().toISOString() };
      }),
    );
  }
}
