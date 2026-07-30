-- CreateTable
CREATE TABLE "transfer_proofs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "reference" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" DATETIME,
    "receipt_number" TEXT,
    "student_carnet" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "transfer_proofs_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transfer_proofs_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "financial_charges" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "transfer_proofs_student_carnet_status_idx" ON "transfer_proofs"("student_carnet", "status");

-- CreateIndex
CREATE INDEX "transfer_proofs_charge_id_status_idx" ON "transfer_proofs"("charge_id", "status");
