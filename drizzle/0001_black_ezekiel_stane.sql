CREATE TABLE "refresh_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "refresh_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_family" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_link_id_links_id_fk";
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("token_family");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_user_id_name_active_idx" ON "folders" USING btree ("user_id","name") WHERE "folders"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_link_id_user_id_fk" FOREIGN KEY ("link_id","user_id") REFERENCES "public"."links"("id","user_id") ON DELETE cascade ON UPDATE no action;