-- CreateTable
CREATE TABLE "whatsapp_inscription_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "career_name" TEXT NOT NULL,
    "personal_email" TEXT,
    "status" TEXT NOT NULL,
    "student_carnet" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_inscription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_inscription_requests_phone_idx" ON "whatsapp_inscription_requests"("phone");

-- CreateIndex
CREATE INDEX "whatsapp_inscription_requests_created_at_idx" ON "whatsapp_inscription_requests"("created_at");
