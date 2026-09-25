import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdvancedQueryDto, toBoolean } from '../../../common/dto/query.dto';

export class CreateUserDto {
  @ApiProperty({ example: 'bs.nguyenvan.a' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên đăng nhập' })
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới' })
  username!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @MaxLength(128)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Mật khẩu (bỏ trống sẽ dùng mật khẩu mặc định)' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password?: string;

  @ApiPropertyOptional({ example: 'Bác sĩ' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: 'Khoa công tác chính' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number | null;

  @ApiPropertyOptional({ description: 'Danh sách mã vai trò', example: ['NHAP_LIEU'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @ApiPropertyOptional({ description: 'Các khoa được phép truy cập thêm' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  departmentScopeIds?: number[];

  @ApiPropertyOptional({ description: 'Bắt buộc đổi mật khẩu lần đăng nhập tới' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mustChangePassword?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UserQueryDto extends AdvancedQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo khoa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Lọc theo mã vai trò' })
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;
}

export class ResetPasswordDto {
  @ApiPropertyOptional({ description: 'Mật khẩu mới (bỏ trống = mặc định Qlbs@123456)' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc người dùng đổi mật khẩu sau khi đăng nhập' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  forceChange?: boolean;
}

export class SetRolesDto {
  @ApiProperty({ description: 'Danh sách mã vai trò', example: ['NHAP_LIEU', 'KHTB'] })
  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];

  @ApiPropertyOptional({ description: 'Thay thế toàn bộ (true) hay chỉ thêm (false)', default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  replace?: boolean;
}

export class SetDepartmentScopesDto {
  @ApiProperty({ description: 'Danh sách id khoa được phép truy cập' })
  @IsArray()
  @IsInt({ each: true })
  departmentIds!: number[];
}

export class ImportUsersDto {
  @ApiProperty({ description: 'Dữ liệu người dùng nhập từ Excel/JSON' })
  @IsArray()
  rows!: Record<string, unknown>[];

  @ApiPropertyOptional({ description: 'Ghi đè nếu tên đăng nhập đã tồn tại' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overwrite?: boolean;

  @ApiPropertyOptional({ description: 'Chạy thử, không ghi vào CSDL' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  dryRun?: boolean;
}
