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

  // Tratamento específico para Escala de Limpeza (onde MÊS e DATA vêm em colunas separadas e GRUPO quebra em múltiplas linhas)
  if (docType.targetModule === 'clean') {
    return parseCleaningPdfRows(filePath, fileName, docType, rows, startYear, endYear);
  }

  // 2. Localiza a linha do cabeçalho
  let headerRowIndex = -1;
  let columnPositions: { name: string; x: number; field: string; role: string }[] = [];

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];

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

    const rowValues: Record<string, string> = {};
    let rawDate = '';

    for (const item of r.items) {
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

function parseCleaningPdfRows(
  filePath: string,
  fileName: string,
  docType: DocumentTypeConfig,
  rows: PdfRow[],
  startYear: number,
  endYear: number
): ParsedDocument {
  const rawRows: { rawDate: string; values: Record<string, string> }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Procura linha principal que tenha MÊS (x < 160) e faixa de DATA (180 <= x <= 260, ex: "12 - 18", "2 -8")
    const monthItem = r.items.find(it => it.x < 160 && /^(JANEIRO|FEVEREIRO|MARÇO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)$/i.test(it.text.trim()));
    const dateRangeItem = r.items.find(it => it.x >= 180 && it.x <= 265 && /^\d{1,2}\s*-\s*\d{1,2}$/.test(it.text.trim()));

    if (!monthItem || !dateRangeItem) continue;

    // Coleta fragmentos da coluna GRUPO (x >= 390) na linha anterior, atual e seguinte
    const groupParts: string[] = [];
    for (const offset of [-1, 0, 1]) {
      const targetRow = rows[i + offset];
      if (!targetRow) continue;
      // Não pega cabeçalho nem outra linha que já tenha mês próprio (exceto offset 0)
      if (offset !== 0) {
        const hasOwnMonth = targetRow.items.some(it => it.x < 160 && /^(JANEIRO|FEVEREIRO|MARÇO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)$/i.test(it.text.trim()));
        if (hasOwnMonth) continue;
      }
      for (const it of targetRow.items) {
        if (it.x >= 390 && it.text.trim().toUpperCase() !== 'GRUPO') {
          groupParts.push(it.text.trim());
        }
      }
    }

    const rawDate = `${dateRangeItem.text.replace(/\s+/g, '')}/${monthItem.text.trim().toLowerCase()}`;
    const cleanGroup = groupParts.join(' ').replace(/\s+/g, ' ').trim();
    rawRows.push({
      rawDate,
      values: { clean_group: cleanGroup }
    });
  }

  const normalizedDates = normalizeDateSequence(rawRows.map(r => r.rawDate), startYear, endYear);
  const assignmentRows: ExtractedAssignmentRow[] = rawRows.map((r, idx) => ({
    date: normalizedDates[idx],
    rawDate: r.rawDate,
    values: {
      clean_group: { raw: r.values.clean_group || '' }
    }
  }));

  return {
    filePath,
    fileName,
    detectedType: docType,
    yearInferred: startYear,
    rows: assignmentRows,
    unresolvedCount: 0
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
