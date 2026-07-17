CREATE TABLE "ai_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_link_id" bigint NOT NULL,
	"task_type" varchar(50) NOT NULL,
	"status" varchar(30) NOT NULL,
	"model_provider" varchar(50) NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"prompt_key" varchar(120),
	"input_tokens" integer,
	"output_tokens" integer,
	"generated_result" jsonb,
	"ttlb_ms" integer NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_metrics_user_link_task_status_idx" ON "ai_metrics" USING btree ("user_link_id","task_type","status");