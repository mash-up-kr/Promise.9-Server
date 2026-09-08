ALTER TABLE "social_accounts" ADD COLUMN "provider_refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "provider_client_id" varchar(255);