-- CreateTable
CREATE TABLE "parking_access_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "entry_gate" TEXT,
    "plate" TEXT,
    "code_masked" TEXT,
    "vehicle_id" TEXT,
    "operator_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "parking_access_attempts_outcome_created_at_idx" ON "parking_access_attempts"("outcome", "created_at");

-- CreateIndex
CREATE INDEX "parking_access_attempts_vehicle_id_created_at_idx" ON "parking_access_attempts"("vehicle_id", "created_at");
