-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "carnet_or_code" TEXT,
    "avatar" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "library_suspended_until" TIMESTAMP(3),
    "library_suspension_reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_encrypted" TEXT,
    "mfa_pending_secret_encrypted" TEXT,
    "mfa_recovery_code_hashes" TEXT,
    "mfa_last_used_step" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "carnet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "career_id" TEXT NOT NULL,
    "career_name" TEXT,
    "entry_cycle" TEXT NOT NULL,
    "jornada" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "gpa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credits_earned" INTEGER NOT NULL DEFAULT 0,
    "total_credits_required" INTEGER NOT NULL,
    "address" TEXT,
    "dpi" TEXT,
    "user_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("carnet")
);

-- CreateTable
CREATE TABLE "teachers" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "academic_degree" TEXT NOT NULL,
    "assigned_section_ids" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "max_hours_per_week" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "details" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careers" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "duration_semesters" INTEGER NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "modality" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "degree_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "courses" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "theoretical_hours" INTEGER NOT NULL,
    "practical_hours" INTEGER NOT NULL,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "career_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "total_credits" INTEGER NOT NULL,
    "duration_semesters" INTEGER NOT NULL,
    "career_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_plan_courses" (
    "plan_id" TEXT NOT NULL,
    "course_code" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,

    CONSTRAINT "curriculum_plan_courses_pkey" PRIMARY KEY ("plan_id","course_code")
);

-- CreateTable
CREATE TABLE "course_prerequisites" (
    "course_code" TEXT NOT NULL,
    "prerequisite_code" TEXT NOT NULL,

    CONSTRAINT "course_prerequisites_pkey" PRIMARY KEY ("course_code","prerequisite_code")
);

-- CreateTable
CREATE TABLE "academic_cycles" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "enrollment_start_date" TIMESTAMP(3) NOT NULL,
    "enrollment_end_date" TIMESTAMP(3) NOT NULL,
    "grade_submission_deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "has_projector" BOOLEAN NOT NULL DEFAULT false,
    "has_air_conditioning" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "schedule_days" TEXT NOT NULL,
    "schedule_time" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "jornada" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "enrolled_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "course_code" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "classroom_id" TEXT NOT NULL,
    "grade_act_status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "grades_published_at" TIMESTAMP(3),
    "grades_closed_at" TIMESTAMP(3),
    "grades_closed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_records" (
    "id" TEXT NOT NULL,
    "zona" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parcial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "segundo_parcial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recuperacion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'En curso',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "student_carnet" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_charges" (
    "id" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "cycle_id" TEXT,
    "career_fee_id" TEXT,
    "student_carnet" TEXT NOT NULL,
    "agreement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "applied_by" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_agreements" (
    "id" TEXT NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "installments" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_fees" (
    "id" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "career_id" TEXT NOT NULL,
    "campus_id" TEXT,
    "plan_id" TEXT,
    "fee_type" TEXT NOT NULL DEFAULT 'OTRO',
    "installment_number" INTEGER,
    "installment_count" INTEGER,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "career_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_by" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_proofs" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "receipt_number" TEXT,
    "student_carnet" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "class_date" TIMESTAMP(3) NOT NULL,
    "topic" TEXT,
    "created_by" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENTE',
    "note" TEXT,
    "session_id" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_activities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "max_score" DOUBLE PRECISION NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "section_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_activity_grades" (
    "id" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "activity_id" TEXT NOT NULL,
    "student_carnet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_activity_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_exams" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "original_total" DOUBLE PRECISION NOT NULL,
    "recovery_score" DOUBLE PRECISION,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_at" TIMESTAMP(3),
    "authorized_at" TIMESTAMP(3),
    "graded_at" TIMESTAMP(3),
    "requested_by" TEXT NOT NULL,
    "authorized_by" TEXT,
    "graded_by" TEXT,
    "authorization_note" TEXT,
    "grade_record_id" TEXT NOT NULL,
    "financial_charge_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_service_requests" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "purpose" TEXT NOT NULL,
    "delivery_type" TEXT NOT NULL DEFAULT 'DIGITAL',
    "admin_note" TEXT,
    "handled_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "student_carnet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_documents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_data" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "student_carnet" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "link" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text_body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIGURATION',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "notification_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "virtual_classrooms" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE_CLASSROOM',
    "sync_status" TEXT NOT NULL DEFAULT 'PENDING_CONFIGURATION',
    "external_course_id" TEXT,
    "enrollment_code" TEXT,
    "alternate_link" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "section_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "virtual_classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "enrollment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Inscrito',
    "student_carnet" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_challenges" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "remember_me" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "logo_data_url" TEXT,
    "mfa_required_roles" TEXT NOT NULL DEFAULT '["ADMIN","DOCENTE","BIBLIOTECA","PARQUEO","EVENTOS"]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_books" (
    "id" TEXT NOT NULL,
    "isbn" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "publication_year" INTEGER,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_copies" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "condition" TEXT NOT NULL DEFAULT 'BUENO',
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_loans" (
    "id" TEXT NOT NULL,
    "loaned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PRESTADO',
    "renewal_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "due_reminder_sent_at" TIMESTAMP(3),
    "overdue_notice_sent_at" TIMESTAMP(3),
    "borrower_id" TEXT NOT NULL,
    "copy_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_reservations" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADA',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "assigned_copy_id" TEXT,
    "ready_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "total_capacity" INTEGER NOT NULL DEFAULT 200,
    "regular_reserve" INTEGER NOT NULL DEFAULT 20,
    "entry_1_name" TEXT NOT NULL DEFAULT 'Entrada 1',
    "entry_2_name" TEXT NOT NULL DEFAULT 'Entrada 2',
    "exit_name" TEXT NOT NULL DEFAULT 'Salida principal',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_vehicles" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTOMOVIL',
    "access_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reserved_spaces" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANIFICADO',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_event_guests" (
    "id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "plate" TEXT,
    "access_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTORIZADO',
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_event_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_visits" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "access_code" TEXT,
    "visitor_name" TEXT,
    "entry_gate" TEXT NOT NULL,
    "exit_gate" TEXT,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exited_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DENTRO',
    "vehicle_id" TEXT,
    "user_id" TEXT,
    "event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_access_attempts" (
    "id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "entry_gate" TEXT,
    "plate" TEXT,
    "code_masked" TEXT,
    "vehicle_id" TEXT,
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_access_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_alerts" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVA',
    "event_id" TEXT,
    "acknowledged_by" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_offline_operations" (
    "id" TEXT NOT NULL,
    "client_operation_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "reason" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "synced_by" TEXT NOT NULL,
    "visit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_offline_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_carnet_or_code_key" ON "users"("carnet_or_code");

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "courses_career_id_idx" ON "courses"("career_id");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_code_key" ON "campuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_plans_code_key" ON "curriculum_plans"("code");

-- CreateIndex
CREATE INDEX "curriculum_plans_career_id_status_idx" ON "curriculum_plans"("career_id", "status");

-- CreateIndex
CREATE INDEX "curriculum_plan_courses_course_code_idx" ON "curriculum_plan_courses"("course_code");

-- CreateIndex
CREATE INDEX "course_prerequisites_prerequisite_code_idx" ON "course_prerequisites"("prerequisite_code");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_code_key" ON "classrooms"("code");

-- CreateIndex
CREATE INDEX "sections_teacher_id_cycle_id_idx" ON "sections"("teacher_id", "cycle_id");

-- CreateIndex
CREATE INDEX "sections_classroom_id_cycle_id_idx" ON "sections"("classroom_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_cycle_id_course_code_code_key" ON "sections"("cycle_id", "course_code", "code");

-- CreateIndex
CREATE INDEX "grade_records_section_id_is_published_idx" ON "grade_records"("section_id", "is_published");

-- CreateIndex
CREATE UNIQUE INDEX "grade_records_student_carnet_section_id_key" ON "grade_records"("student_carnet", "section_id");

-- CreateIndex
CREATE INDEX "financial_charges_student_carnet_status_idx" ON "financial_charges"("student_carnet", "status");

-- CreateIndex
CREATE INDEX "financial_charges_career_fee_id_idx" ON "financial_charges"("career_fee_id");

-- CreateIndex
CREATE INDEX "financial_charges_agreement_id_idx" ON "financial_charges"("agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_charges_career_fee_id_student_carnet_key" ON "financial_charges"("career_fee_id", "student_carnet");

-- CreateIndex
CREATE INDEX "financial_adjustments_student_carnet_created_at_idx" ON "financial_adjustments"("student_carnet", "created_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_charge_id_idx" ON "financial_adjustments"("charge_id");

-- CreateIndex
CREATE INDEX "payment_agreements_student_carnet_status_idx" ON "payment_agreements"("student_carnet", "status");

-- CreateIndex
CREATE INDEX "career_fees_career_id_cycle_id_idx" ON "career_fees"("career_id", "cycle_id");

-- CreateIndex
CREATE INDEX "career_fees_campus_id_plan_id_idx" ON "career_fees"("campus_id", "plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");

-- CreateIndex
CREATE INDEX "payments_student_carnet_paid_at_idx" ON "payments"("student_carnet", "paid_at");

-- CreateIndex
CREATE INDEX "payments_charge_id_idx" ON "payments"("charge_id");

-- CreateIndex
CREATE INDEX "transfer_proofs_student_carnet_status_idx" ON "transfer_proofs"("student_carnet", "status");

-- CreateIndex
CREATE INDEX "transfer_proofs_charge_id_status_idx" ON "transfer_proofs"("charge_id", "status");

-- CreateIndex
CREATE INDEX "attendance_sessions_section_id_idx" ON "attendance_sessions"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_section_id_class_date_key" ON "attendance_sessions"("section_id", "class_date");

-- CreateIndex
CREATE INDEX "attendance_records_student_carnet_idx" ON "attendance_records"("student_carnet");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_carnet_key" ON "attendance_records"("session_id", "student_carnet");

-- CreateIndex
CREATE INDEX "zone_activities_section_id_idx" ON "zone_activities"("section_id");

-- CreateIndex
CREATE INDEX "zone_activity_grades_student_carnet_idx" ON "zone_activity_grades"("student_carnet");

-- CreateIndex
CREATE UNIQUE INDEX "zone_activity_grades_activity_id_student_carnet_key" ON "zone_activity_grades"("activity_id", "student_carnet");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_exams_grade_record_id_key" ON "recovery_exams"("grade_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_exams_financial_charge_id_key" ON "recovery_exams"("financial_charge_id");

-- CreateIndex
CREATE INDEX "recovery_exams_status_idx" ON "recovery_exams"("status");

-- CreateIndex
CREATE INDEX "student_service_requests_student_carnet_created_at_idx" ON "student_service_requests"("student_carnet", "created_at");

-- CreateIndex
CREATE INDEX "student_service_requests_status_created_at_idx" ON "student_service_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "enrollment_documents_status_created_at_idx" ON "enrollment_documents"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_documents_student_carnet_type_key" ON "enrollment_documents"("student_carnet", "type");

-- CreateIndex
CREATE INDEX "app_notifications_user_id_is_read_idx" ON "app_notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_notification_id_key" ON "email_outbox"("notification_id");

-- CreateIndex
CREATE INDEX "email_outbox_status_idx" ON "email_outbox"("status");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_classrooms_external_course_id_key" ON "virtual_classrooms"("external_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "virtual_classrooms_section_id_key" ON "virtual_classrooms"("section_id");

-- CreateIndex
CREATE INDEX "enrollments_student_carnet_status_idx" ON "enrollments"("student_carnet", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_carnet_section_id_key" ON "enrollments"("student_carnet", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "mfa_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "mfa_challenges_user_id_idx" ON "mfa_challenges"("user_id");

-- CreateIndex
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");

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
CREATE INDEX "library_reservations_user_id_status_idx" ON "library_reservations"("user_id", "status");

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

-- CreateIndex
CREATE INDEX "parking_access_attempts_outcome_created_at_idx" ON "parking_access_attempts"("outcome", "created_at");

-- CreateIndex
CREATE INDEX "parking_access_attempts_vehicle_id_created_at_idx" ON "parking_access_attempts"("vehicle_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "parking_alerts_dedupe_key_key" ON "parking_alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "parking_alerts_status_created_at_idx" ON "parking_alerts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "parking_offline_operations_client_operation_id_key" ON "parking_offline_operations"("client_operation_id");

-- CreateIndex
CREATE INDEX "parking_offline_operations_recorded_at_idx" ON "parking_offline_operations"("recorded_at");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plan_courses" ADD CONSTRAINT "curriculum_plan_courses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plan_courses" ADD CONSTRAINT "curriculum_plan_courses_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prerequisites" ADD CONSTRAINT "course_prerequisites_prerequisite_code_fkey" FOREIGN KEY ("prerequisite_code") REFERENCES "courses"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_code_fkey" FOREIGN KEY ("course_code") REFERENCES "courses"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "academic_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_records" ADD CONSTRAINT "grade_records_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_charges" ADD CONSTRAINT "financial_charges_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_charges" ADD CONSTRAINT "financial_charges_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "payment_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_charges" ADD CONSTRAINT "financial_charges_career_fee_id_fkey" FOREIGN KEY ("career_fee_id") REFERENCES "career_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "financial_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_agreements" ADD CONSTRAINT "payment_agreements_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_fees" ADD CONSTRAINT "career_fees_career_id_fkey" FOREIGN KEY ("career_id") REFERENCES "careers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_fees" ADD CONSTRAINT "career_fees_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_fees" ADD CONSTRAINT "career_fees_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "financial_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_proofs" ADD CONSTRAINT "transfer_proofs_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_proofs" ADD CONSTRAINT "transfer_proofs_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "financial_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_activities" ADD CONSTRAINT "zone_activities_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_activity_grades" ADD CONSTRAINT "zone_activity_grades_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "zone_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_activity_grades" ADD CONSTRAINT "zone_activity_grades_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_exams" ADD CONSTRAINT "recovery_exams_grade_record_id_fkey" FOREIGN KEY ("grade_record_id") REFERENCES "grade_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_exams" ADD CONSTRAINT "recovery_exams_financial_charge_id_fkey" FOREIGN KEY ("financial_charge_id") REFERENCES "financial_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_service_requests" ADD CONSTRAINT "student_service_requests_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_documents" ADD CONSTRAINT "enrollment_documents_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "app_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "virtual_classrooms" ADD CONSTRAINT "virtual_classrooms_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_carnet_fkey" FOREIGN KEY ("student_carnet") REFERENCES "students"("carnet") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_copies" ADD CONSTRAINT "library_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "library_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "library_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_vehicles" ADD CONSTRAINT "parking_vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_event_guests" ADD CONSTRAINT "parking_event_guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "parking_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_visits" ADD CONSTRAINT "parking_visits_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "parking_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_visits" ADD CONSTRAINT "parking_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_visits" ADD CONSTRAINT "parking_visits_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "parking_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
