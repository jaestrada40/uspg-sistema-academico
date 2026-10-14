-- CreateTable
CREATE TABLE "whatsapp_phone_claims" (
    "phone_key" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_phone_claims_pkey" PRIMARY KEY ("phone_key")
);
