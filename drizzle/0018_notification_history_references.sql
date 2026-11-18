ALTER TABLE "push_histories" DROP CONSTRAINT "push_histories_token_owner_fk";
--> statement-breakpoint
ALTER TABLE "push_histories" DROP CONSTRAINT "push_histories_link_occurrence_token_unique";
--> statement-breakpoint
ALTER TABLE "push_tokens" DROP CONSTRAINT "push_tokens_id_user_id_unique";
--> statement-breakpoint
DROP INDEX "push_histories_push_token_id_idx";
--> statement-breakpoint
ALTER TABLE "push_histories" DROP COLUMN "push_token_id";
--> statement-breakpoint
CREATE INDEX "push_histories_link_id_idx" ON "push_histories" USING btree ("link_id");
--> statement-breakpoint
ALTER TABLE "email_histories" ADD COLUMN "user_id" bigint;
--> statement-breakpoint
UPDATE "email_histories" AS history
SET "user_id" = link."user_id"
FROM "links" AS link
WHERE history."link_id" = link."id";
--> statement-breakpoint
ALTER TABLE "email_histories" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_histories" DROP CONSTRAINT "email_histories_link_id_links_id_fk";
--> statement-breakpoint
ALTER TABLE "email_histories" ADD CONSTRAINT "email_histories_link_owner_fk" FOREIGN KEY ("link_id","user_id") REFERENCES "public"."links"("id","user_id") ON DELETE cascade ON UPDATE no action;
