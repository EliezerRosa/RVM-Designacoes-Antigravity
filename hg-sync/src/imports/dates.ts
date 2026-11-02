const MONTH_MAP: Record<string, number> = {
  'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
  'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
};

export function parsePortugueseDate(rawStr: string, contextYear?: number): { dateIso: string; month: number; day: number; year: number } | null {
  if (!rawStr) return null;
  const cleaned = rawStr.trim().toLowerCase().replace(/\s+/g, '');
  
  // Ex: 18/out, 01/nov, 2026-10-18
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split('-').map(Number);
    return { dateIso: cleaned, year: y, month: m, day: d };
  }

  const match = cleaned.match(/^(\d{1,2})\/([a-z]{3})/i);
  if (!match) return null;

  const day = parseInt(match[1]);
  const monthStr = match[2];
  const month = MONTH_MAP[monthStr];
  if (!month) return null;

  const baseYear = contextYear || new Date().getFullYear();
  // Se o mês for 1 a 6 e o ano base for 2026 (outubro..dezembro), provavelmente é 2027
  let year = baseYear;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { dateIso: `${year}-${mm}-${dd}`, month, day, year };
}

export function inferDocumentYears(titleText: string): { startYear: number; endYear: number } {
  // Ex: 2026/2027 ou 2026-2027 ou 2026
  const matchRange = titleText.match(/(20\d\d)\s*[\/\-]\s*(20\d\d)/);
  if (matchRange) {
    return { startYear: parseInt(matchRange[1]), endYear: parseInt(matchRange[2]) };
  }
  const matchSingle = titleText.match(/20\d\d/);
  const y = matchSingle ? parseInt(matchSingle[0]) : new Date().getFullYear();
  return { startYear: y, endYear: y + 1 };
}

/**
 * Normaliza uma lista cronológica de datas dd/mmm tratando virada de ano (ex: out/dez -> jan/abr).
 */
export function normalizeDateSequence(rawDates: string[], startYear: number, endYear: number): string[] {
  let currentYear = startYear;
  let lastMonth = -1;

  return rawDates.map(raw => {
    const parsed = parsePortugueseDate(raw, currentYear);
    if (!parsed) return raw;

    // Se o mês anterior era nov/dez e o atual é jan/fev, virou o ano!
    if (lastMonth >= 9 && parsed.month <= 4 && currentYear < endYear) {
      currentYear = endYear;
    }
    lastMonth = parsed.month;

    const mm = String(parsed.month).padStart(2, '0');
    const dd = String(parsed.day).padStart(2, '0');
    return `${currentYear}-${mm}-${dd}`;
  });
}

