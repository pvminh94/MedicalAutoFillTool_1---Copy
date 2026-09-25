import {
  Body,
  Controller,
  StreamableFile,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audit, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AdvancedQueryDto } from '../../common/dto/query.dto';
import type { AccessContext } from '../../common/types/access-context';
import type { PrintDocument } from '../../db/schema/printing';
import { PrintingService } from './printing.service';

interface RenderBody {
  data?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  /** Thiết kế trực tiếp (trình thiết kế gửi lên để xem trước) */
  document?: PrintDocument;
}

@ApiTags('Thiết kế bản in')
@ApiBearerAuth()
@Controller('print')
export class PrintingController {
  constructor(private readonly service: PrintingService) {}

  /* -------------------------------------------------------------- Mẫu in */

  @Get('templates')
  @RequirePermissions('print.template.view')
  @ApiOperation({ summary: 'Danh sách mẫu in' })
  list(@Query() query: AdvancedQueryDto) {
    return this.service.list(query);
  }

  @Get('templates/:id')
  @RequirePermissions('print.template.view')
  @ApiOperation({ summary: 'Chi tiết mẫu in (kèm toàn bộ thiết kế JSON)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get('templates/:id/versions')
  @RequirePermissions('print.template.view')
  @ApiOperation({ summary: 'Lịch sử phiên bản thiết kế' })
  versions(@Param('id', ParseIntPipe) id: number) {
    return this.service.versions(id);
  }

  @Post('templates')
  @RequirePermissions('print.template.create')
  @Audit({ module: 'PRINT', action: 'CREATE', entity: 'print_template', description: 'Thêm mẫu in' })
  @ApiOperation({ summary: 'Tạo mẫu in mới' })
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: AccessContext) {
    return this.service.create(body as never, user);
  }

  @Put('templates/:id')
  @RequirePermissions('print.template.update')
  @Audit({ module: 'PRINT', action: 'UPDATE', entity: 'print_template', description: 'Sửa thiết kế mẫu in' })
  @ApiOperation({ summary: 'Cập nhật thiết kế (tự tăng phiên bản)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AccessContext,
  ) {
    return this.service.update(id, body as never, user);
  }

  @Post('templates/:id/duplicate')
  @RequirePermissions('print.template.create')
  @ApiOperation({ summary: 'Sao chép mẫu in' })
  duplicate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { code: string; name?: string },
    @CurrentUser() user: AccessContext,
  ) {
    return this.service.duplicate(id, body.code, body.name, user);
  }

  @Post('templates/:id/restore/:version')
  @RequirePermissions('print.template.update')
  @ApiOperation({ summary: 'Khôi phục thiết kế về phiên bản cũ' })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AccessContext,
  ) {
    return this.service.restore(id, version, user);
  }

  @Patch('templates/:id/publish')
  @RequirePermissions('print.template.publish')
  @ApiOperation({ summary: 'Ban hành / ngừng sử dụng mẫu in' })
  publish(@Param('id', ParseIntPipe) id: number, @Body() body: { active: boolean }) {
    return this.service.setActive(id, body.active);
  }

  @Delete('templates/:id')
  @RequirePermissions('print.template.delete')
  @Audit({ module: 'PRINT', action: 'DELETE', entity: 'print_template', description: 'Xoá mẫu in' })
  @ApiOperation({ summary: 'Xoá mẫu in' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  /* ------------------------------------------------------------- Kết xuất */

  @Post('preview')
  @RequirePermissions('print.render.view')
  @ApiOperation({ summary: 'Xem trước bản in từ thiết kế đang chỉnh (trả về PDF)' })
  async preview(@Body() body: RenderBody, @Res({ passthrough: true }) res: Response) {
    const document = body.document;
    if (!document) return { error: 'Thiếu thiết kế bản in (document)' };
    const result = await this.service.renderRaw(document, body.data ?? {}, body.rows ?? []);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="xem-truoc.pdf"',
      'X-Print-Pages': String(result.pages),
    });
    return new StreamableFile(result.buffer);
  }

  @Post('templates/:id/render')
  @RequirePermissions('print.render.export')
  @ApiOperation({ summary: 'Kết xuất mẫu in ra PDF với dữ liệu truyền vào' })
  async render(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RenderBody,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { template, result } = await this.service.renderTemplate(
      id,
      body.data ?? {},
      body.rows ?? [],
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download === '1' ? 'attachment' : 'inline'}; filename="${encodeURIComponent(template.code)}.pdf"`,
      'X-Print-Pages': String(result.pages),
    });
    return new StreamableFile(result.buffer);
  }

  /** Mẫu in mặc định theo loại chứng từ — dùng cho các nút "In" ở phân hệ khác */
  @Get('resolve/:docType')
  @RequirePermissions('print.render.view')
  @ApiOperation({ summary: 'Tìm mẫu in đang áp dụng theo loại chứng từ' })
  async resolve(@Param('docType') docType: string, @Query('departmentId') departmentId?: string) {
    const found = await this.service.resolveFor(
      docType,
      departmentId ? Number(departmentId) : null,
    );
    if (!found) return { found: false, docType };
    return {
      found: true,
      id: found.id,
      code: found.code,
      name: found.name,
      paperSize: found.paperSize,
      orientation: found.orientation,
      version: found.version,
    };
  }
}
