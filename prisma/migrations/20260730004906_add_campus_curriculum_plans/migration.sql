-- CreateTable
CREATE TABLE "campuses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "curriculum_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" DATETIME NOT NULL,
    "effective_to" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "total_credits" INTEGER NOT NULL,
    "duration_semesters" INTEGER NOT NULL,
    "career_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "curriculum_plans_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "curriculum_plan_courses" (
    "plan_id" TEXT NOT NULL,
    "course_code" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,

    PRIMARY KEY ("plan_id", "course_code"),
    CONSTRAINT "curriculum_plan_courses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "curriculum_plan_courses_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_students" (
    "carnet" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "career_id" TEXT NOT NULL,
    "career_name" TEXT,
    "entry_cycle" TEXT NOT NULL,
    "jornada" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "gpa" REAL NOT NULL DEFAULT 0,
    "credits_earned" INTEGER NOT NULL DEFAULT 0,
    "total_credits_required" INTEGER NOT NULL,
    "address" TEXT,
    "dpi" TEXT,
    "user_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "plan_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "students_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "students_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_students" ("address", "career_id", "career_name", "carnet", "created_at", "credits_earned", "dpi", "email", "entry_cycle", "gpa", "jornada", "name", "phone", "status", "total_credits_required", "updated_at", "user_id") SELECT "address", "career_id", "career_name", "carnet", "created_at", "credits_earned", "dpi", "email", "entry_cycle", "gpa", "jornada", "name", "phone", "status", "total_credits_required", "updated_at", "user_id" FROM "students";
DROP TABLE "students";
ALTER TABLE "new_students" RENAME TO "students";
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "campuses_code_key" ON "campuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_plans_code_key" ON "curriculum_plans"("code");

-- CreateIndex
CREATE INDEX "curriculum_plans_career_id_status_idx" ON "curriculum_plans"("career_id", "status");

-- CreateIndex
CREATE INDEX "curriculum_plan_courses_course_code_idx" ON "curriculum_plan_courses"("course_code");
