/**
 * Phân hệ Báo cáo công tác của khoa.
 * Gồm: mẫu báo cáo (cấu trúc bảng biểu động), nhập số liệu, bộ máy tính báo cáo
 * theo kỳ, tổng hợp toàn viện và kết xuất Excel/Word/PDF.
 */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';
import {
  ReportEntryController,
  ReportSnapshotController,
  ReportTemplateController,
  ReportViewController,
} from './reports.controller';

@Module({
  imports: [AuditModule],
  controllers: [
    ReportTemplateController,
    ReportViewController,
    ReportEntryController,
    ReportSnapshotController,
  ],
  providers: [ReportsService, ReportsExportService],
  exports: [ReportsService, ReportsExportService],
})
export class ReportsModule {}
