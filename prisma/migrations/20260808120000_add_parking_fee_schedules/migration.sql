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

-- AlterTable - Add columns to financial_charges
ALTER TABLE "financial_charges" ADD COLUMN "vehicle_id" TEXT;
ALTER TABLE "financial_charges" ADD COLUMN "parking_fee_schedule_id" TEXT;

-- CreateIndex on parking_fee_schedules
CREATE INDEX "parking_fee_schedules_cycle_id_idx" ON "parking_fee_schedules"("cycle_id");

-- CreateIndex on financial_charges
CREATE INDEX "financial_charges_vehicle_id_status_idx" ON "financial_charges"("vehicle_id", "status");

-- AlterTable - Add daily_rate to parking_config
ALTER TABLE "parking_config" ADD COLUMN "daily_rate" REAL NOT NULL DEFAULT 0;
