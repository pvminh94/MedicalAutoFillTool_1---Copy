import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { config } from '../../../config/env';
import type { JwtPayload } from '../../../common/types/access-context';
import { AuthService } from '../auth.service';

/** Lấy giá trị một cookie từ header `Cookie` thô. */
function readCookie(header: string | string[] | undefined, name: string): string | null {
  const raw = Array.isArray(header) ? header.join('; ') : header;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const value = part.slice(idx + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Hỗ trợ cookie cho trường hợp mở bản in trong tab mới
        // (tự đọc header Cookie — ứng dụng không cài cookie-parser nên req.cookies luôn rỗng)
        (req: { cookies?: Record<string, string>; headers?: Record<string, string | string[] | undefined> } | undefined) =>
          req?.cookies?.['qlbs_access'] ?? readCookie(req?.headers?.cookie, 'qlbs_access'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
      issuer: config.jwt.issuer,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Loại token không hợp lệ');
    }
    const ctx = await this.authService.buildAccessContext(payload.sub, payload.sid);
    if (!ctx) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn hoặc đã bị thu hồi');
    }
    return ctx;
  }
}
