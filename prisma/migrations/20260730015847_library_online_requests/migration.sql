-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_library_reservations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "expires_at" DATETIME NOT NULL,
    "assigned_copy_id" TEXT,
    "ready_at" DATETIME,
    "fulfilled_at" DATETIME,
    "cancelled_at" DATETIME,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "library_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "library_reservations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_library_reservations" ("book_id", "created_at", "expires_at", "id", "status", "user_id") SELECT "book_id", "created_at", "expires_at", "id", "status", "user_id" FROM "library_reservations";
DROP TABLE "library_reservations";
ALTER TABLE "new_library_reservations" RENAME TO "library_reservations";
CREATE INDEX "library_reservations_book_id_status_idx" ON "library_reservations"("book_id", "status");
CREATE INDEX "library_reservations_user_id_status_idx" ON "library_reservations"("user_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
