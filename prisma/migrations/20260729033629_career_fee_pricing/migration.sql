-- CreateTable
CREATE TABLE "career_fees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "concept" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "due_date" DATETIME NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "career_id" TEXT NOT NULL,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    CONSTRAINT "career_fees_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "financial_charges_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_career_fee_id_fkey" FOREIGN KEY ("career_fee_id") REFERENCES "career_fees" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_financial_charges" ("amount", "concept", "created_at", "cycle_id", "due_date", "id", "status", "student_carnet", "updated_at") SELECT "amount", "concept", "created_at", "cycle_id", "due_date", "id", "status", "student_carnet", "updated_at" FROM "financial_charges";
DROP TABLE "financial_charges";
ALTER TABLE "new_financial_charges" RENAME TO "financial_charges";
CREATE INDEX "financial_charges_student_carnet_status_idx" ON "financial_charges"("student_carnet", "status");
CREATE INDEX "financial_charges_career_fee_id_idx" ON "financial_charges"("career_fee_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "career_fees_career_id_cycle_id_idx" ON "career_fees"("career_id", "cycle_id");
