-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_career_fees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "concept" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "due_date" DATETIME NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "career_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "plan_id" TEXT,
    "fee_type" TEXT NOT NULL DEFAULT 'OTRO',
    "installment_number" INTEGER,
    "installment_count" INTEGER,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    CONSTRAINT "career_fees_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "career_fees_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "career_fees_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_career_fees" ("amount", "assigned_count", "career_id", "concept", "created_at", "created_by", "cycle_id", "due_date", "id") SELECT "amount", "assigned_count", "career_id", "concept", "created_at", "created_by", "cycle_id", "due_date", "id" FROM "career_fees";
DROP TABLE "career_fees";
ALTER TABLE "new_career_fees" RENAME TO "career_fees";
CREATE INDEX "career_fees_career_id_cycle_id_idx" ON "career_fees"("career_id", "cycle_id");
CREATE INDEX "career_fees_campus_id_plan_id_idx" ON "career_fees"("campus_id", "plan_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "financial_charges_career_fee_id_student_carnet_key" ON "financial_charges"("career_fee_id", "student_carnet");
