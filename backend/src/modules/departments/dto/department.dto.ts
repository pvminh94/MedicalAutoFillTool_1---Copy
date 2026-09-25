import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdvancedQueryDto } from '../../../common/dto/query.dto';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'KPK', description: 'Mã đơn vị (duy nhất, không dấu)' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã đơn vị' })
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'Mã đơn vị chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới' })
  code!: string;

  @ApiProperty({ example: 'Khoa Phẫu thuật - Gây mê hồi sức' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên đơn vị' })
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'K.PT-GMHS' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Cấp trên (bỏ trống nếu là đơn vị gốc)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;

  @ApiPropertyOptional({ description: 'Loại đơn vị', example: 'KHOA' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  kind?: string;

  @ApiPropertyOptional({ description: 'Tên bệnh viện in trên báo cáo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hospital?: string;

  @ApiPropertyOptional({ description: 'Mã báo cáo (B4, B5…)', example: 'B4' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  reportCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  email?: string;

  @ApiPropertyOptional({ description: 'Trưởng khoa / người phụ trách' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  headName?: string;

  @ApiPropertyOptional({ description: 'Có nhập báo cáo công tác không' })
  @IsOptional()
  @IsBoolean()
  reportEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class DepartmentQueryDto extends AdvancedQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo cấp trên' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({ description: 'Lọc theo cấp (1=Viện, 2=Khối, 3=Khoa…)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  level?: number;

  @ApiPropertyOptional({ description: 'Chỉ lấy khoa có bật báo cáo' })
  @IsOptional()
  @IsBoolean()
  reportEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Trả về dạng cây phân cấp' })
  @IsOptional()
  @IsBoolean()
  tree?: boolean;
}

class SortOrderItem {
  @IsInt()
  @Min(1)
  id!: number;

  @IsInt()
  sortOrder!: number;
}

export class ReorderDepartmentsDto {
  @ApiProperty({ type: [SortOrderItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortOrderItem)
  items!: SortOrderItem[];
}
