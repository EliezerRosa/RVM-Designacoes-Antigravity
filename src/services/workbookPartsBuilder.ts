// workbookPartsBuilder.ts
// Centraliza montagem de partes da apostila, inserção de partes automáticas e cálculo de horários

import type { WorkbookExcelRow } from '../services/workbookService';

/**
 * Recebe partes "cruas" (de Excel, PDF, jw.org) e retorna lista completa:
 * - Insere partes automáticas (cânticos, orações, comentários)
 * - Calcula horários de início/fim
 * - Normaliza estrutura
 */
export function buildWorkbookParts(rawParts: WorkbookExcelRow[], options?: {
  presidente?: string;
  horaInicioReuniao?: string; // Ex: '19:30'
  incluirComentarios?: boolean;
  incluirOracoes?: boolean;
  incluirCanticos?: boolean;
}): WorkbookExcelRow[] {
  // Configurações padrão
  const horaInicio = options?.horaInicioReuniao || '19:30';
  const incluirComentarios = options?.incluirComentarios ?? true;
  const incluirOracoes = options?.incluirOracoes ?? true;
  const incluirCanticos = options?.incluirCanticos ?? true;
  const presidente = options?.presidente || '';

  // Ordenar partes principais por seq
  const partesPrincipais = [...rawParts].sort((a, b) => a.seq - b.seq);

  // Inserir partes automáticas (exemplo simplificado)
  const partesCompletas: WorkbookExcelRow[] = [];
  let seq = 1;

  // Cântico Inicial
  if (incluirCanticos) {
    partesCompletas.push({
      weekId: partesPrincipais[0]?.weekId || '',
      weekDisplay: partesPrincipais[0]?.weekDisplay || '',
      date: partesPrincipais[0]?.date || '',
      section: 'Início da Reunião',
      tipoParte: 'Cântico Inicial',
      modalidade: 'Cântico',
      tituloParte: '',
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
      weekId: partesPrincipais[0]?.weekId || '',
      weekDisplay: partesPrincipais[0]?.weekDisplay || '',
      date: partesPrincipais[0]?.date || '',
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
      weekId: partesPrincipais[0]?.weekId || '',
      weekDisplay: partesPrincipais[0]?.weekDisplay || '',
      date: partesPrincipais[0]?.date || '',
      section: 'Início da Reunião',
      tipoParte: 'Comentários Iniciais',
      modalidade: 'Presidência',
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

  // Adicionar partes principais (ajustando seq)
  for (const p of partesPrincipais) {
    partesCompletas.push({ ...p, seq: seq++ });
  }

  // Comentários Finais
  if (incluirComentarios) {
    partesCompletas.push({
      weekId: partesPrincipais[0]?.weekId || '',
      weekDisplay: partesPrincipais[0]?.weekDisplay || '',
      date: partesPrincipais[0]?.date || '',
      section: 'Final da Reunião',
      tipoParte: 'Comentários Finais',
      modalidade: 'Presidência',
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

  // Oração Final
  if (incluirOracoes) {
    partesCompletas.push({
      weekId: partesPrincipais[0]?.weekId || '',
      weekDisplay: partesPrincipais[0]?.weekDisplay || '',
      date: partesPrincipais[0]?.date || '',
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
      weekId: partesPrincipais[0]?.weekId || '',
      weekDisplay: partesPrincipais[0]?.weekDisplay || '',
      date: partesPrincipais[0]?.date || '',
      section: 'Final da Reunião',
      tipoParte: 'Cântico Final',
      modalidade: 'Cântico',
      tituloParte: '',
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

  // Cálculo de horários
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
