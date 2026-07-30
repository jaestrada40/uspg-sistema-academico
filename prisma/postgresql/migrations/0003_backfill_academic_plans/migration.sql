INSERT INTO "curriculum_plans" (
  "id", "code", "name", "version", "effective_from", "status",
  "total_credits", "duration_semesters", "career_id", "created_at", "updated_at"
)
SELECT
  'PLAN-INIT-' || c."code",
  c."code" || '-2026A',
  'Pensum inicial - ' || c."name",
  '2026A',
  TIMESTAMP '2026-01-01 12:00:00',
  'Activo',
  c."total_credits",
  c."duration_semesters",
  c."code",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "careers" c
WHERE NOT EXISTS (
  SELECT 1 FROM "curriculum_plans" p WHERE p."career_id" = c."code"
);

INSERT INTO "curriculum_plan_courses" ("plan_id", "course_code", "semester")
SELECT p."id", c."code", c."semester"
FROM "curriculum_plans" p
JOIN "courses" c ON c."career_id" = p."career_id"
WHERE p."id" LIKE 'PLAN-INIT-%'
ON CONFLICT ("plan_id", "course_code") DO NOTHING;

UPDATE "students" s
SET "campus_id" = COALESCE(
  s."campus_id",
  (SELECT c."id" FROM "campuses" c WHERE c."status" = 'Activo' ORDER BY c."created_at" ASC LIMIT 1)
)
WHERE s."campus_id" IS NULL;

UPDATE "students" s
SET "plan_id" = COALESCE(
  s."plan_id",
  (SELECT p."id" FROM "curriculum_plans" p WHERE p."career_id" = s."career_id" ORDER BY p."effective_from" DESC LIMIT 1)
)
WHERE s."plan_id" IS NULL;
