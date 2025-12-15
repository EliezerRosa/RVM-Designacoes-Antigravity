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

export interface Participation {
    id: string;
    publisherName: string;
    week: string;
    date: string;
    partTitle: string;
    type: ParticipationType;
    duration?: number;
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

// ===== DESIGNACAO S-89 =====

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
