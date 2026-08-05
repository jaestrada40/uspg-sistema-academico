-- Align the persisted demo student summary with the academic dashboard seed.
UPDATE "students"
SET "total_credits_required" = 220
WHERE "carnet" = '20230142' AND "total_credits_required" <> 220;
