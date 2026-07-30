-- CreateTable
CREATE TABLE "enrollment_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" DATETIME,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "enrollment_documents_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "enrollment_documents_status_created_at_idx" ON "enrollment_documents"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_documents_student_carnet_type_key" ON "enrollment_documents"("student_carnet", "type");
