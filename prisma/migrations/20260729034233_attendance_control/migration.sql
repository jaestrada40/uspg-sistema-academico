-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "class_date" DATETIME NOT NULL,
    "topic" TEXT,
    "created_by" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "attendance_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PRESENTE',
    "note" TEXT,
    "session_id" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_records_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "attendance_sessions_section_id_idx" ON "attendance_sessions"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_section_id_class_date_key" ON "attendance_sessions"("section_id", "class_date");

-- CreateIndex
CREATE INDEX "attendance_records_student_carnet_idx" ON "attendance_records"("student_carnet");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_carnet_key" ON "attendance_records"("session_id", "student_carnet");
