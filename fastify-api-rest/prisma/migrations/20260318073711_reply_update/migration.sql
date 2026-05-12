/*
  Warnings:

  - You are about to drop the column `created_at` on the `post_likes` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `post_likes` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `post_likes` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `replies` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "post_likes_deleted_at_idx";

-- DropIndex
DROP INDEX "post_likes_post_id_created_at_idx";

-- DropIndex
DROP INDEX "replies_deleted_at_idx";

-- DropIndex
DROP INDEX "replies_post_id_created_at_idx";

-- DropIndex
DROP INDEX "replies_post_id_deleted_at_created_at_idx";

-- AlterTable
ALTER TABLE "post_likes" DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "replies" DROP COLUMN "deleted_at";

-- CreateIndex
CREATE INDEX "replies_post_id_created_at_id_idx" ON "replies"("post_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "replies_author_id_created_at_id_idx" ON "replies"("author_id", "created_at" DESC, "id" DESC);
