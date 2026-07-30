-- CreateTable
CREATE TABLE "parking_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "total_capacity" INTEGER NOT NULL DEFAULT 200,
    "regular_reserve" INTEGER NOT NULL DEFAULT 20,
    "entry_1_name" TEXT NOT NULL DEFAULT 'Entrada 1',
    "entry_2_name" TEXT NOT NULL DEFAULT 'Entrada 2',
    "exit_name" TEXT NOT NULL DEFAULT 'Salida principal',
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "parking_vehicles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plate" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTOMOVIL',
    "access_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "owner_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "parking_vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "parking_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "starts_at" DATETIME NOT NULL,
    "ends_at" DATETIME NOT NULL,
    "reserved_spaces" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANIFICADO',
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "parking_event_guests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guest_name" TEXT NOT NULL,
    "plate" TEXT,
    "access_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTORIZADO',
    "event_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parking_event_guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "parking_events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "parking_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plate" TEXT NOT NULL,
    "access_code" TEXT,
    "visitor_name" TEXT,
    "entry_gate" TEXT NOT NULL,
    "exit_gate" TEXT,
    "entered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exited_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DENTRO',
    "vehicle_id" TEXT,
    "user_id" TEXT,
    "event_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parking_visits_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "parking_vehicles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "parking_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "parking_visits_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "parking_events" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "parking_vehicles_plate_key" ON "parking_vehicles"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "parking_vehicles_access_code_key" ON "parking_vehicles"("access_code");

-- CreateIndex
CREATE INDEX "parking_vehicles_owner_id_status_idx" ON "parking_vehicles"("owner_id", "status");

-- CreateIndex
CREATE INDEX "parking_events_starts_at_ends_at_idx" ON "parking_events"("starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "parking_event_guests_access_code_key" ON "parking_event_guests"("access_code");

-- CreateIndex
CREATE INDEX "parking_event_guests_event_id_status_idx" ON "parking_event_guests"("event_id", "status");

-- CreateIndex
CREATE INDEX "parking_visits_status_entered_at_idx" ON "parking_visits"("status", "entered_at");

-- CreateIndex
CREATE INDEX "parking_visits_plate_status_idx" ON "parking_visits"("plate", "status");

-- CreateIndex
CREATE INDEX "parking_visits_entry_gate_entered_at_idx" ON "parking_visits"("entry_gate", "entered_at");
