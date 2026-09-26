-- Danh mục chức danh (khai báo từ giao diện: Quản trị → Danh mục → Chức danh)
CREATE TABLE IF NOT EXISTS "job_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_titles_code_uq" ON "job_titles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_titles_name_uq" ON "job_titles" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_titles_sort_idx" ON "job_titles" USING btree ("sort_order","name");--> statement-breakpoint
-- Đưa sẵn các chức danh người dùng đang có vào danh mục (mã CD001, CD002… theo thứ tự tên)
INSERT INTO "job_titles" ("code", "name", "sort_order")
SELECT 'CD' || lpad((row_number() OVER (ORDER BY t.name))::text, 3, '0'), t.name, (row_number() OVER (ORDER BY t.name))::int
FROM (
	SELECT min(btrim("title")) AS name
	FROM "users"
	WHERE btrim("title") <> ''
	GROUP BY lower(btrim("title"))
) t
ON CONFLICT DO NOTHING;
