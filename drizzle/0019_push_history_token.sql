ALTER TABLE "push_histories" ADD COLUMN "push_token_id" bigint;--> statement-breakpoint
ALTER TABLE "push_histories" ADD CONSTRAINT "push_histories_push_token_id_push_tokens_id_fk" FOREIGN KEY ("push_token_id") REFERENCES "public"."push_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_histories_push_token_id_idx" ON "push_histories" USING btree ("push_token_id");--> statement-breakpoint
ALTER TABLE "push_histories" ADD CONSTRAINT "push_histories_link_occurrence_token_unique" UNIQUE("link_id","occurrence_id","push_token_id");