CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "embedding" vector(768);