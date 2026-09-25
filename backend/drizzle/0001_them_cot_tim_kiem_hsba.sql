ALTER TABLE "hsba_requests" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "hsba_requests_search_text_idx" ON "hsba_requests" USING btree ("search_text");--> statement-breakpoint
CREATE INDEX "hsba_requests_status_created_idx" ON "hsba_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "hsba_requests_dept_created_idx" ON "hsba_requests" USING btree ("department_id","created_at");