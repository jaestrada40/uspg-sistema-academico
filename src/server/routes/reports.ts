import type express from 'express';
import type { AppPrisma, AuthMiddleware, ServerHelpers } from '../types';

const burgundy = '#800020';
const gray = '#64748B';
const lightGray = '#E2E8F0';

const addHeader = (doc: PDFKit.PDFDocument, institution: string, title: string) => {
  doc.rect(0, 0, 612, 78).fill(burgundy);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institution, 42, 23, { width: 528, align: 'center' });
  doc.fontSize(10).text(title, 42, 48, { width: 528, align: 'center' });
  doc.fillColor('#333333').font('Helvetica').moveDown(4);
};

const addFooter = (doc: PDFKit.PDFDocument) => {
  doc.font('Helvetica').fontSize(7).fillColor(gray)
    .text(`Generado el ${new Date().toLocaleString('es-GT')} — Sistema Académico USPG`, 42, 730, { width: 528, align: 'center', lineBreak: false });
};

const tableHeader = (doc: PDFKit.PDFDocument, cols: { label: string; width: number }[], y: number) => {
  doc.rect(42, y, 528, 18).fill('#F8FAFC');
  let x = 42;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(gray);
  for (const col of cols) {
    doc.text(col.label, x + 4, y + 4, { width: col.width - 8, lineBreak: false });
    x += col.width;
  }
  doc.moveTo(42, y + 18).lineTo(570, y + 18).strokeColor(lightGray).stroke();
  return y + 18;
};

const tableRow = (doc: PDFKit.PDFDocument, cols: { value: string; width: number }[], y: number, shade: boolean) => {
  if (shade) doc.rect(42, y, 528, 16).fill('#FAFAFA');
  let x = 42;
  doc.font('Helvetica').fontSize(8).fillColor('#333333');
  for (const col of cols) {
    doc.text(col.value, x + 4, y + 3, { width: col.width - 8, lineBreak: false });
    x += col.width;
  }
  doc.moveTo(42, y + 16).lineTo(570, y + 16).strokeColor(lightGray).stroke();
  return y + 16;
};

export function registerReportsRoutes(
  app: express.Express,
  prisma: AppPrisma,
  middleware: AuthMiddleware,
  helpers: ServerHelpers,
) {
  const { PDFDocument, XLSX } = helpers;
  const { requireAdmin } = middleware;

  // ── PDF ───────────────────────────────────────────────────────────────────
  app.get('/api/reports/pdf', requireAdmin, async (_req, res) => {
    const [students, careers, gradeRecords, sections, institution] = await Promise.all([
      prisma.student.findMany({ orderBy: { name: 'asc' } }),
      prisma.career.findMany({ orderBy: { name: 'asc' } }),
      prisma.gradeRecord.findMany({ include: { section: { include: { course: true } }, student: true }, orderBy: { updatedAt: 'desc' }, take: 500 }),
      prisma.section.findMany({ include: { course: true }, orderBy: { code: 'asc' }, take: 200 }),
      prisma.institutionConfig.findUnique({ where: { id: 1 } }),
    ]);

    const institutionName = institution?.name ?? 'Universidad de San Pablo de Guatemala';
    const doc = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true, info: { Title: 'Reporte Académico USPG', Author: institutionName } });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Reporte_Academico_USPG_${new Date().toISOString().slice(0, 10)}.pdf"`);
      res.end(pdf);
    });

    // ── Página 1: Estudiantes ────────────────────────────────────────────────
    addHeader(doc, institutionName, 'Reporte Académico — Estudiantes');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text('Directorio de Estudiantes', 42, 100);
    doc.font('Helvetica').fontSize(8).fillColor(gray).text(`Total: ${students.length} estudiantes`, 42, 114).moveDown(0.5);

    const stuCols = [{ label: 'Carné', width: 90 }, { label: 'Nombre', width: 200 }, { label: 'Carrera', width: 160 }, { label: 'Promedio', width: 78 }];
    let y = tableHeader(doc, stuCols, 130);
    for (let i = 0; i < students.length; i++) {
      if (y > 700) { doc.addPage(); addHeader(doc, institutionName, 'Reporte Académico — Estudiantes (cont.)'); y = tableHeader(doc, stuCols, 100); }
      const s = students[i];
      y = tableRow(doc, [
        { value: s.carnet, width: 90 },
        { value: s.name, width: 200 },
        { value: s.careerName, width: 160 },
        { value: s.gpa != null ? Number(s.gpa).toFixed(2) : '—', width: 78 },
      ], y, i % 2 === 1);
    }

    // ── Página: Distribución por carrera ────────────────────────────────────
    doc.addPage();
    addHeader(doc, institutionName, 'Reporte Académico — Distribución por Carrera');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text('Estudiantes por Carrera', 42, 100);
    const careerCols = [{ label: 'Código', width: 100 }, { label: 'Carrera', width: 300 }, { label: 'Estudiantes', width: 128 }];
    y = tableHeader(doc, careerCols, 130);
    for (let i = 0; i < careers.length; i++) {
      const c = careers[i];
      const count = students.filter((s) => s.careerId === c.code).length;
      y = tableRow(doc, [{ value: c.code, width: 100 }, { value: c.name, width: 300 }, { value: String(count), width: 128 }], y, i % 2 === 1);
    }

    // ── Página: Notas ────────────────────────────────────────────────────────
    doc.addPage();
    addHeader(doc, institutionName, 'Reporte Académico — Notas');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text('Historial de Notas', 42, 100);
    const gradeCols = [{ label: 'Carné', width: 80 }, { label: 'Estudiante', width: 170 }, { label: 'Curso', width: 170 }, { label: 'Nota', width: 60 }, { label: 'Estado', width: 78 }];
    y = tableHeader(doc, gradeCols, 130);
    for (let i = 0; i < gradeRecords.length; i++) {
      if (y > 700) { doc.addPage(); addHeader(doc, institutionName, 'Reporte Académico — Notas (cont.)'); y = tableHeader(doc, gradeCols, 100); }
      const g = gradeRecords[i];
      y = tableRow(doc, [
        { value: g.student?.carnet ?? '—', width: 80 },
        { value: g.student?.name ?? '—', width: 170 },
        { value: g.section?.course?.name ?? '—', width: 170 },
        { value: g.total != null ? String(g.total) : '—', width: 60 },
        { value: g.status, width: 78 },
      ], y, i % 2 === 1);
    }

    // ── Página: Secciones ────────────────────────────────────────────────────
    doc.addPage();
    addHeader(doc, institutionName, 'Reporte Académico — Secciones');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text('Secciones Activas', 42, 100);
    const secCols = [{ label: 'Código', width: 90 }, { label: 'Curso', width: 230 }, { label: 'Inscritos', width: 90 }, { label: 'Capacidad', width: 118 }];
    y = tableHeader(doc, secCols, 130);
    for (let i = 0; i < sections.length; i++) {
      if (y > 700) { doc.addPage(); addHeader(doc, institutionName, 'Reporte Académico — Secciones (cont.)'); y = tableHeader(doc, secCols, 100); }
      const s = sections[i];
      y = tableRow(doc, [
        { value: s.code, width: 90 },
        { value: s.course?.name ?? '—', width: 230 },
        { value: String(s.enrolledCount), width: 90 },
        { value: String(s.capacity), width: 118 },
      ], y, i % 2 === 1);
    }

    addFooter(doc);
    doc.end();
  });

  // ── Excel ─────────────────────────────────────────────────────────────────
  app.get('/api/reports/xlsx', requireAdmin, async (_req, res) => {
    const [students, careers, gradeRecords, sections, institution] = await Promise.all([
      prisma.student.findMany({ orderBy: { name: 'asc' } }),
      prisma.career.findMany({ orderBy: { name: 'asc' } }),
      prisma.gradeRecord.findMany({ include: { section: { include: { course: true } }, student: true }, orderBy: { updatedAt: 'desc' }, take: 2000 }),
      prisma.section.findMany({ include: { course: true }, orderBy: { code: 'asc' } }),
      prisma.institutionConfig.findUnique({ where: { id: 1 } }),
    ]);

    const institutionName = institution?.name ?? 'Universidad de San Pablo de Guatemala';
    const wb = XLSX.utils.book_new();

    // Hoja 1: Estudiantes
    const stuRows = [['Carné', 'Nombre', 'Carrera', 'Promedio GPA', 'Estado'], ...students.map((s) => [s.carnet, s.name, s.careerName, s.gpa != null ? Number(s.gpa) : '', s.status ?? ''])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stuRows), 'Estudiantes');

    // Hoja 2: Por carrera
    const careerRows = [['Código', 'Carrera', 'Estudiantes'], ...careers.map((c) => [c.code, c.name, students.filter((s) => s.careerId === c.code).length])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(careerRows), 'Por Carrera');

    // Hoja 3: Notas
    const gradeRows = [['Carné', 'Estudiante', 'Curso', 'Código', 'Nota', 'Estado'], ...gradeRecords.map((g) => [g.student?.carnet ?? '', g.student?.name ?? '', g.section?.course?.name ?? '', g.section?.course?.code ?? '', g.total != null ? g.total : '', g.status])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gradeRows), 'Notas');

    // Hoja 4: Secciones
    const secRows = [['Código', 'Curso', 'Inscritos', 'Capacidad', '% Ocupación'], ...sections.map((s) => [s.code, s.course?.name ?? '', s.enrolledCount, s.capacity, s.capacity > 0 ? Math.round((s.enrolledCount / s.capacity) * 100) + '%' : '0%'])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(secRows), 'Secciones');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const filename = `Reporte_Academico_USPG_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buf);
  });
}
