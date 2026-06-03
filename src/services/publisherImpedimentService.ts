/**
 * Publisher Impediment Service - RVM Designações
 *
 * Detecta designações futuras/atuais que ficam inválidas após
 * alterações no cadastro de um publicador (status, privilégios, seções).
 *
 * Usado por App.tsx, AgentModalHost e PublisherStatusForm para exibir
 * alerta de confirmação antes de salvar o publicador.
 */

import type { Publisher, WorkbookPart } from '../types';
import { checkEligibility, buildEligibilityContext } from './eligibilityService';

export interface ImpedimentEntry {
    part: WorkbookPart;
    reason: string;
}

/**
 * Campos cuja alteração pode causar impedimento em designações já feitas.
 * Usado para atalhar a verificação pesada (skip se nenhum campo relevante mudou).
 */
function hasImpedimentCausingChange(old: Publisher, updated: Publisher): boolean {
    if (old.isServing !== updated.isServing) return true;
    if (old.isNotQualified !== updated.isNotQualified) return true;
    if (old.requestedNoParticipation !== updated.requestedNoParticipation) return true;
    if (old.isHelperOnly !== updated.isHelperOnly) return true;
    if (old.gender !== updated.gender) return true;
    if (old.isBaptized !== updated.isBaptized) return true;

    // Privilégios gerais
    const op = old.privileges || ({} as Partial<Publisher['privileges']>);
    const np = updated.privileges || ({} as Partial<Publisher['privileges']>);
    if (
        op.canPreside !== np.canPreside ||
        op.canGiveTalks !== np.canGiveTalks ||
        op.canGiveStudentTalks !== np.canGiveStudentTalks ||
        op.canPray !== np.canPray ||
        op.canConductCBS !== np.canConductCBS ||
        op.canReadCBS !== np.canReadCBS
    ) return true;

    // Permissões por seção
    const os = old.privilegesBySection || ({} as Partial<Publisher['privilegesBySection']>);
    const ns = updated.privilegesBySection || ({} as Partial<Publisher['privilegesBySection']>);
    if (
        os.canParticipateInTreasures !== ns.canParticipateInTreasures ||
        os.canParticipateInMinistry !== ns.canParticipateInMinistry ||
        os.canParticipateInLife !== ns.canParticipateInLife
    ) return true;

    // Disponibilidade (defensivo: dados legados podem não ter availableDates/exceptionDates)
    const oa = old.availability || { mode: 'always', exceptionDates: [], availableDates: [] };
    const na = updated.availability || { mode: 'always', exceptionDates: [], availableDates: [] };
    if (oa.mode !== na.mode) return true;
    const oaExc = Array.isArray(oa.exceptionDates) ? oa.exceptionDates : [];
    const naExc = Array.isArray(na.exceptionDates) ? na.exceptionDates : [];
    const oaAv = Array.isArray(oa.availableDates) ? oa.availableDates : [];
    const naAv = Array.isArray(na.availableDates) ? na.availableDates : [];
    if (JSON.stringify([...oaExc].sort()) !== JSON.stringify([...naExc].sort())) return true;
    if (JSON.stringify([...oaAv].sort()) !== JSON.stringify([...naAv].sort())) return true;

    return false;
}

/**
 * Retorna as designações futuras/atuais que serão inválidas com o publicador atualizado.
 *
 * @param oldPublisher   Estado atual no banco
 * @param updatedPublisher Estado após o save (com as alterações)
 * @param allParts       Todas as partes da apostila (filtramos aqui)
 * @param allPublishers  Lista completa de publicadores (para buildEligibilityContext)
 * @param todayWeekId    WeekId da semana atual (ISO YYYY-MM-DD do início da semana)
 */
export function findPublisherImpediments(
    oldPublisher: Publisher,
    updatedPublisher: Publisher,
    allParts: WorkbookPart[],
    allPublishers: Publisher[],
    todayWeekId: string
): ImpedimentEntry[] {
    // Atalho: se nenhum campo relevante mudou, não há o que verificar
    if (!hasImpedimentCausingChange(oldPublisher, updatedPublisher)) return [];

    // Partes atribuídas a este publicador em semanas atuais ou futuras
    const name = updatedPublisher.name.trim().toLowerCase();
    const futureParts = allParts.filter(p => {
        const assigned = (p.resolvedPublisherName || '').trim().toLowerCase();
        if (assigned !== name) return false;
        if (p.weekId < todayWeekId) return false;
        // Ignorar partes já concluídas ou canceladas
        if (p.status === 'CONCLUIDA' || p.status === 'CANCELADA') return false;
        return true;
    });

    if (futureParts.length === 0) return [];

    // Atualizar o publicador no array para que buildEligibilityContext use os novos dados
    const publishersWithUpdate = allPublishers.map(p =>
        p.id === updatedPublisher.id ? updatedPublisher : p
    );

    const impediments: ImpedimentEntry[] = [];

    for (const part of futureParts) {
        const weekParts = allParts.filter(p => p.weekId === part.weekId);
        const ctx = buildEligibilityContext(part, weekParts, publishersWithUpdate);
        const result = checkEligibility(
            updatedPublisher,
            part.modalidade as Parameters<typeof checkEligibility>[1],
            part.funcao as Parameters<typeof checkEligibility>[2],
            ctx
        );
        if (!result.eligible) {
            impediments.push({ part, reason: result.reason || 'Inelegível após alteração de cadastro' });
        }
    }

    return impediments;
}
