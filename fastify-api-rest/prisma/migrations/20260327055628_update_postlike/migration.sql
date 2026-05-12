-- DropIndex
DROP INDEX "replies_author_id_created_at_id_idx";

-- DropIndex
DROP INDEX "replies_post_id_created_at_id_idx";

-- CreateIndex
CREATE INDEX "post_likes_post_id_idx" ON "post_likes"("post_id");

-- CreateIndex
CREATE INDEX "replies_post_id_id_idx" ON "replies"("post_id", "id" DESC);

-- CreateIndex
CREATE INDEX "replies_author_id_id_idx" ON "replies"("author_id", "id" DESC);
