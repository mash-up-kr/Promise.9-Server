ALTER TABLE "push_histories" ADD COLUMN "user_id" bigint;
--> statement-breakpoint
UPDATE "push_histories" AS history
SET "user_id" = link."user_id"
FROM "links" AS link
WHERE history."link_id" = link."id";
--> statement-breakpoint
ALTER TABLE "push_histories" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_id_user_id_unique" UNIQUE("id","user_id");
--> statement-breakpoint
ALTER TABLE "push_histories" DROP CONSTRAINT "push_histories_link_id_links_id_fk";
--> statement-breakpoint
ALTER TABLE "push_histories" DROP CONSTRAINT "push_histories_push_token_id_push_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "push_histories" ADD CONSTRAINT "push_histories_link_owner_fk" FOREIGN KEY ("link_id","user_id") REFERENCES "public"."links"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Drizzle이 대상 컬럼을 표현하지 못하므로 재생성 시에도 push_token_id만 NULL로 만든다.
ALTER TABLE "push_histories" ADD CONSTRAINT "push_histories_token_owner_fk" FOREIGN KEY ("push_token_id","user_id") REFERENCES "public"."push_tokens"("id","user_id") ON DELETE SET NULL ("push_token_id") ON UPDATE no action;
