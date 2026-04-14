/**
 * S-140 Template-Model — Modelo Canônico da Reunião do Meio de Semana (RVMC)
 * 
 * Define a estrutura obrigatória, partes fixas e variáveis, regras de composição,
 * e validação para a programação S-140.
 * 
 * FONTE DE VERDADE CENTRAL para:
 * - Composição da reunião (quais partes, em que ordem)
 * - Partes auto-inseridas vs. extraídas da apostila
 * - Validação de consistência estrutural
 * - Layout do S-140 (seções, sub-headers Sala B)
 * - Classificação de designabilidade (quem pode ser designado)
 */

import { EnumSecao, EnumTipoParte, EnumModalidade } from '../types';

// ============================================================================
// 1. DEFINIÇÃO DE PARTE DO TEMPLATE
// ============================================================================

export type PartOrigin = 'AUTO' | 'APOSTILA' | 'DERIVED';
// AUTO     = Inserida automaticamente pelo sistema (cânticos iniciais/finais, orações, comentários)
// APOSTILA = Extraída do HTML da apostila jw.org (partes numeradas H3)
// DERIVED  = Derivada de outra parte (ex: Leitor EBC derivado de Dirigente EBC, Ajudante derivado de Titular)

export type DesignationType = 'NON_ASSIGNABLE' | 'AUTO_CHAIRMAN' | 'MANUAL' | 'MANUAL_PAIR';
// NON_ASSIGNABLE = Não recebe designação (cânticos)
// AUTO_CHAIRMAN  = Auto-atribuído ao presidente (oração inicial, comentários, elogios)
// MANUAL         = Designação manual via motor de rotação (discursos, leituras, etc.)
// MANUAL_PAIR    = Designação manual com par (titular + ajudante) — demonstrações

export interface S140TemplatePart {
  /** Posição sequencial fixa no template (1-based) */
  templateSeq: number;

  /** Seção da reunião */
  section: EnumSecao;

  /** Tipo da parte (identificador interno — usado no código e no banco) */
  tipoParte: string;

  /**
   * Nome oficial da parte como aparece no programa da reunião.
   * Distinção semântica: tipoParte='Dirigente EBC' mas programName='Estudo Bíblico de Congregação'.
   * Quando ausente, usa tipoParte como fallback.
   */
  programName?: string;

  /** Modalidade de execução */
  modalidade: string;

  /** Origem da parte */
  origin: PartOrigin;

  /** Tipo de designação */
  designationType: DesignationType;

  /** Frequência de ocorrência (default: 'EVERY_WEEK') */
  frequency?: 'EVERY_WEEK' | 'MOST_WEEKS' | 'OCCASIONAL' | 'VARIABLE';

  /** Duração padrão em minutos (0 = variável, vem da apostila) */
  defaultDuration: number;

  /** Parte obrigatória na reunião? */
  mandatory: boolean;

  /** Visível no S-140 PDF? */
  visibleInS140: boolean;

  /** Mostra nome do designado no S-140? */
  showAssigneeInS140: boolean;

  /** Tem coluna Sala B no S-140? */
  hasSalaBColumn: boolean;

  /** Pode ter Ajudante? */
  canHaveHelper: boolean;

  /** Funcao padrão */
  funcao: 'Titular' | 'Ajudante';

  /** rawPublisherName padrão (ex: 'presidente' para auto-chairman parts) */
  defaultPublisher: string;

  /** Descrição para documentação/debug */
  description: string;
}

// ============================================================================
// 2. TEMPLATE COMPLETO DA REUNIÃO RVMC (MEIO DE SEMANA)
// ============================================================================

/**
 * Estrutura fixa da reunião do meio de semana.
 * 
 * Blocos AUTO (início) → APOSTILA (variáveis) → AUTO (fim)
 * 
 * As partes com origin='APOSTILA' são SLOTS que serão preenchidos
 * pelo conteúdo real extraído do jw.org. Representam a estrutura
 * ESPERADA — a quantidade real pode variar semana a semana.
 */
export const S140_TEMPLATE: S140TemplatePart[] = [
  // ─── INÍCIO DA REUNIÃO (AUTO) ─────────────────────────────────
  {
    templateSeq: 0,
    section: EnumSecao.INICIO_REUNIAO,
    tipoParte: EnumTipoParte.PRESIDENTE,
    modalidade: EnumModalidade.PRESIDENCIA,
    origin: 'AUTO',
    designationType: 'MANUAL',
    defaultDuration: 0,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Presidente da reunião — renderizado na linha da data (extrema direita), não como linha da tabela.',
  },
  {
    templateSeq: 1,
    section: EnumSecao.INICIO_REUNIAO,
    tipoParte: EnumTipoParte.CANTICO_INICIAL,
    modalidade: EnumModalidade.CANTICO,
    origin: 'AUTO',
    designationType: 'NON_ASSIGNABLE',
    defaultDuration: 3,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Cântico de abertura — número extraído da apostila',
  },
  {
    templateSeq: 2,
    section: EnumSecao.INICIO_REUNIAO,
    tipoParte: EnumTipoParte.ORACAO_INICIAL,
    modalidade: EnumModalidade.ORACAO,
    origin: 'AUTO',
    designationType: 'AUTO_CHAIRMAN',
    defaultDuration: 2,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: 'presidente',
    description: 'Oração de abertura — nome implícito (presidente), já visível na linha da data.',
    // NOTA: showAssigneeInS140=false porque o presidente já é exibido na linha da data acima.
  },
  {
    templateSeq: 3,
    section: EnumSecao.INICIO_REUNIAO,
    tipoParte: EnumTipoParte.COMENTARIOS_INICIAIS,
    modalidade: EnumModalidade.PRESIDENCIA,
    origin: 'AUTO',
    designationType: 'AUTO_CHAIRMAN',
    defaultDuration: 2,
    mandatory: true,
    visibleInS140: false,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: 'presidente',
    description: 'Comentários iniciais do presidente (1 min)',
  },

  // ─── TESOUROS DA PALAVRA DE DEUS (APOSTILA) ───────────────────
  {
    templateSeq: 4,
    section: EnumSecao.TESOUROS,
    tipoParte: 'Discurso Tesouros',
    modalidade: EnumModalidade.DISCURSO_ENSINO,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    defaultDuration: 10,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Discurso principal de Tesouros (10 min) — só irmãos anciãos/SMs',
  },
  {
    templateSeq: 5,
    section: EnumSecao.TESOUROS,
    tipoParte: 'Joias Espirituais',
    modalidade: EnumModalidade.DISCURSO_ENSINO,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    defaultDuration: 10,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Joias Espirituais (10 min) — só irmãos',
  },
  {
    templateSeq: 6,
    section: EnumSecao.TESOUROS,
    tipoParte: 'Leitura da Bíblia',
    modalidade: EnumModalidade.LEITURA_ESTUDANTE,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    defaultDuration: 4,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: true,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Leitura da Bíblia (4 min) — estudante irmão, tem Sala B',
  },

  // ─── FAÇA SEU MELHOR NO MINISTÉRIO (APOSTILA — toda semana, geralmente 3, eventualmente 4 partes) ──
  //
  // Partes presentes toda semana. Na maioria das vezes são 3, eventualmente 4.
  // "Explicando Suas Crenças" pode ser demonstração (titular+ajudante) OU discurso (só titular).
  {
    templateSeq: 7,
    section: EnumSecao.MINISTERIO,
    tipoParte: 'Iniciando Conversas',
    modalidade: EnumModalidade.DEMONSTRACAO,
    origin: 'APOSTILA',
    designationType: 'MANUAL_PAIR',
    frequency: 'MOST_WEEKS',
    defaultDuration: 3,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: true,
    canHaveHelper: true,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Demonstração — Iniciando Conversas (titular + ajudante)',
  },
  {
    templateSeq: 8,
    section: EnumSecao.MINISTERIO,
    tipoParte: 'Cultivando o Interesse',
    modalidade: EnumModalidade.DEMONSTRACAO,
    origin: 'APOSTILA',
    designationType: 'MANUAL_PAIR',
    frequency: 'MOST_WEEKS',
    defaultDuration: 4,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: true,
    canHaveHelper: true,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Demonstração — Cultivando o Interesse (titular + ajudante)',
  },
  {
    templateSeq: 9,
    section: EnumSecao.MINISTERIO,
    tipoParte: 'Fazendo Discípulos',
    modalidade: EnumModalidade.DEMONSTRACAO,
    origin: 'APOSTILA',
    designationType: 'MANUAL_PAIR',
    frequency: 'MOST_WEEKS',
    defaultDuration: 5,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: true,
    canHaveHelper: true,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Demonstração — Fazendo Discípulos (titular + ajudante)',
  },
  {
    templateSeq: 10,
    section: EnumSecao.MINISTERIO,
    tipoParte: 'Explicando Suas Crenças',
    modalidade: EnumModalidade.DEMONSTRACAO, // Pode ser DEMONSTRACAO (par) ou DISCURSO_ESTUDANTE (solo)
    origin: 'APOSTILA',
    designationType: 'MANUAL_PAIR', // Efetivo em runtime: se apostila indica discurso, canHaveHelper=false
    frequency: 'OCCASIONAL', // 4ª parte eventual
    defaultDuration: 5,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: true,
    canHaveHelper: true, // true quando demonstração, false quando discurso (resolvido no parse)
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Explicando Suas Crenças — pode ser demonstração (titular+ajudante) OU discurso (só titular). Formato definido pela apostila da semana.',
  },
  {
    templateSeq: 10.1,
    section: EnumSecao.MINISTERIO,
    tipoParte: 'Discurso de Estudante',
    modalidade: EnumModalidade.DISCURSO_ESTUDANTE,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    frequency: 'OCCASIONAL',
    defaultDuration: 5,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: true,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Discurso de estudante (solo, sem ajudante) — só varões. Alternativa a Explicando Suas Crenças quando a apostila indica formato discurso.',
  },

  // ─── ELOGIOS E CONSELHOS (AUTO — dinâmico, após cada parte de estudante) ──
  {
    templateSeq: 90,
    section: EnumSecao.MINISTERIO,
    tipoParte: EnumTipoParte.ELOGIOS_CONSELHOS,
    modalidade: EnumModalidade.ACONSELHAMENTO,
    origin: 'AUTO',
    designationType: 'AUTO_CHAIRMAN',
    frequency: 'EVERY_WEEK',
    defaultDuration: 1,
    mandatory: true,
    visibleInS140: false,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: 'presidente',
    description: 'Elogios e conselhos do presidente após cada parte de estudante (~4x por reunião, 1 min cada). Não visível no S-140, mas soma ao cálculo de horários.',
  },

  // ─── CÂNTICO DO MEIO (marca transição Ministério → Vida Cristã) ──
  {
    templateSeq: 11,
    section: EnumSecao.VIDA_CRISTA,
    tipoParte: EnumTipoParte.CANTICO_MEIO,
    modalidade: EnumModalidade.CANTICO,
    origin: 'APOSTILA', // Número do cântico vem da apostila, mas posição é fixa
    designationType: 'NON_ASSIGNABLE',
    frequency: 'EVERY_WEEK',
    defaultDuration: 3,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Cântico do meio — marca transição para Nossa Vida Cristã',
  },

  // ─── NOSSA VIDA CRISTÃ (APOSTILA — composição variável) ────────
  //
  // Estrutura real da seção Vida Cristã:
  //   Cântico do Meio → [1-2 Partes variáveis*] → [Necessidades Locais?] → EBC
  //
  // * Partes variáveis: discursos, considerações, vídeos (da Apostila ou Manual),
  //   ou partes inseridas via funcionalidade de Eventos Especiais.
  //   Podem ser 0, 1 ou 2 por semana.
  //
  // Necessidades Locais: ocorre apenas 1-2x por mês.

  {
    templateSeq: 12,
    section: EnumSecao.VIDA_CRISTA,
    tipoParte: 'Parte Vida Cristã',
    programName: 'Parte variável — Nossa Vida Cristã',
    modalidade: EnumModalidade.DISCURSO_ENSINO,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    frequency: 'VARIABLE', // 0-2 por semana, depende da apostila
    defaultDuration: 15,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Discurso, consideração ou vídeo da apostila/manual — só irmãos. Pode haver 0, 1 ou 2 por semana.',
  },
  {
    templateSeq: 13,
    section: EnumSecao.VIDA_CRISTA,
    tipoParte: 'Necessidades Locais',
    modalidade: EnumModalidade.NECESSIDADES_LOCAIS,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    frequency: 'OCCASIONAL', // 1-2 vezes por mês
    defaultDuration: 15,
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Necessidades Locais — só anciãos. Ocorre 1-2x por mês, não toda semana.',
  },
  {
    templateSeq: 14,
    section: EnumSecao.VIDA_CRISTA,
    tipoParte: 'Dirigente EBC',
    programName: 'Estudo Bíblico de Congregação',
    modalidade: EnumModalidade.DIRIGENTE_EBC,
    origin: 'APOSTILA',
    designationType: 'MANUAL',
    frequency: 'MOST_WEEKS',
    defaultDuration: 30,
    mandatory: false, // Ausente em semanas de assembleia/congresso
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Estudo Bíblico de Congregação — designação: Dirigente. "Dirigente EBC" é o role, a parte é "Estudo Bíblico de Congregação".',
  },
  {
    templateSeq: 15,
    section: EnumSecao.VIDA_CRISTA,
    tipoParte: 'Leitor EBC',
    programName: 'Estudo Bíblico de Congregação',
    modalidade: EnumModalidade.LEITOR_EBC,
    origin: 'DERIVED',
    designationType: 'MANUAL',
    frequency: 'MOST_WEEKS',
    defaultDuration: 0,
    // NOTA: Duração 0 = concorrente ao Dirigente EBC (mesmos 30 min, não soma ao total).
    // Não exibe horário nem número sequencial no S-140.
    mandatory: false,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Estudo Bíblico de Congregação — designação: Leitor. Parte derivada do Dirigente EBC.',
  },

  // ─── FINAL DA REUNIÃO (AUTO) ──────────────────────────────────
  {
    templateSeq: 16,
    section: EnumSecao.FINAL_REUNIAO,
    tipoParte: EnumTipoParte.COMENTARIOS_FINAIS,
    modalidade: EnumModalidade.PRESIDENCIA,
    origin: 'AUTO',
    designationType: 'AUTO_CHAIRMAN',
    defaultDuration: 2,
    mandatory: true,
    visibleInS140: false,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: 'presidente',
    description: 'Comentários finais do presidente (3 min)',
  },
  {
    templateSeq: 17,
    section: EnumSecao.FINAL_REUNIAO,
    tipoParte: EnumTipoParte.ORACAO_FINAL,
    modalidade: EnumModalidade.ORACAO,
    origin: 'AUTO',
    designationType: 'MANUAL',
    defaultDuration: 2,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: true,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Oração final — designação manual',
  },
  {
    templateSeq: 18,
    section: EnumSecao.FINAL_REUNIAO,
    tipoParte: EnumTipoParte.CANTICO_FINAL,
    modalidade: EnumModalidade.CANTICO,
    origin: 'AUTO',
    designationType: 'NON_ASSIGNABLE',
    defaultDuration: 3,
    mandatory: true,
    visibleInS140: true,
    showAssigneeInS140: false,
    hasSalaBColumn: false,
    canHaveHelper: false,
    funcao: 'Titular',
    defaultPublisher: '',
    description: 'Cântico final',
  },
];

// ============================================================================
// 3. REGRAS DE COMPOSIÇÃO E VALIDAÇÃO
// ============================================================================

/**
 * Regras estruturais da reunião RVMC.
 */
export const S140_RULES = {
  /** Horário padrão de início */
  defaultStartTime: '19:30',

  /** Duração total estimada (minutos) */
  estimatedTotalDuration: 105, // 1h45min

  /** Ordem fixa das seções */
  sectionOrder: [
    EnumSecao.INICIO_REUNIAO,
    EnumSecao.TESOUROS,
    EnumSecao.MINISTERIO,
    EnumSecao.VIDA_CRISTA,
    EnumSecao.FINAL_REUNIAO,
  ] as const,

  /** Número de partes APOSTILA esperadas por seção (contando apenas Titulares) */
  expectedApostilaParts: {
    [EnumSecao.TESOUROS]: { min: 3, max: 3 },       // Discurso + Joias + Leitura (fixo)
    [EnumSecao.MINISTERIO]: { min: 3, max: 4 },      // Geralmente 3 partes, eventualmente 4 (Explicando Suas Crenças)
    [EnumSecao.VIDA_CRISTA]: { min: 2, max: 6 },     // Cântico Meio + [0-2 Partes variáveis] + [Necessidades Locais?] + EBC (Dirigente + Leitor)
  } as Record<string, { min: number; max: number }>,

  /** Partes que marcam transição de seção */
  sectionTransitions: {
    canticoMeio: {
      from: EnumSecao.MINISTERIO,
      to: EnumSecao.VIDA_CRISTA,
    },
  },

  /** Partes AUTO obrigatórias (inseridas pelo builder) */
  autoPartsStart: [
    EnumTipoParte.PRESIDENTE,
    EnumTipoParte.CANTICO_INICIAL,
    EnumTipoParte.ORACAO_INICIAL,
    EnumTipoParte.COMENTARIOS_INICIAIS,
  ],
  autoPartsEnd: [
    EnumTipoParte.COMENTARIOS_FINAIS,
    EnumTipoParte.ORACAO_FINAL,
    EnumTipoParte.CANTICO_FINAL,
  ],

  /** Partes DERIVADAS automaticamente.
   * Nota semântica: 'Dirigente EBC' e 'Leitor EBC' são designações (roles) da parte
   * 'Estudo Bíblico de Congregação'. Mantemos os nomes internos para compatibilidade
   * com o código existente (especialmente s140GeneratorUnified.ts que está perfeito).
   */
  derivedParts: {
    'Dirigente EBC': 'Leitor EBC', // Se há Dirigente, auto-cria Leitor
  } as Record<string, string>,

  /** Partes com par obrigatório (Titular + Ajudante) */
  pairedParts: [
    'Iniciando Conversas',
    'Cultivando o Interesse',
    'Fazendo Discípulos',
    'Explicando Suas Crenças',
  ],

  /** Tipos que NÃO devem ter rawPublisherName após import */
  cleanPublisherParts: [
    EnumTipoParte.CANTICO_INICIAL,
    EnumTipoParte.CANTICO_MEIO,
    EnumTipoParte.CANTICO_FINAL,
  ],

  /** Tipos atribuídos automaticamente ao presidente */
  autoChairmanParts: [
    EnumTipoParte.ORACAO_INICIAL,
    EnumTipoParte.COMENTARIOS_INICIAIS,
    EnumTipoParte.COMENTARIOS_FINAIS,
  ],
} as const;

// ============================================================================
// 4. FUNÇÕES DE VALIDAÇÃO
// ============================================================================

export interface S140ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valida uma lista de partes contra o template S-140.
 * Checa: presença de partes obrigatórias, ordem de seções, partes duplicadas.
 */
export function validateWeekAgainstTemplate(
  parts: Array<{ tipoParte: string; section: string; funcao: string; seq: number }>
): S140ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const titularParts = parts.filter(p => p.funcao === 'Titular');

  // 1. Verificar partes AUTO obrigatórias
  for (const autoPart of [...S140_RULES.autoPartsStart, ...S140_RULES.autoPartsEnd]) {
    const found = titularParts.some(p =>
      p.tipoParte.toLowerCase().trim() === autoPart.toLowerCase().trim()
    );
    if (!found) {
      errors.push(`Parte obrigatória ausente: ${autoPart}`);
    }
  }

  // 2. Verificar ordem de seções
  const sectionOrder = S140_RULES.sectionOrder;
  let lastSectionIndex = -1;
  for (const part of titularParts.sort((a, b) => a.seq - b.seq)) {
    const sectionIndex = sectionOrder.indexOf(part.section as EnumSecao);
    if (sectionIndex >= 0) {
      if (sectionIndex < lastSectionIndex) {
        warnings.push(`Parte "${part.tipoParte}" (seq ${part.seq}) está fora da ordem de seções esperada`);
      }
      lastSectionIndex = Math.max(lastSectionIndex, sectionIndex);
    }
  }

  // 3. Verificar partes duplicadas (mesmo tipoParte + funcao na mesma semana)
  const seen = new Set<string>();
  for (const part of parts) {
    // Cânticos e partes variáveis podem ter multiplos, não verificar duplicação
    if (part.tipoParte.toLowerCase().includes('cântico') || 
        part.tipoParte.toLowerCase().includes('cantico')) continue;
    
    const key = `${part.tipoParte}|${part.funcao}`;
    if (seen.has(key)) {
      warnings.push(`Parte possivelmente duplicada: ${part.tipoParte} (${part.funcao})`);
    }
    seen.add(key);
  }

  // 4. Verificar partes pareadas (Titular sem Ajudante)
  for (const pairedType of S140_RULES.pairedParts) {
    const hasTitular = parts.some(p => 
      p.tipoParte.toLowerCase().includes(pairedType.toLowerCase()) && p.funcao === 'Titular'
    );
    const hasAjudante = parts.some(p =>
      p.tipoParte.toLowerCase().includes(pairedType.toLowerCase()) && p.funcao === 'Ajudante'
    );
    if (hasTitular && !hasAjudante) {
      warnings.push(`Parte "${pairedType}" tem Titular mas não tem Ajudante`);
    }
  }

  // 5. Verificar derivadas (Dirigente EBC sem Leitor EBC)
  for (const [source, derived] of Object.entries(S140_RULES.derivedParts)) {
    const hasSource = titularParts.some(p => p.tipoParte === source);
    const hasDerived = titularParts.some(p => p.tipoParte === derived);
    if (hasSource && !hasDerived) {
      errors.push(`Parte derivada ausente: "${derived}" (requerida por "${source}")`);
    }
  }

  // 6. Verificar Cântico do Meio
  const hasCanticoMeio = parts.some(p =>
    p.tipoParte.toLowerCase().includes('cântico do meio') || 
    p.tipoParte.toLowerCase().includes('cantico do meio')
  );
  if (!hasCanticoMeio) {
    // Verificar se existe algum cântico que não seja inicial ou final (pode ser o do meio)
    const possibleMiddleSong = parts.some(p => {
      const t = p.tipoParte.toLowerCase();
      return (t.includes('cântico') || t.includes('cantico')) &&
        !t.includes('inicial') && !t.includes('final');
    });
    if (!possibleMiddleSong) {
      warnings.push('Cântico do Meio não encontrado — verifique se a apostila contém o cântico intermediário');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 5. HELPERS — Busca no Template
// ============================================================================

/** Retorna definição do template para um tipo de parte */
export function getTemplateForTipo(tipoParte: string): S140TemplatePart | undefined {
  return S140_TEMPLATE.find(t =>
    t.tipoParte.toLowerCase().trim() === tipoParte.toLowerCase().trim()
  );
}

/** Retorna todas as partes AUTO do template */
export function getAutoTemplateParts(): S140TemplatePart[] {
  return S140_TEMPLATE.filter(t => t.origin === 'AUTO');
}

/** Retorna todas as partes APOSTILA do template */
export function getApostilaTemplateParts(): S140TemplatePart[] {
  return S140_TEMPLATE.filter(t => t.origin === 'APOSTILA');
}

/** Verifica se um tipo de parte é designável manualmente */
export function isManuallyAssignable(tipoParte: string): boolean {
  const template = getTemplateForTipo(tipoParte);
  if (!template) return true; // Partes desconhecidas são designáveis por padrão
  return template.designationType === 'MANUAL' || template.designationType === 'MANUAL_PAIR';
}

/** Retorna a seção esperada para um tipo de parte */
export function getExpectedSection(tipoParte: string): EnumSecao | undefined {
  const template = getTemplateForTipo(tipoParte);
  return template?.section as EnumSecao | undefined;
}

/**
 * Retorna o nome oficial da parte no programa da reunião.
 * Ex: tipoParte='Dirigente EBC' → 'Estudo Bíblico de Congregação'
 * Ex: tipoParte='Leitor EBC' → 'Estudo Bíblico de Congregação'
 * Ex: tipoParte='Leitura da Bíblia' → 'Leitura da Bíblia' (sem programName, usa tipoParte)
 */
export function getProgramName(tipoParte: string): string {
  const template = getTemplateForTipo(tipoParte);
  return template?.programName || tipoParte;
}

/**
 * Verifica se uma parte é da seção Vida Cristã com conteúdo variável
 * (discurso, consideração, vídeo — NÃO inclui EBC nem Necessidades Locais).
 */
export function isVariableVidaCristaPart(tipoParte: string): boolean {
  const lower = tipoParte.toLowerCase().trim();
  return (
    lower.includes('parte vida crist') ||
    lower.includes('parte vida crista') ||
    lower.includes('discurso de ensino')
  );
}

/**
 * Retorna a composição esperada da seção Vida Cristã para UMA semana:
 *   Cântico do Meio → [0-2 Partes variáveis] → [Necessidades Locais?] → EBC (Dirigente + Leitor)
 */
export function getVidaCristaSlots(): {
  fixed: string[];
  variable: string[];
  occasional: string[];
  derived: string[];
} {
  return {
    fixed: [EnumTipoParte.CANTICO_MEIO],                   // Sempre presente
    variable: ['Parte Vida Cristã'],                         // 0-2 por semana (apostila)
    occasional: ['Necessidades Locais'],                     // 1-2x por mês
    derived: ['Dirigente EBC', 'Leitor EBC'],               // EBC (quase sempre)
  };
}
