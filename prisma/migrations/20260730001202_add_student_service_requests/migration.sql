-- CreateTable
CREATE TABLE "student_service_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "purpose" TEXT NOT NULL,
    "delivery_type" TEXT NOT NULL DEFAULT 'DIGITAL',
    "admin_note" TEXT,
    "handled_by" TEXT,
    "reviewed_at" DATETIME,
    "completed_at" DATETIME,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "student_service_requests_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "student_service_requests_student_carnet_created_at_idx" ON "student_service_requests"("student_carnet", "created_at");

-- CreateIndex
CREATE INDEX "student_service_requests_status_created_at_idx" ON "student_service_requests"("status", "created_at");
