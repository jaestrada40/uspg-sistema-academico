-- CreateTable
CREATE TABLE "financial_charges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "concept" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "due_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "cycle_id" TEXT,
    "student_carnet" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "financial_charges_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receipt_number" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paid_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_by" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students" ("carnet") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "financial_charges" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "financial_charges_student_carnet_status_idx" ON "financial_charges"("student_carnet", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- CreateIndex
CREATE INDEX "payments_student_carnet_paid_at_idx" ON "payments"("student_carnet", "paid_at");

-- CreateIndex
CREATE INDEX "payments_charge_id_idx" ON "payments"("charge_id");
