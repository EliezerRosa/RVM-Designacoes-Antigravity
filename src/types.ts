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
    isNotQualified?: boolean;          // Não apto para participar
    requestedNoParticipation?: boolean; // "PEDIRAM PARA NÃO PARTICIPAR"
    // Data origin tracking
    source?: 'manual' | 'import' | 'sync' | 'initial'; // Onde o registro foi criado
    createdAt?: string;  // ISO timestamp of creation
}

// ===== ENUMS RVM PRO 2.0 (Novo Modelo) =====

// EnumSecao - Estrutura da Reunião (5 valores)
export const EnumSecao = {
    INICIO_REUNIAO: 'Início da Reunião',
    TESOUROS: 'Tesouros da Palavra de Deus',
    MINISTERIO: 'Faça Seu Melhor no Ministério',
    VIDA_CRISTA: 'Nossa Vida Cristã',
    FINAL_REUNIAO: 'Final da Reunião',
} as const;
export type EnumSecao = typeof EnumSecao[keyof typeof EnumSecao];

// EnumTipoParte - Função Litúrgica (15 valores - igual ao Excel)
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
    COMENTARIOS_FINAIS: 'Comentários Finais',
    CANTICO_FINAL: 'Cântico Final',
    ORACAO_FINAL: 'Oração Final',
} as const;
export type EnumTipoParte = typeof EnumTipoParte[keyof typeof EnumTipoParte];

// EnumModalidade - Formato de Execução (10 valores)
export const EnumModalidade = {
    PRESIDENCIA: 'Presidência',
    CANTICO: 'Cântico',
    ORACAO: 'Oração',
    ACONSELHAMENTO: 'Aconselhamento',
    DISCURSO_ENSINO: 'Discurso de Ensino',
    LEITURA_ESTUDANTE: 'Leitura de Estudante',
    DEMONSTRACAO: 'Demonstração',
    DISCURSO_ESTUDANTE: 'Discurso de Estudante',
    DIRIGENTE_EBC: 'Dirigente de EBC',
    LEITOR_EBC: 'Leitor de EBC',
} as const;
export type EnumModalidade = typeof EnumModalidade[keyof typeof EnumModalidade];

// EnumFuncao - Papel na Execução (2 valores)
export const EnumFuncao = {
    TITULAR: 'Titular',
    AJUDANTE: 'Ajudante',
} as const;
export type EnumFuncao = typeof EnumFuncao[keyof typeof EnumFuncao];

// ===== PARTICIPACOES (LEGADO - manter para compatibilidade) =====

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

// Modalidades de partes designáveis (LEGADO)
export const PartModality = {
    DISCURSO_ENSINO: 'Discurso de Ensino',
    DISCURSO_ESTUDANTE: 'Discurso de Estudante',
    DEMONSTRACAO: 'Demonstração',
    LEITURA_ESTUDANTE: 'Leitura de Estudante',
    DIRIGENTE_EBC: 'Dirigente de EBC',
    LEITOR_EBC: 'Leitor de EBC',
    ORACAO: 'Oração',
    PRESIDENCIA: 'Presidência',
} as const;

export type PartModality = typeof PartModality[keyof typeof PartModality];

// Seções da Reunião (LEGADO)
export const MeetingSection = {
    INICIO: 'Início da Reunião',
    TESOUROS: 'Tesouros da Palavra de Deus',
    MINISTERIO: 'Faça Seu Melhor no Ministério',
    VIDA_CRISTA: 'Nossa Vida Cristã',
    FINAL: 'Final da Reunião',
} as const;

export type MeetingSection = typeof MeetingSection[keyof typeof MeetingSection];

// Definição de Parte Padrão com metadata
export interface StandardPartDef {
    name: string;
    section: keyof typeof MeetingSection;
    modality: keyof typeof PartModality;
    designable: boolean;
}

// Partes Padrão do S-140
export const StandardPart: Record<string, StandardPartDef> = {
    // Início da Reunião
    PRESIDENTE: { name: 'Presidente', section: 'INICIO', modality: 'PRESIDENCIA', designable: true },
    ORACAO_INICIAL: { name: 'Oração Inicial', section: 'INICIO', modality: 'ORACAO', designable: false },

    // Tesouros
    DISCURSO_TESOUROS: { name: 'Discurso - Tesouros', section: 'TESOUROS', modality: 'DISCURSO_ENSINO', designable: true },
    JOIAS: { name: 'Joias Espirituais', section: 'TESOUROS', modality: 'DISCURSO_ENSINO', designable: true },
    LEITURA_BIBLIA: { name: 'Leitura da Bíblia', section: 'TESOUROS', modality: 'LEITURA_ESTUDANTE', designable: true },

    // Ministério
    INICIANDO: { name: 'Iniciando Conversas', section: 'MINISTERIO', modality: 'DEMONSTRACAO', designable: true },
    CULTIVANDO: { name: 'Cultivando o Interesse', section: 'MINISTERIO', modality: 'DEMONSTRACAO', designable: true },
    FAZENDO: { name: 'Fazendo Discípulos', section: 'MINISTERIO', modality: 'DEMONSTRACAO', designable: true },
    EXPLICANDO: { name: 'Explicando Suas Crenças', section: 'MINISTERIO', modality: 'DEMONSTRACAO', designable: true },
    DISCURSO_ESTUDANTE: { name: 'Discurso de Estudante', section: 'MINISTERIO', modality: 'DISCURSO_ESTUDANTE', designable: true },

    // Vida Cristã
    NECESSIDADES: { name: 'Necessidades Locais', section: 'VIDA_CRISTA', modality: 'DISCURSO_ENSINO', designable: true },
    EBC: { name: 'Estudo Bíblico de Congregação', section: 'VIDA_CRISTA', modality: 'DIRIGENTE_EBC', designable: true },
    EBC_LEITOR: { name: 'Leitor do EBC', section: 'VIDA_CRISTA', modality: 'LEITOR_EBC', designable: true },

    // Final
    ORACAO_FINAL: { name: 'Oração Final', section: 'FINAL', modality: 'ORACAO', designable: true },
} as const;

export type StandardPartKey = keyof typeof StandardPart;

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

// ===== APOSTILA (WORKBOOK STAGING) =====

// Status de uma parte da apostila
export const WorkbookStatus = {
    DRAFT: 'DRAFT',           // Recém importado do Excel
    REFINED: 'REFINED',       // Editado/corrigido pelo usuário
    PROMOTED: 'PROMOTED',     // Convertido para Participations (agendado)
    COMPLETED: 'COMPLETED',   // Parte foi executada na reunião (histórico)
} as const;

export type WorkbookStatus = typeof WorkbookStatus[keyof typeof WorkbookStatus];

// Parte individual extraída da apostila
export interface WorkbookPart {
    id: string;
    batch_id?: string; // ID do lote de upload
    year?: number;    // Ano da parte (novo)
    weekId: string; // YYYY-MM-DD da segunda-feira
    weekDisplay: string; // Ex: "6-12 de Janeiro"
    date: string;
    section: string;

    // =====================================================
    // 5 ATRIBUTOS CANÔNICOS (nomenclatura única)
    // =====================================================
    tipoParte: string;           // O QUE é a parte? (ex: "Leitura da Bíblia")
    modalidade: string;          // COMO é executada? (ex: "Leitura de Estudante")
    tituloParte: string;         // Título contextual (ex: "3. Joias (10 min)")
    descricaoParte: string;      // Resumo do conteúdo
    detalhesParte: string;       // Orientação completa (do mwb)

    // Sequência e função
    seq: number;
    funcao: 'Titular' | 'Ajudante';
    duracao: string;
    horaInicio: string;
    horaFim: string;
    rawPublisherName: string;

    // Resolução de publicador (fuzzy matching)
    resolvedPublisherId?: string;
    resolvedPublisherName?: string;
    matchConfidence?: number;

    // Status e metadados
    status: WorkbookStatus;
    createdAt: string;
    updatedAt?: string;
}

// Batch de importação (controle de versões)
export interface WorkbookBatch {
    id: string;
    fileName: string;
    uploadDate: string;
    totalParts: number;
    draftCount: number;
    refinedCount: number;
    promotedCount: number;
    weekRange: string;          // Ex: "Jan-Fev 2026"
    isActive: boolean;          // Batch atual em edição
    promotedAt?: string;        // Data da promoção para Participations
    promotedToParticipationIds?: string[];  // IDs gerados (para rollback)
}

// Interface legada (manter para compatibilidade)
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
    COMPLETED: 'COMPLETED',
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

    // Contexto temporal
    weekId: string;
    weekDisplay: string;
    date: string;

    // =====================================================
    // 5 ATRIBUTOS CANÔNICOS (nomenclatura única)
    // =====================================================
    section: string;              // Seção da reunião
    tipoParte: string;            // O QUE é a parte?
    modalidade: string;           // COMO é executada?
    tituloParte: string;          // Título contextual
    descricaoParte: string;       // Resumo do conteúdo
    detalhesParte: string;        // Orientação completa

    // Sequência e função
    seq: number;
    funcao: 'Titular' | 'Ajudante';
    duracao: number;              // Minutos
    horaInicio: string;           // HH:MM
    horaFim: string;              // HH:MM

    // Publicador
    rawPublisherName: string;
    resolvedPublisherId?: string;
    resolvedPublisherName?: string;
    matchConfidence?: number;

    // Status e Metadados
    status: HistoryStatus;
    validationNotes?: string;
    importSource: 'PDF' | 'Excel' | 'JSON' | 'Manual' | 'AUTO_INJECTED';
    importBatchId: string;

    // Campos de auditoria
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

// ===== API REQUEST/RESPONSE TYPES =====

export interface GenerateRequest {
    week: string;
    date: string;
    publishers: Publisher[];
    participations: Participation[];
    parts?: { title: string; type: string; needsHelper: boolean }[];
}

export interface GeneratedAssignmentResponse {
    part_title: string;
    part_type: string;
    teaching_category: string;
    principal_name: string;
    principal_id: string;
    secondary_name: string | null;
    secondary_id: string | null;
    status: string;
    score: number;
    reason: string;
    pairing_reason: string | null;
}
