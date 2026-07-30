-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_grade_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zona" REAL NOT NULL DEFAULT 0,
    "parcial" REAL NOT NULL DEFAULT 0,
    "segundo_parcial" REAL NOT NULL DEFAULT 0,
    "final" REAL NOT NULL DEFAULT 0,
    "recuperacion" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'En curso',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "student_carnet" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "grade_records_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "grade_records_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Preserve existing totals by moving the portion of the former 50-point zone
-- above 30 points into the new second partial (maximum 20 points).
INSERT INTO "new_grade_records" ("created_at", "final", "id", "is_published", "parcial", "segundo_parcial", "recuperacion", "section_id", "status", "student_carnet", "total", "updated_at", "zona")
SELECT "created_at", "final", "id", "is_published", "parcial",
       CASE WHEN "zona" > 30 THEN MIN("zona" - 30, 20) ELSE 0 END,
       "recuperacion", "section_id", "status", "student_carnet", "total", "updated_at",
       MIN("zona", 30)
FROM "grade_records";
DROP TABLE "grade_records";
ALTER TABLE "new_grade_records" RENAME TO "grade_records";
CREATE INDEX "grade_records_section_id_is_published_idx" ON "grade_records"("section_id", "is_published");
CREATE UNIQUE INDEX "grade_records_student_carnet_section_id_key" ON "grade_records"("student_carnet", "section_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
