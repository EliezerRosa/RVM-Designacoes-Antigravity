import * as fs from 'fs';
// @ts-ignore
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfTextItem {
  x: number;
  y: number;
  text: string;
}

export interface PdfRow {
  y: number;
  items: { x: number; text: string }[];
}

export async function extractPdfRows(filePath: string): Promise<{ title: string; rows: PdfRow[] }> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  
  const allRows: PdfRow[] = [];
  let title = '';

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    const rowsMap = new Map<number, { x: number; text: string }[]>();

    for (const item of (tc.items as any[])) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      // Agrupa com tolerância de 3px verticais
      const existingKey = [...rowsMap.keys()].find(k => Math.abs(k - y) <= 3) ?? y;
      if (!rowsMap.has(existingKey)) rowsMap.set(existingKey, []);
      rowsMap.get(existingKey)!.push({ x, text: item.str.trim() });
    }

    // Ordena do topo para o fundo (Y decrescente)
    const sortedYs = [...rowsMap.keys()].sort((a, b) => b - a);

    for (const y of sortedYs) {
      const items = rowsMap.get(y)!.sort((a, b) => a.x - b.x);
      // O primeiro texto de destaque no topo vira o título
      if (!title && items.length > 0 && y > 700) {
        title = items.map(i => i.text).join(' ');
      }
      allRows.push({ y, items });
    }
  }

  return { title, rows: allRows };
}
