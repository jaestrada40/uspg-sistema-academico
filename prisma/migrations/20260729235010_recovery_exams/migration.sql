-- CreateTable
CREATE TABLE "recovery_exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "original_total" REAL NOT NULL,
    "recovery_score" REAL,
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_at" DATETIME,
    "authorized_at" DATETIME,
    "graded_at" DATETIME,
    "requested_by" TEXT NOT NULL,
    "authorized_by" TEXT,
    "graded_by" TEXT,
    "authorization_note" TEXT,
    "grade_record_id" TEXT NOT NULL,
    "financial_charge_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "recovery_exams_grade_record_id_fkey" FOREIGN KEY ("grade_record_id") REFERENCES "grade_records" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recovery_exams_financial_charge_id_fkey" FOREIGN KEY ("financial_charge_id") REFERENCES "financial_charges" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_exams_grade_record_id_key" ON "recovery_exams"("grade_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_exams_financial_charge_id_key" ON "recovery_exams"("financial_charge_id");

-- CreateIndex
CREATE INDEX "recovery_exams_status_idx" ON "recovery_exams"("status");
