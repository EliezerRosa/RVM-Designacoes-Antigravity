import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao, EnumTipoParte } from '../types';
import { workbookService } from './workbookService';
import { localNeedsService } from './localNeedsService';
import { loadCompletedParticipations } from './historyAdapter';
import { checkEligibility, isPastWeekDate, getThursdayFromDate, isElderOrMS } from './eligibilityService';
import { getRankedCandidates } from './unifiedRotationService';

import { getModalidadeFromTipo } from '../constants/mappings';

import { isBlocked } from './cooldownService';

export interface GenerationConfig {
    isDryRun: boolean;
    generationWeeks?: string[];       // Semanas específicas para gerar (weekId)
    forceAllPartsInPeriod?: boolean;  // Se true, ignora status quando período definido
}

export interface GenerationResult {
    success: boolean;
    partsGenerated: number;
    warnings: string[];
    errors: string[];
    dryRun: boolean;
    generatedWeeks?: string[];
    message?: string;
}

/**
 * Service to handle batch generation of assignments.
 * Extracted from WorkbookManager to be used by both UI and Agent.
 */
export const generationService = {
    async generateDesignations(
        parts: WorkbookPart[],
        publishers: Publisher[],
        config?: GenerationConfig
    ): Promise<GenerationResult> {
        const isDryRun = config?.isDryRun ?? false;
        const warnings: string[] = [];

        // Helper para normalizar data
        const parseDate = (dateStr: string): Date => {
            if (!dateStr) return new Date(0);
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(dateStr + 'T12:00:00');
            const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
            return new Date(dateStr);
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filter parts needing assignment
        const partsNeedingAssignment = parts.filter(p => {
            const d = parseDate(p.date);
            if (d < today) return false; // Sempre excluir passadas
            if (p.funcao !== 'Titular' && p.funcao !== 'Ajudante') return false;
            // Se já foi concluída ou cancelada, nunca reagendar automaticamente
            if (p.status === 'CONCLUIDA' || p.status === 'CANCELADA') return false;

            // Se semanas específicas definidas → incluir TODAS do período que não estejam finalizadas
            if (config?.generationWeeks && config.generationWeeks.length > 0) {
                return config.generationWeeks.includes(p.weekId);
            }

            // Senão → só PENDENTE ou sem publicador
            return p.status === 'PENDENTE' || !p.resolvedPublisherName;
        });

        if (partsNeedingAssignment.length === 0) {
            return {
                success: false,
                partsGenerated: 0,
                warnings: [],
                errors: ['Todas as partes já foram preenchidas ou não há semanas selecionadas.'],
                dryRun: isDryRun,
                message: 'Nenhuma parte precisando de designação encontrada.'
            };
        }

        try {
            // Validação de duração
            const durationWarnings = validatePartsBeforeGeneration(partsNeedingAssignment);
            if (durationWarnings.length > 0) {
                durationWarnings.forEach(w => warnings.push(w.message));
            }

            // Carregar histórico
            let historyRecords: HistoryRecord[] = [];
            try {
                historyRecords = await loadCompletedParticipations();
            } catch (e) {
                console.warn('[GenerationService] Failed to load history:', e);
            }

            // Modalidade helper
            const getModalidade = (part: WorkbookPart): string => {
                if (part.modalidade) return part.modalidade;
                return getModalidadeFromTipo(part.tipoParte);
            };

            // Agrupar por semana
            const byWeek = partsNeedingAssignment.reduce((acc, part) => {
                const week = part.weekId || part.weekDisplay;
                if (!acc[week]) acc[week] = [];
                acc[week].push(part);
                return acc;
            }, {} as Record<string, WorkbookPart[]>);

            let totalCreated = 0;
            let totalWithPublisher = 0;
            const selectedPublisherByPart = new Map<string, { id: string; name: string }>();

            // Rastreamento in-loop para cooldown imediato


            // Carregar fila de Necessidades Locais
            let localNeedsQueue: Awaited<ReturnType<typeof localNeedsService.getPendingQueue>> = [];
            try {
                localNeedsQueue = await localNeedsService.getPendingQueue();
            } catch (e) {
                console.warn('[GenerationService] Failed to load Local Needs queue:', e);
            }
            const usedPreassignmentIds = new Set<string>();

            // ===================================
            // FASE 1: PRESIDENTES (Rotação Linear)
            // ===================================
            const presidenteParts = partsNeedingAssignment
                .filter(p => p.tipoParte.toLowerCase().includes('presidente') && p.funcao === 'Titular')
                .sort((a, b) => a.date.localeCompare(b.date));

            console.log(`[GenerationService] Processing ${presidenteParts.length} President parts`);

            for (const part of presidenteParts) {
                const thursdayDate = getThursdayFromDate(part.date);

                // Filtro de Elegibilidade + Disponibilidade
                const eligibleCandidates = publishers.filter(p => {
                    const eligResult = checkEligibility(p, EnumModalidade.PRESIDENCIA, EnumFuncao.TITULAR, { date: part.date });
                    if (!eligResult.eligible) return false;

                    const avail = p.availability;
                    if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                    return avail.availableDates.includes(thursdayDate);
                });

                // Seleção via Scientific Score
                const ranked = getRankedCandidates(eligibleCandidates, 'Presidente', historyRecords);

                // Pegar o primeiro
                const candidate = ranked.length > 0 ? ranked[0].publisher : null;

                if (candidate) {
                    selectedPublisherByPart.set(part.id, { id: candidate.id, name: candidate.name });
                    totalWithPublisher++;
                    // Não precisa adicionar a namesExcludedInWeek pois presidentes presidem a reunião toda, 
                    // mas se presidentes puderem ter partes, deveriam ser adicionados? 
                    // Na lógica original não adicionava para exclusão geral, mas vamos manter o padrão original.
                    // (Na lógica original, getNextInRotation usa new Set(), então não checava colisão consigo mesmo aqui)
                }
            }

            // ===================================
            // FASE 2 & 3: Loop Semanal (Ensino, Estudante, Demais)
            // ===================================
            for (const [_weekId, weekParts] of Object.entries(byWeek)) {
                weekParts.sort((a, b) => a.date.localeCompare(b.date));

                // Presidente designado nesta semana (para Oração Inicial e exclusão)
                const presidentePart = weekParts.find(p => p.tipoParte.toLowerCase().includes('presidente') && p.funcao === 'Titular');
                const presidenteDaSemana = presidentePart ? selectedPublisherByPart.get(presidentePart.id)?.name : undefined;

                const namesExcludedInWeek = new Set<string>();
                if (presidenteDaSemana) namesExcludedInWeek.add(presidenteDaSemana);

                // --- FASE 2: ENSINO ---
                const tiposEnsino = ['Discurso Tesouros', 'Joias Espirituais', 'Dirigente EBC', 'Leitor EBC'];
                for (const tipoEnsino of tiposEnsino) {
                    const ensinoParts = weekParts.filter(p =>
                        p.tipoParte === tipoEnsino &&
                        p.funcao === 'Titular' &&
                        !selectedPublisherByPart.has(p.id)
                    );

                    for (const ensinoPart of ensinoParts) {
                        const thursdayDate = getThursdayFromDate(ensinoPart.date);
                        const modalidadeCorreta = getModalidadeFromTipo(tipoEnsino);

                        const checkPubFilters = (p: Publisher) => {
                            const eligResult = checkEligibility(p, modalidadeCorreta as any, EnumFuncao.TITULAR, { date: ensinoPart.date });
                            if (!eligResult.eligible) return false;

                            const avail = p.availability;
                            if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                            return avail.availableDates.includes(thursdayDate);
                        };

                        let candidate: Publisher | null = null;
                        const isLeitorEBC = (tipoEnsino === 'Leitor EBC' || tipoEnsino === EnumTipoParte.LEITOR_EBC);

                        // Helper para selecionar o primeiro DISPONÍVEL da lista ranqueada
                        const pickTopRanked = (pubs: Publisher[]) => {
                            const ranked = getRankedCandidates(pubs, tipoEnsino, historyRecords);
                            // Encontrar o primeiro que NÃO está excluído nesta semana
                            return ranked.find(r => !namesExcludedInWeek.has(r.publisher.name))?.publisher || null;
                        };

                        if (isLeitorEBC) {
                            // Varão > SM > Ancião
                            // Grupo 1: Varões Comuns
                            const brothers = publishers.filter(p => !isElderOrMS(p) && checkPubFilters(p));
                            candidate = pickTopRanked(brothers);

                            if (!candidate) {
                                // Grupo 2: SM
                                const servants = publishers.filter(p => p.condition === 'Servo Ministerial' && checkPubFilters(p));
                                candidate = pickTopRanked(servants);
                            }

                            if (!candidate) {
                                // Grupo 3: Anciãos
                                const elders = publishers.filter(p => (p.condition === 'Ancião' || p.condition === 'Anciao') && checkPubFilters(p));
                                candidate = pickTopRanked(elders);
                            }
                        } else {
                            // Standard: Todos elegíveis juntos
                            const eligible = publishers.filter(p => checkPubFilters(p));
                            candidate = pickTopRanked(eligible);
                        }

                        if (candidate) {
                            selectedPublisherByPart.set(ensinoPart.id, { id: candidate.id, name: candidate.name });
                            totalWithPublisher++;
                            namesExcludedInWeek.add(candidate.name);
                        }
                    }
                }

                // --- FASE 3: ESTUDANTE ---
                const estudanteParts = weekParts.filter(p => {
                    const mod = getModalidadeFromTipo(p.tipoParte);
                    return p.funcao === 'Titular' && !selectedPublisherByPart.has(p.id) && (
                        mod === EnumModalidade.LEITURA_ESTUDANTE || mod === EnumModalidade.DEMONSTRACAO || mod === EnumModalidade.DISCURSO_ESTUDANTE
                    );
                });

                for (const estudantePart of estudanteParts) {
                    const thursdayDate = getThursdayFromDate(estudantePart.date);
                    const modalidadeCorreta = getModalidadeFromTipo(estudantePart.tipoParte);

                    const checkPubFilters = (p: Publisher) => {
                        const eligResult = checkEligibility(p, modalidadeCorreta as any, EnumFuncao.TITULAR, { date: estudantePart.date });
                        if (!eligResult.eligible) return false;
                        const avail = p.availability;
                        if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                        return avail.availableDates.includes(thursdayDate);
                    };

                    const isDemonstracao = modalidadeCorreta === EnumModalidade.DEMONSTRACAO;
                    let candidate: Publisher | null = null;

                    // Helper para selecionar o primeiro DISPONÍVEL da lista ranqueada
                    const pickTopRanked = (pubs: Publisher[]) => {
                        const ranked = getRankedCandidates(pubs, estudantePart.tipoParte, historyRecords);
                        return ranked.find(r => !namesExcludedInWeek.has(r.publisher.name))?.publisher || null;
                    };

                    if (isDemonstracao) {
                        // Irmãs > Varões > SMs > Anciãos
                        // Grupo 1: Irmãs
                        const sisters = publishers.filter(p => p.gender === 'sister' && checkPubFilters(p));
                        candidate = pickTopRanked(sisters);

                        if (!candidate) {
                            // Grupo 2: Varões Comuns
                            const brothers = publishers.filter(p => p.gender === 'brother' && !isElderOrMS(p) && checkPubFilters(p));
                            candidate = pickTopRanked(brothers);
                        }

                        if (!candidate) {
                            // Grupo 3: SMs
                            const servants = publishers.filter(p => p.condition === 'Servo Ministerial' && checkPubFilters(p));
                            candidate = pickTopRanked(servants);
                        }

                        if (!candidate) {
                            // Grupo 4: Anciãos
                            const elders = publishers.filter(p => (p.condition === 'Ancião' || p.condition === 'Anciao') && checkPubFilters(p));
                            candidate = pickTopRanked(elders);
                        }
                    } else {
                        // Standard
                        const eligible = publishers.filter(p => checkPubFilters(p));
                        candidate = pickTopRanked(eligible);
                    }

                    if (candidate) {
                        selectedPublisherByPart.set(estudantePart.id, { id: candidate.id, name: candidate.name });
                        totalWithPublisher++;
                        namesExcludedInWeek.add(candidate.name);
                    }
                }

                // --- FASE 4: DEMAIS PARTES ---
                for (const part of weekParts) {
                    if (selectedPublisherByPart.has(part.id)) continue;

                    const modalidade = getModalidade(part);
                    const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');

                    if (isOracaoInicial && presidenteDaSemana) {
                        const presidentePub = publishers.find(p => p.name === presidenteDaSemana);
                        if (presidentePub) {
                            selectedPublisherByPart.set(part.id, { id: presidentePub.id, name: presidentePub.name });
                            totalWithPublisher++;
                            continue;
                        }
                    }

                    const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

                    // Necessidades Locais (Pré-designação)
                    if (part.tipoParte === 'Necessidades Locais' && funcao === EnumFuncao.TITULAR) {
                        if (part.status === 'CANCELADA') continue;

                        const specificPreassignment = localNeedsQueue.find(p => p.targetWeek === part.weekId);
                        const nextFromQueue = localNeedsQueue.find(p => !p.targetWeek && !usedPreassignmentIds.has(p.id));
                        const preassignment = specificPreassignment || nextFromQueue;

                        if (preassignment) {
                            selectedPublisherByPart.set(part.id, { id: 'preassigned', name: preassignment.assigneeName });
                            (part as any)._localNeedsTheme = preassignment.theme;
                            (part as any)._preassignmentId = preassignment.id;
                            usedPreassignmentIds.add(preassignment.id);
                            totalWithPublisher++;
                            continue;
                        }
                    }

                    const isPast = isPastWeekDate(part.date);
                    const thursdayDate = getThursdayFromDate(part.date);

                    // Ajudante
                    if (funcao === EnumFuncao.AJUDANTE) {
                        let titularGender: 'brother' | 'sister' | undefined = undefined;
                        // Tentativas de achar titular... (Simplificado para brevidade, mas mantendo lógica principal)
                        const titularPart = weekParts.find(p => p.weekId === part.weekId && p.seq === part.seq && p.funcao === 'Titular') ||
                            weekParts.find(p => p.weekId === part.weekId && p.id !== part.id && p.tipoParte === part.tipoParte && p.funcao === 'Titular'); // Simplificação da busca posicional

                        if (titularPart) {
                            const titularName = selectedPublisherByPart.get(titularPart.id)?.name || titularPart.resolvedPublisherName || titularPart.rawPublisherName;
                            const titularPub = publishers.find(p => p.name === titularName);
                            if (titularPub) titularGender = titularPub.gender;
                        }

                        const createAjudanteFilter = (forceGender: 'brother' | 'sister' | undefined) => (p: Publisher): boolean => {
                            if (forceGender && p.gender !== forceGender) return false;
                            const eligResult = checkEligibility(p, modalidade as any, funcao, { date: part.date, isOracaoInicial, secao: part.section, isPastWeek: isPast, titularGender: forceGender });
                            if (!eligResult.eligible) return false;
                            const avail = p.availability;
                            if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                            return avail.availableDates.includes(thursdayDate);
                        };

                        let selectedPublisher: Publisher | null = null;

                        // Helper
                        const pickTopRanked = (pubs: Publisher[], type: string) => {
                            const ranked = getRankedCandidates(pubs, type, historyRecords);
                            // Ajudantes podem repetir na semana? Geralmente sim se for necessário, mas idealmente não.
                            // Original usava `new Set()` -> permitia repetição.
                            return ranked.length > 0 ? ranked[0].publisher : null;
                        };

                        if (titularGender) {
                            const filtered = publishers.filter(createAjudanteFilter(titularGender));
                            selectedPublisher = pickTopRanked(filtered, 'Ajudante');
                        } else {
                            // Fallback: Irmã depois Irmão
                            const sisters = publishers.filter(createAjudanteFilter('sister'));
                            selectedPublisher = pickTopRanked(sisters, 'Ajudante');

                            if (!selectedPublisher) {
                                const brothers = publishers.filter(createAjudanteFilter('brother'));
                                selectedPublisher = pickTopRanked(brothers, 'Ajudante');
                            }
                        }

                        if (selectedPublisher) {
                            selectedPublisherByPart.set(part.id, { id: selectedPublisher.id, name: selectedPublisher.name });
                            totalWithPublisher++;
                        }
                    }
                    // Outras partes
                    else {
                        const isOracaoFinal = part.tipoParte.toLowerCase().includes('oração final') || part.tipoParte.toLowerCase().includes('oracao final');

                        if (isOracaoFinal) {
                            const oracaoFilter = (p: Publisher) => {
                                const r = checkEligibility(p, modalidade as any, funcao, { date: part.date, isPastWeek: isPast });
                                if (!r.eligible) return false;
                                const avail = p.availability;
                                if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                                return avail.availableDates.includes(thursdayDate);
                            };

                            const eligible = publishers.filter(p => oracaoFilter(p));
                            const ranked = getRankedCandidates(eligible, 'Oração Final', historyRecords);

                            // Oração final não tem exclusão de nome? Originalmente tinha 'new Set()'.
                            // Se alguém fez parte e faz oração, deveria poder?
                            // Vamos manter sem checar namesExcludedInWeek para ser fiel ao original,
                            // MAS se quisermos coerência, a pessoa não deveria fazer 2 coisas.
                            // Original: new Set() -> passava vazio -> podia repetir.
                            // MANTEREI assim.
                            const orante = ranked.length > 0 ? ranked[0].publisher : null;

                            if (orante) {
                                selectedPublisherByPart.set(part.id, { id: orante.id, name: orante.name });
                                totalWithPublisher++;
                            }
                        } else {
                            // Genérico
                            const eligiblePublishers = publishers.filter(p => {
                                if (namesExcludedInWeek.has(p.name)) return false;
                                if (isBlocked(p.name, historyRecords, today)) return false;
                                const r = checkEligibility(p, modalidade as any, funcao, { date: part.date, isPastWeek: isPast });
                                return r.eligible;
                            });
                            if (eligiblePublishers.length > 0) {
                                const p = eligiblePublishers[0];
                                selectedPublisherByPart.set(part.id, { id: p.id, name: p.name });
                                namesExcludedInWeek.add(p.name);
                                totalWithPublisher++;
                            }
                        }
                    }
                }

                totalCreated += weekParts.length;
            }

            if (isDryRun) {
                return {
                    success: true,
                    partsGenerated: totalWithPublisher,
                    warnings,
                    errors: [],
                    dryRun: true,
                    message: `Simulação: ${totalWithPublisher} preenchidas.`
                };
            }

            // Commit Phase
            let savedCount = 0;
            for (const [partId, pubInfo] of selectedPublisherByPart.entries()) {
                // Necessidades Locais special commit
                const part = parts.find(p => p.id === partId);
                const localNeedsTheme = (part as any)._localNeedsTheme;
                const preassignmentId = (part as any)._preassignmentId;

                try {
                    if (preassignmentId && localNeedsTheme) {
                        await localNeedsService.assignToPart(preassignmentId, partId);
                        await workbookService.updatePart(partId, { tituloParte: `Necessidades Locais: ${localNeedsTheme}` });
                    }

                    if (part) {
                        // Propose or Update
                        if (part.status === 'PENDENTE' || part.status === 'PROPOSTA') {
                            await workbookService.proposePublisher(partId, pubInfo.name);
                        } else {
                            await workbookService.updatePart(partId, { resolvedPublisherName: pubInfo.name });
                        }
                    }
                    savedCount++;
                } catch (e) {
                    console.error(`[GenerationService] Error saving part ${partId}:`, e);
                    warnings.push(`Erro ao salvar parte ${part?.tipoParte}: ${e instanceof Error ? e.message : 'Unknown'}`);
                }
            }

            return {
                success: true,
                partsGenerated: savedCount,
                warnings,
                errors: [],
                dryRun: false,
                generatedWeeks: Object.keys(byWeek),
                message: `${savedCount} designações geradas com sucesso!`
            };

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Erro fatal ao gerar designações';
            return {
                success: false,
                partsGenerated: 0,
                warnings,
                errors: [errorMsg],
                dryRun: isDryRun,
                message: errorMsg
            };
        }
    }
};

// ============================================================================
// VALIDA��O (Migrado de linearRotationService)
// ============================================================================

export interface ValidationWarning {
    type: 'MISSING_DURATION' | 'MISSING_TITULAR';
    partId: string;
    weekDisplay: string;
    partTitle: string;
    message: string;
}

/**
 * Lista de tipos de partes que N�O precisam de dura��o definida.
 */
export const PARTS_WITHOUT_DURATION: string[] = [
    // C�nticos
    'C�ntico Inicial', 'C�ntico do Meio', 'C�ntico Final',
    'Cantico Inicial', 'Cantico do Meio', 'Cantico Final',
    // Ora��es
    'Ora��o Inicial', 'Ora��o Final',
    'Oracao Inicial', 'Oracao Final',
    // Presidente
    'Coment�rios Iniciais', 'Coment�rios Finais',
    'Comentarios Iniciais', 'Comentarios Finais',
    'Elogios e Conselhos',
    'Presidente', 'Presidente da Reuni�o',
];

export function isPartWithoutDuration(tituloParte: string): boolean {
    const tituloLower = tituloParte.toLowerCase();
    return PARTS_WITHOUT_DURATION.some(type =>
        tituloLower.includes(type.toLowerCase())
    );
}

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
        if (part.funcao === 'Titular') {
            if (isPartWithoutDuration(part.tituloParte)) {
                return;
            }
            const duracao = typeof part.duracao === 'string' ? parseInt(part.duracao) : part.duracao;
            if (!duracao || duracao <= 0) {
                warnings.push({
                    type: 'MISSING_DURATION',
                    partId: part.id,
                    weekDisplay: part.weekDisplay,
                    partTitle: part.tituloParte,
                    message: '\u26A0\uFE0F Parte ' + part.tituloParte + ' (' + part.weekDisplay + ') n�o tem dura��o definida'
                });
            }
        }
    });

    return warnings;
}

