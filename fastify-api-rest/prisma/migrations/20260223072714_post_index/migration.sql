-- DropIndex
DROP INDEX "posts_author_id_created_at_idx";

-- DropIndex
DROP INDEX "posts_deleted_at_idx";

-- DropIndex
DROP INDEX "posts_published_created_at_idx";

-- DropIndex
DROP INDEX "posts_published_view_count_created_at_idx";

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "posts_deleted_at_published_created_at_id_idx" ON "posts"("deleted_at", "published", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_deleted_at_published_view_count_created_at_id_idx" ON "posts"("deleted_at", "published", "view_count" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_deleted_at_published_like_count_created_at_id_idx" ON "posts"("deleted_at", "published", "like_count" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_deleted_at_published_reply_count_created_at_id_idx" ON "posts"("deleted_at", "published", "reply_count" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_deleted_at_published_published_at_id_idx" ON "posts"("deleted_at", "published", "published_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_author_id_deleted_at_created_at_idx" ON "posts"("author_id", "deleted_at", "created_at" DESC);
