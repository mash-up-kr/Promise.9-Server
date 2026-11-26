DROP INDEX "links_title_search_trgm_idx";--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "custom_title" varchar(512);--> statement-breakpoint
CREATE INDEX "links_title_search_trgm_idx" ON "links" USING gin (regexp_replace(lower(coalesce(coalesce("custom_title", "title")::text, '')), '[[:space:]]', '', 'g') gin_trgm_ops) WHERE "links"."deleted_at" is null;