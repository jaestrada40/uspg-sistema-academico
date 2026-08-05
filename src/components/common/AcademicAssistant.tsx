import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AcademicAssistant: React.FC = () => {
  const { currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ from: 'user' | 'bot'; text: string; links?: { label: string; path: string }[] }[]>([{ from: 'bot', text: 'Hola. Puedo ayudarte con información académica de tu cuenta.' }]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const loadConversation = async (id?: string) => {
    try {
      const list = await fetch('/api/assistant/conversations');
      const conversations = await list.json();
      const target = id || conversations[0]?.id;
      if (!target) { const created = await fetch('/api/assistant/conversations', { method: 'POST' }).then((response) => response.json()); setConversationId(created.id); return; }
      const detail = await fetch(`/api/assistant/conversations/${target}`).then((response) => response.json());
      if (!detail.id) throw new Error('No se pudo cargar la conversación');
      setConversationId(detail.id); setMessages(detail.messages.length ? detail.messages : [{ from: 'bot', text: 'Hola. Puedo ayudarte con información académica de tu cuenta.' }]);
    } catch { setMessages([{ from: 'bot', text: 'No se pudo cargar el historial. Puedes iniciar una conversación nueva.' }]); }
  };
  useEffect(() => { if (currentUser) void loadConversation(); }, [currentUser?.id]);
  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, loading]);
  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setQuestion('');
    const nextMessages = [...messages, { from: 'user' as const, text: value }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: value, conversationId, history: nextMessages.slice(-8) }),
      });
      const result = await response.json();
      setMessages((current) => [...current, { from: 'bot', text: response.ok ? result.answer : result.message || 'No pude responder.', links: response.ok ? result.links : undefined }]);
    } catch {
      setMessages((current) => [...current, { from: 'bot', text: 'No se pudo conectar con el asistente.' }]);
    } finally { setLoading(false); }
  };
  const newConversation = async () => { const response = await fetch('/api/assistant/conversations', { method: 'POST' }); if (!response.ok) return; const result = await response.json(); setConversationId(result.id); setMessages([{ from: 'bot', text: 'Nueva conversación iniciada. ¿En qué puedo ayudarte?' }]); };
  const clearConversation = async () => { if (!conversationId) return; const response = await fetch(`/api/assistant/conversations/${conversationId}`, { method: 'DELETE' }); if (response.ok) { setConversationId(null); setConfirmDelete(false); setMessages([{ from: 'bot', text: 'Historial borrado. Puedes iniciar una nueva consulta.' }]); } };
  const suggestions = currentUser.role === 'ESTUDIANTE' ? ['¿Qué cursos tengo?', '¿Cuál es mi horario?', '¿Cómo voy en el pensum?', '¿Tengo saldo pendiente?'] : currentUser.role === 'DOCENTE' ? ['¿Qué secciones tengo?', '¿Cuál es mi horario?', '¿Cuántos inscritos tengo?'] : ['Dame el resumen administrativo', '¿Cuántos estudiantes hay?', '¿Qué expedientes están pendientes?', '¿Hay cargos vencidos?'];
  return <div className="fixed bottom-5 right-5 z-50">{open && <div className="mb-3 flex h-[min(560px,75vh)] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#800020] px-4 py-3 text-white"><div><p className="text-sm font-extrabold">Asistente académico</p><p className="text-[10px] text-white/75">Consultas para {currentUser.role === 'ESTUDIANTE' ? 'estudiantes' : currentUser.role === 'DOCENTE' ? 'catedráticos' : 'administración'}</p></div><div className="flex items-center gap-2"><button type="button" onClick={newConversation} title="Nueva conversación"><Plus className="h-4 w-4" /></button><button type="button" onClick={() => setConfirmDelete(true)} title="Borrar historial" disabled={!conversationId}><Trash2 className="h-4 w-4" /></button><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente"><X className="h-4 w-4" /></button></div></div><div ref={messagesRef} className="flex-1 space-y-3 overflow-auto bg-[#F8FAFC] p-3">{messages.map((message, index) => <div key={`${message.from}-${index}`} className={`rounded-xl px-3 py-2 text-xs leading-5 ${message.from === 'user' ? 'ml-8 bg-[#800020] text-white' : 'mr-5 bg-white text-[#333333] shadow-sm'}`}>{message.text.split('\n').map((line, lineIndex) => <React.Fragment key={lineIndex}>{line}{lineIndex < message.text.split('\n').length - 1 && <br />}</React.Fragment>)}{message.links?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{message.links.map((link) => <a key={link.path} href={link.path} className="rounded-full border border-[#800020]/20 px-2 py-1 text-[10px] font-bold text-[#800020] hover:bg-[#800020]/5">{link.label}</a>)}</div> : null}</div>)}{messages.length === 1 && <div className="mr-2"><p className="mb-2 text-[10px] font-bold uppercase text-[#64748B]">Puedes preguntar</p><div className="flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setQuestion(suggestion); }} className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#800020] hover:bg-[#800020]/5">{suggestion}</button>)}</div></div>}{loading && <div className="text-xs text-[#64748B]">Consultando tus datos...</div>}</div><form onSubmit={ask} className="flex gap-2 border-t p-3"><input maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Escribe una pregunta..." className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs" /><button type="submit" disabled={loading} aria-label="Enviar pregunta" className="rounded-lg bg-[#800020] px-3 text-white disabled:opacity-50"><Send className="h-4 w-4" /></button></form></div>}{confirmDelete && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-700"><Trash2 className="h-5 w-5" /></div><h2 id="delete-chat-title" className="text-base font-extrabold text-slate-900">Borrar conversación</h2><p className="mt-1 text-sm text-slate-600">Se eliminarán los mensajes de esta conversación. Esta acción no se puede deshacer.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border px-4 py-2 text-xs font-bold text-slate-700">Cancelar</button><button type="button" onClick={clearConversation} className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800">Borrar conversación</button></div></div></div>}<button type="button" onClick={() => setOpen((value) => !value)} aria-label="Abrir asistente académico" className="flex h-14 w-14 items-center justify-center rounded-full bg-[#800020] text-white shadow-xl transition hover:bg-[#5F0018]"><MessageCircle className="h-6 w-6" /></button></div>;
};
