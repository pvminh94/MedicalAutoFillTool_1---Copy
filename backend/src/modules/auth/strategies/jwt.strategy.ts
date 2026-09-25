import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { config } from '../../../config/env';
import type { JwtPayload } from '../../../common/types/access-context';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Hỗ trợ cookie cho trường hợp mở bản in trong tab mới
        (req: { cookies?: Record<string, string> } | undefined) =>
          req?.cookies?.['qlbs_access'] ?? null,
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
