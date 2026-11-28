/**
 * Contrato Canônico Neutro de Publicador, Privilégios, Papéis e Capabilities — RVM Designações
 *
 * Implementa a ponte arquitetural limpa prevista em `.agents/workflows/visao-arquitetural-rvm.intent.md` (V-1…V-6):
 * - 100% agnóstico a qualquer sistema externo (sem dialeto de terceiros);
 * - Compartilhado pelas 3 UIs (UI 1 Console de Governança, UI 2 Conversa RVM, UI 3 Celular Android)
 *   e consumível por qualquer ponte externa opcional via Anti-Corruption Layer (ACL);
 * - Preparado 1:1 para futura promoção às tabelas tipadas M0–M2 do MER sem renomeação de chaves.
 */

import type {
    Condition,
    Funcao,
    Gender,
    PublisherPrivileges,
    PublisherPrivilegesBySection,
} from '../types';

export const CANONICAL_CONTRACT_VERSION = '2026-11-27.01';

export type CanonicalServiceStatus =
    | 'unbaptized_publisher'
    | 'baptized_publisher'
    | 'continuous_auxiliary_pioneer'
    | 'regular_pioneer'
    | 'special_pioneer'
    | 'inactive';

export type CanonicalPrivilegeDomain =
    | 'midweek'
    | 'weekend'
    | 'support'
    | 'field'
    | 'cleaning';

export interface CanonicalPrivilegeDefinition {
    key: CanonicalPrivilegeKey;
    label: string;
    domain: CanonicalPrivilegeDomain;
    sexRule: 'male' | 'any';
    minCondition: 'Publicador' | 'Servo Ministerial' | 'Ancião';
    requiresBaptism: boolean;
}

export const CANONICAL_PRIVILEGE_CATALOG = [
    // Meio de Semana (RVM)
    { key: 'midweek.chairman', label: 'Presidente da RVM', domain: 'midweek', sexRule: 'male', minCondition: 'Ancião', requiresBaptism: true },
    { key: 'midweek.chairman_aux', label: 'Presidente Sala Auxiliar', domain: 'midweek', sexRule: 'male', minCondition: 'Ancião', requiresBaptism: true },
    { key: 'midweek.treasures_talk', label: 'Discurso / Joias (Tesouros)', domain: 'midweek', sexRule: 'male', minCondition: 'Servo Ministerial', requiresBaptism: true },
    { key: 'midweek.bible_reading', label: 'Leitura da Bíblia', domain: 'midweek', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'midweek.student_init_call', label: 'Iniciando Conversas', domain: 'midweek', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'midweek.student_return_visit', label: 'Cultivando o Interesse', domain: 'midweek', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'midweek.student_bible_study', label: 'Fazendo Discípulos / Estudo', domain: 'midweek', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'midweek.student_talk', label: 'Discurso de Estudante', domain: 'midweek', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'midweek.student_helper', label: 'Ajudante (Demonstrações)', domain: 'midweek', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'midweek.ministry_discussion', label: 'Consideração FSM', domain: 'midweek', sexRule: 'male', minCondition: 'Servo Ministerial', requiresBaptism: true },
    { key: 'midweek.life_talk', label: 'Nossa Vida Cristã', domain: 'midweek', sexRule: 'male', minCondition: 'Servo Ministerial', requiresBaptism: true },
    { key: 'midweek.local_needs', label: 'Necessidades Locais', domain: 'midweek', sexRule: 'male', minCondition: 'Ancião', requiresBaptism: true },
    { key: 'midweek.cbs_conductor', label: 'Dirigente do EBC', domain: 'midweek', sexRule: 'male', minCondition: 'Ancião', requiresBaptism: true },
    { key: 'midweek.cbs_reader', label: 'Leitor do EBC', domain: 'midweek', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'midweek.prayer', label: 'Oração', domain: 'midweek', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'midweek.open_prayer', label: 'Oração Inicial', domain: 'midweek', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'midweek.close_prayer', label: 'Oração Final', domain: 'midweek', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },

    // Fim de Semana
    { key: 'weekend.chairman', label: 'Presidente Fim de Semana', domain: 'weekend', sexRule: 'male', minCondition: 'Servo Ministerial', requiresBaptism: true },
    { key: 'weekend.public_talk_local', label: 'Orador Público (Local)', domain: 'weekend', sexRule: 'male', minCondition: 'Servo Ministerial', requiresBaptism: true },
    { key: 'weekend.public_talk_away', label: 'Orador Público (Fora)', domain: 'weekend', sexRule: 'male', minCondition: 'Servo Ministerial', requiresBaptism: true },
    { key: 'weekend.watchtower_conductor', label: 'Dirigente de A Sentinela', domain: 'weekend', sexRule: 'male', minCondition: 'Ancião', requiresBaptism: true },
    { key: 'weekend.watchtower_reader', label: 'Leitor de A Sentinela', domain: 'weekend', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'weekend.hospitality', label: 'Hospitalidade', domain: 'weekend', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },

    // Apoio & Áudio/Vídeo
    { key: 'support.attendant', label: 'Indicador', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'support.security_attendant', label: 'Indicador de Segurança', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'support.microphones', label: 'Microfones', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'support.audio_console', label: 'Operador de Áudio', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'support.video', label: 'Operador de Vídeo', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'support.stage', label: 'Palco', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'support.stream', label: 'Transmissão / Stream', domain: 'support', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'support.zoom_attendant', label: 'Indicador de Zoom', domain: 'support', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },
    { key: 'support.interpreter', label: 'Intérprete', domain: 'support', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },

    // Serviço de Campo & Limpeza
    { key: 'field.conduct_meeting', label: 'Dirigente de Saída de Campo', domain: 'field', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'field.group_assistant', label: 'Ajudante de Grupo de Campo', domain: 'field', sexRule: 'male', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'field.public_witnessing', label: 'Testemunho Público', domain: 'field', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: true },
    { key: 'cleaning.general', label: 'Limpeza do Salão', domain: 'cleaning', sexRule: 'any', minCondition: 'Publicador', requiresBaptism: false },
] as const;

export type CanonicalPrivilegeKey = typeof CANONICAL_PRIVILEGE_CATALOG[number]['key'];

export const CANONICAL_CONGREGATION_ROLES = [
    { key: 'cca', label: 'Coordenador do Corpo de Anciãos', canonicalFuncao: 'Coordenador do Corpo de Anciãos' as Funcao },
    { key: 'secretary', label: 'Secretário', canonicalFuncao: 'Secretário' as Funcao },
    { key: 'service_overseer', label: 'Superintendente de Serviço', canonicalFuncao: 'Superintendente de Serviço' as Funcao },
    { key: 'rvm_overseer', label: 'Superintendente da Reunião Vida e Ministério', canonicalFuncao: 'Superintendente da Reunião Vida e Ministério' as Funcao },
    { key: 'rvm_assistant', label: 'Ajudante do Superintendente da Reunião Vida e Ministério', canonicalFuncao: 'Ajudante do Superintendente da Reunião Vida e Ministério' as Funcao },
    { key: 'announcement_board', label: 'Responsável pelo Quadro de Anúncios', canonicalFuncao: 'Responsável pelo Quadro de Anúncios' as Funcao },
    { key: 'auxiliary_counselor', label: 'Conselheiro Assistente', canonicalFuncao: null },
    { key: 'public_talks_coordinator', label: 'Coordenador dos Discursos Públicos', canonicalFuncao: null },
    { key: 'territory_servant', label: 'Servo de Territórios', canonicalFuncao: null },
    { key: 'av_servant', label: 'Servo de Áudio e Vídeo', canonicalFuncao: null },
    { key: 'attendants_servant', label: 'Servo de Indicadores', canonicalFuncao: null },
    { key: 'accounts_servant', label: 'Servo de Contas', canonicalFuncao: null },
    { key: 'literature_servant', label: 'Servo de Publicações', canonicalFuncao: null },
    { key: 'cleaning_coordinator', label: 'Coordenador de Limpeza', canonicalFuncao: null },
    { key: 'maintenance_coordinator', label: 'Coordenador de Manutenção', canonicalFuncao: null },
    { key: 'public_witnessing_coordinator', label: 'Coordenador do Testemunho Público', canonicalFuncao: null },
    { key: 'kh_operating_committee', label: 'Comissão de Manutenção do Salão', canonicalFuncao: null },
] as const;

export type CanonicalCongregationRoleKey = typeof CANONICAL_CONGREGATION_ROLES[number]['key'];

/**
 * Capabilities de Domínio — governam simultaneamente:
 * - UI 1 (Console de Governança / Crise)
 * - UI 2 (Conversa RVM — ações DAV permitidas)
 * - UI 3 (Celular Android — mini-apps visíveis na tela inicial)
 *
 * Invariante V-6: capabilities com `isTechnicalGovernance: true` NUNCA são concedidas
 * automaticamente por papéis congregacionais nem por pontes externas de sincronização.
 */
export const CANONICAL_CAPABILITY_CATALOG = [
    // Governança Técnica (UI 1 — estritamente manual pelo Admin Técnico)
    { key: 'governance.console', label: 'Console Técnico de Governança e Crises (UI 1)', isTechnicalGovernance: true },
    { key: 'governance.permissions', label: 'Gerenciar Políticas e Overrides de Acesso', isTechnicalGovernance: true },
    { key: 'governance.integrations', label: 'Gerenciar Webhooks, Credenciais e Integrações', isTechnicalGovernance: true },

    // Gestão Congregacional (UI 2 Conversa + UI 3 Celular Android)
    { key: 'congregation.admin', label: 'Administração Congregacional (Papel Congregacional)', isTechnicalGovernance: false },
    { key: 'congregation.view_all', label: 'Visualizar Dados Gerais da Congregação', isTechnicalGovernance: false },
    { key: 'congregation.view_personal_details', label: 'Visualizar Dados Pessoais', isTechnicalGovernance: false },
    { key: 'congregation.update_privileges', label: 'Atualizar Privilégios de Publicadores', isTechnicalGovernance: false },
    { key: 'congregation.send_invitations', label: 'Enviar Convites de Acesso', isTechnicalGovernance: false },
    { key: 'congregation.information_board', label: 'Gerenciar Quadro de Anúncios', isTechnicalGovernance: false },
    { key: 'schedules.view', label: 'Visualizar Programações e Escalas', isTechnicalGovernance: false },
    { key: 'schedules.midweek.manage', label: 'Gerenciar Escala da Reunião de Meio de Semana', isTechnicalGovernance: false },
    { key: 'schedules.weekend.manage', label: 'Gerenciar Escala de Fim de Semana', isTechnicalGovernance: false },
    { key: 'schedules.weekend.view_speakers', label: 'Visualizar Oradores Públicos', isTechnicalGovernance: false },
    { key: 'schedules.av.manage', label: 'Gerenciar Escala de Áudio e Vídeo', isTechnicalGovernance: false },
    { key: 'schedules.attendants.manage', label: 'Gerenciar Escala de Indicadores', isTechnicalGovernance: false },
    { key: 'schedules.cleaning.manage', label: 'Gerenciar Escala de Limpeza', isTechnicalGovernance: false },
    { key: 'schedules.field_ministry.manage', label: 'Gerenciar Saídas de Campo', isTechnicalGovernance: false },
    { key: 'schedules.public_witnessing.manage', label: 'Gerenciar Testemunho Público', isTechnicalGovernance: false },
    { key: 'schedules.maintenance.manage', label: 'Gerenciar Escala de Manutenção', isTechnicalGovernance: false },
    { key: 'schedules.custom.manage', label: 'Gerenciar Escalas Personalizadas', isTechnicalGovernance: false },
    { key: 'reports.group.view', label: 'Visualizar Relatórios do Grupo', isTechnicalGovernance: false },
    { key: 'reports.group.enter', label: 'Lançar Relatórios do Grupo', isTechnicalGovernance: false },
    { key: 'reports.field_service.enter', label: 'Lançar Relatórios de Serviço de Campo', isTechnicalGovernance: false },
    { key: 'reports.group.update_contacts', label: 'Atualizar Contatos do Grupo', isTechnicalGovernance: false },
    { key: 'attendance.enter', label: 'Registrar Assistência às Reuniões (S-88)', isTechnicalGovernance: false },
    { key: 'territories.view', label: 'Visualizar Territórios', isTechnicalGovernance: false },
    { key: 'territories.manage', label: 'Gerenciar Territórios e S-13', isTechnicalGovernance: false },
    { key: 'calendar.sync', label: 'Assinar / Sincronizar Calendário (.ics)', isTechnicalGovernance: false },
] as const;

export type CanonicalCapabilityKey = typeof CANONICAL_CAPABILITY_CATALOG[number]['key'];

export type ExternalLinkStatus = 'linked' | 'missing_in_source' | 'unlinked';

/**
 * Vínculo genérico com provedor externo opcional (Anti-Corruption Layer).
 * Mantém o núcleo do RVM desacoplado de qualquer sistema terceiro específico.
 */
export interface ExternalIdentityLink {
    provider: string;            // Identificador do adaptador externo (ex.: 'external_sync', 'csv_import', etc.)
    externalId: string;          // ID do registro no sistema externo (sempre string para neutralidade)
    externalName?: string;       // Nome canônico observado na origem
    status: ExternalLinkStatus;
    syncedAt: string;            // ISO UTC
}

export interface PublisherCanonicalProfile {
    contractVersion: string;
    congregationId?: string;
    serviceStatus?: CanonicalServiceStatus;
    birthDate?: string | null;       // YYYY-MM-DD
    baptismDate?: string | null;     // YYYY-MM-DD
    fieldGroupName?: string | null;
    preferredName?: string | null;
    extendedPrivileges: CanonicalPrivilegeKey[];
    congregationRoles: CanonicalCongregationRoleKey[];
    domainCapabilities: CanonicalCapabilityKey[];
    tags?: string[];
    updatedAt?: string;              // ISO UTC
}

const PRIVILEGE_DEF_BY_KEY = new Map<CanonicalPrivilegeKey, CanonicalPrivilegeDefinition>(
    CANONICAL_PRIVILEGE_CATALOG.map((item) => [item.key, item])
);

const TECHNICAL_GOVERNANCE_CAPABILITIES = new Set<string>(
    CANONICAL_CAPABILITY_CATALOG
        .filter((item) => item.isTechnicalGovernance)
        .map((item) => item.key)
);

const VALID_PRIVILEGE_KEYS = new Set<string>(CANONICAL_PRIVILEGE_CATALOG.map((item) => item.key));
const VALID_ROLE_KEYS = new Set<string>(CANONICAL_CONGREGATION_ROLES.map((item) => item.key));
const VALID_CAPABILITY_KEYS = new Set<string>(CANONICAL_CAPABILITY_CATALOG.map((item) => item.key));

const ROLE_TO_CANONICAL_FUNCAO = new Map<CanonicalCongregationRoleKey, Funcao>(
    CANONICAL_CONGREGATION_ROLES.map((item) => [item.key, item.canonicalFuncao])
);

function conditionRank(condition: Condition): number {
    if (condition === 'Ancião' || condition === 'Anciao') return 3;
    if (condition === 'Servo Ministerial') return 2;
    return 1;
}

/**
 * Validação estrutural declarativa de privilégio (antecipa invariante I-P3 do MER).
 */
export function isPrivilegeAllowedForPublisher(
    key: CanonicalPrivilegeKey,
    subject: { gender: Gender; condition: Condition; isBaptized: boolean }
): boolean {
    const def = PRIVILEGE_DEF_BY_KEY.get(key);
    if (!def) return false;
    if (def.sexRule === 'male' && subject.gender !== 'brother') return false;
    if (def.requiresBaptism && !subject.isBaptized) return false;
    if (conditionRank(subject.condition) < conditionRank(def.minCondition)) return false;
    return true;
}

/**
 * Trava dura (V-6): impede que capabilities de governança técnica (`governance.*`)
 * sejam injetadas por sincronizações externas ou papéis congregacionais.
 */
export function isTechnicalGovernanceCapability(key: string): boolean {
    return TECHNICAL_GOVERNANCE_CAPABILITIES.has(key) || key.startsWith('governance.');
}

export function filterNonGovernanceCapabilities(
    capabilities: ReadonlyArray<string>
): CanonicalCapabilityKey[] {
    const clean = new Set<CanonicalCapabilityKey>();
    for (const raw of capabilities) {
        if (VALID_CAPABILITY_KEYS.has(raw) && !isTechnicalGovernanceCapability(raw)) {
            clean.add(raw as CanonicalCapabilityKey);
        }
    }
    return Array.from(clean).sort();
}

/**
 * Resolve a `funcao` canônica do RVM a partir da lista neutra de papéis congregacionais,
 * preservando a precedência dos papéis de liderança da RVM e da Comissão de Serviço.
 */
export function resolvePrimaryCanonicalFuncao(
    roles: ReadonlyArray<CanonicalCongregationRoleKey>,
    existingFuncao?: Funcao
): Funcao {
    const precedence: CanonicalCongregationRoleKey[] = [
        'rvm_overseer',
        'rvm_assistant',
        'cca',
        'secretary',
        'service_overseer',
        'announcement_board',
    ];
    for (const key of precedence) {
        if (roles.includes(key)) {
            return ROLE_TO_CANONICAL_FUNCAO.get(key) ?? null;
        }
    }
    // Preserva papel exclusivo do RVM caso nenhum papel de liderança congregacional sobreponha
    if (existingFuncao === 'Responsável pelo Quadro de Anúncios') {
        return existingFuncao;
    }
    return null;
}

/**
 * Projeta o conjunto neutro `extendedPrivileges` para os campos nativos do motor atual
 * (`PublisherPrivileges`, `PublisherPrivilegesBySection` e `isHelperOnly`), mantendo
 * 100% de compatibilidade com `eligibilityService` sem alterar `M-0…M-12`.
 */
export function projectLegacyPrivilegesFromCanonical(
    extendedPrivileges: ReadonlyArray<CanonicalPrivilegeKey>,
    subject: {
        gender: Gender;
        condition: Condition;
        isBaptized: boolean;
        preserveElderStudentParts?: boolean;
        existingElderCanDoStudentParts?: boolean;
    }
): {
    privileges: PublisherPrivileges;
    privilegesBySection: PublisherPrivilegesBySection;
    isHelperOnly: boolean;
} {
    const allowed = new Set<CanonicalPrivilegeKey>(
        extendedPrivileges.filter((k) => isPrivilegeAllowedForPublisher(k, subject))
    );
    const isBrother = subject.gender === 'brother';
    const isElder = subject.condition === 'Ancião' || subject.condition === 'Anciao';

    const hasAnyStudentTitular =
        allowed.has('midweek.student_init_call') ||
        allowed.has('midweek.student_return_visit') ||
        allowed.has('midweek.student_bible_study') ||
        allowed.has('midweek.student_talk') ||
        allowed.has('midweek.bible_reading');

    const hasAnyTeaching =
        allowed.has('midweek.treasures_talk') ||
        allowed.has('midweek.life_talk') ||
        allowed.has('midweek.local_needs') ||
        allowed.has('midweek.ministry_discussion') ||
        allowed.has('midweek.cbs_conductor') ||
        allowed.has('midweek.cbs_reader');

    const elderCanDoStudentParts = isElder
        ? subject.preserveElderStudentParts
            ? Boolean(subject.existingElderCanDoStudentParts)
            : hasAnyStudentTitular
        : false;

    const privileges: PublisherPrivileges = {
        canPreside: isElder && (allowed.has('midweek.chairman') || allowed.has('midweek.chairman_aux')),
        canConductCBS: isElder && allowed.has('midweek.cbs_conductor'),
        canReadCBS: isBrother && allowed.has('midweek.cbs_reader'),
        canPray: isBrother && subject.isBaptized && (
            allowed.has('midweek.prayer') ||
            allowed.has('midweek.open_prayer') ||
            allowed.has('midweek.close_prayer')
        ),
        canGiveTalks: isBrother && (
            allowed.has('midweek.treasures_talk') ||
            allowed.has('midweek.life_talk') ||
            allowed.has('midweek.local_needs') ||
            allowed.has('midweek.ministry_discussion')
        ),
        canGiveStudentTalks: isBrother && allowed.has('midweek.student_talk'),
        elderCanDoStudentParts,
    };

    const privilegesBySection: PublisherPrivilegesBySection = {
        canParticipateInTreasures: isBrother && (
            allowed.has('midweek.bible_reading') || allowed.has('midweek.treasures_talk')
        ),
        canParticipateInMinistry:
            allowed.has('midweek.student_init_call') ||
            allowed.has('midweek.student_return_visit') ||
            allowed.has('midweek.student_bible_study') ||
            allowed.has('midweek.student_helper') ||
            allowed.has('midweek.student_talk') ||
            allowed.has('midweek.ministry_discussion'),
        canParticipateInLife: isBrother && (
            allowed.has('midweek.life_talk') ||
            allowed.has('midweek.local_needs') ||
            allowed.has('midweek.cbs_conductor') ||
            allowed.has('midweek.cbs_reader')
        ),
    };

    const isHelperOnly =
        allowed.has('midweek.student_helper') &&
        !hasAnyStudentTitular &&
        !hasAnyTeaching;

    return { privileges, privilegesBySection, isHelperOnly };
}

/**
 * Normaliza e higieniza um `PublisherCanonicalProfile` (ordenação determinística,
 * remoção de chaves inválidas e bloqueio de capabilities `governance.*`).
 */
export function normalizeCanonicalProfile(
    input: Partial<PublisherCanonicalProfile>,
    options?: { allowTechnicalGovernance?: boolean }
): PublisherCanonicalProfile {
    const extPrivs = Array.from(
        new Set((input.extendedPrivileges || []).filter((k): k is CanonicalPrivilegeKey => VALID_PRIVILEGE_KEYS.has(k)))
    ).sort();

    const roles = Array.from(
        new Set((input.congregationRoles || []).filter((k): k is CanonicalCongregationRoleKey => VALID_ROLE_KEYS.has(k)))
    ).sort();

    const rawCaps = (input.domainCapabilities || []).filter((k): k is CanonicalCapabilityKey => VALID_CAPABILITY_KEYS.has(k));
    const caps = options?.allowTechnicalGovernance
        ? Array.from(new Set(rawCaps)).sort()
        : filterNonGovernanceCapabilities(rawCaps);

    const tags = input.tags
        ? Array.from(new Set(input.tags.map((t) => t.trim()).filter(Boolean))).sort()
        : undefined;

    return {
        contractVersion: CANONICAL_CONTRACT_VERSION,
        ...(input.congregationId ? { congregationId: input.congregationId } : {}),
        ...(input.serviceStatus ? { serviceStatus: input.serviceStatus } : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
        ...(input.baptismDate !== undefined ? { baptismDate: input.baptismDate } : {}),
        ...(input.fieldGroupName !== undefined ? { fieldGroupName: input.fieldGroupName } : {}),
        ...(input.preferredName !== undefined ? { preferredName: input.preferredName } : {}),
        extendedPrivileges: extPrivs,
        congregationRoles: roles,
        domainCapabilities: caps,
        ...(tags && tags.length > 0 ? { tags } : {}),
        ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    };
}

/**
 * Atualiza ou insere vínculo externo por `provider` de forma idempotente.
 */
export function upsertExternalLink(
    existing: ReadonlyArray<ExternalIdentityLink> | undefined,
    nextLink: ExternalIdentityLink
): ExternalIdentityLink[] {
    const list = [...(existing || [])];
    const idx = list.findIndex((item) => item.provider === nextLink.provider);
    if (idx >= 0) {
        list[idx] = nextLink;
    } else {
        list.push(nextLink);
    }
    return list.sort((a, b) => a.provider.localeCompare(b.provider));
}
