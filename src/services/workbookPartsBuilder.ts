// workbookPartsBuilder.ts
// Centraliza montagem de partes da apostila, inserção de partes automáticas e cálculo de horários
//
// REGRAS DE COMPOSIÇÃO (refinadas):
//
// ESTRUTURA CANÔNICA DA REUNIÃO:
//   1. Cântico Inicial (número da apostila)
//   2. Oração Inicial (presidente)
//   3. Comentários Iniciais (presidente, 1 min)
//   4-N. Partes de Tesouros da Palavra de Deus
//   N+1-M. Partes de Faça Seu Melhor no Ministério
//   M+1. Cântico do Meio (número da apostila) ← ENTRE Ministério e Vida Cristã
//   M+2-P. Partes de Nossa Vida Cristã
//   P+1. Comentários Finais (presidente, 3 min)
//   P+2. Oração Final
//   P+3. Cântico Final (número da apostila)
//
// POSICIONAMENTO DO CÂNTICO DO MEIO:
//   O Cântico do Meio é inserido ENTRE a última parte de "Faça Seu Melhor no Ministério"
//   e a primeira parte de "Nossa Vida Cristã". Isso é garantido pelo builder,
//   independente da ordem em que as partes chegam do parser.
//
// CÂNTICOS:
//   Os 3 números de cântico (inicial, meio, final) são passados via options.
//   Se não fornecidos, tituloParte fica vazio (a ser preenchido manualmente).

import type { WorkbookExcelRow } from '../services/workbookService';

/**
 * Recebe partes "cruas" (de Excel, PDF, jw.org) e retorna lista completa:
 * - Insere partes automáticas (cânticos, orações, comentários)
 * - Posiciona o Cântico do Meio na posição canônica
 * - Calcula horários de início/fim
 * - Normaliza estrutura
 */
export function buildWorkbookParts(rawParts: WorkbookExcelRow[], options?: {
  presidente?: string;
  horaInicioReuniao?: string; // Ex: '19:30'
  incluirComentarios?: boolean;
  incluirOracoes?: boolean;
  incluirCanticos?: boolean;
  canticoInicial?: number;
  canticoMeio?: number;
  canticoFinal?: number;
}): WorkbookExcelRow[] {
  // Configurações padrão
  const horaInicio = options?.horaInicioReuniao || '19:30';
  const incluirComentarios = options?.incluirComentarios ?? true;
  const incluirOracoes = options?.incluirOracoes ?? true;
  const incluirCanticos = options?.incluirCanticos ?? true;
  const presidente = options?.presidente || '';

  // Ordenar partes principais por seq original
  const partesPrincipais = [...rawParts].sort((a, b) => a.seq - b.seq);

  // Separar partes por seção para garantir ordem canônica
  // Remover qualquer Cântico do Meio que tenha vindo do parser (builder cuida)
  const partesTesourosMinist: WorkbookExcelRow[] = [];
  const partesVidaCrista: WorkbookExcelRow[] = [];

  for (const p of partesPrincipais) {
    const lower = p.tipoParte.toLowerCase();
    // Ignorar cântico do meio (builder insere na posição canônica)
    if (lower === 'cântico do meio' || lower === 'cantico do meio') continue;

    if (p.section === 'Nossa Vida Cristã') {
      partesVidaCrista.push(p);
    } else {
      partesTesourosMinist.push(p);
    }
  }

  // Construir lista final na ordem canônica
  const partesCompletas: WorkbookExcelRow[] = [];
  let seq = 1;

  const meta = {
    weekId: partesPrincipais[0]?.weekId || '',
    weekDisplay: partesPrincipais[0]?.weekDisplay || '',
    date: partesPrincipais[0]?.date || '',
  };

  // ─── INÍCIO DA REUNIÃO ───────────────────────────────

  // Cântico Inicial
  if (incluirCanticos) {
    partesCompletas.push({
      ...meta,
      section: 'Início da Reunião',
      tipoParte: 'Cântico Inicial',
      modalidade: 'Cântico',
      tituloParte: options?.canticoInicial ? `Cântico ${options.canticoInicial}` : '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '3',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: '',
      status: 'PENDENTE',
    });
  }

  // Oração Inicial
  if (incluirOracoes) {
    partesCompletas.push({
      ...meta,
      section: 'Início da Reunião',
      tipoParte: 'Oração Inicial',
      modalidade: 'Oração',
      tituloParte: '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '2',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: presidente,
      status: 'PENDENTE',
    });
  }

  // Comentários Iniciais
  if (incluirComentarios) {
    partesCompletas.push({
      ...meta,
      section: 'Início da Reunião',
      tipoParte: 'Comentários Iniciais',
      modalidade: 'Presidência',
      tituloParte: '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '1',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: presidente,
      status: 'PENDENTE',
    });
  }

  // ─── TESOUROS + MINISTÉRIO (partes do parser, na ordem) ──────
  for (const p of partesTesourosMinist) {
    partesCompletas.push({ ...p, seq: seq++ });
  }

  // ─── CÂNTICO DO MEIO (posição canônica: entre Ministério e Vida Cristã) ──
  if (incluirCanticos) {
    partesCompletas.push({
      ...meta,
      section: 'Nossa Vida Cristã',
      tipoParte: 'Cântico do Meio',
      modalidade: 'Cântico',
      tituloParte: options?.canticoMeio ? `Cântico ${options.canticoMeio}` : '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '3',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: '',
      status: 'PENDENTE',
    });
  }

  // ─── VIDA CRISTÃ (partes do parser, na ordem) ────────────────
  for (const p of partesVidaCrista) {
    partesCompletas.push({ ...p, seq: seq++ });
  }

  // ─── FINAL DA REUNIÃO ────────────────────────────────

  // Comentários Finais
  if (incluirComentarios) {
    partesCompletas.push({
      ...meta,
      section: 'Final da Reunião',
      tipoParte: 'Comentários Finais',
      modalidade: 'Presidência',
      tituloParte: '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '3',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: presidente,
      status: 'PENDENTE',
    });
  }

  // Oração Final
  if (incluirOracoes) {
    partesCompletas.push({
      ...meta,
      section: 'Final da Reunião',
      tipoParte: 'Oração Final',
      modalidade: 'Oração',
      tituloParte: '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '2',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: '',
      status: 'PENDENTE',
    });
  }

  // Cântico Final
  if (incluirCanticos) {
    partesCompletas.push({
      ...meta,
      section: 'Final da Reunião',
      tipoParte: 'Cântico Final',
      modalidade: 'Cântico',
      tituloParte: options?.canticoFinal ? `Cântico ${options.canticoFinal}` : '',
      descricaoParte: '',
      detalhesParte: '',
      seq: seq++,
      funcao: 'Titular',
      duracao: '3',
      horaInicio: '',
      horaFim: '',
      rawPublisherName: '',
      status: 'PENDENTE',
    });
  }

  // ─── CÁLCULO DE HORÁRIOS ─────────────────────────────
  let minutos = parseTimeToMinutes(horaInicio);
  for (const parte of partesCompletas) {
    parte.horaInicio = minutesToTime(minutos);
    const dur = parseInt(parte.duracao.replace(/[^0-9]/g, ''), 10) || 0;
    minutos += dur;
    parte.horaFim = minutesToTime(minutos);
  }

  return partesCompletas;
}

// Helpers de tempo (copiados do workbookService)
function parseTimeToMinutes(time: string): number {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + (minutes || 0);
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let h = hours % 24;
  return `${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
