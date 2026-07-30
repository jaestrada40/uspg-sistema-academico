-- AlterTable
ALTER TABLE "library_loans" ADD COLUMN "due_reminder_sent_at" DATETIME;
ALTER TABLE "library_loans" ADD COLUMN "overdue_notice_sent_at" DATETIME;
