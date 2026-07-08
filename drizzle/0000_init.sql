CREATE TABLE "folders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "folders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_summary_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" bigint NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"model_provider" varchar(50) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"prompt_key" varchar(100),
	"input_tokens" integer,
	"output_tokens" integer,
	"generated_summary" text,
	"input_cost" numeric(12, 6),
	"output_cost" numeric(12, 6),
	"currency" varchar(10),
	"ttlb_ms" integer,
	"error_code" text,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"folder_id" bigint,
	"original_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"final_url" text,
	"domain" varchar(255),
	"title" varchar(512),
	"metadata" jsonb,
	"ai_summary" text,
	"ai_summary_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"memo" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"link_id" bigint NOT NULL,
	"name" varchar(20) NOT NULL,
	"normalized_name" varchar(20) NOT NULL,
	"source_type" varchar(10) NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"provider_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_provider_provider_user_id_unique" UNIQUE("provider","provider_user_id"),
	CONSTRAINT "social_accounts_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_summary_metrics_link_attempt_idx" ON "ai_summary_metrics" USING btree ("link_id","attempt_number");--> statement-breakpoint
CREATE INDEX "ai_summary_metrics_link_status_idx" ON "ai_summary_metrics" USING btree ("link_id","status");--> statement-breakpoint
CREATE INDEX "ai_summary_metrics_model_created_at_idx" ON "ai_summary_metrics" USING btree ("model_provider","model_name","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "links_user_id_normalized_url_active_idx" ON "links" USING btree ("user_id","normalized_url") WHERE "links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "links_user_id_created_at_idx" ON "links" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "links_user_id_folder_id_created_at_idx" ON "links" USING btree ("user_id","folder_id","created_at" DESC NULLS LAST) WHERE "links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "links_user_id_deleted_at_idx" ON "links" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "links_deleted_at_idx" ON "links" USING btree ("deleted_at") WHERE "links"."deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_link_id_normalized_name_idx" ON "tags" USING btree ("link_id","normalized_name");--> statement-breakpoint
CREATE INDEX "tags_user_id_normalized_name_idx" ON "tags" USING btree ("user_id","normalized_name");