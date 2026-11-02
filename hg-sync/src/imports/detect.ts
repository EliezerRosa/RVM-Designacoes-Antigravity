import * as path from 'path';
import * as xlsx from 'xlsx';
import { config } from '../config.js';
import { DocumentTypeConfig, ExtractedAssignmentRow, ParsedDocument } from '../types.js';
import { extractPdfRows, PdfRow } from './pdf.js';
import { inferDocumentYears, normalizeDateSequence } from './dates.js';
import { nameResolver } from '../names/resolver.js';

export async function parseAssignmentFile(filePath: string): Promise<ParsedDocument | null> {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  if (ext === '.pdf') {
    return parsePdfDocument(filePath, fileName);
  } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    return parseSpreadsheetDocument(filePath, fileName);
  }

  return null;
}

async function parsePdfDocument(filePath: string, fileName: string): Promise<ParsedDocument | null> {
  const { title, rows } = await extractPdfRows(filePath);
  if (rows.length === 0) return null;

  // 1. Detecta o tipo de documento pelo título e pelos cabeçalhos encontrados
  const allText = rows.map(r => r.items.map(i => i.text).join(' ')).join(' ');
  const docType = matchDocumentType(title, allText, fileName);
  if (!docType) return null;

  const { startYear, endYear } = inferDocumentYears(title + ' ' + fileName);

  // 2. Localiza a linha do cabeçalho
  let headerRowIndex = -1;
  let columnPositions: { name: string; x: number; field: string; role: string }[] = [];

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    const rowText = row.items.map(it => it.text.toUpperCase()).join(' | ');
    
    // Procura colunas configuradas na linha
    const matches: typeof columnPositions = [];
    for (const col of docType.columns) {
      const foundItem = row.items.find(it => it.text.toUpperCase().includes(col.name.toUpperCase()));
      if (foundItem) {
        matches.push({ name: col.name, x: foundItem.x, field: col.field, role: col.role });
      }
    }

    if (matches.length >= 2 && matches.some(m => m.field === 'date')) {
      headerRowIndex = i;
      columnPositions = matches.sort((a, b) => a.x - b.x);
      break;
    }
  }

  if (headerRowIndex === -1 || columnPositions.length === 0) return null;

  // 3. Itera sobre as linhas de dados subsequentes
  const rawRows: { rawDate: string; values: Record<string, string> }[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.items.length === 0) continue;

    // Associa cada item de texto à coluna mais próxima horizontalmente
    const rowValues: Record<string, string> = {};
    let rawDate = '';

    for (const item of r.items) {
      // Acha a coluna mais próxima
      let closestCol = columnPositions[0];
      let minDiff = Math.abs(item.x - closestCol.x);

      for (const col of columnPositions) {
        const diff = Math.abs(item.x - col.x);
        if (diff < minDiff) {
          minDiff = diff;
          closestCol = col;
        }
      }

      if (closestCol.field === 'date') {
        rawDate = item.text;
      } else {
        rowValues[closestCol.field] = item.text;
      }
    }

    if (rawDate) {
      rawRows.push({ rawDate, values: rowValues });
    }
  }

  // 4. Normaliza a sequência cronológica de datas
  const rawDates = rawRows.map(r => r.rawDate);
  const normalizedDates = normalizeDateSequence(rawDates, startYear, endYear);

  // 5. Resolve os nomes de cada publicador
  let unresolvedCount = 0;
  const assignmentRows: ExtractedAssignmentRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const isoDate = normalizedDates[i];
    const resolvedValues: ExtractedAssignmentRow['values'] = {};

    for (const col of docType.columns) {
      if (col.field === 'date') continue;
      const rawVal = raw.values[col.field] || '';

      if (col.role === 'brother') {
        const resolved = nameResolver.resolve(rawVal, col.field);
        if (resolved.confidence === 'unresolved' && rawVal.trim().length > 0) {
          unresolvedCount++;
        }
        resolvedValues[col.field] = { raw: rawVal, resolved };
      } else {
        resolvedValues[col.field] = { raw: rawVal };
      }
    }

    assignmentRows.push({
      date: isoDate,
      rawDate: raw.rawDate,
      values: resolvedValues
    });
  }

  return {
    filePath,
    fileName,
    detectedType: docType,
    yearInferred: startYear,
    rows: assignmentRows,
    unresolvedCount
  };
}

function parseSpreadsheetDocument(filePath: string, fileName: string): ParsedDocument | null {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (data.length === 0) return null;

  const allText = data.map(r => r.join(' ')).join(' ');
  const docType = matchDocumentType('', allText, fileName);
  if (!docType) return null;

  const { startYear, endYear } = inferDocumentYears(allText + ' ' + fileName);

  // Acha linha de cabeçalho
  let headerIndex = -1;
  const colMap: Record<number, { field: string; role: string }> = {};

  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i] || [];
    let matches = 0;
    row.forEach((cellVal: any, colIdx: number) => {
      const text = String(cellVal || '').toUpperCase().trim();
      const matchedCol = docType.columns.find(c => text.includes(c.name.toUpperCase()));
      if (matchedCol) {
        colMap[colIdx] = { field: matchedCol.field, role: matchedCol.role };
        matches++;
      }
    });
    if (matches >= 2) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return null;

  const rawRows: { rawDate: string; values: Record<string, string> }[] = [];

  for (let i = headerIndex + 1; i < data.length; i++) {
    const row = data[i] || [];
    let rowDate = '';
    const rowValues: Record<string, string> = {};

    row.forEach((cellVal: any, colIdx: number) => {
      const colInfo = colMap[colIdx];
      if (!colInfo) return;
      const text = String(cellVal || '').trim();
      if (colInfo.field === 'date') {
        rowDate = text;
      } else {
        rowValues[colInfo.field] = text;
      }
    });

    if (rowDate) {
      rawRows.push({ rawDate, values: rowValues });
    }
  }

  const rawDates = rawRows.map(r => r.rawDate);
  const normalizedDates = normalizeDateSequence(rawDates, startYear, endYear);

  let unresolvedCount = 0;
  const assignmentRows: ExtractedAssignmentRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const isoDate = normalizedDates[i];
    const resolvedValues: ExtractedAssignmentRow['values'] = {};

    for (const col of docType.columns) {
      if (col.field === 'date') continue;
      const rawVal = raw.values[col.field] || '';

      if (col.role === 'brother') {
        const resolved = nameResolver.resolve(rawVal, col.field);
        if (resolved.confidence === 'unresolved' && rawVal.trim().length > 0) {
          unresolvedCount++;
        }
        resolvedValues[col.field] = { raw: rawVal, resolved };
      } else {
        resolvedValues[col.field] = { raw: rawVal };
      }
    }

    assignmentRows.push({
      date: isoDate,
      rawDate: raw.rawDate,
      values: resolvedValues
    });
  }

  return {
    filePath,
    fileName,
    detectedType: docType,
    yearInferred: startYear,
    rows: assignmentRows,
    unresolvedCount
  };
}

function matchDocumentType(title: string, fullText: string, fileName: string): DocumentTypeConfig | null {
  const combined = (title + ' ' + fullText + ' ' + fileName).toUpperCase();
  for (const docType of config.documentTypes) {
    const matches = docType.headerMatchAny.every(pattern => combined.includes(pattern.toUpperCase()));
    if (matches) return docType;
  }
  return null;
}
