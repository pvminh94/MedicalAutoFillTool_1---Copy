import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { config } from './config/env';
import { DbModule } from './db/db.module';
import { CacheModule } from './infra/cache/cache.module';
import { QueueModule } from './infra/queue/queue.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { HealthModule } from './modules/health/health.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UtilitiesModule } from './modules/utilities/utilities.module';

const envFile = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(__dirname, '..', '.env'),
].find((p) => fs.existsSync(p));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFile,
      ignoreEnvFile: !envFile,
    }),
    ScheduleModule.forRoot(),
    // Hạ tầng
    DbModule,
    CacheModule,
    QueueModule,
    // Nghiệp vụ hệ thống
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    DepartmentsModule,
    SettingsModule,
    UtilitiesModule,
    SchedulerModule,
    // Kiểm tra tình trạng
    HealthModule,
  ],
  providers: [
    // Thứ tự guard có ý nghĩa: xác thực trước, phân quyền sau
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Chuẩn hoá phản hồi + ghi nhật ký thao tác
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Bắt mọi lỗi và trả về cấu trúc thống nhất
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {
  static readonly timezone = config.timezone;
}
