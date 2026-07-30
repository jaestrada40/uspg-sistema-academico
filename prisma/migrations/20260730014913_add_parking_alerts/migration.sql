-- CreateTable
CREATE TABLE "parking_alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupe_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVA',
    "event_id" TEXT,
    "acknowledged_by" TEXT,
    "acknowledged_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "parking_alerts_dedupe_key_key" ON "parking_alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "parking_alerts_status_created_at_idx" ON "parking_alerts"("status", "created_at");
