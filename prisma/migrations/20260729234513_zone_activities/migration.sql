-- CreateTable
CREATE TABLE "zone_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "max_score" REAL NOT NULL,
    "due_date" DATETIME NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "section_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "zone_activities_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "zone_activity_grades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "score" REAL,
    "feedback" TEXT,
    "activity_id" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "zone_activity_grades_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "zone_activities" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "zone_activity_grades_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "zone_activities_section_id_idx" ON "zone_activities"("section_id");

-- CreateIndex
CREATE INDEX "zone_activity_grades_student_carnet_idx" ON "zone_activity_grades"("student_carnet");

-- CreateIndex
CREATE UNIQUE INDEX "zone_activity_grades_activity_id_student_carnet_key" ON "zone_activity_grades"("activity_id", "student_carnet");
