/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `post_files` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `post_files` table. All the data in the column will be lost.
  - You are about to drop the column `avatarHeight` on the `profiles` table. All the data in the column will be lost.
  - You are about to drop the column `avatarWidth` on the `profiles` table. All the data in the column will be lost.
  - You are about to drop the column `avatar_file_size` on the `profiles` table. All the data in the column will be lost.
  - You are about to drop the column `avatar_mime_type` on the `profiles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[file_key]` on the table `post_files` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "post_files_deleted_at_idx";

-- DropIndex
DROP INDEX "post_files_post_id_sort_order_idx";

-- AlterTable
ALTER TABLE "post_files" DROP COLUMN "deleted_at",
DROP COLUMN "updated_at",
ALTER COLUMN "file_size" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "avatarHeight",
DROP COLUMN "avatarWidth",
DROP COLUMN "avatar_file_size",
DROP COLUMN "avatar_mime_type";

-- CreateIndex
CREATE UNIQUE INDEX "post_files_file_key_key" ON "post_files"("file_key");
