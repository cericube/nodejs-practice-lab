/*
  Warnings:

  - Added the required column `user_id` to the `post_files` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "post_files" ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "post_files" ADD CONSTRAINT "post_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
