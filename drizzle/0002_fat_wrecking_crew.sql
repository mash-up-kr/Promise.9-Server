ALTER TABLE "links" ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "viewed_at" timestamp with time zone;