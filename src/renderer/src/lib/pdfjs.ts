import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function loadPdfDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js transfers the buffer; slice to keep the original bytes intact for pdf-lib on save.
  const copy = bytes.slice(0);
  const task = pdfjs.getDocument({ data: copy });
  return task.promise;
}
