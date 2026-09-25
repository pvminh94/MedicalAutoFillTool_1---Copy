import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audit, CurrentUser, RequirePermissions } from '../../common/decorators';
import type { AccessContext } from '../../common/types/access-context';
import { ReportsExportService } from './reports-export.service';
import { ReportsService } from './reports.service';
import {
  CreateReportTemplateDto,
  EntryGridQueryDto,
  ReportQueryDto,
  SaveStructureDto,
  UpdateReportTemplateDto,
  UpsertEntriesDto,
} from './dto/reports.dto';

@ApiTags('Báo cáo khoa — Mẫu báo cáo')
@ApiBearerAuth()
@Controller('reports/templates')
export class ReportTemplateController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @RequirePermissions('report.template.view')
  @ApiOperation({ summary: 'Danh sách mẫu báo cáo' })
  list(@Query() query: EntryGridQueryDto, @CurrentUser() user: AccessContext) {
    return this.service.listTemplates(query, user);
  }

  @Get(':id')
  @RequirePermissions('report.template.view')
  @ApiOperation({ summary: 'Chi tiết mẫu báo cáo (mục → nhóm → dòng, kèm danh sách cột)' })
  findOne(@Param('id', ParseIntPipe) id: number, @Query('includeArchived') includeArchived?: string) {
    return this.service.getTemplateFull(id, includeArchived === 'true');
  }

  @Post()
  @RequirePermissions('report.template.create')
  @Audit({ module: 'REPORT', action: 'CREATE', entity: 'report_template', description: 'Thêm mẫu báo cáo' })
  @ApiOperation({ summary: 'Tạo mẫu báo cáo (kèm cột và cấu trúc bảng biểu)' })
  create(@Body() dto: CreateReportTemplateDto, @CurrentUser() user: AccessContext) {
    return this.service.createTemplate(dto, user);
  }

  @Put(':id')
  @RequirePermissions('report.template.update')
  @Audit({ module: 'REPORT', action: 'UPDATE', entity: 'report_template', description: 'Sửa mẫu báo cáo' })
  @ApiOperation({ summary: 'Cập nhật thông tin mẫu báo cáo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReportTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Put(':id/structure')
  @RequirePermissions('report.template.update')
  @Audit({ module: 'REPORT', action: 'UPDATE', entity: 'report_template', description: 'Lưu cấu trúc báo cáo' })
  @ApiOperation({ summary: 'Lưu toàn bộ cấu trúc (cột, mục, nhóm, dòng) trong một lần' })
  saveStructure(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveStructureDto) {
    return this.service.saveStructure(id, dto);
  }

  @Post(':id/duplicate')
  @RequirePermissions('report.template.create')
  @ApiOperation({ summary: 'Sao chép mẫu báo cáo (có thể sang khoa khác)' })
  duplicate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { code: string; name?: string; departmentId?: number },
  ) {
    return this.service.duplicateTemplate(id, body.code, body.name, body.departmentId);
  }

  @Delete(':id')
  @RequirePermissions('report.template.delete')
  @Audit({ module: 'REPORT', action: 'DELETE', entity: 'report_template', description: 'Xoá mẫu báo cáo' })
  @ApiOperation({ summary: 'Xoá mẫu báo cáo (tự chuyển sang ngừng dùng nếu đã có số liệu)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeTemplate(id);
  }

  @Post('validate-formula')
  @RequirePermissions('report.template.view')
  @ApiOperation({ summary: 'Kiểm tra công thức cột trước khi lưu' })
  validate(@Body() body: { columns: CreateReportTemplateDto['columns']; formula?: string }) {
    return this.service.validateFormula({ columns: body.columns ?? [], formula: body.formula });
  }
}

@ApiTags('Báo cáo khoa — Xem & kết xuất')
@ApiBearerAuth()
@Controller('reports')
export class ReportViewController {
  constructor(
    private readonly service: ReportsService,
    private readonly exporter: ReportsExportService,
  ) {}

  @Get('view')
  @RequirePermissions('report.view.view')
  @ApiOperation({ summary: 'Tính báo cáo theo kỳ (ngày/tuần/tháng/quý/năm/khoảng/toàn bộ)' })
  view(@Query() query: ReportQueryDto, @CurrentUser() user: AccessContext) {
    return this.service.buildReport(query, user);
  }

  @Get('summary')
  @RequirePermissions('report.summary.view')
  @ApiOperation({ summary: 'Bảng tổng hợp toàn viện theo chỉ tiêu chuẩn' })
  summary(@Query() query: ReportQueryDto, @CurrentUser() user: AccessContext) {
    return this.service.buildSummary(query, user);
  }

  @Get('stats')
  @RequirePermissions('report.view.view')
  @ApiOperation({ summary: 'Thống kê tình hình nhập liệu (dashboard)' })
  stats(@Query() query: ReportQueryDto, @CurrentUser() user: AccessContext) {
    return this.service.stats(query, user);
  }

  @Get('export/:format')
  @RequirePermissions('report.export.excel')
  @ApiOperation({ summary: 'Kết xuất báo cáo ra Excel / Word / PDF' })
  async export(
    @Param('format') format: string,
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AccessContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.service.buildReport(query, user);
    const result =
      format === 'word'
        ? await this.exporter.exportWord(report)
        : format === 'pdf'
          ? await this.exporter.exportPdf(report)
          : await this.exporter.exportExcel(report);
    res.set({
      'Content-Type': result.mime,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
      'X-Report-Pages': String(result.pages ?? ''),
      // HTTP header chỉ nhận ASCII — bỏ dấu tiếng Việt cho an toàn
      'X-Report-Period': report.period.label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^\x20-\x7E]/g, ''),
    });
    return new StreamableFile(result.buffer);
  }
}

@ApiTags('Báo cáo khoa — Nhập số liệu')
@ApiBearerAuth()
@Controller('reports/entries')
export class ReportEntryController {
  constructor(private readonly service: ReportsService) {}

  @Get('grid')
  @RequirePermissions('report.entry.view')
  @ApiOperation({ summary: 'Lưới nhập liệu: cấu trúc bảng + số liệu đã nhập theo kỳ' })
  grid(@Query() query: EntryGridQueryDto, @CurrentUser() user: AccessContext) {
    return this.service.getEntryGrid(query, user);
  }

  @Get('latest-date')
  @RequirePermissions('report.entry.view')
  @ApiOperation({ summary: 'Ngày mới nhất đã có số liệu của một mẫu báo cáo' })
  latest(@Query('templateId', ParseIntPipe) templateId: number) {
    return this.service.latestEntryDate(templateId);
  }

  @Post()
  @RequirePermissions('report.entry.update')
  @Audit({ module: 'REPORT', action: 'UPSERT', entity: 'report_entry', description: 'Lưu số liệu báo cáo' })
  @ApiOperation({ summary: 'Lưu số liệu hàng loạt (tự tạo/ghi đè theo ô, có nhật ký)' })
  upsert(@Body() dto: UpsertEntriesDto, @CurrentUser() user: AccessContext) {
    return this.service.upsertEntries(dto, user);
  }

  @Delete()
  @RequirePermissions('report.entry.delete')
  @Audit({ module: 'REPORT', action: 'DELETE', entity: 'report_entry', description: 'Xoá ô số liệu' })
  @ApiOperation({ summary: 'Xoá một ô số liệu' })
  remove(
    @Query('templateId', ParseIntPipe) templateId: number,
    @Query('rowId', ParseIntPipe) rowId: number,
    @Query('colKey') colKey: string,
    @Query('entryDate') entryDate: string,
    @CurrentUser() user: AccessContext,
  ) {
    return this.service.deleteEntry(templateId, rowId, colKey, entryDate, user);
  }

  @Get('history')
  @RequirePermissions('report.entry.view-audit')
  @ApiOperation({ summary: 'Nhật ký thay đổi số liệu (ai sửa, giá trị cũ/mới)' })
  history(@Query() query: ReportQueryDto) {
    return this.service.entryHistory(query);
  }
}

@ApiTags('Báo cáo khoa — Chốt số liệu')
@ApiBearerAuth()
@Controller('reports/snapshots')
export class ReportSnapshotController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @RequirePermissions('report.view.view')
  @ApiOperation({ summary: 'Danh sách bản chốt số liệu' })
  list(@Query() query: ReportQueryDto) {
    return this.service.listSnapshots(query);
  }

  @Get(':id')
  @RequirePermissions('report.view.view')
  @ApiOperation({ summary: 'Chi tiết bản chốt (kèm toàn bộ số liệu tại thời điểm chốt)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.getSnapshot(id);
  }

  @Post()
  @RequirePermissions('report.snapshot.create')
  @Audit({ module: 'REPORT', action: 'CREATE', entity: 'report_snapshot', description: 'Chốt số liệu kỳ báo cáo' })
  @ApiOperation({ summary: 'Chốt số liệu một kỳ báo cáo' })
  create(
    @Body() body: { templateId: number; title?: string } & ReportQueryDto,
    @CurrentUser() user: AccessContext,
  ) {
    const { templateId, title, ...query } = body;
    return this.service.snapshot(templateId, query as ReportQueryDto, user, title);
  }

  @Patch(':id/status')
  @RequirePermissions('report.snapshot.approve')
  @Audit({ module: 'REPORT', action: 'UPDATE', entity: 'report_snapshot', description: 'Duyệt/khoá báo cáo đã chốt' })
  @ApiOperation({ summary: 'Duyệt hoặc khoá bản chốt số liệu' })
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'DRAFT' | 'APPROVED' | 'LOCKED' },
    @CurrentUser() user: AccessContext,
  ) {
    return this.service.updateSnapshotStatus(id, body.status, user);
  }
}
