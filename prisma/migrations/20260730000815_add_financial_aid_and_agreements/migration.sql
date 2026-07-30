-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "applied_by" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_adjustments_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_adjustments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "financial_charges" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_agreements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "total_amount" REAL NOT NULL,
    "installments" INTEGER NOT NULL,
    "start_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_agreements_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_financial_charges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "concept" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "due_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "cycle_id" TEXT,
    "career_fee_id" TEXT,
    "student_carnet" TEXT NOT NULL,
    "agreement_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "financial_charges_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "payment_agreements" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_career_fee_id_fkey" FOREIGN KEY ("career_fee_id") REFERENCES "career_fees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_financial_charges" ("amount", "career_fee_id", "concept", "created_at", "cycle_id", "due_date", "id", "status", "student_carnet", "updated_at") SELECT "amount", "career_fee_id", "concept", "created_at", "cycle_id", "due_date", "id", "status", "student_carnet", "updated_at" FROM "financial_charges";
DROP TABLE "financial_charges";
ALTER TABLE "new_financial_charges" RENAME TO "financial_charges";
CREATE INDEX "financial_charges_student_carnet_status_idx" ON "financial_charges"("student_carnet", "status");
CREATE INDEX "financial_charges_career_fee_id_idx" ON "financial_charges"("career_fee_id");
CREATE INDEX "financial_charges_agreement_id_idx" ON "financial_charges"("agreement_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "financial_adjustments_student_carnet_created_at_idx" ON "financial_adjustments"("student_carnet", "created_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_charge_id_idx" ON "financial_adjustments"("charge_id");

-- CreateIndex
CREATE INDEX "payment_agreements_student_carnet_status_idx" ON "payment_agreements"("student_carnet", "status");
