-- Align the persisted demo student summary with the academic dashboard seed.
-- This only affects the known demo record when an older database still has 200.
UPDATE "students"
SET "total_credits_required" = 220
WHERE "carnet" = '20230142' AND "total_credits_required" <> 220;
