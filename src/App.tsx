import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { NotificationToastContainer } from './components/common/NotificationToast';
import { AcademicAssistant } from './components/common/AcademicAssistant';

import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
const lazyPage = <T extends Record<string, React.ComponentType>>(loader: () => Promise<T>, name: keyof T) => lazy(async () => ({ default: (await loader())[name] }));
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage');
const StudentsPage = lazyPage(() => import('./pages/StudentsPage'), 'StudentsPage');
const TeachersPage = lazyPage(() => import('./pages/TeachersPage'), 'TeachersPage');
const CareersPage = lazyPage(() => import('./pages/CareersPage'), 'CareersPage');
const CoursesPage = lazyPage(() => import('./pages/CoursesPage'), 'CoursesPage');
const CyclesPage = lazyPage(() => import('./pages/CyclesPage'), 'CyclesPage');
const SectionsPage = lazyPage(() => import('./pages/SectionsPage'), 'SectionsPage');
const EnrollmentPage = lazyPage(() => import('./pages/EnrollmentPage'), 'EnrollmentPage');
const GradesControlPage = lazyPage(() => import('./pages/GradesControlPage'), 'GradesControlPage');
const SchedulesPage = lazyPage(() => import('./pages/SchedulesPage'), 'SchedulesPage');
const AcademicHistoryPage = lazyPage(() => import('./pages/AcademicHistoryPage'), 'AcademicHistoryPage');
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage');
const ProfileSettingsPage = lazyPage(() => import('./pages/ProfileSettingsPage'), 'ProfileSettingsPage');
const VirtualClassroomsPage = lazyPage(() => import('./pages/VirtualClassroomsPage'), 'VirtualClassroomsPage');
const FinancesPage = lazyPage(() => import('./pages/FinancesPage'), 'FinancesPage');
const AttendancePage = lazyPage(() => import('./pages/AttendancePage'), 'AttendancePage');
const ZoneActivitiesPage = lazyPage(() => import('./pages/ZoneActivitiesPage'), 'ZoneActivitiesPage');
const RecoveriesPage = lazyPage(() => import('./pages/RecoveriesPage'), 'RecoveriesPage');
const NotificationsPage = lazyPage(() => import('./pages/NotificationsPage'), 'NotificationsPage');
const StudentRequestsPage = lazyPage(() => import('./pages/StudentRequestsPage'), 'StudentRequestsPage');
const EnrollmentDocumentsPage = lazyPage(() => import('./pages/EnrollmentDocumentsPage'), 'EnrollmentDocumentsPage');
const CurriculumMapPage = lazyPage(() => import('./pages/CurriculumMapPage'), 'CurriculumMapPage');
const StudyPlanPage = lazyPage(() => import('./pages/StudyPlanPage'), 'StudyPlanPage');
const CurriculumOrganizerPage = lazyPage(() => import('./pages/CurriculumOrganizerPage'), 'CurriculumOrganizerPage');
const AcademicStructurePage = lazyPage(() => import('./pages/AcademicStructurePage'), 'AcademicStructurePage');
const LibraryPage = lazyPage(() => import('./pages/LibraryPage'), 'LibraryPage');
const ParkingPage = lazyPage(() => import('./pages/ParkingPage'), 'ParkingPage');
const ParkingKioskPage = lazyPage(() => import('./pages/ParkingKioskPage'), 'ParkingKioskPage');
const UsersPage = lazyPage(() => import('./pages/UsersPage'), 'UsersPage');
const SystemsPage = lazyPage(() => import('./pages/SystemsPage'), 'SystemsPage');
const EventsPage = lazyPage(() => import('./pages/EventsPage'), 'EventsPage');
const AssistantKnowledgePage = lazyPage(() => import('./pages/AssistantKnowledgePage'), 'AssistantKnowledgePage');

const PageLoader = () => <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-[#64748B]">Cargando módulo...</div>;

// Protected Route Wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authLoading, currentUser } = useApp();
  const location = useLocation();
  if (authLoading) {
    return <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-sm font-semibold text-[#64748B]">Verificando sesión...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (currentUser.mustChangePassword && location.pathname !== '/perfil') {
    return <Navigate to="/perfil" replace />;
  }
  if (currentUser.mfaEnrollmentRequired && location.pathname !== '/perfil') {
    return <Navigate to="/perfil" replace />;
  }
  if (currentUser.role === 'BIBLIOTECA' && location.pathname === '/dashboard') return <Navigate to="/biblioteca" replace />;
  if (currentUser.role === 'PARQUEO' && location.pathname === '/dashboard') return <Navigate to="/parqueo" replace />;
  if (currentUser.role === 'EVENTOS' && location.pathname === '/dashboard') return <Navigate to="/eventos" replace />;
  if (currentUser.role === 'SISTEMAS' && location.pathname === '/dashboard') return <Navigate to="/sistemas" replace />;
  if (currentUser.role === 'REGISTRO' && location.pathname === '/dashboard') return <Navigate to="/estudiantes" replace />;
  if (currentUser.role === 'FINANZAS' && location.pathname === '/dashboard') return <Navigate to="/pagos" replace />;
  return <AppLayout>{children}<AcademicAssistant /></AppLayout>;
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <NotificationToastContainer />
        <Suspense fallback={<PageLoader />}><Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
          <Route path="/usuarios" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
          <Route path="/sistemas" element={<ProtectedRoute><SystemsPage /></ProtectedRoute>} />
          <Route path="/aulas-virtuales" element={<ProtectedRoute><VirtualClassroomsPage /></ProtectedRoute>} />
          <Route path="/pagos" element={<ProtectedRoute><FinancesPage /></ProtectedRoute>} />
          <Route path="/asistencia" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
          <Route path="/actividades-zona" element={<ProtectedRoute><ZoneActivitiesPage /></ProtectedRoute>} />
          <Route path="/recuperaciones" element={<ProtectedRoute><RecoveriesPage /></ProtectedRoute>} />
          <Route path="/notificaciones" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/conocimiento-asistente" element={<ProtectedRoute><AssistantKnowledgePage /></ProtectedRoute>} />
          <Route path="/solicitudes" element={<ProtectedRoute><StudentRequestsPage /></ProtectedRoute>} />
          <Route path="/expediente" element={<ProtectedRoute><EnrollmentDocumentsPage /></ProtectedRoute>} />
          <Route path="/malla" element={<ProtectedRoute><CurriculumMapPage /></ProtectedRoute>} />
          <Route path="/plan-estudios" element={<ProtectedRoute><StudyPlanPage /></ProtectedRoute>} />
          <Route path="/organizar-pensum" element={<ProtectedRoute><CurriculumOrganizerPage /></ProtectedRoute>} />
          <Route path="/estructura-academica" element={<ProtectedRoute><AcademicStructurePage /></ProtectedRoute>} />
          <Route path="/biblioteca" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
          <Route path="/parqueo" element={<ProtectedRoute><ParkingPage /></ProtectedRoute>} />
          <Route path="/parqueo-kiosco" element={<ProtectedRoute><ParkingKioskPage /></ProtectedRoute>} />
          <Route path="/eventos" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/estudiantes"
            element={
              <ProtectedRoute>
                <StudentsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/docentes"
            element={
              <ProtectedRoute>
                <TeachersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/carreras"
            element={
              <ProtectedRoute>
                <CareersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/cursos"
            element={
              <ProtectedRoute>
                <CoursesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ciclos"
            element={
              <ProtectedRoute>
                <CyclesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/secciones"
            element={
              <ProtectedRoute>
                <SectionsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/inscripcion"
            element={
              <ProtectedRoute>
                <EnrollmentPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/notas"
            element={
              <ProtectedRoute>
                <GradesControlPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/horarios"
            element={
              <ProtectedRoute>
                <SchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/historial"
            element={
              <ProtectedRoute>
                <AcademicHistoryPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reportes"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/perfil"
            element={
              <ProtectedRoute>
                <ProfileSettingsPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes></Suspense>
      </BrowserRouter>
    </AppProvider>
  );
}
