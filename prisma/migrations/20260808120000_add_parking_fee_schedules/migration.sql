-- CreateTable
CREATE TABLE "parking_fee_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period_type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "due_date" DATETIME NOT NULL,
    "created_by" TEXT NOT NULL,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parking_fee_schedules_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "academic_cycles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex on parking_fee_schedules
CREATE INDEX "parking_fee_schedules_cycle_id_idx" ON "parking_fee_schedules"("cycle_id");

-- RedefineTables for financial_charges (add vehicle_id and parking_fee_schedule_id with FK constraints)
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
    "vehicle_id" TEXT,
    "parking_fee_schedule_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "financial_charges_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_career_fee_id_fkey" FOREIGN KEY ("career_fee_id") REFERENCES "career_fees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "payment_agreements" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "parking_vehicles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_charges_parking_fee_schedule_id_fkey" FOREIGN KEY ("parking_fee_schedule_id") REFERENCES "parking_fee_schedules" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_financial_charges" ("id", "concept", "amount", "due_date", "status", "cycle_id", "career_fee_id", "student_carnet", "agreement_id", "vehicle_id", "parking_fee_schedule_id", "created_at", "updated_at") SELECT "id", "concept", "amount", "due_date", "status", "cycle_id", "career_fee_id", "student_carnet", "agreement_id", "vehicle_id", "parking_fee_schedule_id", "created_at", "updated_at" FROM "financial_charges";
DROP TABLE "financial_charges";
ALTER TABLE "new_financial_charges" RENAME TO "financial_charges";
CREATE INDEX "financial_charges_student_carnet_status_idx" ON "financial_charges"("student_carnet", "status");
CREATE INDEX "financial_charges_career_fee_id_idx" ON "financial_charges"("career_fee_id");
CREATE INDEX "financial_charges_agreement_id_idx" ON "financial_charges"("agreement_id");
CREATE INDEX "financial_charges_vehicle_id_status_idx" ON "financial_charges"("vehicle_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable - Add daily_rate to parking_config
ALTER TABLE "parking_config" ADD COLUMN "daily_rate" REAL NOT NULL DEFAULT 0;
