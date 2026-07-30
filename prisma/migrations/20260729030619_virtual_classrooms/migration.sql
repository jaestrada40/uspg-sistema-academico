-- CreateTable
CREATE TABLE "virtual_classrooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE_CLASSROOM',
    "sync_status" TEXT NOT NULL DEFAULT 'PENDING_CONFIGURATION',
    "external_course_id" TEXT,
    "enrollment_code" TEXT,
    "alternate_link" TEXT,
    "last_synced_at" DATETIME,
    "sync_error" TEXT,
    "section_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "virtual_classrooms_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "virtual_classrooms_external_course_id_key" ON "virtual_classrooms"("external_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_classrooms_section_id_key" ON "virtual_classrooms"("section_id");
