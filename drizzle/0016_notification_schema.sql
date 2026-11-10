CREATE TABLE "email_histories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_histories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" bigint NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"ses_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_histories_link_occurrence_unique" UNIQUE("link_id","occurrence_id"),
	CONSTRAINT "email_histories_status_check" CHECK ("email_histories"."status" in ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
	CONSTRAINT "email_histories_accepted_message_check" CHECK ("email_histories"."status" <> 'ACCEPTED' or "email_histories"."ses_message_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"channel" varchar(10) NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_user_channel_unique" UNIQUE("user_id","channel"),
	CONSTRAINT "notification_settings_channel_check" CHECK ("notification_settings"."channel" in ('email', 'push'))
);
--> statement-breakpoint
CREATE TABLE "push_histories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_histories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"link_id" bigint NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"push_token_id" bigint,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"ticket_id" varchar(255),
	"error_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_histories_link_occurrence_token_unique" UNIQUE("link_id","occurrence_id","push_token_id"),
	CONSTRAINT "push_histories_status_check" CHECK ("push_histories"."status" in ('PENDING', 'ACCEPTED', 'RECEIPT_OK', 'FAILED', 'UNKNOWN')),
	CONSTRAINT "push_histories_accepted_ticket_check" CHECK ("push_histories"."status" not in ('ACCEPTED', 'RECEIPT_OK') or "push_histories"."ticket_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "push_tokens_platform_check" CHECK ("push_tokens"."platform" in ('ios', 'android')),
	CONSTRAINT "push_tokens_token_check" CHECK (length(trim("push_tokens"."token")) > 0)
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "reminder_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "email_histories" ADD CONSTRAINT "email_histories_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_histories" ADD CONSTRAINT "push_histories_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_histories" ADD CONSTRAINT "push_histories_push_token_id_push_tokens_id_fk" FOREIGN KEY ("push_token_id") REFERENCES "public"."push_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_histories_status_updated_at_idx" ON "email_histories" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "push_histories_push_token_id_idx" ON "push_histories" USING btree ("push_token_id");--> statement-breakpoint
CREATE INDEX "push_histories_status_updated_at_idx" ON "push_histories" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");