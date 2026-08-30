import type { GoogleGenAI } from '@google/genai';
import type { AppPrisma } from '../types';
import { crearSolicitudEstudiante, STUDENT_REQUEST_TYPES, STUDENT_REQUEST_DELIVERY_TYPES } from './academicService';

const TOOL_NAME = 'crear_solicitud_estudiantil';

// El asistente interno puede EJECUTAR esta unica accion por ahora: crear un
// tramite estudiantil real (constancia, certificacion de notas, cierre de
// pensum). Nunca se ofrece a otros roles, y notifications.ts solo llama a
// esta funcion cuando el mensaje ya sugiere esa intencion (ver el regex en
// el handler de /api/assistant) -- asi el modelo no decide "de la nada"
// mutar datos reales del estudiante; el gatillo inicial es determinista.
//
// La confirmacion explicita del estudiante y los datos completos (tipo,
// proposito, entrega) los exige la propia funcion que declara la
// herramienta: si Gemini no los tiene todos, responde en texto en vez de
// llamarla, y aqui simplemente se devuelve ese texto como pregunta
// aclaratoria.
export async function intentarCrearSolicitudPorAsistente(
  gemini: GoogleGenAI,
  prisma: AppPrisma,
  notifyUser: (userId: string, title: string, message: string, type?: string, link?: string) => Promise<void>,
  actor: { id: string; name: string; carnetOrCode: string | null },
  question: string,
  history: string,
): Promise<{ ejecuto: boolean; texto: string }> {
  const tool = {
    functionDeclarations: [
      {
        name: TOOL_NAME,
        description:
          'Crea un trámite estudiantil real (constancia de estudios, certificación de notas, o cierre de pensum) ' +
          'en el Sistema Académico. SOLO llamar cuando el estudiante ya confirmó explícitamente (dijo algo como ' +
          '"sí", "confirmo", "adelante") Y ya se sabe el tipo de trámite, el propósito, y la forma de entrega. Si ' +
          'falta algún dato o no hay confirmación explícita todavía, NO llames la función: responde en texto ' +
          'pidiendo justo lo que falta.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...STUDENT_REQUEST_TYPES], description: 'Tipo de trámite.' },
            purpose: { type: 'string', description: 'Para qué necesita el documento (mínimo 5 caracteres).' },
            deliveryType: { type: 'string', enum: [...STUDENT_REQUEST_DELIVERY_TYPES], description: 'Forma de entrega.' },
          },
          required: ['type', 'purpose', 'deliveryType'],
        },
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Awaited<ReturnType<typeof gemini.models.generateContent>>;
  try {
    response = await Promise.race([
      gemini.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Eres el asistente del Sistema Académico USPG hablando con el estudiante ${actor.name}. Historial reciente:\n${history}\n\nMensaje actual: ${question}`,
        config: { tools: [tool] },
      }),
      new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Gemini timeout')))),
    ]);
  } catch (error) {
    // Un error de Gemini aca (cuota, modelo removido, timeout, red) NUNCA debe
    // tumbar el proceso completo -- notifications.ts no envuelve esta llamada
    // en try/catch, asi que si esto no captura, se cae todo el servidor para
    // TODOS los usuarios, no solo para quien hizo esta pregunta.
    console.error('Error de Gemini en intentarCrearSolicitudPorAsistente:', error instanceof Error ? error.message : error);
    return {
      ejecuto: false,
      texto: 'Tuve un problema técnico procesando tu trámite. Puedes intentar de nuevo en unos minutos, o crearlo directamente desde la sección de Solicitudes.',
    };
  } finally {
    clearTimeout(timeout);
  }

  const llamada = response.functionCalls?.[0];
  if (!llamada || llamada.name !== TOOL_NAME) {
    return {
      ejecuto: false,
      texto: response.text?.trim()
        || 'Cuéntame qué trámite necesitas (constancia de estudios, certificación de notas, o cierre de pensum), para qué lo necesitas, y si lo quieres digital o físico.',
    };
  }

  const args = (llamada.args || {}) as { type?: string; purpose?: string; deliveryType?: string };
  const resultado = await crearSolicitudEstudiante(prisma, notifyUser, actor, {
    type: args.type || '',
    purpose: args.purpose || '',
    deliveryType: args.deliveryType,
  });
  if (resultado.ok === false) {
    return { ejecuto: false, texto: resultado.message };
  }
  const record = resultado.record as { type: string; deliveryType: string };
  return {
    ejecuto: true,
    texto: `Listo, tu solicitud de ${record.type.replaceAll('_', ' ').toLowerCase()} quedó registrada (entrega ${record.deliveryType.toLowerCase()}). El equipo de Registro Académico la va a revisar y te va a notificar cuando haya una actualización. Puedes ver el estado en la sección de Solicitudes.`,
  };
}
