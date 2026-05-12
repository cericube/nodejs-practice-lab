-- DropIndex
DROP INDEX "post_likes_post_id_idx";

-- CreateIndex
CREATE INDEX "post_likes_user_id_created_at_post_id_idx" ON "post_likes"("user_id", "created_at" DESC, "post_id");
