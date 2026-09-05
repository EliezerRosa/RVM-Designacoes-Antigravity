/**
 * publisherHistoryService.ts
 *
 * Gerencia a busca, indexação e interpretação do histórico de alterações de perfil
 * e status de participação de publicadores (gravados em publisher_profile_history).
 */

import { supabase } from '../lib/supabase';
import type { Publisher } from '../types';

export interface ProfileHistoryRecord {
    id: number;
    publisher_id: string;
    publisher_name: string;
    changed_fields: string[];
    prev_data?: Record<string, unknown>;
    new_data?: Record<string, unknown>;
    source: string;
    author_label: string;
    author_id?: string | null;
    changed_at: string;
}

export type FormSectionType = 'status' | 'privileges' | 'sections';

// Mapeamento de campos por área/aba
export const SECTION_FIELDS: Record<FormSectionType, string[]> = {
    status: [
        'isServing',
        'isNotQualified',
        'notQualifiedReason',
        'requestedNoParticipation',
        'noParticipationReason',
        'isIndefinitelyPaused',
        'indefinitePauseReason',
        'isHelperOnly',
        'status',
        'active',
    ],
    privileges: [
        'privileges',
        'canPreside',
        'canGiveTalks',
        'canGiveStudentTalks',
        'canPray',
        'canReadCBS',
        'canConductCBS',
    ],
    sections: [
        'privilegesBySection',
        'canParticipateInTreasures',
        'canParticipateInMinistry',
        'canParticipateInLife',
    ],
};

const FIELD_LABELS: Record<string, string> = {
    isServing: 'Em Serviço',
    isNotQualified: 'Não Apto',
    notQualifiedReason: 'Motivo (Não Apto)',
    requestedNoParticipation: 'Pediu Não Participar',
    noParticipationReason: 'Motivo (Não Participar)',
    isIndefinitelyPaused: 'Pausado (Admin)',
    indefinitePauseReason: 'Motivo (Pausa)',
    isHelperOnly: 'Só Ajudante',
    privileges: 'Privilégios',
    canPreside: 'Presidir',
    canGiveTalks: 'Discurso Ensino',
    canGiveStudentTalks: 'Discurso Estudante',
    canPray: 'Oração',
    canReadCBS: 'Leitor EBC',
    canConductCBS: 'Dirigir EBC',
    privilegesBySection: 'Por Seção',
    canParticipateInTreasures: 'Tesouros',
    canParticipateInMinistry: 'Ministério',
    canParticipateInLife: 'Vida Cristã',
    name: 'Nome',
    gender: 'Gênero',
    phone: 'Telefone',
    email: 'E-mail',
    spouseId: 'Cônjuge',
    syntheticProfiles: 'Perfis Sintéticos',
    ageGroup: 'Faixa Etária',
    condition: 'Condição',
    funcao: 'Função',
    isBaptized: 'Batizado',
    parentIds: 'Pais/Tutores',
    canPairWithNonParent: 'Par com Não-Pais',
};

/**
 * Retorna o nome amigável de um campo alterado.
 */
export function getFriendlyFieldName(field: string): string {
    return FIELD_LABELS[field] || field;
}

/**
 * Avalia se um campo realmente mudou de valor semântico entre o estado anterior e o novo,
 * prevenindo falsos positivos causados por null vs false, null vs "", null vs [], etc.
 */
export function isFieldActuallyChanged(
    field: string,
    prevVal: unknown,
    newVal: unknown
): boolean {
    // 1. Campos Booleanos com padrão false (se ambos falsy -> falso)
    const FALSE_DEFAULT_BOOLEANS = [
        'isNotQualified',
        'requestedNoParticipation',
        'isIndefinitelyPaused',
        'isHelperOnly',
        'canPairWithNonParent',
        'canPreside',
        'canGiveTalks',
        'canGiveStudentTalks',
        'canPray',
        'canReadCBS',
        'canConductCBS',
        'canParticipateInTreasures',
        'canParticipateInMinistry',
        'canParticipateInLife',
    ];

    if (FALSE_DEFAULT_BOOLEANS.includes(field)) {
        return Boolean(prevVal) !== Boolean(newVal);
    }

    // 2. Campos Booleanos com padrão true (isServing, active, isBaptized)
    if (field === 'isServing' || field === 'active' || field === 'isBaptized') {
        const pBool = prevVal === undefined || prevVal === null ? true : Boolean(prevVal);
        const nBool = newVal === undefined || newVal === null ? true : Boolean(newVal);
        return pBool !== nBool;
    }

    // 3. Strings livres e telefones
    const STRING_FIELDS = [
        'notQualifiedReason',
        'noParticipationReason',
        'indefinitePauseReason',
        'email',
        'phone',
        'contact_phone',
        'spouseId',
        'name',
        'gender',
        'ageGroup',
        'condition',
        'funcao',
        'address',
        'status',
    ];

    if (STRING_FIELDS.includes(field)) {
        const sPrev = typeof prevVal === 'string' ? prevVal.trim() : '';
        const sNew = typeof newVal === 'string' ? newVal.trim() : '';
        if (field === 'phone' || field === 'contact_phone') {
            const dPrev = sPrev.replace(/\D/g, '');
            const dNew = sNew.replace(/\D/g, '');
            return dPrev !== dNew;
        }
        return sPrev !== sNew;
    }

    // 4. Arrays (syntheticProfiles, parentIds, aliases)
    if (field === 'syntheticProfiles' || field === 'parentIds' || field === 'aliases') {
        const arrPrev = Array.isArray(prevVal) ? [...prevVal].map(String).sort() : [];
        const arrNew = Array.isArray(newVal) ? [...newVal].map(String).sort() : [];
        return JSON.stringify(arrPrev) !== JSON.stringify(arrNew);
    }

    // 5. Objetos aninhados: privileges
    if (field === 'privileges') {
        const pPrev = (prevVal && typeof prevVal === 'object') ? prevVal as Record<string, unknown> : {};
        const pNew = (newVal && typeof newVal === 'object') ? newVal as Record<string, unknown> : {};
        const privKeys = ['canPreside', 'canGiveTalks', 'canGiveStudentTalks', 'canPray', 'canReadCBS', 'canConductCBS'];
        return privKeys.some(k => Boolean(pPrev[k]) !== Boolean(pNew[k]));
    }

    // 6. Objetos aninhados: privilegesBySection
    if (field === 'privilegesBySection') {
        const sPrev = (prevVal && typeof prevVal === 'object') ? prevVal as Record<string, unknown> : {};
        const sNew = (newVal && typeof newVal === 'object') ? newVal as Record<string, unknown> : {};
        const secKeys = ['canParticipateInTreasures', 'canParticipateInMinistry', 'canParticipateInLife'];
        return secKeys.some(k => Boolean(sPrev[k]) !== Boolean(sNew[k]));
    }

    // 7. Fallback genérico: se ambos forem nulos/falsy vazios
    const isFalsyOrEmpty = (v: unknown) =>
        v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);

    if (isFalsyOrEmpty(prevVal) && isFalsyOrEmpty(newVal)) {
        return false;
    }

    return JSON.stringify(prevVal ?? null) !== JSON.stringify(newVal ?? null);
}

/**
 * Sanitiza um registro de histórico extraindo apenas os campos que realmente mudaram
 * semânticamente entre prev_data e new_data (eliminando falsos positivos).
 */
export function sanitizeHistoryRecord(rec: ProfileHistoryRecord): ProfileHistoryRecord {
    if (!rec || !rec.prev_data || !rec.new_data) {
        return rec;
    }
    const prev = rec.prev_data;
    const next = rec.new_data;

    // Se changed_fields estiver ausente ou vazio, calcula a partir de todas as chaves
    const candidateFields = rec.changed_fields && rec.changed_fields.length > 0
        ? rec.changed_fields
        : Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));

    const realFields: string[] = [];
    for (const f of candidateFields) {
        if (
            f === 'availability' ||
            f === 'availabilityMeta' ||
            f === 'profileMeta' ||
            f === 'updatedAt' ||
            f === 'updatedBy' ||
            f === 'id'
        ) {
            continue;
        }
        if (isFieldActuallyChanged(f, prev[f], next[f])) {
            realFields.push(f);
        }
    }

    return {
        ...rec,
        changed_fields: realFields,
    };
}

/**
 * Busca histórico via RPC SECURITY DEFINER `get_publisher_profile_history_for_form`.
 */
export async function fetchPublisherProfileHistory(token?: string | null): Promise<ProfileHistoryRecord[]> {
    try {
        const { data, error } = await supabase.rpc('get_publisher_profile_history_for_form', {
            p_token: token || null,
            p_publisher_id: null,
        });

        if (error) {
            console.warn('[publisherHistoryService] RPC error fetching history:', error);
            return [];
        }

        const raw = (data || []) as ProfileHistoryRecord[];
        return raw
            .map(sanitizeHistoryRecord)
            .filter(r => r.changed_fields && r.changed_fields.length > 0);
    } catch (err) {
        console.error('[publisherHistoryService] Error loading history:', err);
        return [];
    }
}

/**
 * Agrupa histórico por publisher_id.
 */
export function groupHistoryByPublisher(records: ProfileHistoryRecord[]): Map<string, ProfileHistoryRecord[]> {
    const map = new Map<string, ProfileHistoryRecord[]>();
    for (const rec of records) {
        const list = map.get(rec.publisher_id) || [];
        list.push(rec);
        map.set(rec.publisher_id, list);
    }
    return map;
}

export const indexHistoryByPublisher = groupHistoryByPublisher;

export interface LastChangeInfo {
    author: string;
    date: string;
    dateFormatted: string;
    fields: string[];
    isSectionSpecific: boolean;
    areaLabel: string;
    record?: ProfileHistoryRecord;
}

/**
 * Formata data curta amigável (ex: "03/09 às 17:13" ou "25/04").
 */
export function formatHistoryDate(isoDate: string, full = false): string {
    if (!isoDate) return '';
    try {
        const d = new Date(isoDate);
        if (isNaN(d.getTime())) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');

        if (full) {
            return `${day}/${month}/${year} às ${hours}:${mins}`;
        }
        return `${day}/${month} ${hours}:${mins}`;
    } catch {
        return '';
    }
}

/**
 * Limpa o label do autor para exibição compacta de tela.
 * Ex: "SEC (portal): Marcos Rogério" -> "SEC: Marcos Rogério"
 * Ex: "SEC (portal): SEC - Marcos Rogério" -> "SEC: Marcos Rogério"
 * Ex: "admin_app" ou "Admin" -> "Admin"
 */
export function formatAuthorShort(author: string): string {
    if (!author) return 'Sistema';
    let cleaned = author
        .replace(/\(portal\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    // Limpa redundâncias como "SEC : SEC - Marcos Rogério" -> "SEC: Marcos Rogério"
    cleaned = cleaned.replace(/^(\w+)\s*:\s*\1\s*-\s*/i, '$1: ');
    cleaned = cleaned.replace(/^(\w+)\s*:\s*\1\s*:\s*/i, '$1: ');
    cleaned = cleaned.replace(/^(\w+)\s*:\s*\1\s+/i, '$1: ');
    return cleaned;
}

/**
 * Localiza a última alteração relevante para a aba ativa (ou geral) do publicador.
 */
export function resolveLastChangeForSection(
    publisherOrRecords: Publisher | ProfileHistoryRecord[] | null | undefined,
    recordsOrSection: ProfileHistoryRecord[] | FormSectionType,
    maybeSection?: FormSectionType
): LastChangeInfo | null {
    let publisher: Publisher | null = null;
    let records: ProfileHistoryRecord[] = [];
    let section: FormSectionType = 'status';

    if (Array.isArray(publisherOrRecords)) {
        // Chamado com (records, section)
        records = publisherOrRecords;
        section = (typeof recordsOrSection === 'string' ? recordsOrSection : 'status') as FormSectionType;
    } else {
        // Chamado com (publisher, records, section)
        publisher = publisherOrRecords || null;
        records = Array.isArray(recordsOrSection) ? recordsOrSection : [];
        section = (maybeSection || 'status') as FormSectionType;
    }

    if (!Array.isArray(records)) {
        records = [];
    }

    // Sanitiza os registros garantindo apenas mudanças reais
    const sanitizedRecords = records
        .map(sanitizeHistoryRecord)
        .filter(r => r.changed_fields && r.changed_fields.length > 0);

    const sectionTargetFields = SECTION_FIELDS[section] || [];

    // 1) Procura o registro mais recente que tocou especificamente nos campos desta seção
    const specificRecord = sanitizedRecords.find(r =>
        r && r.changed_fields && Array.isArray(r.changed_fields) && r.changed_fields.some(f => sectionTargetFields.includes(f))
    );

    if (specificRecord) {
        const sectionLabel = section === 'status' ? 'Status' : section === 'privileges' ? 'Privilégios' : 'Por Seção';
        // FILTRAGEM CRUCIAL: Retorna ESTRITAMENTE os campos da seção ativa (sem vazar campos de outras abas)
        const sectionOnlyFields = specificRecord.changed_fields.filter(f => sectionTargetFields.includes(f));
        return {
            author: formatAuthorShort(specificRecord.author_label),
            date: specificRecord.changed_at,
            dateFormatted: formatHistoryDate(specificRecord.changed_at),
            fields: sectionOnlyFields,
            isSectionSpecific: true,
            areaLabel: sectionLabel,
            record: specificRecord,
        };
    }

    // 2) Se não há histórico específico desta seção mas há algum registro geral
    if (sanitizedRecords.length > 0) {
        const latest = sanitizedRecords[0];
        if (latest) {
            return {
                author: formatAuthorShort(latest.author_label),
                date: latest.changed_at,
                dateFormatted: formatHistoryDate(latest.changed_at),
                fields: latest.changed_fields || [],
                isSectionSpecific: false,
                areaLabel: 'Geral',
                record: latest,
            };
        }
    }

    // 3) Fallback para profileMeta embutido no JSONB do publicador
    if (publisher) {
        const meta = (publisher as any).profileMeta;
        if (meta && meta.updatedAt) {
            const rawFields: string[] = meta.changedFields || [];
            const specificMetaFields = rawFields.filter(f => sectionTargetFields.includes(f));
            if (specificMetaFields.length > 0) {
                const sectionLabel = section === 'status' ? 'Status' : section === 'privileges' ? 'Privilégios' : 'Por Seção';
                return {
                    author: formatAuthorShort(meta.updatedBy || 'Admin'),
                    date: meta.updatedAt,
                    dateFormatted: formatHistoryDate(meta.updatedAt),
                    fields: specificMetaFields,
                    isSectionSpecific: true,
                    areaLabel: sectionLabel,
                };
            }
            return {
                author: formatAuthorShort(meta.updatedBy || 'Admin'),
                date: meta.updatedAt,
                dateFormatted: formatHistoryDate(meta.updatedAt),
                fields: rawFields,
                isSectionSpecific: false,
                areaLabel: 'Geral',
            };
        }
    }

    return null;
}

/**
 * Identifica "Status Invisíveis a Nível de Código Duro" que afetam a participação
 * do publicador mas não são óbvios nas colunas comuns.
 */
export interface InvisibleHardcodedStatus {
    id: string;
    label: string;
    icon: string;
    tooltip: string;
    badgeBg: string;
    badgeColor: string;
}

export function getInvisibleHardcodedStatuses(
    publisher: Publisher,
    currentSection: FormSectionType
): InvisibleHardcodedStatus[] {
    const statuses: InvisibleHardcodedStatus[] = [];

    // 1. Não Batizado (Código duro em Oração, Presidir, Ensino, EBC)
    if (publisher.isBaptized === false) {
        statuses.push({
            id: 'not_baptized',
            label: 'Não Batizado',
            icon: '💧',
            tooltip: 'Regra de Código Duro: Publicador não batizado é impedido pelo motor de presidir, fazer oração, dar discurso de ensino e ler/dirigir EBC (mesmo se os privilégios forem ligados).',
            badgeBg: '#FEF3C7',
            badgeColor: '#B45309',
        });
    }

    // 2. Indisponibilidade Temporal (Calendário / Férias / Ausência)
    const avail = publisher.availability;
    if (avail) {
        if (avail.mode === 'never') {
            statuses.push({
                id: 'avail_never',
                label: 'Indisponível Geral',
                icon: '📅',
                tooltip: 'Regra de Calendário: Modo definido como "Nunca disponível". O motor bloqueia designações automáticas para este publicador.',
                badgeBg: '#FEE2E2',
                badgeColor: '#B91C1C',
            });
        } else if (avail.exceptionDates && avail.exceptionDates.length > 0) {
            const count = avail.exceptionDates.length;
            statuses.push({
                id: 'avail_exceptions',
                label: `${count} sem. indisponível`,
                icon: '📅',
                tooltip: `Indisponibilidade no Calendário: ${count} semana(s) marcada(s) como indisponível (${avail.exceptionDates.slice(0, 3).join(', ')}${count > 3 ? '...' : ''}). O motor bloqueia designações nessas datas.`,
                badgeBg: '#E0F2FE',
                badgeColor: '#0369A1',
            });
        }
    }

    // 3. Criança (Código duro para partes de estudante)
    if (publisher.ageGroup === 'child') {
        statuses.push({
            id: 'child_rule',
            label: 'Criança',
            icon: '👶',
            tooltip: 'Regra de Código Duro: Crianças (child) não são designadas para partes de estudante na reunião (somente como ajudantes em demonstrações).',
            badgeBg: '#F3F4F6',
            badgeColor: '#4B5563',
        });
    }

    // 4. Irmãs na aba de Privilégios (Código duro litúrgico)
    if (currentSection === 'privileges' && publisher.gender === 'sister') {
        statuses.push({
            id: 'sister_liturgical',
            label: 'Restrições Litúrgicas',
            icon: '👩',
            tooltip: 'Regra de Código Duro: As diretrizes da reunião impedem irmãs de presidir, orar, dar discursos de ensino ou ler/dirigir EBC.',
            badgeBg: '#F3E8FF',
            badgeColor: '#7E22CE',
        });
    }

    // 5. Restrição de Pareamento Apenas com Pais
    if (publisher.canPairWithNonParent === false && (publisher.parentIds || []).length > 0) {
        statuses.push({
            id: 'parent_only',
            label: 'Só com Pais',
            icon: '👨‍👧',
            tooltip: 'Regra de Pareamento: Menor só pode realizar demonstrações tendo o pai ou a mãe como ajudante/titular.',
            badgeBg: '#FDF2F8',
            badgeColor: '#BE185D',
        });
    }

    return statuses;
}

/**
 * Atualiza o autor de um registro do histórico (ou do profileMeta do publicador)
 * via RPC SECURITY DEFINER `update_publisher_profile_history_author`.
 */
export async function updateProfileHistoryAuthor(
    historyId: number | null | undefined,
    newAuthor: string,
    publisherId?: string,
    token?: string | null
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.rpc('update_publisher_profile_history_author', {
            p_history_id: historyId && historyId > 0 ? historyId : null,
            p_new_author_label: newAuthor.trim(),
            p_publisher_id: publisherId || null,
            p_token: token || null,
        });

        if (error) {
            console.error('[publisherHistoryService] RPC error updating author:', error);
            return { success: false, error: error.message };
        }

        const res = data as { success?: boolean; error?: string };
        return { success: !!res?.success, error: res?.error };
    } catch (err: any) {
        console.error('[publisherHistoryService] Error updating author:', err);
        return { success: false, error: err?.message || String(err) };
    }
}
