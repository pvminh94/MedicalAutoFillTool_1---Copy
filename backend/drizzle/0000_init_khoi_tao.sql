CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text DEFAULT '' NOT NULL,
	"hospital" text DEFAULT 'BỆNH VIỆN QUÂN Y 4' NOT NULL,
	"report_code" text DEFAULT 'B4' NOT NULL,
	"parent_id" integer,
	"level" integer DEFAULT 1 NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'KHOA' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"head_name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"report_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text DEFAULT '' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"department_id" integer,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text NOT NULL,
	"success" boolean NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'INFO' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"module" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"data_scope" text DEFAULT 'OWN' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"color" text DEFAULT '#0ea5e9' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"group" text DEFAULT 'general' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"value_type" text DEFAULT 'string' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_department_scopes" (
	"user_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_department_scopes_user_id_department_id_pk" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"granted_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"department_id" integer,
	"avatar" text DEFAULT '' NOT NULL,
	"signature_image" text DEFAULT '' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text DEFAULT '' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hsba_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"user_id" integer,
	"username" text DEFAULT '' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"from_status" text DEFAULT '' NOT NULL,
	"to_status" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hsba_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'CHO_DE_NGHI' NOT NULL,
	"workflow_id" integer,
	"current_step" integer DEFAULT 0 NOT NULL,
	"pending_step_key" text DEFAULT 'DE_NGHI' NOT NULL,
	"created_by" integer NOT NULL,
	"requester_id" integer,
	"requester_name" text NOT NULL,
	"requester_title" text DEFAULT '' NOT NULL,
	"department_id" integer,
	"department_name" text DEFAULT '' NOT NULL,
	"patient_name" text NOT NULL,
	"patient_birth_year" text DEFAULT '' NOT NULL,
	"patient_birth_date" date,
	"patient_gender" text DEFAULT '' NOT NULL,
	"patient_code" text DEFAULT '' NOT NULL,
	"patient_address" text DEFAULT '' NOT NULL,
	"ma_kcb" text DEFAULT '' NOT NULL,
	"ma_the_bhyt" text DEFAULT '' NOT NULL,
	"ngay_vao_vien" date,
	"ngay_ra_vien" date,
	"doi_tuong" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"content" text NOT NULL,
	"amount" text DEFAULT '' NOT NULL,
	"attachments_note" text DEFAULT '' NOT NULL,
	"extra_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"return_reason" text DEFAULT '' NOT NULL,
	"returned_by" integer,
	"returned_at" timestamp with time zone,
	"return_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hsba_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"step_key" text NOT NULL,
	"step_name" text DEFAULT '' NOT NULL,
	"user_id" integer NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"full_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hsba_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"department_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"label" text NOT NULL,
	"row_span" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"col_key" text NOT NULL,
	"label" text NOT NULL,
	"group_label" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'INPUT' NOT NULL,
	"formula" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'number' NOT NULL,
	"summary_key" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"width" integer DEFAULT 70 NOT NULL,
	"align" text DEFAULT 'center' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"row_id" integer NOT NULL,
	"col_key" text NOT NULL,
	"entry_date" date NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_entry_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"department_id" integer,
	"row_id" integer,
	"row_label" text DEFAULT '' NOT NULL,
	"col_key" text DEFAULT '' NOT NULL,
	"col_label" text DEFAULT '' NOT NULL,
	"entry_date" date,
	"old_value" double precision,
	"new_value" double precision,
	"action" text DEFAULT 'update' NOT NULL,
	"user_id" integer,
	"username" text DEFAULT '' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"block_id" integer,
	"group_label" text DEFAULT '' NOT NULL,
	"row_label" text NOT NULL,
	"agg" text DEFAULT 'SUM' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"is_bold" boolean DEFAULT false NOT NULL,
	"is_total" boolean DEFAULT false NOT NULL,
	"formula" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"department_id" integer,
	"title" text NOT NULL,
	"period_mode" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"period_label" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"locked_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT 'BÁO CÁO CÔNG TÁC CHUYÊN MÔN' NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"footer_note" text DEFAULT '' NOT NULL,
	"default_period" text DEFAULT 'day' NOT NULL,
	"print_template_id" integer,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_template_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"module" text DEFAULT 'GENERIC' NOT NULL,
	"doc_type" text DEFAULT '' NOT NULL,
	"paper_size" text DEFAULT 'A4' NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"document" jsonb NOT NULL,
	"thumbnail" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"department_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"owner_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"original_name" text DEFAULT '' NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"path" text NOT NULL,
	"checksum" text DEFAULT '' NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'SUCCESS' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"module" text NOT NULL,
	"format" text DEFAULT 'xlsx' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"file_path" text DEFAULT '' NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer,
	"job_code" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"trigger" text DEFAULT 'queue' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"error_stack" text DEFAULT '' NOT NULL,
	"result" jsonb,
	"triggered_by" integer
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"handler" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"allow_overlap" boolean DEFAULT false NOT NULL,
	"timeout_sec" integer DEFAULT 600 NOT NULL,
	"max_retries" integer DEFAULT 2 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" text DEFAULT 'PENDING' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"last_duration_ms" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'Puzzle' NOT NULL,
	"kind" text DEFAULT 'BUILTIN' NOT NULL,
	"route" text DEFAULT '' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permission_code" text DEFAULT '' NOT NULL,
	"department_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placement" text DEFAULT 'sidebar' NOT NULL,
	"badge" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#0ea5e9' NOT NULL,
	"open_in_new_tab" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_department_scopes" ADD CONSTRAINT "user_department_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_department_scopes" ADD CONSTRAINT "user_department_scopes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_logs" ADD CONSTRAINT "hsba_logs_request_id_hsba_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."hsba_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_logs" ADD CONSTRAINT "hsba_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_requests" ADD CONSTRAINT "hsba_requests_workflow_id_hsba_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."hsba_workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_requests" ADD CONSTRAINT "hsba_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_requests" ADD CONSTRAINT "hsba_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_requests" ADD CONSTRAINT "hsba_requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_requests" ADD CONSTRAINT "hsba_requests_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_signatures" ADD CONSTRAINT "hsba_signatures_request_id_hsba_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."hsba_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_signatures" ADD CONSTRAINT "hsba_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hsba_workflows" ADD CONSTRAINT "hsba_workflows_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_section_id_report_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_columns" ADD CONSTRAINT "report_columns_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_row_id_report_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."report_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_entry_audits" ADD CONSTRAINT "report_entry_audits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_rows" ADD CONSTRAINT "report_rows_section_id_report_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_rows" ADD CONSTRAINT "report_rows_block_id_report_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."report_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_template_versions" ADD CONSTRAINT "print_template_versions_template_id_print_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."print_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_template_versions" ADD CONSTRAINT "print_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_jobs" ADD CONSTRAINT "data_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_scheduled_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scheduled_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_uq" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "departments_parent_idx" ON "departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "departments_path_idx" ON "departments" USING btree ("path");--> statement-breakpoint
CREATE INDEX "departments_active_idx" ON "departments" USING btree ("active");--> statement-breakpoint
CREATE INDEX "departments_name_trgm_idx" ON "departments" USING gin (to_tsvector('simple', "name" || ' ' || "code"));--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_module_idx" ON "audit_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "login_logs_user_idx" ON "login_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_logs_created_idx" ON "login_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_uq" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "permissions_module_idx" ON "permissions" USING btree ("module");--> statement-breakpoint
CREATE INDEX "role_permissions_perm_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uq" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "roles_active_idx" ON "roles" USING btree ("active");--> statement-breakpoint
CREATE INDEX "settings_group_idx" ON "settings" USING btree ("group");--> statement-breakpoint
CREATE INDEX "user_dept_scopes_dept_idx" ON "user_department_scopes" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("active");--> statement-breakpoint
CREATE INDEX "users_search_idx" ON "users" USING gin (to_tsvector('simple', "full_name" || ' ' || "username" || ' ' || "title"));--> statement-breakpoint
CREATE INDEX "hsba_logs_request_idx" ON "hsba_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "hsba_logs_created_idx" ON "hsba_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hsba_requests_code_uq" ON "hsba_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "hsba_requests_status_idx" ON "hsba_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hsba_requests_created_idx" ON "hsba_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hsba_requests_dept_idx" ON "hsba_requests" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "hsba_requests_requester_idx" ON "hsba_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "hsba_requests_creator_idx" ON "hsba_requests" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "hsba_requests_patient_idx" ON "hsba_requests" USING btree ("patient_name");--> statement-breakpoint
CREATE INDEX "hsba_requests_search_idx" ON "hsba_requests" USING gin (to_tsvector('simple', "patient_name" || ' ' || "ma_kcb" || ' ' || "code" || ' ' || "ma_the_bhyt" || ' ' || "requester_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "hsba_signatures_request_step_uq" ON "hsba_signatures" USING btree ("request_id","step_key");--> statement-breakpoint
CREATE INDEX "hsba_signatures_user_idx" ON "hsba_signatures" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hsba_workflows_code_uq" ON "hsba_workflows" USING btree ("code");--> statement-breakpoint
CREATE INDEX "hsba_workflows_dept_idx" ON "hsba_workflows" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "report_blocks_section_idx" ON "report_blocks" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_columns_tmpl_key_uq" ON "report_columns" USING btree ("template_id","col_key");--> statement-breakpoint
CREATE INDEX "report_columns_tmpl_idx" ON "report_columns" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_entries_uq" ON "report_entries" USING btree ("template_id","row_id","col_key","entry_date");--> statement-breakpoint
CREATE INDEX "report_entries_tmpl_date_idx" ON "report_entries" USING btree ("template_id","entry_date");--> statement-breakpoint
CREATE INDEX "report_entries_row_idx" ON "report_entries" USING btree ("row_id");--> statement-breakpoint
CREATE INDEX "report_entries_date_idx" ON "report_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "report_entry_audits_dept_idx" ON "report_entry_audits" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "report_entry_audits_date_idx" ON "report_entry_audits" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "report_entry_audits_created_idx" ON "report_entry_audits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "report_entry_audits_tmpl_idx" ON "report_entry_audits" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "report_rows_section_idx" ON "report_rows" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "report_rows_block_idx" ON "report_rows" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "report_rows_order_idx" ON "report_rows" USING btree ("section_id","sort_order");--> statement-breakpoint
CREATE INDEX "report_sections_tmpl_idx" ON "report_sections" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "report_sections_order_idx" ON "report_sections" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "report_snapshots_dept_idx" ON "report_snapshots" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "report_snapshots_period_idx" ON "report_snapshots" USING btree ("date_from","date_to");--> statement-breakpoint
CREATE INDEX "report_snapshots_created_idx" ON "report_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_templates_dept_code_uq" ON "report_templates" USING btree ("department_id","code");--> statement-breakpoint
CREATE INDEX "report_templates_dept_idx" ON "report_templates" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "report_templates_active_idx" ON "report_templates" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "print_template_versions_uq" ON "print_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "print_template_versions_tmpl_idx" ON "print_template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "print_templates_code_uq" ON "print_templates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "print_templates_module_idx" ON "print_templates" USING btree ("module","doc_type");--> statement-breakpoint
CREATE INDEX "print_templates_active_idx" ON "print_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("module","owner_id");--> statement-breakpoint
CREATE INDEX "attachments_created_idx" ON "attachments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "backups_created_idx" ON "backups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "data_jobs_kind_idx" ON "data_jobs" USING btree ("kind","module");--> statement-breakpoint
CREATE INDEX "data_jobs_created_idx" ON "data_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "data_jobs_status_idx" ON "data_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_runs_started_idx" ON "job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_jobs_code_uq" ON "scheduled_jobs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_active_idx" ON "scheduled_jobs" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "utilities_code_uq" ON "utilities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "utilities_active_idx" ON "utilities" USING btree ("active");--> statement-breakpoint
CREATE INDEX "utilities_placement_idx" ON "utilities" USING btree ("placement");