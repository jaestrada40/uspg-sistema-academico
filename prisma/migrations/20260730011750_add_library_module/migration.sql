-- CreateTable
CREATE TABLE "library_books" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "publication_year" INTEGER,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "library_copies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "barcode" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "condition" TEXT NOT NULL DEFAULT 'BUENO',
    "book_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "library_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "library_loans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loaned_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" DATETIME NOT NULL,
    "returned_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PRESTADO',
    "renewal_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "borrower_id" TEXT NOT NULL,
    "copy_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "library_loans_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "library_loans_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "library_copies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "library_reservations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'ACTIVA',
    "expires_at" DATETIME NOT NULL,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "library_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "library_reservations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "library_books_isbn_key" ON "library_books"("isbn");

-- CreateIndex
CREATE INDEX "library_books_title_author_idx" ON "library_books"("title", "author");

-- CreateIndex
CREATE UNIQUE INDEX "library_copies_barcode_key" ON "library_copies"("barcode");

-- CreateIndex
CREATE INDEX "library_copies_book_id_status_idx" ON "library_copies"("book_id", "status");

-- CreateIndex
CREATE INDEX "library_loans_borrower_id_status_idx" ON "library_loans"("borrower_id", "status");

-- CreateIndex
CREATE INDEX "library_loans_copy_id_status_idx" ON "library_loans"("copy_id", "status");

-- CreateIndex
CREATE INDEX "library_reservations_book_id_status_idx" ON "library_reservations"("book_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "library_reservations_user_id_book_id_status_key" ON "library_reservations"("user_id", "book_id", "status");
