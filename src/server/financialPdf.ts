import PDFDocument from 'pdfkit';

const burgundy = '#800020';
const gray = '#64748B';
const money = (value: number) => `Q${value.toFixed(2)}`;

const addHeader = (doc: PDFKit.PDFDocument, institutionName: string, title: string) => {
  doc.rect(0, 0, 612, 78).fill(burgundy);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(institutionName, 42, 23, { width: 528, align: 'center' });
  doc.fontSize(10).text(title, 42, 48, { width: 528, align: 'center' });
};

const addFooter = (doc: PDFKit.PDFDocument) => {
  doc.font('Helvetica').fontSize(7).fillColor(gray).text(`Generado el ${new Date().toLocaleString('es-GT')} - Sistema Académico USPG`, 42, 730, { width: 528, align: 'center', lineBreak: false });
};

export interface ReceiptPdfData {
  institutionName: string;
  receiptNumber: string;
  paidAt: Date;
  studentCarnet: string;
  studentName: string;
  concept: string;
  amount: number;
  method: string;
  reference?: string | null;
  registeredBy: string;
}

export const createReceiptPdf = (data: ReceiptPdfData) => {
  const doc = new PDFDocument({ size: 'LETTER', margin: 42, info: { Title: `Recibo ${data.receiptNumber}`, Author: data.institutionName } });
  addHeader(doc, data.institutionName, 'RECIBO OFICIAL DE PAGO');
  doc.fillColor('#222').font('Helvetica-Bold').fontSize(18).text(data.receiptNumber, 42, 105, { width: 528, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(gray).text(`Fecha de pago: ${data.paidAt.toLocaleString('es-GT')}`, 42, 133, { width: 528, align: 'center' });
  doc.roundedRect(62, 172, 488, 188, 8).fillAndStroke('#F8FAFC', '#E2E8F0');
  const rows = [
    ['Estudiante', data.studentName], ['Carné', data.studentCarnet], ['Concepto', data.concept],
    ['Método de pago', data.method], ['Referencia', data.reference || 'Sin referencia'], ['Registrado por', data.registeredBy],
  ];
  let y = 192;
  rows.forEach(([label, value]) => {
    doc.fillColor(gray).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), 82, y, { width: 125 });
    doc.fillColor('#222').font('Helvetica').fontSize(10).text(value, 215, y - 1, { width: 310 });
    y += 27;
  });
  doc.roundedRect(156, 394, 300, 82, 8).fill(burgundy);
  doc.fillColor('white').font('Helvetica').fontSize(9).text('TOTAL PAGADO', 156, 414, { width: 300, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(22).text(money(data.amount), 156, 434, { width: 300, align: 'center' });
  doc.fillColor('#222').font('Helvetica').fontSize(8).text('Este documento fue generado electrónicamente por el Sistema Académico USPG.', 62, 515, { width: 488, align: 'center' });
  addFooter(doc);
  return doc;
};

export interface StatementMovement { id: string; date: Date; type: string; document: string; description: string; debit: number; credit: number; balance: number; }
export interface StatementPdfData {
  institutionName: string;
  student: { carnet: string; name: string; careerName: string };
  period: { from: Date; to: Date };
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  movements: StatementMovement[];
}

export const createStatementPdf = (data: StatementPdfData) => {
  const doc = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true, info: { Title: `Estado de cuenta ${data.student.carnet}`, Author: data.institutionName } });
  const tableHeader = () => {
    doc.rect(42, y, 528, 23).fill('#F1E7EA');
    doc.fillColor(burgundy).font('Helvetica-Bold').fontSize(7);
    ['Fecha', 'Documento', 'Descripción', 'Cargo', 'Abono', 'Saldo'].forEach((header, index) => doc.text(header, columns[index] + 3, y + 8, { width: widths[index] - 6, align: index > 2 ? 'right' : 'left' }));
    y += 23;
  };
  addHeader(doc, data.institutionName, 'ESTADO DE CUENTA');
  doc.fillColor('#222').font('Helvetica-Bold').fontSize(12).text(data.student.name, 42, 101);
  doc.font('Helvetica').fontSize(9).fillColor(gray).text(`Carné: ${data.student.carnet}    Carrera: ${data.student.careerName}`, 42, 121);
  doc.fontSize(8).text(`Período: ${data.period.from.toLocaleDateString('es-GT')} al ${data.period.to.toLocaleDateString('es-GT')}    Saldo anterior: ${money(data.openingBalance)}`, 42, 143);
  const columns = [42, 102, 184, 366, 434, 502];
  const widths = [60, 82, 182, 68, 68, 68];
  let y = 174;
  tableHeader();
  data.movements.forEach((movement, index) => {
    if (y > 690) { doc.addPage(); y = 58; tableHeader(); }
    if (index % 2) doc.rect(42, y, 528, 24).fill('#FAFAFA');
    doc.fillColor('#222').font('Helvetica').fontSize(7.5);
    const values = [movement.date.toLocaleDateString('es-GT'), movement.document, movement.description, movement.debit ? money(movement.debit) : '-', movement.credit ? money(movement.credit) : '-', money(movement.balance)];
    values.forEach((value, column) => doc.text(value, columns[column] + 3, y + 8, { width: widths[column] - 6, align: column > 2 ? 'right' : 'left', ellipsis: true }));
    y += 24;
  });
  y += 20;
  if (y > 640) { doc.addPage(); y = 70; }
  doc.roundedRect(290, y, 280, 112, 8).fillAndStroke('#F8FAFC', '#E2E8F0');
  const summaryRows = [['Saldo anterior', data.openingBalance], ['Cargos del período', data.periodDebits], ['Abonos del período', data.periodCredits], ['Saldo final', data.closingBalance]] as const;
  summaryRows.forEach(([label, value], index) => { doc.fillColor(gray).font('Helvetica').fontSize(8).text(label, 310, y + 16 + index * 22); doc.fillColor(index === 3 && value > 0 ? '#C53030' : '#222').font('Helvetica-Bold').text(money(value), 430, y + 16 + index * 22, { width: 120, align: 'right' }); });
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) {
    doc.switchToPage(page);
    addFooter(doc);
    if (page === range.start) doc.fillColor('white').font('Helvetica-Bold').fontSize(15).text(data.institutionName, 42, 23, { width: 528, align: 'center', lineBreak: false });
  }
  return doc;
};
