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
  // Users
  USER_CREATED_ADMIN: 'Usuario creado por administrador',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario actualizado',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_DELETED: 'Usuario eliminado',
  // Institution
  INSTITUTION_UPDATED: 'Institución actualizada',
  // Academic
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
  CYCLE_CREATED: 'Ciclo académico creado',
  CYCLE_UPDATED: 'Ciclo académico actualizado',
  // Finance
  PAYMENT_REGISTERED: 'Pago registrado',
  CHARGE_CREATED: 'Cargo generado',
  // Requests
  REQUEST_CREATED: 'Solicitud creada',
  REQUEST_UPDATED: 'Solicitud actualizada',
  // Parking
  VEHICLE_REGISTERED: 'Vehículo registrado',
  VEHICLE_REMOVED: 'Vehículo removido',
  ACCESS_ENTRY: 'Ingreso registrado',
  ACCESS_EXIT: 'Salida registrada',
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
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  DOCENTE: 'Docente',
  ESTUDIANTE: 'Estudiante',
  BIBLIOTECA: 'Biblioteca',
  PARQUEO: 'Parqueo',
  EVENTOS: 'Eventos',
  SISTEMAS: 'Sistemas',
};

const SYNC_STATUS_LABELS: Record<string, string> = {
  SYNCED: 'Sincronizado',
  PENDING: 'Pendiente',
  ERROR: 'Error de sincronización',
  PENDING_SYNC: 'Pendiente de sincronización',
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
