-- Restore the historical sections referenced by the demo student's grade records.
INSERT OR IGNORE INTO "sections" ("id", "code", "schedule_days", "schedule_time", "modality", "jornada", "capacity", "enrolled_count", "status", "course_code", "teacher_id", "cycle_id", "classroom_id")
VALUES
  ('HIST-INF-101', 'INF-101-HIST', '[]', '00:00 - 00:00', 'Presencial', 'Matutina', 0, 0, 'Cerrada', 'INF-101', 'DOC-1042', 'CYC-2025-1', 'CLR-LAB1'),
  ('HIST-MAT-101', 'MAT-101-HIST', '[]', '00:00 - 00:00', 'Presencial', 'Matutina', 0, 0, 'Cerrada', 'MAT-101', 'DOC-1042', 'CYC-2025-1', 'CLR-LAB1');

INSERT OR IGNORE INTO "grade_records" ("id", "zona", "parcial", "segundo_parcial", "final", "recuperacion", "total", "status", "is_published", "student_carnet", "section_id")
VALUES
  ('GRD-101', 30, 18, 15, 26, 0, 89, 'Aprobado', 1, '20230142', 'HIST-INF-101'),
  ('GRD-102', 30, 16, 12, 24, 0, 82, 'Aprobado', 1, '20230142', 'HIST-MAT-101');
