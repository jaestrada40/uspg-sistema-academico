-- AlterTable
ALTER TABLE "users" ADD COLUMN "library_suspended_until" DATETIME;
ALTER TABLE "users" ADD COLUMN "library_suspension_reason" TEXT;
