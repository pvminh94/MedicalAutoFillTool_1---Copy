import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AdvancedQueryDto, toBoolean } from '../../common/dto/query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateJobTitleDto {
  @ApiProperty({ example: 'BS' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã chức danh' })
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'Mã chức danh chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới' })
  code!: string;

  @ApiProperty({ example: 'Bác sĩ' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên chức danh' })
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateJobTitleDto extends PartialType(CreateJobTitleDto) {}

export class JobTitleQueryDto extends AdvancedQueryDto {}
