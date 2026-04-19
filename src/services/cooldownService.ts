/**
 * Cooldown & Blocking Service - RVM Designações v9.0
 * 
 * MUDANÇA v9.0: O cooldown agora é um BLOQUEIO REAL, não apenas penalização.
 * Publicadores em cooldown são PULADOS pelo motor de rotação.
 * Seleção manual via Dropdown pode "atropelar" com confirmação do usuário.
 * 
 * Implementa as regras de:
 * - Bloqueio por cooldown (3 semanas sem poder participar)
 * - Gap mínimo entre participações (2 semanas = alerta visual)
 * - Detecção de múltiplas designações na mesma semana
 */

import type { HistoryRecord } from '../types';

// ===== Constantes de Configuração v9.0 =====

export const COOLDOWN_WEEKS = 3; // Semanas de BLOQUEIO após participar
export const COOLDOWN_WEEKS_HELPER = 2; // Semanas de bloqueio para Ajudante
export const MIN_WEEK_GAP = 2; // Gap mínimo entre qualquer participação (ALERTA GRAVE)

// Tipo para categorias de participação (usado em filtros)
export type ParticipationCategory = 'MAIN' | 'HELPER' | 'IGNORED';

/**
 * Determina categoria da parte para cálculo de prioridade.
 * MAIN = conta para bloqueio, HELPER = pouco peso, IGNORED = não conta
 */
export function getParticipationCategory(tipoParte: string, funcao: string = 'Titular'): ParticipationCategory {
    // 1. Ajudante SEMPRE tem peso mínimo
    if (funcao === 'Ajudante') return 'HELPER';

    const lower = tipoParte?.toLowerCase() || '';

    // 2. Presidente conta como MAIN para bloqueio (garante rotação entre anciãos)
    if (lower.includes('presidente')) {
        return 'MAIN';
    }

    // 3. IGNORADOS: Orações, NL, Cânticos, e partes secundárias da Presidência - NÃO CONTAM para bloqueio
    if (lower.includes('oração') ||
        lower.includes('oracao') ||
        lower.includes('necessidades') ||
        lower.includes('cântico') ||
        lower.includes('cantico') ||
        lower.includes('elogios') ||
        lower.includes('comentários iniciais') ||
        lower.includes('comentarios iniciais') ||
        lower.includes('observações finais') ||
        lower.includes('observacoes finais') ||
        lower.includes('comentários finais') ||
        lower.includes('comentarios finais')) {
        return 'IGNORED';
    }

    // 3. MAIN: Todo o resto conta para bloqueio
    return 'MAIN';
}

/**
 * Define prioridade de exibição para Label de Cooldown
 * Maior número = Maior prioridade
 */
function getPartPriority(h: HistoryRecord): number {
    const type = (h.tipoParte || '').toLowerCase();
    const role = (h.funcao || '').toLowerCase();

    if (type.includes('presidente')) return 100;
    if (type.includes('discurso')) return 90;
    if (type.includes('jóias') || type.includes('joias') || type.includes('tesouros')) return 50;
    if (type.includes('vida cristã') || type.includes('vida crista')) return 50;
    if (type.includes('leitura')) return 60;
    if (type.includes('oração')) return 40;
    if (role === 'ajudante') return 10;
    if (type.includes('comentários') || type.includes('comentarios')) return 20;

    return 30; // Default
}

// ===== Interfaces =====

export interface CooldownInfo {
    isInCooldown: boolean;
    weeksSinceLast: number;
    cooldownRemaining: number;
    lastPartType: string;
    lastDate: string;
    weekDisplay: string; // v9.6: Para exibir "Semana X" em vez de data exata (que pode ser domingo)
}

/**
 * v9.0: Verifica se um publicador está BLOQUEADO.
 * Um publicador está bloqueado se participou de qualquer parte MAIN nos últimos COOLDOWN_WEEKS.
 * 
 * Esta verificação é usada pelo motor de rotação para PULAR publicadores bloqueados.
 * 
 * @param publisherName Nome do publicador
 * @param history Histórico de participações (HistoryRecord[])
 * @param today Data de referência (default: hoje)
 * @returns true se bloqueado, false se disponível
 */
export function isBlocked(
    publisherName: string,
    history: HistoryRecord[],
    today: Date = new Date()
): boolean {
    // Filtrar histórico do publicador - apenas partes MAIN (não orações, não ajudante)
    const relevantHistory = history.filter(h => {
        const isThisPublisher = h.resolvedPublisherName === publisherName || h.rawPublisherName === publisherName;
        if (!isThisPublisher) return false;

        // Só contar partes MAIN para bloqueio
        const category = getParticipationCategory(h.tipoParte || '', h.funcao || '');
        return category === 'MAIN';
    });

    if (relevantHistory.length === 0) {
        return false; // Nunca participou em partes MAIN, não está bloqueado
    }

    // Encontrar a participação mais recente
    const dates = relevantHistory.map(h => new Date(h.date || '').getTime());
    const mostRecent = Math.max(...dates, 0);

    if (mostRecent === 0) {
        return false; // Datas inválidas
    }

    const daysSinceLast = Math.floor((today.getTime() - mostRecent) / (1000 * 60 * 60 * 24));
    const weeksSinceLast = Math.floor(daysSinceLast / 7);

    return weeksSinceLast < COOLDOWN_WEEKS;
}

export function getBlockInfo(
    publisherName: string,
    history: HistoryRecord[],
    today: Date = new Date()
): CooldownInfo | null {
    // Filtrar histórico do publicador - apenas partes MAIN
    const relevantHistory = history.filter(h => {
        const isThisPublisher = h.resolvedPublisherName === publisherName || h.rawPublisherName === publisherName;
        if (!isThisPublisher) return false;

        const category = getParticipationCategory(h.tipoParte || '', h.funcao || '');
        return category === 'MAIN';
    }).sort((a, b) => {
        const dateA = new Date(a.date || '');
        const dateB = new Date(b.date || '');
        const timeDiff = dateB.getTime() - dateA.getTime(); // Mais recente primeiro

        if (timeDiff !== 0) return timeDiff;

        // v9.7: Desempate por Prioridade (Ex: Presidente > Comentários)
        return getPartPriority(b) - getPartPriority(a);
    });

    if (relevantHistory.length === 0) {
        return null; // Nunca participou
    }

    const lastRecord = relevantHistory[0];
    const lastDate = new Date(lastRecord.date || '');
    const daysSinceLast = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeksSinceLast = Math.floor(daysSinceLast / 7);

    return {
        isInCooldown: weeksSinceLast < COOLDOWN_WEEKS,
        weeksSinceLast,
        cooldownRemaining: Math.max(0, COOLDOWN_WEEKS - weeksSinceLast),
        lastPartType: lastRecord.tipoParte || lastRecord.tituloParte || '',
        lastDate: lastRecord.date || '',
        weekDisplay: lastRecord.weekDisplay || '' // Novo campo
    };
}

export function getCooldownInfo(
    publisherName: string,
    partType: string,
    history: HistoryRecord[],
    today: Date = new Date()
): CooldownInfo | null {
    // Filtrar histórico do publicador para o tipo de parte específico
    const relevantHistory = history
        .filter(h =>
            (h.resolvedPublisherName === publisherName || h.rawPublisherName === publisherName) &&
            (h.tipoParte === partType || h.tituloParte === partType)
        )
        .sort((a, b) => {
            const dateA = new Date(a.date || '');
            const dateB = new Date(b.date || '');
            return dateB.getTime() - dateA.getTime(); // Mais recente primeiro
        });

    if (relevantHistory.length === 0) {
        return null; // Nunca fez esta parte
    }

    const lastRecord = relevantHistory[0];
    const lastDate = new Date(lastRecord.date || lastRecord.date || '');
    const daysSinceLast = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeksSinceLast = Math.floor(daysSinceLast / 7);

    return {
        isInCooldown: weeksSinceLast < COOLDOWN_WEEKS,
        weeksSinceLast,
        cooldownRemaining: Math.max(0, COOLDOWN_WEEKS - weeksSinceLast),
        lastPartType: lastRecord.tipoParte || lastRecord.tituloParte || '',
        lastDate: lastRecord.date || lastRecord.date || '',
        weekDisplay: lastRecord.weekDisplay || '' // Novo campo
    };
}

/**
 * Calcula prioridade baseada APENAS em tempo (ignora status).
 * Usado para indicador "⚡ PRÓXIMO NA FILA" no dropdown.
 */
export function calculateTimeOnlyPriority(
    publisherName: string,
    history: HistoryRecord[],
    today: Date = new Date()
): number {
    // Filtrar histórico do publicador pelo nome
    const publisherHistory = history.filter(h =>
        h.resolvedPublisherName === publisherName ||
        h.rawPublisherName === publisherName
    );

    if (publisherHistory.length === 0) {
        // Nunca participou → prioridade máxima
        return Number.MAX_SAFE_INTEGER;
    }

    // Encontrar a data mais recente de qualquer participação
    const dates = publisherHistory.map(h => new Date(h.date || ''));
    const mostRecent = dates.reduce((max, d) => d > max ? d : max, new Date(0));

    // Calcular dias desde última participação
    const daysSinceLast = Math.floor((today.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24));

    return daysSinceLast;
}

// ===== Funções Auxiliares =====

/**
 * Estatísticas de participação de um publicador
 */
export function getParticipationStats(
    publisherName: string,
    history: HistoryRecord[],
    _today: Date = new Date()
): {
    totalParticipations: number;
    teachingCount: number;
    studentCount: number;
    helperCount: number;
    lastParticipation: string | null;
    averageIntervalDays: number;
} {
    const fullHistory = history.filter(h =>
        h.resolvedPublisherName === publisherName ||
        h.rawPublisherName === publisherName
    );

    if (fullHistory.length === 0) {
        return {
            totalParticipations: 0,
            teachingCount: 0,
            studentCount: 0,
            helperCount: 0,
            lastParticipation: null,
            averageIntervalDays: 0
        };
    }

    let teachingCount = 0;
    let studentCount = 0;
    let helperCount = 0;

    fullHistory.forEach(h => {
        const category = getParticipationCategory(h.tipoParte || '', h.funcao || '');
        if (category === 'MAIN') {
            // Determinar se é ensino ou estudante baseado no tipo
            const lower = (h.tipoParte || '').toLowerCase();
            if (lower.includes('leitura') || lower.includes('demonstra') || lower.includes('discurso')) {
                studentCount++;
            } else {
                teachingCount++;
            }
        } else if (category === 'HELPER') {
            helperCount++;
        }
    });

    // Ordenar por data para encontrar mais recente e calcular intervalo médio
    const sortedByDate = [...fullHistory].sort((a, b) =>
        new Date(b.date || '').getTime() - new Date(a.date || '').getTime()
    );

    const lastParticipation = sortedByDate[0]?.date || null;

    // Calcular intervalo médio
    let avgInterval = 0;
    if (sortedByDate.length > 1) {
        const dates = sortedByDate.map(h => new Date(h.date || '').getTime());
        let totalInterval = 0;
        for (let i = 0; i < dates.length - 1; i++) {
            totalInterval += dates[i] - dates[i + 1];
        }
        avgInterval = Math.floor(totalInterval / (dates.length - 1) / (1000 * 60 * 60 * 24));
    }

    return {
        totalParticipations: fullHistory.length,
        teachingCount,
        studentCount,
        helperCount,
        lastParticipation,
        averageIntervalDays: avgInterval
    };
}

// ===== Alertas de Designação Múltipla =====

/**
 * Interface para alertas de designação múltipla
 */
export interface AssignmentWarning {
    type: 'SAME_WEEK' | 'ADJACENT_WEEK';
    weekId: string;
    weekDisplay: string;
    partTitle: string;
    date: string;
    message: string;
}

/**
 * Verifica se um publicador tem múltiplas designações na mesma semana ou semanas adjacentes.
 * Retorna alertas (warnings) em vez de bloquear - é informativo, não restritivo.
 */
export function checkMultipleAssignments(
    publisherName: string,
    currentWeekId: string,
    currentPartId: string,
    allParts: Array<{
        id: string;
        weekId: string;
        weekDisplay: string;
        tipoParte: string;
        tituloParte: string;
        date: string;
        rawPublisherName: string;
        resolvedPublisherName?: string;
        status?: string;
    }>,
    excludePresidency: boolean = true
): AssignmentWarning[] {
    const warnings: AssignmentWarning[] = [];

    // Filtrar partes do mesmo publicador (excluindo a parte atual)
    const publisherParts = allParts.filter(p =>
        p.id !== currentPartId &&
        (p.resolvedPublisherName === publisherName || p.rawPublisherName === publisherName) &&
        (p.status !== 'CANCELADA') &&
        // Excluir presidência se solicitado (não conta como "participação" para este aviso)
        (!excludePresidency || !p.tipoParte?.toLowerCase().includes('presidente'))
    );

    // Extrair números das semanas para comparação de adjacência
    // weekId format esperado: "2025-01" ou "YYYY-WW"
    const parseWeekNumber = (weekId: string): number => {
        const parts = weekId.split('-');
        if (parts.length === 2) {
            const year = parseInt(parts[0]);
            const week = parseInt(parts[1]);
            return year * 100 + week;
        }
        return 0;
    };

    // Helper para identificar partes que não geram conflito "real"
    const isNonConflictingPart = (p: { tipoParte: string; tituloParte: string }) => {
        const type = (p.tipoParte || '').toLowerCase();
        // 1. Oração Final é explicitamente permitida como segunda parte
        if (type.includes('oração final') || type.includes('oracao final')) return true;

        // 2. Partes do Presidente (se flag ativa)
        if (excludePresidency) {
            if (type.includes('presidente')) return true;
            // Usa check mais robusto de partes auto-atribuídas (importado ou inline se não disponível)
            // Lógica inline para evitar dependência circular se mappings.ts importar cooldownService
            if (type.includes('comentários') || type.includes('comentarios') ||
                type.includes('elogios') || type.includes('oração inicial') || type.includes('oracao inicial')) {
                return true;
            }
        }
        return false;
    };

    const currentWeekNum = parseWeekNumber(currentWeekId);

    for (const part of publisherParts) {
        // Ignorar partes que não geram conflito (Ex: Oração Final, ou partes do Presidente)
        if (isNonConflictingPart(part)) continue;

        const partWeekNum = parseWeekNumber(part.weekId);

        // Mesma semana
        if (part.weekId === currentWeekId) {
            warnings.push({
                type: 'SAME_WEEK',
                weekId: part.weekId,
                weekDisplay: part.weekDisplay,
                partTitle: part.tituloParte || part.tipoParte,
                date: part.date,
                message: `⚠️ Já designado para "${part.tituloParte || part.tipoParte}" nesta mesma semana`
            });
        }
        // Semana anterior ou posterior (adjacente)
        else if (Math.abs(partWeekNum - currentWeekNum) === 1) {
            warnings.push({
                type: 'ADJACENT_WEEK',
                weekId: part.weekId,
                weekDisplay: part.weekDisplay,
                partTitle: part.tituloParte || part.tipoParte,
                date: part.date,
                message: `📅 Também designado na semana ${partWeekNum < currentWeekNum ? 'anterior' : 'seguinte'}: "${part.tituloParte || part.tipoParte}"`
            });
        }
    }

    return warnings;
}
