/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `posts` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "posts_author_id_deleted_at_created_at_idx";

-- DropIndex
DROP INDEX "posts_created_at_id_key";

-- DropIndex
DROP INDEX "posts_deleted_at_published_created_at_id_idx";

-- DropIndex
DROP INDEX "posts_deleted_at_published_like_count_created_at_id_idx";

-- DropIndex
DROP INDEX "posts_deleted_at_published_reply_count_created_at_id_idx";

-- DropIndex
DROP INDEX "posts_deleted_at_published_view_count_created_at_id_idx";

-- AlterTable
ALTER TABLE "posts" DROP COLUMN "deleted_at";

-- CreateIndex
CREATE INDEX "posts_author_id_id_idx" ON "posts"("author_id", "id" DESC);

-- CreateIndex
CREATE INDEX "posts_published_id_idx" ON "posts"("published", "id" DESC);

-- CreateIndex
CREATE INDEX "posts_published_view_count_id_idx" ON "posts"("published", "view_count" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_published_like_count_id_idx" ON "posts"("published", "like_count" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_published_reply_count_id_idx" ON "posts"("published", "reply_count" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");
