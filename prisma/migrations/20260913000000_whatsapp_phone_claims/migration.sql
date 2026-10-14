-- CreateTable
CREATE TABLE "whatsapp_phone_claims" (
    "phone_key" TEXT NOT NULL PRIMARY KEY,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
