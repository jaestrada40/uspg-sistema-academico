-- CreateTable
CREATE TABLE "careers" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "duration_semesters" INTEGER NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "modality" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "degree_type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "courses" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "theoretical_hours" INTEGER NOT NULL,
    "practical_hours" INTEGER NOT NULL,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "career_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "courses_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "course_prerequisites" (
    "course_code" TEXT NOT NULL,
    "prerequisite_code" TEXT NOT NULL,

    PRIMARY KEY ("course_code", "prerequisite_code"),
    CONSTRAINT "course_prerequisites_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses" ("code") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_prerequisites_prerequisite_code_fkey" FOREIGN KEY ("prerequisite_code") REFERENCES "courses" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "courses_career_id_idx" ON "courses"("career_id");

-- CreateIndex
CREATE INDEX "course_prerequisites_prerequisite_code_idx" ON "course_prerequisites"("prerequisite_code");
