import { Module } from '@nestjs/common';
import { FiltersController } from './filters.controller';

/** Module siêu dữ liệu bộ lọc nâng cao (không phụ thuộc CSDL). */
@Module({ controllers: [FiltersController] })
export class FiltersModule {}
