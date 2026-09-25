/**
 * Phân hệ Thiết kế bản in.
 * Chỉ phụ thuộc CSDL nên có thể dùng lại ở mọi phân hệ khác (HSBA, báo cáo, tiện ích).
 */
import { Module } from '@nestjs/common';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';

@Module({
  controllers: [PrintingController],
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
