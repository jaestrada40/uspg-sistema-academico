const ACTION_LABELS: Record<string, string> = {
  // Auth
  LOGIN_SUCCESS: 'Inicio de sesión exitoso',
  LOGIN_FAILED: 'Intento de inicio de sesión fallido',
  LOGIN_MFA_TOTP: 'Inicio de sesión con MFA (TOTP)',
  LOGIN_MFA_RECOVERY: 'Inicio de sesión con código de recuperación',
  LOGOUT: 'Cierre de sesión',
  PASSWORD_CHANGED: 'Contraseña cambiada',
  PASSWORD_RESET_ADMIN: 'Contraseña restablecida por administrador',
  PASSWORD_RESET_REQUEST: 'Solicitud de restablecimiento de contraseña',
  FORGOT_PASSWORD: 'Solicitud de contraseña olvidada',
  // MFA
  ENABLE_MFA: 'MFA activado',
  DISABLE_MFA: 'MFA desactivado',
  MFA_RESET_ADMIN: 'MFA restablecido por administrador',
  UPDATE_MFA_POLICY: 'Política de MFA actualizada',
  MFA_RECOVERY_CODES_REGENERATED: 'Códigos de recuperación MFA regenerados',
  MFA_SETUP_STARTED: 'Configuración de MFA iniciada',
  START_MFA_SETUP: 'Configuración de MFA iniciada',
  REGENERATE_MFA_RECOVERY_CODES: 'Códigos de recuperación MFA regenerados',
  ADMIN_RESET_MFA: 'MFA restablecido por administrador',
  MFA_RESET_SYSTEMS: 'MFA restablecido por soporte de sistemas',
  PASSWORD_RESET_SELF_SERVICE: 'Contraseña restablecida por el usuario',
  PASSWORD_RESET_SYSTEMS: 'Contraseña restablecida por soporte de sistemas',
  SESSION_CLOSED_SYSTEMS: 'Sesión cerrada por soporte de sistemas',
  RETRY_OUTBOX_SYSTEMS: 'Reintento de envío de correo',
  // Users
  USER_CREATED_ADMIN: 'Usuario creado por administrador',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_DELETED: 'Usuario eliminado',
  USER_ROLE_CHANGED: 'Rol de usuario cambiado',
  // Institution
  INSTITUTION_UPDATED: 'Institución actualizada',
  // Academic
  CREATE: 'Creado',
  UPDATE: 'Actualizado',
  CLOSE: 'Cerrado',
  IMPORT: 'Importado',
  PUBLISH: 'Publicado',
  ENROLL: 'Inscripción registrada',
  CAREER_CREATED: 'Carrera creada',
  CAREER_UPDATED: 'Carrera actualizada',
  CAREER_DELETED: 'Carrera eliminada',
  COURSE_CREATED: 'Curso creado',
  COURSE_UPDATED: 'Curso actualizado',
  SECTION_CREATED: 'Sección creada',
  SECTION_UPDATED: 'Sección actualizada',
  ENROLLMENT_CREATED: 'Inscripción registrada',
  ENROLLMENT_DROPPED: 'Inscripción retirada',
  GRADE_SUBMITTED: 'Nota registrada',
  UPDATE_GRADE: 'Nota actualizada',
  CYCLE_CREATED: 'Ciclo académico creado',
  CYCLE_UPDATED: 'Ciclo académico actualizado',
  CREATE_CAMPUS: 'Campus creado',
  UPDATE_CAMPUS: 'Campus actualizado',
  CREATE_CURRICULUM_PLAN: 'Plan curricular creado',
  UPDATE_CURRICULUM_PLAN: 'Plan curricular actualizado',
  ORGANIZE_CURRICULUM_PLAN: 'Pensum organizado',
  SAVE_ATTENDANCE: 'Asistencia guardada',
  AUTHORIZE_RECOVERY: 'Recuperación autorizada',
  REJECT_RECOVERY: 'Recuperación rechazada',
  REQUEST_RECOVERY: 'Recuperación solicitada',
  GRADE_RECOVERY: 'Recuperación calificada',
  CREATE_ZONE_ACTIVITY: 'Actividad de zona creada',
  GRADE_ZONE_ACTIVITY: 'Actividad de zona calificada',
  PUBLISH_ZONE_ACTIVITY: 'Actividad de zona publicada',
  // Finance
  PAYMENT_REGISTERED: 'Pago registrado',
  REGISTER_PAYMENT: 'Pago registrado',
  CHARGE_CREATED: 'Cargo generado',
  CREATE_CHARGE: 'Cargo generado',
  CREATE_CAREER_FEE: 'Arancel de carrera creado',
  CREATE_FEE_SCHEDULE: 'Calendario de cobros creado',
  CREATE_LATE_FEE: 'Recargo por mora creado',
  CREATE_PAYMENT_AGREEMENT: 'Convenio de pago creado',
  APPLY_FINANCIAL_ADJUSTMENT: 'Ajuste financiero aplicado',
  SUBMIT_TRANSFER_PROOF: 'Comprobante de transferencia enviado',
  REVIEW_TRANSFER_PROOF: 'Comprobante de transferencia revisado',
  // Requests
  REQUEST_CREATED: 'Solicitud creada',
  REQUEST_UPDATED: 'Solicitud actualizada',
  CREATE_STUDENT_REQUEST: 'Solicitud creada',
  UPDATE_STUDENT_REQUEST: 'Solicitud actualizada',
  UPLOAD_ENROLLMENT_DOCUMENT: 'Documento de inscripción cargado',
  REVIEW_ENROLLMENT_DOCUMENT: 'Documento de inscripción revisado',
  // Library
  CREATE_LIBRARY_BOOK: 'Libro registrado',
  LIBRARY_LOAN: 'Préstamo registrado',
  LIBRARY_RETURN: 'Devolución registrada',
  LIBRARY_INCIDENT: 'Incidencia de biblioteca registrada',
  // Parking
  VEHICLE_REGISTERED: 'Vehículo registrado',
  VEHICLE_REMOVED: 'Vehículo removido',
  ACCESS_ENTRY: 'Ingreso registrado',
  ACCESS_EXIT: 'Salida registrada',
  // Notifications / Assistant
  BROADCAST_NOTIFICATION: 'Notificación masiva enviada',
  ASSISTANT_AI_FALLBACK: 'Asistente IA sin respuesta',
  ASSISTANT_KNOWLEDGE_CREATED: 'Artículo de conocimiento del asistente creado',
  ASSISTANT_KNOWLEDGE_UPDATED: 'Artículo de conocimiento del asistente actualizado',
  // Systems
  SESSION_TERMINATED: 'Sesión terminada',
  SYSTEM_CONFIG_UPDATED: 'Configuración de sistema actualizada',
};

const ENTITY_LABELS: Record<string, string> = {
  USER: 'Usuario',
  INSTITUTION: 'Institución',
  CAREER: 'Carrera',
  COURSE: 'Curso',
  SECTION: 'Sección',
  ENROLLMENT: 'Inscripción',
  GRADE: 'Nota',
  CYCLE: 'Ciclo',
  PAYMENT: 'Pago',
  CHARGE: 'Cargo',
  VEHICLE: 'Vehículo',
  SESSION: 'Sesión',
  REQUEST: 'Solicitud',
  CLASSROOM: 'Aula virtual',
  CONFIG: 'Configuración',
  ASSISTANT: 'Asistente virtual',
  ATTENDANCE: 'Asistencia',
  CAMPUS: 'Campus',
  CURRICULUM_PLAN: 'Plan curricular',
  EMAIL_OUTBOX: 'Correo pendiente',
  ENROLLMENT_DOCUMENT: 'Documento de inscripción',
  FINANCE: 'Finanzas',
  GRADES: 'Notas',
  LIBRARY_BOOK: 'Libro',
  NOTIFICATION: 'Notificación',
  RECOVERY: 'Recuperación',
  STUDENT: 'Estudiante',
  STUDENT_REQUEST: 'Solicitud de estudiante',
  TEACHER: 'Docente',
  TRANSFER_PROOF: 'Comprobante de transferencia',
  ZONE_ACTIVITY: 'Actividad de zona',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
  BIBLIOTECA: 'Biblioteca',
  PARQUEO: 'Parqueo',
  EVENTOS: 'Eventos',
  SISTEMAS: 'Sistemas',
  REGISTRO: 'Registro Académico',
  FINANZAS: 'Administración Financiera',
};

const SYNC_STATUS_LABELS: Record<string, string> = {
  SYNCED: 'Sincronizado',
  PENDING: 'Pendiente',
  ERROR: 'Error de sincronización',
  PENDING_SYNC: 'Pendiente de sincronización',
  PENDING_CONFIGURATION: 'Configuración pendiente',
  FAILED: 'Fallido',
};

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_CLASSROOM: 'Google Classroom',
  MOODLE: 'Moodle',
  CANVAS: 'Canvas',
  TEAMS: 'Microsoft Teams',
  ZOOM: 'Zoom',
};

export const translateAction = (action: string): string =>
  ACTION_LABELS[action] ?? action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const translateEntity = (entity: string): string =>
  ENTITY_LABELS[entity] ?? entity.replace(/_/g, ' ');

export const translateRole = (role: string): string =>
  ROLE_LABELS[role] ?? role;

export const translateSyncStatus = (status: string): string =>
  SYNC_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');

export const translateProvider = (provider: string): string =>
  PROVIDER_LABELS[provider] ?? provider.replace(/_/g, ' ');
