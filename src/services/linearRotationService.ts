/**
 * Linear Rotation Service - RVM Designações v5.0
 * 
 * Implementa rotação linear para:
 * - Presidentes: Ciclo puro (A→B→C→A)
 * - Ensino: Ciclo + Prioridade + Cooldown (híbrido)
 */

import type { Publisher, HistoryRecord } from '../types';
import { calculateRotationPriority } from './cooldownService';

// ===== Constantes =====
const LINEAR_BONUS = 10; // Bônus de pontos para próximo no ciclo

// ===== Persistência de Índices =====

export function loadLinearIndex(groupName: 'presidente' | 'ensino'): number {
    const stored = localStorage.getItem(`rvm_${groupName}_idx`);
    return stored ? parseInt(stored, 10) : 0;
}

export function saveLinearIndex(groupName: 'presidente' | 'ensino', index: number): void {
    localStorage.setItem(`rvm_${groupName}_idx`, index.toString());
}

// ===== Grupos =====

/**
 * Grupo Presidentes: Anciãos + SMs aprovados para presidir
 * Ordenado alfabeticamente para ciclo estável
 */
export function getGrupoPresidentes(publishers: Publisher[]): Publisher[] {
    return publishers
        .filter(p =>
            p.condition === 'Ancião' ||
            p.condition === 'Anciao' ||
            (p.condition === 'Servo Ministerial' && p.privileges?.canPreside)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Grupo Ensino: Todos Anciãos + SMs
 * Ordenado alfabeticamente para ciclo estável
 */
export function getGrupoEnsino(publishers: Publisher[]): Publisher[] {
    return publishers
        .filter(p =>
            p.condition === 'Ancião' ||
            p.condition === 'Anciao' ||
            p.condition === 'Servo Ministerial'
        )
        .sort((a, b) => a.name.localeCompare(b.name));
}

// ===== Rotação Linear Pura (Presidentes) =====

export interface LinearSelectionResult {
    publisher: Publisher | null;
    nextIndex: number;
    skippedNames: string[];
}

/**
 * Seleciona próximo presidente no ciclo linear.
 * Ignora prioridade/cooldown - apenas verifica disponibilidade.
 */
export function selectNextPresident(
    grupo: Publisher[],
    currentIndex: number,
    unavailableNames: string[] = []
): LinearSelectionResult {
    if (grupo.length === 0) {
        return { publisher: null, nextIndex: currentIndex, skippedNames: [] };
    }

    const skippedNames: string[] = [];
    let attempts = 0;
    let idx = currentIndex % grupo.length;

    while (attempts < grupo.length) {
        const candidate = grupo[idx];
        if (!unavailableNames.includes(candidate.name)) {
            return {
                publisher: candidate,
                nextIndex: (idx + 1) % grupo.length,
                skippedNames
            };
        }
        skippedNames.push(candidate.name);
        idx = (idx + 1) % grupo.length;
        attempts++;
    }

    // Ninguém disponível
    return { publisher: null, nextIndex: currentIndex, skippedNames };
}

// ===== Rotação Linear + Prioridade + Cooldown (Ensino) =====

export interface HybridSelectionResult {
    publisher: Publisher | null;
    nextIndex: number;
    wasLinearChoice: boolean;
    scores: Array<{ name: string; priority: number; linearBonus: number; total: number }>;
}

/**
 * Seleciona próximo membro de ensino usando lógica híbrida:
 * - Calcula prioridade normal para cada elegível
 * - Adiciona bônus de +10 para quem é próximo no ciclo
 * - Escolhe maior pontuação total
 */
export function selectNextEnsinoMember(
    grupo: Publisher[],
    currentIndex: number,
    eligiblePublishers: Publisher[],
    history: HistoryRecord[],
    partType: string,
    futureAssignments?: Array<{
        date: string;
        tipoParte: string;
        rawPublisherName?: string;
        resolvedPublisherName?: string;
        funcao?: string;
    }>
): HybridSelectionResult {
    if (eligiblePublishers.length === 0) {
        return { publisher: null, nextIndex: currentIndex, wasLinearChoice: false, scores: [] };
    }

    const nextInCycle = grupo[currentIndex % grupo.length];
    const scores: Array<{ name: string; priority: number; linearBonus: number; total: number }> = [];

    eligiblePublishers.forEach(pub => {
        const priority = calculateRotationPriority(
            pub.name,
            history,
            partType,
            'Titular',
            new Date(),
            futureAssignments
        );

        const linearBonus = (pub.name === nextInCycle?.name) ? LINEAR_BONUS : 0;
        const total = priority + linearBonus;

        scores.push({
            name: pub.name,
            priority,
            linearBonus,
            total
        });
    });

    // Ordenar por total (maior primeiro)
    scores.sort((a, b) => b.total - a.total);

    const winner = eligiblePublishers.find(p => p.name === scores[0]?.name) || null;
    const wasLinearChoice = winner?.name === nextInCycle?.name;

    // Avançar índice apenas se o escolhido for o próximo no ciclo
    let nextIndex = currentIndex;
    if (wasLinearChoice) {
        nextIndex = (currentIndex + 1) % grupo.length;
    }

    return {
        publisher: winner,
        nextIndex,
        wasLinearChoice,
        scores
    };
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
