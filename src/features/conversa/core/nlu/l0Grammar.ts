/**
 * L0 Grammar — Parser Determinístico pt-BR (Custo 0, Determinismo Total)
 *
 * Reconhece intenções, datas relativas/absolutas, tipos de partes, formulários S-n
 * e entidades a partir de padrões gramaticais rígidos e dicionários semânticos.
 */

import type { ConversaIntentId } from '../intentCatalog';

export interface ParsedSlots {
  personName?: string;
  weekId?: string;
  month?: string;
  partType?: string;
  startDate?: string;
  endDate?: string;
  targetDate?: string;
  reason?: string;
  section?: string;
  ruleName?: string;
  ruleId?: string;
  choiceIndex?: number;
  confirmation?: 'yes' | 'no';
}

export interface L0ParseResult {
  intentId: ConversaIntentId | null;
  slots: ParsedSlots;
  confidence: number;
  resolvedBy: 'l0-grammar';
  rawText: string;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s\-/]/g, ' ') // remove pontuação exceto hífen e barra
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mapeamento de tipos canônicos de partes
 */
const PART_PATTERNS: Array<{ pattern: RegExp; partType: string }> = [
  { pattern: /\b(leitura(\s+da\s+biblia)?)\b/, partType: 'bible_reading' },
  { pattern: /\b(joias(\s+espirituais)?)\b/, partType: 'spiritual_gems' },
  { pattern: /\b(tesouros(\s+da\s+palavra)?)\b/, partType: 'treasures_talk' },
  { pattern: /\b(iniciando\s+conversas?)\b/, partType: 'starting_conversations' },
  { pattern: /\b(cultivando(\s+o)?\s+interesse)\b/, partType: 'following_up' },
  { pattern: /\b(fazendo\s+discipulos?)\b/, partType: 'making_disciples' },
  { pattern: /\b(explicando\s+crencas?)\b/, partType: 'explaining_beliefs' },
  { pattern: /\b(demonstracao|demonstracoes)\b/, partType: 'student_demo' },
  { pattern: /\b(discurso\s+de\s+estudante|discurso\s+estudante)\b/, partType: 'student_talk' },
  { pattern: /\b(nossa\s+vida\s+crista|vida\s+crista)\b/, partType: 'living_part' },
  { pattern: /\b(necessidades\s+locais)\b/, partType: 'local_needs' },
  { pattern: /\b(estudo\s+biblico(\s+de\s+congregacao)?|ebc)\b/, partType: 'cbs' },
  { pattern: /\b(leitor(\s+do\s+ebc)?)\b/, partType: 'cbs_reader' },
  { pattern: /\b(leitor\s+de\s+a\s+sentinela|leitor\s+sentinela)\b/, partType: 'watchtower_reader' },
  { pattern: /\b(dirigente\s+de\s+a\s+sentinela|dirigente\s+sentinela)\b/, partType: 'watchtower_conductor' },
  { pattern: /\b(presidente|presidencia)\b/, partType: 'chairman' },
  { pattern: /\b(oracao(\s+inicial|\s+final)?)\b/, partType: 'prayer' },
  { pattern: /\b(indicador|indicadores)\b/, partType: 'attendant' },
  { pattern: /\b(audio|video|a\/v|microfone|som)\b/, partType: 'av_audio' },
];

/**
 * Detecta formulários oficiais S-n
 */
function extractFormType(norm: string): 's140' | 's89' | 's4' | 's1' | null {
  if (/\b(s\s*-\s*140|s140|programacao(\s+da\s+reuniao)?)\b/.test(norm)) return 's140';
  if (/\b(s\s*-\s*89|s89|folhinha|designacao(\s+de\s+estudante)?)\b/.test(norm)) return 's89';
  if (/\b(s\s*-\s*4|s4|relatorio(\s+de\s+campo|\s+mensal\s+pessoal)?)\b/.test(norm)) return 's4';
  if (/\b(s\s*-\s*1|s1|fechamento(\s+mensal)?|consolidacao)\b/.test(norm)) return 's1';
  return null;
}

/**
 * Extrai datas relativas ou absolutas no padrão YYYY-MM-DD
 */
function extractDateInfo(norm: string): { weekId?: string; month?: string; startDate?: string; endDate?: string; targetDate?: string } {
  const result: { weekId?: string; month?: string; startDate?: string; endDate?: string; targetDate?: string } = {};

  // Padrão de data completa DD/MM/YYYY: 25/12/2026 -> YYYY-MM-DD
  const fullDateMatch = norm.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (fullDateMatch) {
    const day = fullDateMatch[1].padStart(2, '0');
    const month = fullDateMatch[2].padStart(2, '0');
    const year = fullDateMatch[3];
    const iso = `${year}-${month}-${day}`;
    result.weekId = iso;
    result.startDate = iso;
    result.targetDate = iso;
  } else {
    // Padrão de dia/mês: 20/11
    const dayMonthMatch = norm.match(/\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})\b/);
    if (dayMonthMatch) {
      result.weekId = `${dayMonthMatch[1].padStart(2, '0')}/${dayMonthMatch[2].padStart(2, '0')}`;
    } else {
      const dayMatch = norm.match(/\bdia\s+(\d{1,2})\b/);
      if (dayMatch) {
        result.weekId = `dia-${dayMatch[1]}`;
      }
    }
  }

  // Padrão de intervalo: de 18 a 25 / de 10/11 a 20/11
  const rangeMatch = norm.match(/\bde\s+(\d{1,2}(?:\/\d{1,2})?)\s+a\s+(\d{1,2}(?:\/\d{1,2}(?:\/\d{4})?)?)\b/);
  if (rangeMatch) {
    result.startDate = rangeMatch[1];
    result.endDate = rangeMatch[2];
  }

  // Padrões relativos de semana
  if (/\b(esta\s+semana|essa\s+semana|semana\s+atual)\b/.test(norm)) {
    result.weekId = 'current-week';
  } else if (/\b(proxima\s+semana|semana\s+que\s+vem)\b/.test(norm)) {
    result.weekId = 'next-week';
  } else if (/\b(semana\s+passada)\b/.test(norm)) {
    result.weekId = 'previous-week';
  }

  // Meses por extenso
  const monthMatch = norm.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  if (monthMatch) {
    result.month = monthMatch[1];
  } else if (/\b(este\s+mes|mes\s+atual)\b/.test(norm)) {
    result.month = 'current-month';
  } else if (/\b(proximo\s+mes|mes\s+que\s+vem)\b/.test(norm)) {
    result.month = 'next-month';
  }

  return result;
}

/**
 * Extrai possíveis nomes de pessoas após preposições comuns
 */
function extractPotentialPersonName(norm: string): string | undefined {
  // Padrões: da maria, do joao, pelo carlos, irmao pedro, irma ana
  const nameMatch = norm.match(/\b(?:d[ao]|pel[ao]|irm[ao]|com)\s+([a-z]+(?:\s+[a-z]+)?)\b/);
  if (nameMatch) {
    const candidate = nameMatch[1].trim();
    // Excluir falsos positivos conhecidos
    const stopWords = ['semana', 'leitura', 'estudo', 'reuniao', 'mes', 'dia', 'joias', 'tesouros', 'campo', 'relatorio'];
    if (!stopWords.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Função principal do analisador L0
 */
export function parseL0Grammar(rawText: string): L0ParseResult {
  const norm = normalizeText(rawText);
  const slots: ParsedSlots = {};

  // Resposta rápida numérica de clarificação ("1", "2", "3", "opcao 1", "o segundo", etc.)
  const ordinalMatch = norm.match(/\b(?:opcao\s+(\d+)|(primeiro|segundo|terceiro|quarto|quinto)|^([1-9])$)\b/);
  if (ordinalMatch) {
    let index = 0;
    if (ordinalMatch[1]) {
      index = parseInt(ordinalMatch[1], 10) - 1;
    } else if (ordinalMatch[3]) {
      index = parseInt(ordinalMatch[3], 10) - 1;
    } else if (ordinalMatch[2] === 'primeiro') {
      index = 0;
    } else if (ordinalMatch[2] === 'segundo') {
      index = 1;
    } else if (ordinalMatch[2] === 'terceiro') {
      index = 2;
    } else if (ordinalMatch[2] === 'quarto') {
      index = 3;
    } else if (ordinalMatch[2] === 'quinto') {
      index = 4;
    }
    return {
      intentId: 'clarify-ambiguity',
      slots: { choiceIndex: index },
      confidence: 1.0,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // Confirmação / Cancelamento rápido ("sim", "nao", "ok", "confirmo")
  if (/^(sim|s|ok|confirmar|confirmo|pode\s+ser|beleza)$/.test(norm)) {
    return {
      intentId: 'clarify-ambiguity',
      slots: { confirmation: 'yes' },
      confidence: 1.0,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }
  if (/^(nao|n|cancelar|cancela|esquece|deixa)$/.test(norm)) {
    return {
      intentId: 'clarify-ambiguity',
      slots: { confirmation: 'no' },
      confidence: 1.0,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // Extrair tipo de parte
  for (const { pattern, partType } of PART_PATTERNS) {
    if (pattern.test(norm)) {
      slots.partType = partType;
      break;
    }
  }

  // Extrair datas e formulários
  const dateInfo = extractDateInfo(norm);
  Object.assign(slots, dateInfo);
  const form = extractFormType(norm);
  const person = extractPotentialPersonName(norm);
  if (person) slots.personName = person;

  // 1. Desfazer
  if (/\b(desfaz|desfazer|voltar\s+atras|cancelar\s+alteracao)\b/.test(norm)) {
    return {
      intentId: 'undo-last-action',
      slots,
      confidence: 1.0,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 2. Registro de Ausência
  if (/\b(vou\s+viajar|viajarei|estarei\s+fora|ausente|ausencia|nao\s+poderei|nao\s+vou\s+poder)\b/.test(norm) && (slots.startDate || slots.weekId || slots.month)) {
    return {
      intentId: 'register-absence',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 3. Documentos Oficiais (S-140, S-89, S-4, S-1)
  if (form === 's140') {
    return {
      intentId: 'view-s140',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }
  if (form === 's89') {
    return {
      intentId: 'view-s89',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }
  if (form === 's4') {
    return {
      intentId: 'view-s4',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }
  if (form === 's1') {
    return {
      intentId: 'view-s1-consolidation',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 4. Minhas designações
  if (/\b(minhas?\s+designac(?:ao|oes)|minhas?\s+partes?|o\s+que\s+eu\s+tenho|minha\s+proxima\s+parte)\b/.test(norm)) {
    return {
      intentId: 'query-my-assignments',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 5. Partes vagas / pendentes
  if (/\b(vagas?|vagos?|sem\s+designac(?:ao|oes)|partes?\s+(estao\s+)?(vagas?|pendentes?)|o\s+que\s+falta\s+preencher|tem\s+(alguma\s+)?vaga)\b/.test(norm)) {
    return {
      intentId: 'query-vacant-parts',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 6. Última participação
  if (/\b(quando\s+.*participou|ultima\s+vez|quando\s+foi\s+a\s+ultima)\b/.test(norm)) {
    return {
      intentId: 'query-last-participation',
      slots,
      confidence: 0.9,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 7. Elegibilidade
  if (/\b(pode\s+fazer|e\s+elegivel|esta\s+apto|qualificad[ao])\b/.test(norm)) {
    return {
      intentId: 'query-eligibility',
      slots,
      confidence: 0.9,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 8. Semanas pendentes
  if (/\b(semanas?\s+pendentes?|nao\s+foram\s+publicadas?|rascunhos?|semanas?\s+abertas?)\b/.test(norm)) {
    return {
      intentId: 'query-pending-weeks',
      slots,
      confidence: 0.9,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 9. Explicação de ranking / desempate
  if (/\b(por\s*que\s+.*escolhido|como\s+foi\s+calculad[ao]|criterio\s+de\s+desempate|por\s*que\s+nao\s+o)\b/.test(norm)) {
    return {
      intentId: 'explain-ranking',
      slots,
      confidence: 0.9,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 10. Regras teocráticas / motor
  if (/\b(regra|regras|como\s+funciona\s+o\s+rodizio|o\s+que\s+diz\s+o\s+s\s*-\s*38|aquiescencia\s+tacita|intervalo\s+entre\s+partes|por\s*que\s+nao\s+posso\s+designar)\b/.test(norm)) {
    let ruleName = slots.ruleName;
    let ruleId: string | undefined = undefined;
    if (/\boracao\b/.test(norm)) {
      ruleName = 'oracao';
      ruleId = 'oracao';
    } else if (/\bpresidente\b/.test(norm)) {
      ruleName = 'presidente';
      ruleId = 'presidente';
    } else if (/\bintervalo\b/.test(norm)) {
      ruleName = 'intervalo';
      ruleId = 'intervalo';
    } else if (/\bgenero|irmao|irma\b/.test(norm)) {
      ruleName = 'genero';
      ruleId = 'genero';
    }
    slots.ruleName = ruleName;
    slots.ruleId = ruleId;

    return {
      intentId: 'explain-engine-rules',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 11. Substituição / Reatribuição
  if (/\b(troca\s+o|trocar|substituir|mudar\s+designad[ao])\b/.test(norm)) {
    return {
      intentId: 'reassign-part-assignee',
      slots,
      confidence: 0.85,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 12. Aprovar semana
  if (/\b(aprova\s+a\s+semana|aprovar\s+semana|aprovar\s+rascunho)\b/.test(norm)) {
    return {
      intentId: 'approve-week-proposal',
      slots,
      confidence: 0.9,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 13. Designações da semana / programa da reunião
  if (/\b(quem\s+faz|quem\s+esta\s+escalad[ao]|quem\s+e\s+o|designac(?:ao|oes)\s+da\s+semana|o\s+que\s+tem\s+(na\s+reuniao|hoje|essa\s+semana|no\s+programa)|quais\s+(as\s+)?partes(\s+da\s+reuniao|\s+do\s+programa)?|programa\s+da\s+reuniao|o\s+que\s+tem\s+dia)\b/.test(norm)) {
    return {
      intentId: 'query-week-assignments',
      slots,
      confidence: 0.9,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 14. Briefing e pendências
  if (/\b(pendencias?|briefing|o\s+que\s+tenho\s+(que|a)\s+fazer|o\s+que\s+preciso\s+fazer)\b/.test(norm)) {
    return {
      intentId: 'proactive-briefing',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // 15. Status de sincronização externa
  if (/\b(sincronizacao|sync|como\s+esta\s+a\s+sincronizacao|status\s+da\s+sincronizacao)\b/.test(norm)) {
    return {
      intentId: 'query-sync-status',
      slots,
      confidence: 0.95,
      resolvedBy: 'l0-grammar',
      rawText,
    };
  }

  // Se não foi possível mapear categoricamente em L0
  return {
    intentId: null,
    slots,
    confidence: 0.0,
    resolvedBy: 'l0-grammar',
    rawText,
  };
}
