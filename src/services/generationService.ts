import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao, EnumTipoParte } from '../types';
import { workbookService } from './workbookService';
import { localNeedsService } from './localNeedsService';
import { loadCompletedParticipations } from './historyAdapter';
import { checkEligibility, isPastWeekDate, getThursdayFromDate, isElderOrMS } from './eligibilityService';
import { getNextInRotation } from './fairRotationService';

import { getModalidadeFromTipo } from '../constants/mappings';
import { validatePartsBeforeGeneration } from './linearRotationService';
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
                const availabilityFilter = (p: Publisher): boolean => {
                    const eligResult = checkEligibility(p, EnumModalidade.PRESIDENCIA, EnumFuncao.TITULAR, { date: part.date });
                    if (!eligResult.eligible) return false;

                    const avail = p.availability;
                    if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                    return avail.availableDates.includes(thursdayDate);
                };

                const { publisher: candidate } = await getNextInRotation(
                    publishers,
                    'presidentes',
                    new Set<string>(),
                    availabilityFilter
                );

                if (candidate) {
                    selectedPublisherByPart.set(part.id, { id: candidate.id, name: candidate.name });
                    totalWithPublisher++;
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

                        const ensinoFilter = (p: Publisher): boolean => {
                            const eligResult = checkEligibility(p, modalidadeCorreta as any, EnumFuncao.TITULAR, { date: ensinoPart.date });
                            if (!eligResult.eligible) return false;

                            const avail = p.availability;
                            if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                            return avail.availableDates.includes(thursdayDate);
                        };

                        let candidate: Publisher | null = null;
                        const isLeitorEBC = (tipoEnsino === 'Leitor EBC' || tipoEnsino === EnumTipoParte.LEITOR_EBC);

                        if (isLeitorEBC) {
                            // Varão > SM > Ancião
                            const commonBrotherResult = await getNextInRotation(publishers, 'ensino', namesExcludedInWeek, (p) => !isElderOrMS(p) && ensinoFilter(p));
                            if (commonBrotherResult.publisher) candidate = commonBrotherResult.publisher;
                            else {
                                const msResult = await getNextInRotation(publishers, 'ensino', namesExcludedInWeek, (p) => p.condition === 'Servo Ministerial' && ensinoFilter(p));
                                if (msResult.publisher) candidate = msResult.publisher;
                                else {
                                    const elderResult = await getNextInRotation(publishers, 'ensino', namesExcludedInWeek, (p) => (p.condition === 'Ancião' || p.condition === 'Anciao') && ensinoFilter(p));
                                    if (elderResult.publisher) candidate = elderResult.publisher;
                                }
                            }
                        } else {
                            const standardResult = await getNextInRotation(publishers, 'ensino', namesExcludedInWeek, ensinoFilter);
                            candidate = standardResult.publisher;
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

                    const estudanteFilter = (p: Publisher): boolean => {
                        const eligResult = checkEligibility(p, modalidadeCorreta as any, EnumFuncao.TITULAR, { date: estudantePart.date });
                        if (!eligResult.eligible) return false;
                        const avail = p.availability;
                        if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                        return avail.availableDates.includes(thursdayDate);
                    };

                    const isDemonstracao = modalidadeCorreta === EnumModalidade.DEMONSTRACAO;
                    let candidate: Publisher | null = null;

                    if (isDemonstracao) {
                        // Irmãs > Varões > SMs > Anciãos
                        const sisterResult = await getNextInRotation(publishers, 'estudante', namesExcludedInWeek, (p) => p.gender === 'sister' && estudanteFilter(p));
                        if (sisterResult.publisher) candidate = sisterResult.publisher;
                        else {
                            const brotherResult = await getNextInRotation(publishers, 'estudante', namesExcludedInWeek, (p) => p.gender === 'brother' && !isElderOrMS(p) && estudanteFilter(p));
                            if (brotherResult.publisher) candidate = brotherResult.publisher;
                            else {
                                const msResult = await getNextInRotation(publishers, 'estudante', namesExcludedInWeek, (p) => p.condition === 'Servo Ministerial' && estudanteFilter(p));
                                if (msResult.publisher) candidate = msResult.publisher;
                                else {
                                    const elderResult = await getNextInRotation(publishers, 'estudante', namesExcludedInWeek, (p) => (p.condition === 'Ancião' || p.condition === 'Anciao') && estudanteFilter(p));
                                    if (elderResult.publisher) candidate = elderResult.publisher;
                                }
                            }
                        }
                    } else {
                        const standardResult = await getNextInRotation(publishers, 'estudante', namesExcludedInWeek, estudanteFilter);
                        candidate = standardResult.publisher;
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
                        if (titularGender) {
                            const group = titularGender === 'brother' ? 'ajudante_m' : 'ajudante_f';
                            const res = await getNextInRotation(publishers, group, new Set(), createAjudanteFilter(titularGender));
                            selectedPublisher = res.publisher;
                        } else {
                            // Fallback: Irmã depois Irmão
                            const r1 = await getNextInRotation(publishers, 'ajudante_f', new Set(), createAjudanteFilter('sister'));
                            if (r1.publisher) selectedPublisher = r1.publisher;
                            else {
                                const r2 = await getNextInRotation(publishers, 'ajudante_m', new Set(), createAjudanteFilter('brother'));
                                selectedPublisher = r2.publisher;
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
                            const { publisher: orante } = await getNextInRotation(publishers, 'oracao_final', new Set(), oracaoFilter);
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
