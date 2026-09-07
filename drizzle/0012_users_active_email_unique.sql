ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_active_email_unique" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;