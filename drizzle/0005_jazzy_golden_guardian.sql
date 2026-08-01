CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
CREATE INDEX "links_embedding_idx" ON "links" USING hnsw ("embedding" vector_cosine_ops);