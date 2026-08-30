-- CreateTable
CREATE TABLE "whatsapp_inscription_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "career_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "student_carnet" TEXT,
    "detail" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "whatsapp_inscription_requests_phone_idx" ON "whatsapp_inscription_requests"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_inscription_requests_created_at_idx" ON "whatsapp_inscription_requests"("created_at");
