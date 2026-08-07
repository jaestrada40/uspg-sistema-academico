-- AlterTable
ALTER TABLE "academic_cycles" ADD COLUMN "campus_id" TEXT;
ALTER TABLE "classrooms" ADD COLUMN "campus_id" TEXT;
ALTER TABLE "teachers" ADD COLUMN "campus_id" TEXT;

-- Backfill: only Campus Central has real activity today.
UPDATE "academic_cycles" SET "campus_id" = 'CAMPUS-CENTRAL' WHERE "campus_id" IS NULL;
UPDATE "classrooms" SET "campus_id" = 'CAMPUS-CENTRAL' WHERE "campus_id" IS NULL;
UPDATE "teachers" SET "campus_id" = 'CAMPUS-CENTRAL' WHERE "campus_id" IS NULL;

-- Clean up the misleading campus suffix typed manually into the cycle name.
UPDATE "academic_cycles" SET "name" = 'Segundo Semestre 2026' WHERE "name" = 'Segundo Semestre 2026 · Campus Central';

-- Enforce NOT NULL now that every row has a value.
ALTER TABLE "academic_cycles" ALTER COLUMN "campus_id" SET NOT NULL;
ALTER TABLE "classrooms" ALTER COLUMN "campus_id" SET NOT NULL;
ALTER TABLE "teachers" ALTER COLUMN "campus_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "academic_cycles_campus_id_idx" ON "academic_cycles"("campus_id");
CREATE INDEX "classrooms_campus_id_idx" ON "classrooms"("campus_id");
CREATE INDEX "teachers_campus_id_idx" ON "teachers"("campus_id");

-- AddForeignKey
ALTER TABLE "academic_cycles" ADD CONSTRAINT "academic_cycles_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
