/**
 * Assignment Service - RVM Designações v6.0
 * 
 * Implementa designação por prioridade dinâmica para 3 grupos:
 * - Presidentes: Anciãos + SMs aprovados
 * - Ensino: Anciãos + SMs (Tesouros, Joias, EBC)
 * - Estudante: Todos elegíveis (Leitura, Demos)
 */

import type { Publisher, HistoryRecord } from '../types';
import { calculateRotationPriority } from './cooldownService';

// ===== Constantes =====

// ===== Grupos =====

/**
 * Grupo Presidentes: Anciãos + SMs aprovados para presidir
 */
export function getGrupoPresidentes(publishers: Publisher[]): Publisher[] {
    return publishers.filter(p =>
        p.condition === 'Ancião' ||
        p.condition === 'Anciao' ||
        (p.condition === 'Servo Ministerial' && p.privileges?.canPreside)
    );
}

/**
 * Grupo Ensino: Todos Anciãos + SMs
 * Para Leitor EBC, inclui também irmãos batizados elegíveis
 */
export function getGrupoEnsino(publishers: Publisher[]): Publisher[] {
    return publishers.filter(p =>
        p.condition === 'Ancião' ||
        p.condition === 'Anciao' ||
        p.condition === 'Servo Ministerial'
    );
}

/**
 * Grupo Ensino Expandido (para Leitor EBC): Anciãos + SMs + Irmãos batizados elegíveis
 */
export function getGrupoEnsinoExpandido(publishers: Publisher[]): Publisher[] {
    return publishers.filter(p =>
        p.condition === 'Ancião' ||
        p.condition === 'Anciao' ||
        p.condition === 'Servo Ministerial' ||
        ((p.gender as string) === 'M' && p.isServing && (p.condition as string) === 'Publicador Batizado')
    );
}

/**
 * Grupo Estudante: Todos elegíveis (batizados + não-batizados)
 */
export function getGrupoEstudante(publishers: Publisher[]): Publisher[] {
    return publishers.filter(p => p.isServing);
}

// ===== Ranking por Prioridade =====

export interface RankedPublisher {
    publisher: Publisher;
    priority: number;
}

/**
 * Calcula prioridade e retorna lista ordenada DESC (maior prioridade primeiro)
 */
export function rankByPriority(
    eligiblePublishers: Publisher[],
    historyRecords: HistoryRecord[],
    tipoParte: string,
    funcao: string,
    inLoopAssignments: Array<{
        date: string;
        tipoParte: string;
        resolvedPublisherName: string;
        funcao: string;
    }> = []
): RankedPublisher[] {
    const ranked: RankedPublisher[] = [];

    eligiblePublishers.forEach(pub => {
        const priority = calculateRotationPriority(
            pub.name,
            historyRecords,
            tipoParte,
            funcao,
            new Date(),
            inLoopAssignments
        );

        ranked.push({
            publisher: pub,
            priority
        });
    });

    // Ordenar DESC (maior prioridade primeiro)
    ranked.sort((a, b) => b.priority - a.priority);

    return ranked;
}

/**
 * Tipo para resultado de designação em lote
 */
export interface BatchAssignmentResult {
    assignments: Array<{ partId: string; publisher: Publisher }>;
    remainingPublishers: Publisher[];
    logs: string[];
}

/**
 * Designa múltiplas partes do mesmo tipo em sequência.
 * Semana1→1º, Semana2→2º, etc.
 */
export function assignInSequence(
    parts: Array<{ id: string; date: string; weekDisplay: string }>,
    rankedPublishers: RankedPublisher[],
    inLoopAssignments: Array<{
        date: string;
        tipoParte: string;
        resolvedPublisherName: string;
        funcao: string;
    }>,
    _tipoParte: string
): BatchAssignmentResult {
    const assignments: Array<{ partId: string; publisher: Publisher }> = [];
    const logs: string[] = [];
    const usedNames = new Set<string>();

    // Ordenar partes por data
    const sortedParts = [...parts].sort((a, b) => a.date.localeCompare(b.date));

    let publisherIndex = 0;

    for (const part of sortedParts) {
        // Encontrar próximo publicador disponível (não usado ainda nesta batch)
        while (publisherIndex < rankedPublishers.length) {
            const candidate = rankedPublishers[publisherIndex];

            if (!usedNames.has(candidate.publisher.name)) {
                // Verificar se não foi designado in-loop para mesma semana
                const alreadyInWeek = inLoopAssignments.some(a =>
                    a.resolvedPublisherName === candidate.publisher.name &&
                    a.date === part.date
                );

                if (!alreadyInWeek) {
                    assignments.push({ partId: part.id, publisher: candidate.publisher });
                    usedNames.add(candidate.publisher.name);
                    logs.push(`${part.weekDisplay}: ${candidate.publisher.name} (${candidate.priority}pts)`);
                    publisherIndex++;
                    break;
                }
            }
            publisherIndex++;
        }

        if (publisherIndex >= rankedPublishers.length) {
            logs.push(`${part.weekDisplay}: ⚠️ Sem publicadores disponíveis`);
        }
    }

    // Publicadores não usados
    const remainingPublishers = rankedPublishers
        .filter(r => !usedNames.has(r.publisher.name))
        .map(r => r.publisher);

    return { assignments, remainingPublishers, logs };
}

// ===== Validações =====

export interface ValidationWarning {
    type: 'MISSING_DURATION' | 'MISSING_TITULAR';
    partId: string;
    weekDisplay: string;
    partTitle: string;
    message: string;
}

/**
 * Valida partes antes de gerar designações.
 * Retorna avisos para partes de titular sem duração definida.
 */
export function validatePartsBeforeGeneration(
    parts: Array<{
        id: string;
        funcao: string;
        duracao?: number | string;
        weekDisplay: string;
        tituloParte: string;
        resolvedPublisherName?: string;
    }>
): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    parts.forEach(part => {
        // Aviso: Parte de Titular sem duração
        if (part.funcao === 'Titular') {
            const duracao = typeof part.duracao === 'string' ? parseInt(part.duracao) : part.duracao;
            if (!duracao || duracao <= 0) {
                warnings.push({
                    type: 'MISSING_DURATION',
                    partId: part.id,
                    weekDisplay: part.weekDisplay,
                    partTitle: part.tituloParte,
                    message: `⚠️ Parte "${part.tituloParte}" (${part.weekDisplay}) não tem duração definida`
                });
            }
        }
    });

    return warnings;
}
