import { createWriteStream, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { createReceiptPdf, createStatementPdf } from '../src/server/financialPdf';

mkdirSync('tmp/pdfs', { recursive: true });

const writePdf = async (path: string, document: PDFKit.PDFDocument) => {
  const stream = createWriteStream(path);
  document.pipe(stream);
  document.end();
  await once(stream, 'finish');
};

await writePdf('tmp/pdfs/recibo-muestra.pdf', createReceiptPdf({
  institutionName: 'Universidad de San Pablo de Guatemala', receiptNumber: 'REC-2026-DEMO001', paidAt: new Date('2026-07-08T16:30:00-06:00'),
  studentCarnet: '20230142', studentName: 'Javier Estrada', concept: 'Mensualidad julio 2026', amount: 1200,
  method: 'TRANSFERENCIA', reference: 'TRX-DEMO-001', registeredBy: 'Ing. Carlos Mendoza',
}));

await writePdf('tmp/pdfs/estado-cuenta-muestra.pdf', createStatementPdf({
  institutionName: 'Universidad de San Pablo de Guatemala', student: { carnet: '20230142', name: 'Javier Estrada', careerName: 'Ingeniería en Sistemas' },
  period: { from: new Date('2026-07-01'), to: new Date('2026-07-31') }, openingBalance: 0, periodDebits: 1200, periodCredits: 1200, closingBalance: 0,
  movements: [
    { id: 'cargo-1', date: new Date('2026-07-01'), type: 'CARGO', document: 'CARGO001', description: 'Mensualidad julio 2026', debit: 1200, credit: 0, balance: 1200 },
    { id: 'pago-1', date: new Date('2026-07-08'), type: 'PAGO', document: 'REC-DEMO', description: 'Pago · Mensualidad julio 2026', debit: 0, credit: 1200, balance: 0 },
  ],
}));

console.log('PDF financieros generados en tmp/pdfs');
