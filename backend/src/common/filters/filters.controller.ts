/**
 * API mô tả bộ lọc nâng cao — giao diện đọc để tự dựng thanh lọc theo từng tài nguyên.
 * Endpoint này chỉ trả về siêu dữ liệu (không truy vấn dữ liệu nghiệp vụ) nên chỉ cần đăng nhập.
 */
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OPERATOR_LABELS, getFilterSpec, listFilterResources } from './filter-registry';

@ApiTags('Siêu dữ liệu')
@Controller('meta/filters')
export class FiltersController {
  @Get()
  @ApiOperation({ summary: 'Danh sách tài nguyên hỗ trợ lọc nâng cao và các trường lọc' })
  list() {
    return {
      operators: OPERATOR_LABELS,
      resources: listFilterResources(),
    };
  }

  @Get(':resource')
  @ApiOperation({ summary: 'Mô tả trường lọc nâng cao của một tài nguyên' })
  detail(@Param('resource') resource: string) {
    const spec = getFilterSpec(resource);
    if (!spec) throw new NotFoundException(`Không hỗ trợ lọc cho tài nguyên "${resource}"`);
    return { operators: OPERATOR_LABELS, ...spec };
  }
}
