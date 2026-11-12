/**
 * Formatação pura de datas no padrão canônico brasileiro DD/MM/AAAA (zero dependências).
 */
export function formatDateBr(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const ym = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (ym) return `${ym[2]}/${ym[1]}`;
  return trimmed;
}
