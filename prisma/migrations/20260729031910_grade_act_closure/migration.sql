-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "schedule_days" TEXT NOT NULL,
    "schedule_time" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "jornada" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "enrolled_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "course_code" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "grade_act_status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "grades_published_at" DATETIME,
    "grades_closed_at" DATETIME,
    "grades_closed_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sections_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sections_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sections_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "academic_cycles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sections_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_sections" ("capacity", "classroom_id", "code", "course_code", "created_at", "cycle_id", "enrolled_count", "id", "jornada", "modality", "schedule_days", "schedule_time", "status", "teacher_id", "updated_at") SELECT "capacity", "classroom_id", "code", "course_code", "created_at", "cycle_id", "enrolled_count", "id", "jornada", "modality", "schedule_days", "schedule_time", "status", "teacher_id", "updated_at" FROM "sections";
DROP TABLE "sections";
ALTER TABLE "new_sections" RENAME TO "sections";
CREATE INDEX "sections_teacher_id_cycle_id_idx" ON "sections"("teacher_id", "cycle_id");
CREATE INDEX "sections_classroom_id_cycle_id_idx" ON "sections"("classroom_id", "cycle_id");
CREATE UNIQUE INDEX "sections_cycle_id_course_code_code_key" ON "sections"("cycle_id", "course_code", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
