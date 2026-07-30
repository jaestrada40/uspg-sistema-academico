-- CreateTable
CREATE TABLE "grade_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zona" REAL NOT NULL DEFAULT 0,
    "parcial" REAL NOT NULL DEFAULT 0,
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

-- CreateIndex
CREATE INDEX "grade_records_section_id_is_published_idx" ON "grade_records"("section_id", "is_published");

-- CreateIndex
CREATE UNIQUE INDEX "grade_records_student_carnet_section_id_key" ON "grade_records"("student_carnet", "section_id");
