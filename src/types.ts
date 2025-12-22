// ============================================================================
// RVM Designacoes - Modelo de Dados Unificado
// Consolidado de: ALL RVM, CRUD RVM, Form RVM, S-89 RVM
// ============================================================================

// ===== PUBLICADORES =====

export type Gender = 'brother' | 'sister';
export type Condition = 'Anciao' | 'Ancião' | 'Servo Ministerial' | 'Publicador';
export type AgeGroup = 'Adulto' | 'Jovem' | 'Crianca';

export interface PublisherPrivileges {
    canGiveTalks: boolean;
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
    isNotQualified?: boolean;          // "NÃO APTOS OU NÃO ASSISTEM REUNIÃO"
    requestedNoParticipation?: boolean; // "PEDIRAM PARA NÃO PARTICIPAR"
    // Data origin tracking
    source?: 'manual' | 'import' | 'sync' | 'initial'; // Onde o registro foi criado
    createdAt?: string;  // ISO timestamp of creation
}

// ===== PARTICIPACOES =====

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

// Modalidades de partes designáveis (para análise de histórico e elegibilidade)
export const PartModality = {
    DISCURSO_ENSINO: 'Discurso de Ensino',      // Tesouros (Discurso 1, Joias), Vida Cristã (EBC Dirigente, outras)
    DISCURSO_ESTUDANTE: 'Discurso de Estudante', // Ministério (Discurso final)
    DEMONSTRACAO: 'Demonstração',                // Ministério (Iniciando, Cultivando, Fazendo, Explicando)
    ESTUDANTE: 'Estudante',                      // Tesouros (Leitura da Bíblia)
    LEITURA: 'Leitura',                          // Vida Cristã (EBC Leitor)
    ORACAO: 'Oração',                            // Vida Cristã (Oração Final)
} as const;

export type PartModality = typeof PartModality[keyof typeof PartModality];

export interface Participation {
    id: string;
    publisherName: string;
    week: string;
    date: string;
    partTitle: string;
    type: ParticipationType;
    duration?: number;
    // Data origin tracking
    source?: 'manual' | 'import' | 'sync';
    createdAt?: string;
}

// ===== ESTRUTURA DA REUNIAO =====

export interface MeetingItem {
    time: string;
    description: string;
    duration?: string;
    isSong?: boolean;
    isComment?: boolean;
}

export interface AssignableItem extends MeetingItem {
    assignee: string;
    assigneeRole: string;
}

export interface StudentPart extends MeetingItem {
    mainHallAssignee: string;
    roomBAssignee: string;
    assistantMainHall?: string;
    assistantRoomB?: string;
    assigneeRole: string;
}

export interface TreasuresSection {
    talk: AssignableItem;
    gems: AssignableItem;
    bibleReading: StudentPart;
}

export interface MinistrySection {
    part1: StudentPart;
    part2: StudentPart;
    part3: StudentPart;
    part4?: StudentPart;
}

export interface LivingSection {
    song: string;
    part1: AssignableItem;
    part2: AssignableItem;
    congregationStudy: AssignableItem;
    closingComments: MeetingItem;
    closingSong: string;
    closingPrayer: string;
}

export interface MeetingData {
    id: string;
    congregationName: string;
    date: string;
    week: string;
    bibleReading: string;
    chairman: string;
    counselor: string;
    openingPrayer: string;
    openingSong: string;
    treasures: TreasuresSection;
    ministry: MinistrySection;
    living: LivingSection;
}

// ===== REGRAS DE ELEGIBILIDADE =====

export interface RuleCondition {
    fact: string;
    operator: 'equal' | 'notEqual' | 'in' | 'notIn' | 'contains';
    value: string | boolean | number | string[];
}

export interface Rule {
    id: string;
    description: string;
    isActive: boolean;
    conditions: RuleCondition[];
}

// ===== EVENTOS ESPECIAIS =====

export type EventImpactAction = 'REPLACE_PART' | 'ADD_PART' | 'REPLACE_SECTION' | 'REASSIGN_PART';

export interface EventImpact {
    action: EventImpactAction;
    targetType?: ParticipationType | ParticipationType[];
    reassignTarget?: ParticipationType;
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
    theme: string;
    assignedTo: string;
    duration: number;
    configuration: {
        timeReduction?: {
            targetType: ParticipationType;
            minutes: number;
        };
    };
}

// ===== APOSTILA (WORKBOOK) =====

export interface Workbook {
    id: string;
    name: string;
    fileData: string;
    uploadDate: string;
    isDeleted?: boolean;
}

// ===== MOTOR DE DESIGNAÇÕES =====

export const ApprovalStatus = {
    DRAFT: 'DRAFT',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
} as const;

export type ApprovalStatus = typeof ApprovalStatus[keyof typeof ApprovalStatus];

export const TeachingCategory = {
    TEACHING: 'TEACHING',   // Peso 1.0 - Discursos, Joias, Necessidades Locais
    STUDENT: 'STUDENT',     // Peso 0.5 - Leitura, Demonstrações titular
    HELPER: 'HELPER',       // Peso 0.1 - Ajudante em demonstrações
} as const;

export type TeachingCategory = typeof TeachingCategory[keyof typeof TeachingCategory];

// ===== DESIGNACAO S-89 (Legado) =====

export interface Assignment {
    id: string;
    date: string;
    congregation: string;
    partNumber: number;
    section: string;
    title: string;
    student: string;
    assistant?: string;
    durationMin: number;
    room?: string;
}

// ===== DESIGNACAO AGENDADA (Motor de Regras) =====

export interface ScheduledAssignment {
    id: string;
    weekId: string;
    partId: string;
    partTitle: string;
    partType: ParticipationType;
    teachingCategory: TeachingCategory;

    // Designados
    principalPublisherId: string;
    principalPublisherName: string;
    secondaryPublisherId?: string;
    secondaryPublisherName?: string;

    // Timing
    date: string;
    startTime?: string;
    endTime?: string;
    durationMin: number;

    // Status de Aprovação
    status: ApprovalStatus;
    approvedByElderId?: string;
    approvalDate?: string;
    rejectionReason?: string;

    // Metadados da seleção
    selectionReason: string;
    score: number;
    room?: string;

    createdAt: string;
    updatedAt?: string;
}

// ===== CONFIGURAÇÃO DO MOTOR =====

export interface EngineConfig {
    weights: {
        teaching: number;  // default: 1.0
        student: number;   // default: 0.5
        helper: number;    // default: 0.1
    };
    cooldown: {
        samePartWeeks: number;      // default: 6
        sameSectionWeeks: number;   // default: 2
        penaltyPoints: number;      // default: 500
    };
    bonuses: {
        neverParticipated: number;  // default: 1000
    };
    pairing: {
        preferSameGender: boolean;  // default: true
        preferFamily: boolean;      // default: true
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

// ===== RESULTADO DO RANQUEAMENTO =====

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
}

// ===== RESULTADO DO FILTRO =====

export interface FilterResult {
    eligible: Publisher[];
    rejected: { publisher: Publisher; reason: string }[];
}

// ===== AÇÃO DE APROVAÇÃO =====

export interface ApprovalAction {
    assignmentId: string;
    action: 'APPROVE' | 'REJECT';
    elderId: string;
    elderName: string;
    reason?: string;
}

// ===== ESTATISTICAS =====

export interface PublisherStats {
    publisherId: string;
    publisherName: string;
    totalAssignments: number;
    lastAssignmentDate: string | null;
    lastAssignmentWeek: string | null;
    lastAssignmentTitle: string | null;
    lastAssignmentType: ParticipationType | null;
    avgDaysBetweenAssignments: number | null;
}

// ===== DADOS HISTORICOS =====

export interface HistoricalData {
    weekId: string;
    weekDisplay: string;
    participations: {
        partTitle: string;
        publisherName: string;
    }[];
}

export interface HistoricalImportRecord {
    id: string;
    fileName: string;
    importDate: string;
    data: HistoricalData[];
}

// ===== VALIDACAO =====

export interface ValidationRequest {
    publisher: Publisher;
    partType: string;
    partTitle: string;
    meetingDate: string;
}

export interface ValidationResponse {
    isValid: boolean;
    reason: string;
}

// ===== RESULTADO DA IA =====

export interface AiScheduleResult {
    partTitle: string;
    studentName: string;
    helperName: string | null;
    reason: string;
}

// ===== IMPORTACAO DE HISTORICO (STAGING) =====

export const HistoryStatus = {
    PENDING: 'PENDING',           // Aguardando validação
    VALIDATED: 'VALIDATED',       // Nome resolvido automaticamente
    APPROVED: 'APPROVED',         // Integrado ao sistema
    REJECTED: 'REJECTED',         // Descartado
} as const;

export type HistoryStatus = typeof HistoryStatus[keyof typeof HistoryStatus];

export interface HistoryRecord {
    id: string;

    // Dados da Semana
    weekId: string;               // "2024-11" (ano-mês)
    weekDisplay: string;          // "SEMANA 4-10 DE NOVEMBRO | SALMO 105"
    date: string;                 // ISO date (primeiro dia da semana)

    // Dados da Parte
    section: string;              // "Tesouros", "Ministério", "Vida Cristã"
    partType: string;             // "Leitura da Bíblia", "Discurso", etc.
    partTitle: string;            // Título específico da apostila
    modality: PartModality;       // Modalidade da parte designável

    // Participante
    rawPublisherName: string;     // Nome como veio no arquivo
    participationRole: 'Titular' | 'Ajudante';  // Tipo de participação

    // Resolução (após matching)
    resolvedPublisherId?: string;
    resolvedPublisherName?: string;
    matchConfidence?: number;     // 0-100

    // Status
    status: HistoryStatus;
    validationNotes?: string;
    importSource: 'PDF' | 'Excel' | 'JSON' | 'Manual';
    importBatchId: string;        // Agrupa imports do mesmo arquivo

    // Metadados
    createdAt: string;
    updatedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
}

export interface ImportBatch {
    id: string;
    fileName: string;
    importDate: string;
    source: 'PDF' | 'Excel' | 'JSON' | 'Manual';
    totalRecords: number;
    pendingCount: number;
    validatedCount: number;
    approvedCount: number;
    rejectedCount: number;
}
