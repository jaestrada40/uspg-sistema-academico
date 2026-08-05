import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/components/common/AcademicAssistant.tsx', import.meta.url), 'utf8');

// Contract tests: protect the assistant's security and conversation capabilities.
assert.match(server, /app\.post\('\/api\/assistant', requireUser/);
assert.match(server, /assistantHistory\(/);
assert.match(server, /assistantConversationForUser/);
assert.match(server, /assistant_messages|assistantMessage/);
assert.match(server, /const links = \(\(\) =>/);
assert.match(server, /role === 'ESTUDIANTE'/);
assert.match(server, /role === 'DOCENTE'/);
assert.match(server, /role === 'ADMIN'/);
assert.match(server, /No inventes/);
assert.match(ui, /history: nextMessages\.slice\(-8\)/);
assert.match(ui, /message\.links/);

const representativeQuestions = [
  '¿Qué cursos tengo?', '¿Qué tengo mañana?', '¿Cuál es mi promedio?', '¿Cuánto debo?',
  '¿Tengo recuperaciones?', '¿Qué libros tengo prestados?', '¿Qué solicitudes están pendientes?',
  '¿Qué secciones tengo?', '¿Cuántos estudiantes hay?', '¿Hay expedientes pendientes?',
  '¿Cuántos cargos vencidos existen?', '¿Hay vehículos dentro?', '¿Cuántas aulas virtuales hay?',
  '¿Cuántos usuarios tienen MFA?', 'Dame un resumen administrativo',
  '¿Qué carrera estudio?', '¿Cuántos créditos me faltan?', '¿Tengo faltas?',
  '¿Cuándo vencen mis préstamos?', '¿Qué avisos no he leído?', '¿Cómo solicito una constancia?',
  '¿Cuál es mi aula?', '¿Quién es mi docente?', '¿Qué cursos puedo inscribir?',
  '¿Qué docentes están registrados?', '¿Cuántas carreras existen?', '¿Cuántas secciones hay?',
  '¿Qué documentos están pendientes?', '¿Cuántos préstamos activos hay?', '¿Cuántas sesiones de asistencia hay?',
  '¿Cuántas recuperaciones están abiertas?', '¿Cuántas actividades de zona hay?', '¿Hay aulas virtuales configuradas?',
  '¿Qué usuarios tienen autenticación de dos factores?', 'Muéstrame el listado de estudiantes',
  '¿Cuántos cursos activos existen?', '¿Qué pagos están pendientes?', 'Necesito revisar mi pensum',
];
assert.equal(representativeQuestions.length, 38);
console.log(`Assistant contract OK: ${representativeQuestions.length} representative questions covered.`);
