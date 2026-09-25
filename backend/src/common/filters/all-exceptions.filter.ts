import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface PgError {
  code?: string;
  detail?: string;
  constraint?: string;
}

/**
 * Chuẩn hoá mọi lỗi trả về cùng một cấu trúc JSON để giao diện xử lý thống nhất:
 *   { success: false, statusCode, message, errors?, path, timestamp }
 * Đồng thời dịch một số mã lỗi PostgreSQL sang thông báo tiếng Việt dễ hiểu.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Lỗi hệ thống, vui lòng thử lại sau.';
    let errors: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; error?: string };
        if (Array.isArray(b.message)) {
          errors = b.message;
          message = 'Dữ liệu gửi lên không hợp lệ';
        } else if (typeof b.message === 'string') {
          message = b.message;
        } else if (b.error) {
          message = b.error;
        }
      }
    } else if (exception instanceof Error) {
      const pg = exception as Error & PgError;
      switch (pg.code) {
        case '23505':
          status = HttpStatus.CONFLICT;
          message = 'Dữ liệu đã tồn tại (trùng khoá duy nhất)';
          break;
        case '23503':
          status = HttpStatus.BAD_REQUEST;
          message = 'Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng';
          break;
        case '23502':
          status = HttpStatus.BAD_REQUEST;
          message = 'Thiếu trường bắt buộc';
          break;
        case '22P02':
          status = HttpStatus.BAD_REQUEST;
          message = 'Sai định dạng dữ liệu';
          break;
        case '57014':
          status = HttpStatus.REQUEST_TIMEOUT;
          message = 'Truy vấn quá lâu, vui lòng thu hẹp điều kiện lọc';
          break;
        default:
          message = exception.message || message;
      }
      if (pg.constraint) message = `${message} (${pg.constraint})`;
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
