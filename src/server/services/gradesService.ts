import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import type { AppPrisma } from '../types';

export const gradeView = (record: any) => ({
  id: record.id,
  studentCarnet: record.studentCarnet,
  studentName: record.student.name,
  sectionId: record.sectionId,
  courseCode: record.section.courseCode,
  courseName: record.section.course.name,
  cycleId: record.section.cycleId,
  zona: record.zona,
  parcial: record.parcial,
  segundoParcial: record.segundoParcial,
  final: record.final,
  recuperacion: record.recuperacion,
  total: record.total,
  status: record.status,
  isPublished: record.isPublished,
  actaStatus: record.section.gradeActStatus,
  gradesPublishedAt: record.section.gradesPublishedAt,
  gradesClosedAt: record.section.gradesClosedAt,
  gradesClosedBy: record.section.gradesClosedBy,
});

export const recalculateStudentZones = async (tx: any, sectionId: string, studentCarnets: string[]) => {
  for (const studentCarnet of studentCarnets) {
    const activityGrades = await tx.zoneActivityGrade.findMany({ where: { studentCarnet, activity: { sectionId }, score: { not: null } } });
    const zona = Math.min(30, activityGrades.reduce((sum: number, item: any) => sum + Number(item.score || 0), 0));
    const current = await tx.gradeRecord.findUnique({ where: { studentCarnet_sectionId: { studentCarnet, sectionId } } });
    if (!current) continue;
    const total = current.recuperacion > 0 ? current.recuperacion : zona + current.parcial + current.segundoParcial + current.final;
    await tx.gradeRecord.update({ where: { id: current.id }, data: { zona, total, status: total >= 61 ? 'Aprobado' : total > 0 ? 'Reprobado' : 'En curso' } });
  }
};

export const recoveryView = (record: any) => {
  const charge = record.financialCharge;
  const paid = charge ? charge.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0) : 0;
  const balance = charge ? Math.max(0, charge.amount - paid) : 0;
  return {
    id: record.id,
    status: record.status,
    originalTotal: record.originalTotal,
    recoveryScore: record.recoveryScore,
    requestedAt: record.requestedAt,
    scheduledAt: record.scheduledAt,
    authorizedAt: record.authorizedAt,
    gradedAt: record.gradedAt,
    requestedBy: record.requestedBy,
    authorizedBy: record.authorizedBy,
    gradedBy: record.gradedBy,
    authorizationNote: record.authorizationNote,
    gradeRecordId: record.gradeRecordId,
    studentCarnet: record.gradeRecord.studentCarnet,
    studentName: record.gradeRecord.student.name,
    sectionId: record.gradeRecord.sectionId,
    sectionCode: record.gradeRecord.section.code,
    courseCode: record.gradeRecord.section.courseCode,
    courseName: record.gradeRecord.section.course.name,
    teacherId: record.gradeRecord.section.teacherId,
    charge: charge
      ? { id: charge.id, amount: charge.amount, paid, balance, status: balance <= 0 ? 'PAGADO' : charge.dueDate < new Date() ? 'VENCIDO' : 'PENDIENTE' }
      : null,
  };
};

// Un curso reprobado deja de ser elegible para recuperación si el estudiante ya lo aprobó
// en otro intento/sección (retake); GradeRecord es por sección, no por curso, así que ambos
// registros conviven en el expediente.
export const filterRecoveryEligible = async (prisma: AppPrisma, eligibleCandidates: any[]) => {
  const approvedByStudent = new Map<string, Set<string>>();
  if (eligibleCandidates.length) {
    const studentCarnets = [...new Set(eligibleCandidates.map((grade) => grade.studentCarnet))];
    const approvedGrades = await (prisma as any).gradeRecord.findMany({ where: { studentCarnet: { in: studentCarnets }, status: 'Aprobado' }, select: { studentCarnet: true, section: { select: { courseCode: true } } } });
    for (const grade of approvedGrades) {
      if (!approvedByStudent.has(grade.studentCarnet)) approvedByStudent.set(grade.studentCarnet, new Set());
      approvedByStudent.get(grade.studentCarnet)!.add(grade.section.courseCode);
    }
  }
  return eligibleCandidates.filter((grade) => !approvedByStudent.get(grade.studentCarnet)?.has(grade.section.courseCode));
};

export const closeSectionGrades = async (prisma: AppPrisma, section: any, closedByName: string, actorId: string) => {
  const closedAt = new Date();
  await prisma.$transaction(async (tx: any) => {
    await tx.section.update({ where: { id: section.id }, data: { gradeActStatus: 'CERRADA', gradesClosedAt: closedAt, gradesClosedBy: closedByName } });
    for (const grade of section.gradeRecords) {
      const newEnrollmentStatus = grade.status === 'Aprobado' ? 'Completado' : 'Reprobado';
      await tx.enrollment.updateMany({ where: { studentCarnet: grade.studentCarnet, sectionId: section.id }, data: { status: newEnrollmentStatus } });
    }
    const studentCarnets = [...new Set(section.gradeRecords.map((g: any) => g.studentCarnet))];
    for (const carnet of studentCarnets) {
      const allGrades = await tx.gradeRecord.findMany({ where: { studentCarnet: carnet, section: { gradeActStatus: 'CERRADA' } }, include: { section: { include: { course: { select: { credits: true } } } } } });
      const approved = allGrades.filter((g: any) => g.status === 'Aprobado');
      const creditsEarned = approved.reduce((sum: number, g: any) => sum + g.section.course.credits, 0);
      const totalWeighted = approved.reduce((sum: number, g: any) => sum + g.total * g.section.course.credits, 0);
      const gpa = creditsEarned > 0 ? Math.round((totalWeighted / creditsEarned) * 100) / 100 : 0;
      await tx.student.update({ where: { carnet }, data: { gpa, creditsEarned } });
    }
    await tx.auditLog.create({ data: { action: 'CLOSE', entityType: 'GRADES', entityId: section.id, actorId, details: JSON.stringify({ records: section.gradeRecords.length }) } });
  });
  return closedAt;
};

export const renderActaPdf = (res: Response, section: any, institutionName: string) => {
  const safeCode = section.code.replace(/[^a-z0-9_-]/gi, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Acta_${safeCode}_USPG.pdf"`);
  const doc = new PDFDocument({ size: 'LETTER', margin: 42, info: { Title: `Acta ${section.code}`, Author: institutionName } });
  doc.pipe(res);
  const burgundy = '#800020';
  doc.rect(0, 0, 612, 74).fill(burgundy);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institutionName, 42, 23, { align: 'center' });
  doc.fontSize(10).text('ACTA OFICIAL DE CALIFICACIONES', 42, 46, { align: 'center' });
  doc.fillColor('#222').font('Helvetica-Bold').fontSize(11).text(`${section.courseCode} - ${section.course.name}`, 42, 94);
  doc.font('Helvetica').fontSize(9).text(`Sección: ${section.code}    Ciclo: ${section.cycle.name}`, 42, 113);
  doc.text(`Catedrático: ${section.teacher.name}`, 42, 128);
  doc.text(`Estado del acta: ${section.gradeActStatus}`, 42, 143);
  if (section.gradesClosedAt) doc.text(`Cierre: ${section.gradesClosedAt.toLocaleString('es-GT')} por ${section.gradesClosedBy}`, 42, 158);
  const columns = [42, 96, 248, 286, 324, 362, 402, 446, 496];
  const widths = [54, 152, 38, 38, 38, 40, 44, 50, 74];
  const headers = ['Carné', 'Estudiante', 'Zona', '1er P.', '2do P.', 'Final', 'Recup.', 'Total', 'Estado'];
  let y = section.gradesClosedAt ? 187 : 172;
  const drawHeader = () => {
    doc.rect(42, y, 528, 23).fill('#F1E7EA');
    doc.fillColor(burgundy).font('Helvetica-Bold').fontSize(7);
    headers.forEach((header, index) => doc.text(header, columns[index] + 3, y + 8, { width: widths[index] - 6, align: index > 1 ? 'center' : 'left' }));
    y += 23;
  };
  drawHeader();
  section.gradeRecords.forEach((grade: any, index: number) => {
    if (y > 700) { doc.addPage(); y = 54; drawHeader(); }
    if (index % 2) doc.rect(42, y, 528, 22).fill('#FAFAFA');
    doc.fillColor('#222').font('Helvetica').fontSize(7.5);
    const values = [grade.studentCarnet, grade.student.name, grade.zona, grade.parcial, grade.segundoParcial, grade.final, grade.recuperacion || '-', grade.total, grade.status];
    values.forEach((value, column) => doc.text(String(value), columns[column] + 3, y + 7, { width: widths[column] - 6, align: column > 1 ? 'center' : 'left', ellipsis: true }));
    y += 22;
  });
  y += 18;
  const approved = section.gradeRecords.filter((grade: any) => grade.status === 'Aprobado').length;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#222').text(`Total: ${section.gradeRecords.length}    Aprobados: ${approved}    Reprobados: ${section.gradeRecords.length - approved}`, 42, y);
  y += 48;
  doc.moveTo(62, y).lineTo(250, y).stroke('#555');
  doc.moveTo(362, y).lineTo(550, y).stroke('#555');
  doc.font('Helvetica').fontSize(8).text(section.teacher.name, 62, y + 7, { width: 188, align: 'center' });
  doc.text('Control Académico', 362, y + 7, { width: 188, align: 'center' });
  const pageCount = doc.bufferedPageRange().count;
  doc.fontSize(7).fillColor('#666').text(`Documento generado el ${new Date().toLocaleString('es-GT')} - Página ${pageCount}`, 42, 742, { align: 'center' });
  doc.end();
};

export const renderCertificationPdf = (res: Response, student: any, institutionName: string, approvedCredits: number) => {
  const safeCarnet = student.carnet.replace(/[^a-z0-9_-]/gi, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Certificacion_Estudios_${safeCarnet}_USPG.pdf"`);
  const burgundy = '#800020';
  const gray = '#64748B';
  const doc = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true, info: { Title: `Certificación de estudios ${student.carnet}`, Author: institutionName } });
  doc.pipe(res);
  const drawBanner = () => {
    doc.rect(0, 0, 612, 78).fill(burgundy);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institutionName, 42, 23, { width: 528, align: 'center' });
    doc.fontSize(10).text('SECRETARÍA GENERAL - CERTIFICACIÓN OFICIAL DE ESTUDIOS', 42, 48, { width: 528, align: 'center' });
  };
  drawBanner();
  doc.roundedRect(42, 100, 528, 118, 8).fillAndStroke('#F8FAFC', '#E2E8F0');
  const infoRows: [string, string][] = [
    ['Nombre completo', student.name], ['Carné', student.carnet], ['Carrera', student.careerName || '-'],
    ['Ciclo de ingreso', student.entryCycle], ['Promedio general', `${student.gpa.toFixed(2)} pts`], ['Créditos', `${approvedCredits} / ${student.totalCreditsRequired} pts`],
  ];
  let infoY = 116;
  infoRows.forEach(([label, value], index) => {
    const column = index % 2 === 0 ? 62 : 322;
    if (index % 2 === 0 && index > 0) infoY += 36;
    doc.fillColor(gray).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), column, infoY, { width: 220 });
    doc.fillColor('#222').font('Helvetica').fontSize(10).text(value, column, infoY + 13, { width: 220 });
  });
  let y = 244;
  doc.fillColor('#222').font('Helvetica-Bold').fontSize(10).text('Historial de asignaturas evaluadas', 42, y);
  y += 20;
  const columns = [42, 96, 310, 400, 462];
  const widths = [54, 214, 90, 62, 108];
  const headers = ['Código', 'Asignatura', 'Ciclo', 'Nota', 'Estado'];
  const drawHeader = () => {
    doc.rect(42, y, 528, 22).fill('#F1E7EA');
    doc.fillColor(burgundy).font('Helvetica-Bold').fontSize(7.5);
    headers.forEach((header, index) => doc.text(header, columns[index] + 3, y + 7, { width: widths[index] - 6, align: index >= 3 ? 'center' : 'left' }));
    y += 22;
  };
  drawHeader();
  student.gradeRecords.forEach((grade: any, index: number) => {
    if (y > 700) { doc.addPage(); y = 54; drawHeader(); }
    if (index % 2) doc.rect(42, y, 528, 22).fill('#FAFAFA');
    doc.fillColor('#222').font('Helvetica').fontSize(7.5);
    const values = [grade.section.courseCode, grade.section.course.name, grade.section.cycleId, grade.total.toFixed(1), grade.status];
    values.forEach((value, column) => doc.text(String(value), columns[column] + 3, y + 7, { width: widths[column] - 6, align: column >= 3 ? 'center' : 'left', ellipsis: true }));
    y += 22;
  });
  if (!student.gradeRecords.length) { doc.fillColor(gray).font('Helvetica').fontSize(9).text('No existen registros de calificaciones para este estudiante.', 42, y + 8); y += 24; }
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page);
    doc.font('Helvetica').fontSize(7).fillColor(gray).text(`Documento oficial generado electrónicamente el ${new Date().toLocaleString('es-GT')} - Sistema Académico USPG`, 42, 742, { width: 528, align: 'center', lineBreak: false });
    if (page === range.start) { doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institutionName, 42, 23, { width: 528, align: 'center', lineBreak: false }); }
  }
  doc.end();
};
