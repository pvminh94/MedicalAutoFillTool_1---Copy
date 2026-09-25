-- Chỉ mục cho các truy vấn lọc/sắp xếp nóng của giao diện:
--   · bảng hồ sơ bệnh án sắp xếp theo số tiền (cột lưu dạng chuỗi → cần chỉ mục biểu thức)
--   · lọc/sắp xếp theo số lần bị trả lại
--   · nhật ký sửa số liệu tra theo kỳ báo cáo
--   · bản chốt số liệu tra theo mẫu báo cáo (chạy mỗi lần mở lưới nhập liệu / lưu số liệu)
--   · tác vụ định kỳ tra theo thời điểm chạy kế tiếp (vòng quét của bộ lập lịch)
CREATE INDEX "hsba_requests_amount_num_idx" ON "hsba_requests" (((coalesce(nullif(regexp_replace("amount", '[^0-9.-]', '', 'g'), ''), '0'))::numeric));--> statement-breakpoint
CREATE INDEX "hsba_requests_return_count_idx" ON "hsba_requests" USING btree ("return_count");--> statement-breakpoint
CREATE INDEX "report_entry_audits_tmpl_date_idx" ON "report_entry_audits" USING btree ("template_id","entry_date");--> statement-breakpoint
CREATE INDEX "report_snapshots_tmpl_status_idx" ON "report_snapshots" USING btree ("template_id","status");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_next_run_idx" ON "scheduled_jobs" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","created_at") WHERE "read_at" IS NULL;
