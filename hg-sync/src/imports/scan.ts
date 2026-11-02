import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config.js';
import { parseAssignmentFile } from './detect.js';
import { ParsedDocument } from '../types.js';

export async function scanDownloadsFolder(): Promise<ParsedDocument[]> {
  const dir = config.downloadsDir;
  if (!fs.existsSync(dir)) {
    console.warn(`[Scanner] Pasta não encontrada: ${dir}`);
    return [];
  }

  const entries = fs.readdirSync(dir);
  const validExtensions = ['.pdf', '.xlsx', '.xls', '.csv'];
  const results: ParsedDocument[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const ext = path.extname(entry).toLowerCase();
      if (!validExtensions.includes(ext)) continue;

      // Filtra arquivos que tenham relação com designações
      const upper = entry.toUpperCase();
      if (
        upper.includes('PRESIDENTE') ||
        upper.includes('LEITOR') ||
        upper.includes('INDICADOR') ||
        upper.includes('MICROFONE') ||
        upper.includes('LIMPEZA') ||
        upper.includes('CAMPO')
      ) {
        const parsed = await parseAssignmentFile(fullPath);
        if (parsed) {
          results.push(parsed);
        }
      }
    } catch (e) {
      console.warn(`[Scanner] Falha ao processar arquivo ${entry}:`, e);
    }
  }

  return results;
}
