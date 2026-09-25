import { Global, Module } from '@nestjs/common';
import { DB, DbService, createDbConnection } from './db.service';

/**
 * Module CSDL toàn cục — cung cấp kết nối Drizzle dùng chung cho mọi phân hệ.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => createDbConnection(),
    },
    DbService,
  ],
  exports: [DbService, DB],
})
export class DbModule {}
