-- CreateTable
CREATE TABLE "parking_fee_schedules" (
    "id" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parking_fee_schedules_cycle_id_idx" ON "parking_fee_schedules"("cycle_id");

-- AddForeignKey
ALTER TABLE "parking_fee_schedules" ADD CONSTRAINT "parking_fee_schedules_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "academic_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "financial_charges" ADD COLUMN "vehicle_id" TEXT;
ALTER TABLE "financial_charges" ADD COLUMN "parking_fee_schedule_id" TEXT;

-- CreateIndex
CREATE INDEX "financial_charges_vehicle_id_status_idx" ON "financial_charges"("vehicle_id", "status");

-- AddForeignKey
ALTER TABLE "financial_charges" ADD CONSTRAINT "financial_charges_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "parking_vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_charges" ADD CONSTRAINT "financial_charges_parking_fee_schedule_id_fkey" FOREIGN KEY ("parking_fee_schedule_id") REFERENCES "parking_fee_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "parking_config" ADD COLUMN "daily_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
