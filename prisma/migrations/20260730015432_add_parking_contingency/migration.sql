-- CreateTable
CREATE TABLE "parking_offline_operations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_operation_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "reason" TEXT,
    "recorded_at" DATETIME NOT NULL,
    "synced_by" TEXT NOT NULL,
    "visit_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "parking_offline_operations_client_operation_id_key" ON "parking_offline_operations"("client_operation_id");

-- CreateIndex
CREATE INDEX "parking_offline_operations_recorded_at_idx" ON "parking_offline_operations"("recorded_at");
