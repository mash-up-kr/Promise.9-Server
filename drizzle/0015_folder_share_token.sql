ALTER TABLE "folders" ADD COLUMN "share_token" varchar(32);--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "folders_share_token_idx" ON "folders" USING btree ("share_token");