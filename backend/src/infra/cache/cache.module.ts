/**
 * Module hạ tầng cache + Redis.
 *
 * Khởi tạo client ioredis nếu `CACHE_DRIVER=redis`; nếu Redis không sẵn sàng,
 * tự động hạ cấp sang cache bộ nhớ để hệ thống vẫn chạy được (ghi cảnh báo).
 */
import { Global, Logger, Module, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../../config/env';
import { CACHE_REDIS, CacheService } from './cache.service';

const redisProvider: Provider = {
  provide: CACHE_REDIS,
  useFactory: (): Redis | null => {
    if (config.redis.driver !== 'redis') return null;
    const logger = new Logger('Redis');
    const client = new Redis(config.redis.url, {
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
      reconnectOnError: () => true,
    });
    client.on('ready', () => logger.log(`Đã kết nối Redis: ${config.redis.url}`));
    client.on('error', (err) => {
      // Không ném lỗi ra ngoài: chỉ ghi log, cache sẽ tự hạ cấp khi cần
      logger.warn(`Redis: ${err.message}`);
    });
    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider, CacheService],
  exports: [CacheService, CACHE_REDIS],
})
export class CacheModule {}
