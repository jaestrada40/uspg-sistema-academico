-- CreateTable
CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "link" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "user_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text_body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIGURATION',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" DATETIME,
    "notification_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "email_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "app_notifications" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "app_notifications_user_id_is_read_idx" ON "app_notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_notification_id_key" ON "email_outbox"("notification_id");

-- CreateIndex
CREATE INDEX "email_outbox_status_idx" ON "email_outbox"("status");
