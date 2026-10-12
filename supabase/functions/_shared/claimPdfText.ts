/**
 * Text layer of a claim PDF (no OCR). Shared by the browser reader and the server-side reader;
 * each passes in its own pdfjs module. Reads at most the first `maxPages` pages.
 */
type PdfjsLike = {
  getDocument: (src: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>;
    }>;
    destroy?: () => Promise<void> | void;
  };
};

export const PDF_TEXT_MAX_PAGES = 4;

export async function readPdfTextLayer(pdfjs: PdfjsLike, bytes: Uint8Array, maxPages = PDF_TEXT_MAX_PAGES) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    const max = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= max; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Keep the PDF's own line breaks (hasEOL); the analysis works line by line.
      let pageText = '';
      for (const item of content.items) {
        if (!item || typeof item !== 'object' || !('str' in item)) continue;
        const { str, hasEOL } = item as { str?: unknown; hasEOL?: boolean };
        pageText += String(str || '');
        pageText += hasEOL ? '\n' : ' ';
      }
      pages.push(pageText);
    }
    return pages.join('\n');
  } finally {
    try { await task.destroy?.(); } catch { /* already closed */ }
  }
}
