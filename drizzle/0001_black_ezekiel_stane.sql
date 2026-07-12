ALTER TABLE "tags" DROP CONSTRAINT "tags_link_id_links_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "folders_user_id_name_active_idx" ON "folders" USING btree ("user_id","name") WHERE "folders"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_link_id_user_id_fk" FOREIGN KEY ("link_id","user_id") REFERENCES "public"."links"("id","user_id") ON DELETE cascade ON UPDATE no action;