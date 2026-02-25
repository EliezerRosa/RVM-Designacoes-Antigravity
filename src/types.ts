// ============================================================================
// RVM Designacoes - Modelo de Dados Unificado (LIMPO)
// Consolidado de: ALL RVM, CRUD RVM, Form RVM, S-89 RVM
// ============================================================================

// ===== PUBLICADORES =====

export type Gender = 'brother' | 'sister';
export type Condition = 'Anciao' | 'Ancião' | 'Servo Ministerial' | 'Publicador';
export type AgeGroup = 'Adulto' | 'Jovem' | 'Crianca';

export interface PublisherPrivileges {
    canGiveTalks: boolean;              // Discurso de Ensino (Anciãos/SMs)
    canGiveStudentTalks?: boolean;      // Discurso de Estudante (padrão: true se ausente)
    canConductCBS: boolean;
    canReadCBS: boolean;
    canPray: boolean;
    canPreside: boolean;

}

export interface PublisherPrivilegesBySection {
    canParticipateInTreasures: boolean;
    canParticipateInMinistry: boolean;
    canParticipateInLife: boolean;
}

export interface PublisherAvailability {
    mode: 'always' | 'never';
    exceptionDates: string[];    // Datas Indisponíveis (quando mode='always', são as exceções negativas)
    availableDates: string[];    // Datas Disponíveis (quando mode='never', são as exceções positivas)
}

export interface Publisher {
    id: string;
    name: string;
    gender: Gender;
    condition: Condition;
    phone: string;
    isBaptized: boolean;
    isServing: boolean;
    ageGroup: AgeGroup;
    parentIds: string[];
    isHelperOnly: boolean;
    canPairWithNonParent: boolean;
    privileges: PublisherPrivileges;
    privilegesBySection: PublisherPrivilegesBySection;
    availability: PublisherAvailability;
    aliases: string[];
    // Status flags from EMR categories
    isNotQualified?: boolean;          // Não apto para participar
    notQualifiedReason?: string;        // Motivo da não qualificação (ex: "Necessita treinamento")
    requestedNoParticipation?: boolean; // "PEDIRAM PARA NÃO PARTICIPAR"
    noParticipationReason?: string;     // Motivo (ex: "Viagem", "Problemas pessoais")
    // Data origin tracking
    source?: 'manual' | 'import' | 'sync' | 'initial'; // Onde o registro foi criado
    createdAt?: string;  // ISO timestamp of creation
}

// ===== ENUMS RVM PRO 2.0 (Novo Modelo) =====

// EnumSecao - Estrutura da Reunião
export const EnumSecao = {
    INICIO_REUNIAO: 'Início da Reunião',
    TESOUROS: 'Tesouros da Palavra de Deus',
    MINISTERIO: 'Faça Seu Melhor no Ministério',
    VIDA_CRISTA: 'Nossa Vida Cristã',
    FINAL_REUNIAO: 'Final da Reunião',
} as const;
export type EnumSecao = typeof EnumSecao[keyof typeof EnumSecao];

// EnumTipoParte - Função Litúrgica
export const EnumTipoParte = {
    PRESIDENTE: 'Presidente',
    CANTICO_INICIAL: 'Cântico Inicial',
    ORACAO_INICIAL: 'Oração Inicial',
    COMENTARIOS_INICIAIS: 'Comentários Iniciais',
    DISCURSO_TESOUROS: 'Discurso na Tesouros',
    JOIAS_ESPIRITUAIS: 'Joias Espirituais',
    PARTE_ESTUDANTE: 'Parte de Estudante',       // Inclui Leitura, Conversas, etc.
    ELOGIOS_CONSELHOS: 'Elogios e Conselhos',
    CANTICO_MEIO: 'Cântico do Meio',
    PARTE_VIDA_CRISTA: 'Parte na Vida Cristã',
    DIRIGENTE_EBC: 'Dirigente do EBC',
    LEITOR_EBC: 'Leitor do EBC',
    NECESSIDADES_LOCAIS: 'Necessidades Locais',
    COMENTARIOS_FINAIS: 'Comentários Finais',
    CANTICO_FINAL: 'Cântico Final',
    ORACAO_FINAL: 'Oração Final',
} as const;
export type EnumTipoParte = typeof EnumTipoParte[keyof typeof EnumTipoParte];

// EnumModalidade - Formato de Execução
export const EnumModalidade = {
    PRESIDENCIA: 'Presidência',
    CANTICO: 'Cântico',
    ORACAO: 'Oração',
    ACONSELHAMENTO: 'Aconselhamento',
    DISCURSO_ENSINO: 'Discurso de Ensino',
    LEITURA_ESTUDANTE: 'Leitura de Estudante',
    DEMONSTRACAO: 'Demonstração',
    DISCURSO_ESTUDANTE: 'Discurso de Estudante',
    NECESSIDADES_LOCAIS: 'Necessidades Locais',
    DIRIGENTE_EBC: 'Dirigente de EBC',
    LEITOR_EBC: 'Leitor de EBC',
} as const;
export type EnumModalidade = typeof EnumModalidade[keyof typeof EnumModalidade];

// EnumFuncao - Papel na Execução
export const EnumFuncao = {
    TITULAR: 'Titular',
    AJUDANTE: 'Ajudante',
} as const;
export type EnumFuncao = typeof EnumFuncao[keyof typeof EnumFuncao];

// ===== EVENTOS ESPECIAIS =====

// Mantido para compatibilidade com sistema de eventos
export const ParticipationType = {
    PRESIDENTE: 'Presidente',
    ORACAO_INICIAL: 'Oracao Inicial',
    ORACAO_FINAL: 'Oracao Final',
    TESOUROS: 'Tesouros da Palavra de Deus',
    MINISTERIO: 'Faca Seu Melhor no Ministerio',
    VIDA_CRISTA: 'Nossa Vida Crista',
    DIRIGENTE: 'Dirigente do EBC',
    LEITOR: 'Leitor do EBC',
    AJUDANTE: 'Ajudante',
    CANTICO: 'Cantico',
    COMENTARIOS_FINAIS: 'Comentarios Finais',
} as const;
export type ParticipationType = typeof ParticipationType[keyof typeof ParticipationType];

export type EventImpactAction =
    | 'REPLACE_PART'
    | 'ADD_PART'
    | 'REPLACE_SECTION'
    | 'REASSIGN_PART'
    | 'SC_VISIT_LOGIC'
    | 'CANCEL_WEEK'
    | 'TIME_ADJUSTMENT'
    | 'REDUCE_VIDA_CRISTA_TIME';  // Para eventos satélite (Preparação/Recapitulação)

export interface EventImpact {
    action: EventImpactAction;
    targetType?: ParticipationType | ParticipationType[];
    reassignTarget?: ParticipationType;
    timeReduction?: {
        targetPart: string;
        minutes: number;
    };
}

export interface EventTemplate {
    id: string;
    name: string;
    description: string;
    impact: EventImpact;
    defaults: {
        duration: number;
        theme?: string;
        requiresTheme: boolean;
        requiresAssignee: boolean;
    };
}

export interface SpecialEvent {
    id: string;
    week: string;
    templateId: string;
    theme?: string;
    responsible?: string;
    duration?: number;
    boletimYear?: number;
    boletimNumber?: number;
    guidelines?: string;
    observations?: string;
    configuration?: {
        timeReduction?: {
            targetType: ParticipationType;
            minutes: number;
        };
    };
    isApplied?: boolean;
    appliedAt?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    // Novos campos para eventos satélite
    parentEventId?: string;     // Vincula a evento pai (Assembleia/Congresso)
    targetPartId?: string;      // Parte específica a ter tempo reduzido
}

// ===== APOSTILA (WORKBOOK STAGING) =====

export const WorkbookStatus = {
    PENDENTE: 'PENDENTE',
    PROPOSTA: 'PROPOSTA',
    APROVADA: 'APROVADA',
    DESIGNADA: 'DESIGNADA',
    REJEITADA: 'REJEITADA',
    CONCLUIDA: 'CONCLUIDA',
    CANCELADA: 'CANCELADA',
} as const;
export type WorkbookStatus = typeof WorkbookStatus[keyof typeof WorkbookStatus];

export interface WorkbookPart {
    id: string;
    batch_id?: string;
    year?: number;
    weekId: string;
    weekDisplay: string;
    date: string;
    section: string;

    // 5 ATRIBUTOS CANÔNICOS
    tipoParte: string;
    modalidade: string;
    tituloParte: string;
    descricaoParte: string;
    detalhesParte: string;

    // Sequência e função
    seq: number;
    funcao: 'Titular' | 'Ajudante';
    duracao: string;
    horaInicio: string;
    horaFim: string;
    rawPublisherName: string;

    // Publicador designado (ID é a fonte da verdade, Nome é cache)
    resolvedPublisherId?: string;
    resolvedPublisherName?: string;

    // Status e metadados
    status: WorkbookStatus;
    createdAt: string;
    updatedAt?: string;
    approvedById?: string;
    approvedAt?: string;
    rejectedReason?: string;
    completedAt?: string;
    cancelReason?: string;

    // Campos de Eventos Especiais
    affectedByEventId?: string;     // Evento que afetou esta parte (aplicado)
    pendingEventId?: string;        // Evento pendente que afetará esta parte
    createdByEventId?: string;      // Evento que criou esta parte (ADD_PART)
    originalDuration?: string;      // Duração original antes de ajuste
}

export interface WorkbookBatch {
    id: string;
    fileName: string;
    uploadDate: string;
    totalParts: number;
    draftCount: number;
    refinedCount: number;
    promotedCount: number;
    weekRange: string;
    isActive: boolean;
    promotedAt?: string;
    promotedToParticipationIds?: string[];
}

// ===== MOTOR DE DESIGNAÇÕES =====

export const ApprovalStatus = {
    DRAFT: 'DRAFT',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    COMPLETED: 'COMPLETED',
} as const;
export type ApprovalStatus = typeof ApprovalStatus[keyof typeof ApprovalStatus];

export const TeachingCategory = {
    TEACHING: 'TEACHING',
    STUDENT: 'STUDENT',
    HELPER: 'HELPER',
} as const;
export type TeachingCategory = typeof TeachingCategory[keyof typeof TeachingCategory];

export interface EngineConfig {
    weights: {
        teaching: number;
        student: number;
        helper: number;
    };
    cooldown: {
        samePartWeeks: number;
        sameSectionWeeks: number;
        penaltyPoints: number;
    };
    bonuses: {
        neverParticipated: number;
    };
    pairing: {
        preferSameGender: boolean;
        preferFamily: boolean;
    };
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
    weights: {
        teaching: 1.0,
        student: 0.5,
        helper: 0.1,
    },
    cooldown: {
        samePartWeeks: 6,
        sameSectionWeeks: 2,
        penaltyPoints: 500,
    },
    bonuses: {
        neverParticipated: 1000,
    },
    pairing: {
        preferSameGender: true,
        preferFamily: true,
    },
};

export interface RankedCandidate {
    publisher: Publisher;
    score: number;
    breakdown: {
        daysSinceLastAssignment: number;
        categoryWeight: number;
        cooldownPenalty: number;
        neverParticipatedBonus: number;
    };
    reason: string;

    // Campos adicionais do motor para compatibilidade
    publisherId?: string;
    publisherName?: string;
    priority?: number;
    cooldownInfo?: any;
    daysSinceLastTeaching?: number;
    daysSinceLastStudent?: number;
    daysSinceLastHelper?: number;
}

// ===== DADOS HISTORICOS (Adaptador para Motor) =====

export const HistoryStatus = {
    PENDING: 'PENDING',
    VALIDATED: 'VALIDATED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
} as const;
export type HistoryStatus = typeof HistoryStatus[keyof typeof HistoryStatus];

// Usado pelo CooldownService e HistoryAdapter
export interface HistoryRecord {
    id: string;
    weekId: string;
    weekDisplay: string;
    date: string;
    section: string;
    tipoParte: string;
    modalidade: string;
    tituloParte: string;
    descricaoParte: string;
    detalhesParte: string;
    seq: number;
    funcao: 'Titular' | 'Ajudante';
    duracao: number;
    horaInicio: string;
    horaFim: string;
    rawPublisherName: string;
    resolvedPublisherId?: string;
    resolvedPublisherName?: string;
    matchConfidence?: number;
    status: HistoryStatus;
    validationNotes?: string;
    importSource: 'PDF' | 'Excel' | 'JSON' | 'Manual' | 'AUTO_INJECTED';
    importBatchId: string;
    createdAt: string;
    updatedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
}

// ===== VALIDACAO =====

export interface ValidationResponse {
    isValid: boolean;
    reason: string;
}

// ===== PERÍODO DE ANÁLISE (v8.2) =====

export interface AnalysisPeriod {
    id?: string;
    startDate: string;      // YYYY-MM-DD
    endDate: string;        // YYYY-MM-DD
    isDefault: boolean;     // Se é período default (último semestre)
    createdAt?: string;
    updatedAt?: string;
}

// ===== AUTO-TUNING (v8.2) =====

export interface TuningMetrics {
    period: AnalysisPeriod;
    totalParticipations: number;
    activePublishers: number;
    avgParticipationsPerPublisher: number;
    distributionStdDev: number;     // Desvio padrão (ideal < 2.0)
    maxOverload: number;            // Max - Média (ideal < 3)
    idlePublishers: number;         // Sem parte > 8 semanas (ideal = 0)
    gapViolations: number;          // Violações MIN_WEEK_GAP
    collectedAt: string;
}

export interface TuningRecommendation {
    parameter: string;
    currentValue: number;
    proposedValue: number;
    reason: string;
    impact: 'low' | 'medium' | 'high';
}

export interface TuningConfig {
    // Parâmetros do Motor
    weeksFactor: number;            // Default: 50
    weightFactor: number;           // Default: 5
    bimonthlyBonus: number;         // Default: 1000
    cooldownWeeks: number;          // Default: 3
    bimonthlyThreshold: number;     // Default: 8

    // Configurações do Auto-Tuning
    autoRunEnabled: boolean;        // Executar automaticamente
    autoRunIntervalWeeks: number;   // Intervalo em semanas (8 = bimestral)
    lastAutoRunAt?: string;         // Última execução automática

    // Metadados
    createdAt?: string;
    updatedAt?: string;
}

export const DEFAULT_TUNING_CONFIG: TuningConfig = {
    weeksFactor: 50,
    weightFactor: 5,
    bimonthlyBonus: 1000,
    cooldownWeeks: 3,
    bimonthlyThreshold: 8,
    autoRunEnabled: true,
    autoRunIntervalWeeks: 8,  // Bimestral
};

