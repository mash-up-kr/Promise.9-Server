ALTER TABLE "links" ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN IF NOT EXISTS "viewed_at" timestamp with time zone;
