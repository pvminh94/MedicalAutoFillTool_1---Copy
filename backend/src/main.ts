import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { config } from './config/env';
import { MaintenanceService } from './infra/maintenance/maintenance.service';

process.env.TZ = process.env.TZ ?? config.timezone;

async function bootstrap(): Promise<void> {
  const logger = new Logger('QLBS');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: config.isProd
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug'],
    bodyParser: true,
    rawBody: false,
  });

  app.setGlobalPrefix(config.apiPrefix, {
    exclude: ['health', 'ready', 'version'],
  });

  // Ứng dụng chạy sau proxy (Nginx) nên cần tin tưởng X-Forwarded-*
  app.set('trust proxy', 1);

  app.enableCors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept-Language'],
    exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
  });

  // Chế độ bảo trì (khi phục hồi CSDL): chặn yêu cầu trước khi vào route/xác thực
  app.use(app.get(MaintenanceService).middleware());

  const bodyLimit = `${config.storage.uploadMaxMb}mb`;
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      forbidUnknownValues: false,
      validationError: { target: false, value: false },
    }),
  );

  // Tiêu đề bảo mật cơ bản (thay cho helmet, tránh thêm phụ thuộc)
  app.use(
    (
      _req: unknown,
      res: { setHeader: (k: string, v: string) => void; removeHeader: (k: string) => void },
      next: () => void,
    ) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-DNS-Prefetch-Control', 'off');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      res.removeHeader('X-Powered-By');
      next();
    },
  );

  // Thư mục lưu tệp tải lên — phục vụ trực tiếp để hiển thị ảnh/chữ ký
  fs.mkdirSync(config.storage.dir, { recursive: true });
  fs.mkdirSync(config.storage.exportsDir, { recursive: true });
  fs.mkdirSync(config.storage.backupsDir, { recursive: true });
  app.useStaticAssets(config.storage.dir, { prefix: '/files/' });

  if (config.swagger) {
    const doc = new DocumentBuilder()
      .setTitle('QLBS API — Phần mềm Quản lý Bệnh viện')
      .setDescription(
        'API cho hệ thống quản lý bệnh viện: hồ sơ bệnh án, báo cáo khoa, thiết kế bản in, quản trị phân quyền.',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addTag('Xác thực')
      .build();
    const document = SwaggerModule.createDocument(app, doc);
    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true },
      customSiteTitle: 'QLBS API',
    });
    logger.log(`Tài liệu API: http://localhost:${config.port}/${config.apiPrefix}/docs`);
  }

  app.enableShutdownHooks();

  await app.listen(config.port, config.host);

  const banner = [
    '──────────────────────────────────────────────────────────',
    `  QLBS — Phần mềm Quản lý Bệnh viện`,
    `  Môi trường : ${config.env}`,
    `  API        : http://localhost:${config.port}/${config.apiPrefix}`,
    `  Tình trạng : http://localhost:${config.port}/health`,
    `  CSDL       : ${config.database.url.replace(/:\/\/[^@]*@/, '://***@')}`,
    `  Cache      : ${config.redis.driver}  ·  Hàng đợi: ${config.queue.driver}`,
    `  Múi giờ    : ${config.timezone}`,
    '──────────────────────────────────────────────────────────',
  ].join('\n');
  logger.log(`\n${banner}`);
}

void bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Không khởi động được ứng dụng:', err);
  process.exit(1);
});
