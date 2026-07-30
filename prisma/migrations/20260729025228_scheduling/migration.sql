-- CreateTable
CREATE TABLE "academic_cycles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "enrollment_start_date" DATETIME NOT NULL,
    "enrollment_end_date" DATETIME NOT NULL,
    "grade_submission_deadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "has_projector" BOOLEAN NOT NULL DEFAULT false,
    "has_air_conditioning" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sections" (
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sections_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sections_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sections_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "academic_cycles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sections_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");

-- CreateIndex
CREATE INDEX "sections_teacher_id_cycle_id_idx" ON "sections"("teacher_id", "cycle_id");

-- CreateIndex
CREATE INDEX "sections_classroom_id_cycle_id_idx" ON "sections"("classroom_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_cycle_id_course_code_code_key" ON "sections"("cycle_id", "course_code", "code");
