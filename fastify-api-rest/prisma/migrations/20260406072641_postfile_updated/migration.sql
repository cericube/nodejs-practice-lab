/*
  Warnings:

  - You are about to drop the column `sort_order` on the `post_files` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "post_files_post_id_sort_order_key";

-- AlterTable
ALTER TABLE "post_files" DROP COLUMN "sort_order";
