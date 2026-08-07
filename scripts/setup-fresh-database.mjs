// Aplica las migraciones sobre una base de datos nueva (sin historial previo).
// Las migraciones 20260804012000_restore_historical_grade_sections,
// 20260804013000_complete_demo_academic_history, 20260804014000_insert_demo_historical_grades
// y 20260804015000_finalize_historical_sections insertan el historial académico real
// del estudiante de demostración (carnet 20230142) y dependen de filas (docente DOC-1042,
// ciclo CYC-2025-1, aula CLR-LAB1, ese estudiante) que solo existen en la base de datos
// de producción original: ninguna migración las crea, así que en una base nueva fallan
// por violación de llave foránea. Cada migración corre en su propia transacción, así que
// al fallar no deja filas parciales. Este script las marca como aplicadas sin ejecutar su
// SQL (equivalente a un baseline puntual) para poder continuar con el resto del historial;
// después, `npm run db:seed` puebla datos de demostración generales y funcionales
// (aunque no reproduce exactamente esas filas históricas puntuales).
import { execFileSync } from 'node:child_process';

const HISTORICAL_MIGRATIONS = [
  '20260804012000_restore_historical_grade_sections',
  '20260804013000_complete_demo_academic_history',
  '20260804014000_insert_demo_historical_grades',
  '20260804015000_finalize_historical_sections',
];

const configArg = process.argv.includes('--postgres') ? ['--config', 'prisma.postgresql.config.ts'] : [];

const run = (args) => execFileSync('npx', ['prisma', ...args, ...configArg], { stdio: 'pipe', encoding: 'utf8' });

for (let attempt = 0; attempt <= HISTORICAL_MIGRATIONS.length; attempt += 1) {
  try {
    run(['migrate', 'deploy']);
    console.log('Migraciones aplicadas correctamente.');
    process.exit(0);
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`;
    const failedMatch = output.match(/Migration name: (\S+)/);
    const failed = failedMatch && HISTORICAL_MIGRATIONS.includes(failedMatch[1]) ? failedMatch[1] : undefined;
    if (!failed) {
      process.stderr.write(output);
      process.exit(1);
    }
    console.log(`Base de datos nueva: omitiendo migración de historial de demo "${failed}" (depende de datos que solo existen en producción).`);
    run(['migrate', 'resolve', '--applied', failed]);
  }
}

process.stderr.write('No se pudieron aplicar todas las migraciones tras omitir el historial de demo.\n');
process.exit(1);
