ALTER TABLE "curriculum_plans" ADD COLUMN "campus_id" TEXT;
CREATE INDEX "curriculum_plans_campus_id_status_idx" ON "curriculum_plans"("campus_id", "status");
UPDATE "curriculum_plans"
SET "campus_id" = (SELECT "id" FROM "campuses" WHERE "code" = 'CC')
WHERE "code" LIKE '%-CC';
