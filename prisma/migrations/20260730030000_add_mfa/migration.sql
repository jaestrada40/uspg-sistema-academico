ALTER TABLE "users" ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "mfa_secret_encrypted" TEXT;
ALTER TABLE "users" ADD COLUMN "mfa_pending_secret_encrypted" TEXT;
ALTER TABLE "users" ADD COLUMN "mfa_recovery_code_hashes" TEXT;

ALTER TABLE "institution_config" ADD COLUMN "mfa_required_roles" TEXT NOT NULL DEFAULT '["ADMIN","DOCENTE","BIBLIOTECA","PARQUEO","EVENTOS"]';

CREATE TABLE "mfa_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token_hash" TEXT NOT NULL,
    "remember_me" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "mfa_challenges"("token_hash");
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges"("user_id");
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");
