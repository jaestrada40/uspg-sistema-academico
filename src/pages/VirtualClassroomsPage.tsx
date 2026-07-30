import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, School } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';

interface VirtualClassroomView {
  id: string; syncStatus: string; alternateLink: string | null; enrollmentCode: string | null;
  sectionCode: string; courseCode: string; courseName: string; teacherName: string; cycleName: string;
}

export const VirtualClassroomsPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [classrooms, setClassrooms] = useState<VirtualClassroomView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => fetch('/api/virtual-classrooms').then(async (response) => {
    if (!response.ok) throw new Error();
    setClassrooms(await response.json());
  }).catch(() => showToast('No se pudieron cargar las aulas virtuales', 'error')).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const sync = async (id: string) => {
    const response = await fetch(`/api/virtual-classrooms/${id}/sync`, { method: 'POST' });
    const result = await response.json();
    showToast(result.message, response.ok ? 'success' : 'warning');
    if (response.ok) load();
  };

  return <div className="space-y-6">
    <PageHeader title="Mis Clases" description="Acceso directo a las aulas virtuales vinculadas con tus secciones e inscripciones" breadcrumbs={[{ label: 'Inicio', href: '/dashboard' }, { label: 'Mis Clases', active: true }]} />
    {loading ? <p className="text-sm text-[#64748B]">Cargando aulas virtuales...</p> : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {classrooms.map((item) => <article key={item.id} className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs">
          <div className="flex items-start gap-3"><div className="rounded-lg bg-[#800020]/10 p-3 text-[#800020]"><School className="h-5 w-5" /></div><div><span className="text-[10px] font-bold text-[#800020]">{item.courseCode} · {item.sectionCode}</span><h3 className="font-bold text-[#333333]">{item.courseName}</h3><p className="text-xs text-[#64748B]">{item.teacherName}</p></div></div>
          <div className="my-4 rounded-lg bg-[#F8FAFC] p-3 text-xs"><p><strong>Ciclo:</strong> {item.cycleName}</p><p className="mt-1"><strong>Estado:</strong> {item.syncStatus === 'ACTIVE' ? 'Conectada' : 'Pendiente de Google Workspace'}</p>{item.enrollmentCode && <p className="mt-1"><strong>Código:</strong> {item.enrollmentCode}</p>}</div>
          {item.alternateLink ? <a href={item.alternateLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-[#800020] px-4 py-2 text-xs font-bold text-white">Entrar a Classroom <ExternalLink className="h-4 w-4" /></a> : currentUser.role === 'ADMIN' ? <button onClick={() => sync(item.id)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#800020] px-4 py-2 text-xs font-bold text-[#800020]"><RefreshCw className="h-4 w-4" /> Configurar con Google</button> : <p className="text-center text-xs font-semibold text-amber-700">El administrador debe conectar Google Workspace.</p>}
        </article>)}
        {!classrooms.length && <p className="text-sm text-[#64748B]">No tienes aulas virtuales asignadas.</p>}
      </div>
    )}
  </div>;
};
