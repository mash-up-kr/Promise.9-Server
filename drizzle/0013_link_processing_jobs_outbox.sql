CREATE TABLE "link_analysis_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "link_analysis_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" bigint NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_processing_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "link_processing_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"job_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"execution_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"worker_id" varchar(128),
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "link_jobs_type_check" CHECK ("link_processing_jobs"."job_type" in ('ANALYZE', 'EMBEDDING')),
	CONSTRAINT "link_jobs_status_check" CHECK ("link_processing_jobs"."status" in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "link_jobs_attempt_check" CHECK ("link_processing_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "link_analysis_outbox" ADD CONSTRAINT "link_analysis_outbox_job_id_link_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."link_processing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_processing_jobs" ADD CONSTRAINT "link_jobs_link_owner_fk" FOREIGN KEY ("link_id","user_id") REFERENCES "public"."links"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_outbox_publishable_idx" ON "link_analysis_outbox" USING btree ("available_at","id") WHERE "link_analysis_outbox"."published_at" is null;--> statement-breakpoint
CREATE INDEX "link_jobs_active_link_idx" ON "link_processing_jobs" USING btree ("link_id","id") WHERE "link_processing_jobs"."status" in ('PENDING', 'RUNNING');--> statement-breakpoint
CREATE UNIQUE INDEX "link_jobs_running_link_idx" ON "link_processing_jobs" USING btree ("link_id") WHERE "link_processing_jobs"."status" = 'RUNNING';--> statement-breakpoint
CREATE INDEX "link_jobs_expired_lease_idx" ON "link_processing_jobs" USING btree ("lease_expires_at") WHERE "link_processing_jobs"."status" = 'RUNNING';