INSERT OR IGNORE INTO "sections" ("id", "code", "schedule_days", "schedule_time", "modality", "jornada", "capacity", "enrolled_count", "status", "course_code", "teacher_id", "cycle_id", "classroom_id", "created_at", "updated_at")
VALUES
  ('HIST-INF-101', 'INF-101-HIST', '[]', '00:00 - 00:00', 'Presencial', 'Matutina', 0, 0, 'Cerrada', 'INF-101', 'DOC-1042', 'CYC-2025-1', 'CLR-LAB1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('HIST-MAT-101', 'MAT-101-HIST', '[]', '00:00 - 00:00', 'Presencial', 'Matutina', 0, 0, 'Cerrada', 'MAT-101', 'DOC-1042', 'CYC-2025-1', 'CLR-LAB1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "grade_records" ("id", "zona", "parcial", "segundo_parcial", "final", "recuperacion", "total", "status", "is_published", "student_carnet", "section_id", "created_at", "updated_at")
VALUES
  ('HIST-GRD-101', 30, 18, 15, 26, 0, 89, 'Aprobado', 1, '20230142', 'HIST-INF-101', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('HIST-GRD-102', 30, 16, 12, 24, 0, 82, 'Aprobado', 1, '20230142', 'HIST-MAT-101', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
