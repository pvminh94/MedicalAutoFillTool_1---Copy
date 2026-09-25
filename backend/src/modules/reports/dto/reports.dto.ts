import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AdvancedQueryDto } from '../../../common/dto/query.dto';

const toBool = ({ value }: { value: unknown }): boolean | undefined =>
  value === undefined || value === '' ? undefined : ['1', 'true', 'yes', 'on'].includes(String(value));

/* ---------------------------------------------------------------------- Cột */

export class ColumnInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ example: 'hs' })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu khoá cột' })
  colKey!: string;

  @ApiProperty({ example: 'HS' })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu tên cột' })
  label!: string;

  @ApiPropertyOptional({ example: 'BHYT' })
  @IsOptional()
  @IsString()
  groupLabel?: string;

  @ApiProperty({ enum: ['INPUT', 'CALC'] })
  @IsIn(['INPUT', 'CALC'], { message: 'Loại cột phải là INPUT hoặc CALC' })
  kind!: 'INPUT' | 'CALC';

  @ApiPropertyOptional({ example: 'hs+tq+te' })
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional({ enum: ['number', 'integer', 'percent', 'text'] })
  @IsOptional()
  @IsIn(['number', 'integer', 'percent', 'text'])
  format?: string;

  @ApiPropertyOptional({ example: 'kham' })
  @IsOptional()
  @IsString()
  summaryKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  width?: number;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  align?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

/* --------------------------------------------------------------------- Dòng */

export class RowInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiPropertyOptional({ description: 'Nhãn nhóm hiển thị cột đầu (vd "BHYT")' })
  @IsOptional()
  @IsString()
  groupLabel?: string;

  @ApiProperty({ example: 'Khám bệnh' })
  @IsString()
  @IsNotEmpty({ message: 'Thiếu tên chỉ tiêu' })
  rowLabel!: string;

  @ApiPropertyOptional({ enum: ['SUM', 'FIRST', 'LAST', 'AVG', 'MIN', 'MAX'], default: 'SUM' })
  @IsOptional()
  @IsIn(['SUM', 'FIRST', 'LAST', 'AVG', 'MIN', 'MAX'])
  agg?: 'SUM' | 'FIRST' | 'LAST' | 'AVG' | 'MIN' | 'MAX';

  @ApiPropertyOptional({ example: 'lượt' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBold?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTotal?: boolean;

  @ApiPropertyOptional({ description: 'Công thức riêng cho dòng này (ghi đè công thức cột)' })
  @IsOptional()
  @IsString()
  formula?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class BlockInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ example: 'I. Khám bệnh' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [RowInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RowInputDto)
  rows?: RowInputDto[];
}

export class SectionInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ example: 'A. Công tác khám chữa bệnh' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [BlockInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockInputDto)
  blocks?: BlockInputDto[];

  @ApiPropertyOptional({ type: [RowInputDto], description: 'Dòng không thuộc nhóm nào' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RowInputDto)
  rows?: RowInputDto[];
}

/* ------------------------------------------------------------------ Mẫu BC */

export class CreateReportTemplateDto {
  @ApiProperty()
  @IsInt()
  departmentId!: number;

  @ApiProperty({ example: 'BAO_CAO_TUAN' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Báo cáo công tác tuần' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  footerNote?: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month', 'quarter', 'year', 'range'] })
  @IsOptional()
  @IsString()
  defaultPeriod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  printTemplateId?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [ColumnInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnInputDto)
  columns?: ColumnInputDto[];

  @ApiPropertyOptional({ type: [SectionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionInputDto)
  sections?: SectionInputDto[];
}

export class UpdateReportTemplateDto extends PartialType(CreateReportTemplateDto) {}

/** Lưu toàn bộ cấu trúc bảng biểu trong một lần (trình thiết kế báo cáo) */
export class SaveStructureDto {
  @ApiPropertyOptional({ type: [ColumnInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnInputDto)
  columns?: ColumnInputDto[];

  @ApiPropertyOptional({ type: [SectionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionInputDto)
  sections?: SectionInputDto[];

  @ApiPropertyOptional({ description: 'Xoá cứng các cột/dòng không còn trong cấu trúc gửi lên' })
  @IsOptional()
  @IsBoolean()
  purge?: boolean;
}

/* ---------------------------------------------------------------- Số liệu */

export class EntryValueDto {
  @ApiProperty()
  @IsInt()
  rowId!: number;

  @ApiProperty({ example: 'hs' })
  @IsString()
  colKey!: string;

  @ApiProperty({ example: 12 })
  @IsNumber()
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertEntriesDto {
  @ApiProperty()
  @IsInt()
  templateId!: number;

  @ApiProperty({ example: '2026-09-25', description: 'Ngày số liệu (hoặc ngày bắt đầu nếu nhập theo kỳ)' })
  @IsString()
  entryDate!: string;

  @ApiPropertyOptional({ description: 'Nhập một lần cho cả kỳ: mọi giá trị được ghi vào ngày kết thúc kỳ' })
  @IsOptional()
  @IsBoolean()
  forPeriod?: boolean;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month', 'quarter', 'year', 'range'] })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiProperty({ type: [EntryValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntryValueDto)
  values!: EntryValueDto[];

  @ApiPropertyOptional({ description: 'Không ghi đè các ô đã có số liệu khác 0' })
  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class ReportQueryDto extends AdvancedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  templateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiProperty({ enum: ['day', 'yesterday', 'week', 'month', 'quarter', 'year', 'range', 'all'] })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ example: '2026-09-25', description: 'Ngày tham chiếu để tính kỳ' })
  @IsOptional()
  @IsString()
  date?: string;
}

export class EntryGridQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ description: 'Bao gồm cả dòng/cột đã ngừng sử dụng' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeArchived?: boolean;
}
