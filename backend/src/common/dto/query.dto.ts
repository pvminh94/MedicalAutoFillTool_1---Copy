/**
 * Các DTO truy vấn dùng chung: phân trang, sắp xếp, tìm kiếm nâng cao.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { config } from '../../config/env';

const toBool = ({ value }: { value: unknown }): boolean | undefined =>
  value === undefined || value === '' ? undefined : ['1', 'true', 'yes', 'on'].includes(String(value));

const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === '') return undefined;
  return Array.isArray(value) ? value.map(String) : String(value).split(',').map((s) => s.trim()).filter(Boolean);
};

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Trang (bắt đầu từ 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số trang phải là số nguyên' })
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi mỗi trang', default: config.pagination.defaultPageSize })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(config.pagination.maxPageSize)
  pageSize: number = config.pagination.defaultPageSize;

  @ApiPropertyOptional({ description: 'Từ khoá tìm kiếm nhanh' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Trường sắp xếp', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Chiều sắp xếp', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Tải toàn bộ không phân trang (tối đa 5000)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  all?: boolean;

  get limit(): number {
    return this.all ? 5_000 : this.pageSize;
  }

  get offset(): number {
    return this.all ? 0 : (this.page - 1) * this.pageSize;
  }
}

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'in'
  | 'nin'
  | 'isnull'
  | 'notnull';

export interface ParsedFilter {
  field: string;
  op: FilterOperator;
  value: string;
  values: string[];
}

const VALID_OPS: FilterOperator[] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'in',
  'nin',
  'isnull',
  'notnull',
];

/**
 * Bộ lọc nâng cao dạng chuỗi: `field:op:value,field2:op:value2`
 * @example status:in:CHO_DE_NGHI|CHO_KHTB,priority:eq:HIGH,patientName:like:Nguyễn
 */
export class AdvancedQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Bộ lọc nâng cao, nhiều điều kiện cách nhau bởi dấu phẩy. ' +
      'Cú pháp: field:op:value · op ∈ eq,ne,gt,gte,lt,lte,like,in,nin,isnull,notnull · ' +
      'nhiều giá trị cho "in" cách nhau bởi dấu |',
    example: 'status:eq:HOAN_TAT,priority:in:HIGH|NORMAL',
  })
  @IsOptional()
  @IsString()
  filters?: string;

  @ApiPropertyOptional({ description: 'Trường ngày dùng để lọc khoảng', example: 'createdAt' })
  @IsOptional()
  @IsString()
  dateField?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Chỉ lấy bản ghi đang hoạt động' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ description: 'Lọc theo danh sách khoa', example: '1,2,3' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ description: 'Bao gồm cả bản ghi đã xoá mềm' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeDeleted?: boolean;

  parseFilters(): ParsedFilter[] {
    if (!this.filters?.trim()) return [];
    return this.filters
      .split(',')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [field = '', opRaw = 'eq', ...rest] = chunk.split(':');
        const op = (VALID_OPS.includes(opRaw as FilterOperator) ? opRaw : 'eq') as FilterOperator;
        const value = rest.join(':').trim();
        return {
          field: field.trim(),
          op,
          value,
          values: value.split('|').map((v) => v.trim()).filter(Boolean),
        };
      })
      .filter((f) => f.field.length > 0);
  }
}

export class IdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id!: number;
}

export class BulkIdsDto {
  @ApiPropertyOptional({ description: 'Danh sách ID cần xử lý', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  ids!: number[];
}

export class SortOrderItemDto {
  @IsInt()
  id!: number;

  @IsInt()
  sortOrder!: number;
}

export class ReorderDto {
  @IsArray()
  items!: SortOrderItemDto[];
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, totalPages),
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
