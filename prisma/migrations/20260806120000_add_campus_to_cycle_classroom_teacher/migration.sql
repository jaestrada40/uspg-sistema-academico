-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_academic_cycles" (
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
    "campus_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "academic_cycles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_academic_cycles" ("created_at", "end_date", "enrollment_end_date", "enrollment_start_date", "grade_submission_deadline", "id", "is_current", "name", "start_date", "status", "updated_at", "year", "campus_id") SELECT "created_at", "end_date", "enrollment_end_date", "enrollment_start_date", "grade_submission_deadline", "id", "is_current", "name", "start_date", "status", "updated_at", "year", 'CAMPUS-CENTRAL' FROM "academic_cycles";
DROP TABLE "academic_cycles";
ALTER TABLE "new_academic_cycles" RENAME TO "academic_cycles";
CREATE INDEX "academic_cycles_campus_id_idx" ON "academic_cycles"("campus_id");
CREATE TABLE "new_assistant_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "assistant_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_assistant_conversations" ("created_at", "id", "title", "updated_at", "user_id") SELECT "created_at", "id", "title", "updated_at", "user_id" FROM "assistant_conversations";
DROP TABLE "assistant_conversations";
ALTER TABLE "new_assistant_conversations" RENAME TO "assistant_conversations";
CREATE INDEX "assistant_conversations_user_id_updated_at_idx" ON "assistant_conversations"("user_id", "updated_at");
CREATE TABLE "new_classrooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "has_projector" BOOLEAN NOT NULL DEFAULT false,
    "has_air_conditioning" BOOLEAN NOT NULL DEFAULT false,
    "campus_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "classrooms_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_classrooms" ("building", "capacity", "code", "created_at", "has_air_conditioning", "has_projector", "id", "status", "type", "updated_at", "campus_id") SELECT "building", "capacity", "code", "created_at", "has_air_conditioning", "has_projector", "id", "status", "type", "updated_at", 'CAMPUS-CENTRAL' FROM "classrooms";
DROP TABLE "classrooms";
ALTER TABLE "new_classrooms" RENAME TO "classrooms";
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");
CREATE INDEX "classrooms_campus_id_idx" ON "classrooms"("campus_id");
CREATE TABLE "new_curriculum_plans" (
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
    "campus_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "curriculum_plans_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "curriculum_plans_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_curriculum_plans" ("campus_id", "career_id", "code", "created_at", "duration_semesters", "effective_from", "effective_to", "id", "name", "status", "total_credits", "updated_at", "version") SELECT "campus_id", "career_id", "code", "created_at", "duration_semesters", "effective_from", "effective_to", "id", "name", "status", "total_credits", "updated_at", "version" FROM "curriculum_plans";
DROP TABLE "curriculum_plans";
ALTER TABLE "new_curriculum_plans" RENAME TO "curriculum_plans";
CREATE UNIQUE INDEX "curriculum_plans_code_key" ON "curriculum_plans"("code");
CREATE INDEX "curriculum_plans_career_id_status_idx" ON "curriculum_plans"("career_id", "status");
CREATE INDEX "curriculum_plans_campus_id_status_idx" ON "curriculum_plans"("campus_id", "status");
CREATE TABLE "new_institution_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "logo_data_url" TEXT,
    "mfa_required_roles" TEXT NOT NULL DEFAULT '["ADMIN","DOCENTE","BIBLIOTECA","PARQUEO","EVENTOS","SISTEMAS"]',
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_institution_config" ("id", "logo_data_url", "mfa_required_roles", "name", "short_name", "updated_at") SELECT "id", "logo_data_url", "mfa_required_roles", "name", "short_name", "updated_at" FROM "institution_config";
DROP TABLE "institution_config";
ALTER TABLE "new_institution_config" RENAME TO "institution_config";
CREATE TABLE "new_teachers" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "academic_degree" TEXT NOT NULL,
    "assigned_section_ids" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "max_hours_per_week" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "campus_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "teachers_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_teachers" ("academic_degree", "assigned_section_ids", "code", "created_at", "email", "max_hours_per_week", "name", "phone", "specialty", "status", "updated_at", "user_id", "campus_id") SELECT "academic_degree", "assigned_section_ids", "code", "created_at", "email", "max_hours_per_week", "name", "phone", "specialty", "status", "updated_at", "user_id", 'CAMPUS-CENTRAL' FROM "teachers";
DROP TABLE "teachers";
ALTER TABLE "new_teachers" RENAME TO "teachers";
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");
CREATE INDEX "teachers_campus_id_idx" ON "teachers"("campus_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Clean up the misleading campus suffix typed manually into the cycle name.
UPDATE "academic_cycles" SET "name" = 'Segundo Semestre 2026' WHERE "name" = 'Segundo Semestre 2026 · Campus Central';
