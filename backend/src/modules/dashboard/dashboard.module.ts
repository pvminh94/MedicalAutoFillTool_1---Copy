import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';

/** Bảng điều khiển chỉ đọc dữ liệu tổng hợp (CSDL + cache) nên không cần service riêng. */
@Module({ controllers: [DashboardController] })
export class DashboardModule {}
