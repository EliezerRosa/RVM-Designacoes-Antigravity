import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao, EnumTipoParte, HistoryStatus } from '../types';
import { loadCompletedParticipations } from './historyAdapter';
import { checkEligibility, isPastWeekDate, getThursdayFromDate, getWeekMondayId, isElderOrMS } from './eligibilityService';
import { getRankedCandidates, getRotationConfig, getMostRecentFSMRole, wasRecentlyPairedWith } from './unifiedRotationService';
import { generationCommitService } from './generationCommitService';
import { localNeedsService } from './localNeedsService';

import { getModalidadeFromTipo, isNonDesignatablePart, isCleanablePart, isAutoAssignedToChairman } from '../constants/mappings';

import { isBlocked, COOLDOWN_WEEKS, COOLDOWN_WEEKS_HELPER } from './cooldownService';
import { ELIGIBILITY_RULES_VERSION } from './eligibilityService';
import { auditService } from './auditService';

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
            // Cânticos, Comentários Iniciais/Finais, Elogios e Conselhos NUNCA recebem designação
            if (isNonDesignatablePart(p.tipoParte)) {
                // v9.1: Se tiver lixo (nome preenchido), incluir para limpar!
                if (p.resolvedPublisherName || p.rawPublisherName) return true;
                return false;
            }
            // Se já foi concluída ou cancelada, nunca reagendar automaticamente
            if (p.status === 'CONCLUIDA' || p.status === 'CANCELADA') return false;

            // Se semanas específicas definidas → incluir TODAS do período que não estejam finalizadas
            if (config?.generationWeeks && config.generationWeeks.length > 0) {
                return config.generationWeeks.includes(p.weekId);
            }

            // Senão → só PENDENTE ou sem publicador
            // OU se tiver publicador, mas for INVÁLIDO (Sanity Check v9.2)
            if (p.status === 'PENDENTE' || !p.resolvedPublisherName) return true;

            // Check if existing assignment is valid
            // Only check if we are forced to re-evaluate or if status is not finalized
            // Mas o usuário quer corrigir "resíduos". Então vamos checar PROPOSTA/DESIGNADA também se estiver no range.
            if (p.status === 'PROPOSTA' || p.status === 'DESIGNADA') {
                const pubName = p.resolvedPublisherName;
                const publisher = publishers.find(pub => pub.name === pubName);
                if (publisher) {
                    // Copied helper logic or use direct import
                    const mod = p.modalidade || getModalidadeFromTipo(p.tipoParte, p.section);

                    // Simple check: Gender/Modality mismatch is the main issue
                    const eligibility = checkEligibility(publisher, mod as any, p.funcao, {
                        date: p.date,
                        secao: p.section,
                        partTitle: p.tituloParte,
                        partDescription: p.descricaoParte,
                        partDetails: p.detalhesParte,
                    });
                    if (!eligibility.eligible) {
                        console.log(`[SanityCheck] Found invalid assignment: ${pubName} for ${p.tipoParte} (${eligibility.reason}). Marking for re-generation.`);
                        return true;
                    }
                }
            }

            return false;
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
                return getModalidadeFromTipo(part.tipoParte, part.section);
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
            // FASE 0: LIMPEZA (Cleanup) - Apenas Cânticos
            // ===================================
            // Identificar partes que devem ser LIMPAS (Cânticos)
            const partsToClean = partsNeedingAssignment.filter(p => isCleanablePart(p.tipoParte));
            for (const part of partsToClean) {
                // Marca com string vazia para o Commit Phase saber que é limpeza
                selectedPublisherByPart.set(part.id, { id: 'CLEANUP', name: '' });
            }

            // ===================================
            // FASE 0.5: SANITY CHECK (Invalid Assignments)
            // ===================================
            // Remove designações inválidas (ex: Irmãs em Discurso) para permitir que o motor tente preencher corretamente
            for (const part of partsNeedingAssignment) {
                if (part.resolvedPublisherName) {
                    const pubName = part.resolvedPublisherName;
                    const publisher = publishers.find(pub => pub.name === pubName);
                    if (publisher) {
                        const mod = part.modalidade || getModalidadeFromTipo(part.tipoParte, part.section);
                        const eligibility = checkEligibility(publisher, mod as any, part.funcao, {
                            date: part.date,
                            secao: part.section,
                            partTitle: part.tituloParte,
                            partDescription: part.descricaoParte,
                            partDetails: part.detalhesParte,
                        });

                        if (!eligibility.eligible) {
                            // MARCA PARA LIMPEZA. Se o motor encontrar alguém, sobrescreve. Se não, fica limpo.
                            selectedPublisherByPart.set(part.id, { id: 'CLEANUP', name: '' });
                        }
                    }
                }
            }

            // ===================================
            // FASE 1: PRESIDENTES (Rotação Linear)
            // ===================================
            const presidenteParts = partsNeedingAssignment
                .filter(p => p.tipoParte.toLowerCase().includes('presidente') && p.funcao === 'Titular')
                .sort((a, b) => a.date.localeCompare(b.date));

            console.log(`[GenerationService] Processing ${presidenteParts.length} President parts`);

            for (const part of presidenteParts) {
                const thursdayDate = getThursdayFromDate(part.date);
                const weekId = getWeekMondayId(part.date);

                // Filtro de Elegibilidade + Disponibilidade
                const eligibleCandidates = publishers.filter(p => {
                    const eligResult = checkEligibility(p, EnumModalidade.PRESIDENCIA, EnumFuncao.TITULAR, {
                        date: part.date,
                        partTitle: part.tituloParte,
                        partDescription: part.descricaoParte,
                        partDetails: part.detalhesParte,
                    });
                    if (!eligResult.eligible) return false;

                    const avail = p.availability;
                    if (avail.mode === 'always') return !avail.exceptionDates.includes(weekId) && !avail.exceptionDates.includes(thursdayDate);
                    return avail.availableDates.includes(weekId) || avail.availableDates.includes(thursdayDate);
                });

                // Seleção via Scientific Score (mesma fonte do painel/agente:
                // filtra a semana corrente do histórico + usa data da parte como referência)
                const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                const historyForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
                const ranked = getRankedCandidates(eligibleCandidates, 'Presidente', historyForRanking, undefined, safeThursdayDate);

                // v10: Pegar o primeiro NÃO bloqueado
                // CORRECTION O: Use target date (thursdayDate)
                const candidate = ranked.find(r => !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate))?.publisher
                    || (ranked.length > 0 ? ranked[0].publisher : null); // Fallback se todos bloqueados

                if (candidate) {
                    selectedPublisherByPart.set(part.id, { id: candidate.id, name: candidate.name });
                    totalWithPublisher++;

                    // Intra-batch: Injeta como histórico sintético para que a próxima semana
                    // veja esta presidência e não repita o mesmo ancião consecutivamente
                    historyRecords.push({
                        id: `synth-pres-${part.id}`,
                        weekId: part.weekId,
                        weekDisplay: part.weekDisplay,
                        date: part.date,
                        section: part.section,
                        tipoParte: part.tipoParte,
                        modalidade: part.modalidade || '',
                        tituloParte: '',
                        descricaoParte: '',
                        detalhesParte: '',
                        seq: part.seq,
                        funcao: 'Titular',
                        duracao: 0,
                        horaInicio: '',
                        horaFim: '',
                        rawPublisherName: candidate.name,
                        resolvedPublisherName: candidate.name,
                        status: HistoryStatus.APPROVED,
                        importSource: 'AUTO_INJECTED',
                        importBatchId: '',
                        createdAt: new Date().toISOString(),
                    });
                }
            }

            // ===================================
            // FASE 1.5: AUTO-DESIGNAÇÃO (Presidente)
            // ===================================
            // Atribui Oração Inicial, Comentários, etc. ao Presidente da Semana
            for (const weekId of Object.keys(byWeek)) {
                const weekParts = byWeek[weekId];

                // Encontrar o Presidente desta semana (já processado na Fase 1 ou existente no array)
                let chairmanName = 'Presidente da Reunião'; // Fallback
                let chairmanId = ''; // ID real do publicador (FK -> publishers.id)

                // 1. Tenta achar nos selecionados agora (Fase 1)
                const chairmanPart = weekParts.find(p => p.tipoParte.toLowerCase().includes('presidente'));
                if (chairmanPart && selectedPublisherByPart.has(chairmanPart.id)) {
                    const sel = selectedPublisherByPart.get(chairmanPart.id);
                    chairmanName = sel?.name || chairmanName;
                    chairmanId = sel?.id || '';
                } else if (chairmanPart?.resolvedPublisherName) {
                    // 2. Tenta achar se já estava salvo antes
                    chairmanName = chairmanPart.resolvedPublisherName;
                    chairmanId = chairmanPart.resolvedPublisherId || '';
                }

                // Auto-atribuir partes do presidente
                const autoAssignParts = weekParts.filter(p => isAutoAssignedToChairman(p.tipoParte));
                for (const part of autoAssignParts) {
                    // Se já estiver correto no banco, ignora (para não gastar update)
                    if (part.resolvedPublisherName === chairmanName) continue;

                    // Sem chairmanId real não persistimos (FK validaria e quebraria).
                    // O fluxo normal é: chairmanPart é commitado primeiro e
                    // workbookService.syncChairmanAssignments propaga depois com FK válida.
                    if (!chairmanId) continue;

                    selectedPublisherByPart.set(part.id, {
                        id: chairmanId,
                        name: chairmanName
                    });
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
                // v9.5: Add missing Teaching types to ensure they use Ranked Selection (not strict blocking)
                const tiposEnsino = [
                    'Discurso Tesouros',
                    'Joias Espirituais',
                    'Dirigente EBC',
                    'Leitor EBC',
                    'Discurso de Ensino',
                    'Parte Vida Cristã',
                    'Parte Vida Crista'
                ];
                for (const tipoEnsino of tiposEnsino) {
                    const ensinoParts = weekParts.filter(p =>
                        p.tipoParte === tipoEnsino &&
                        p.funcao === 'Titular' &&
                        !selectedPublisherByPart.has(p.id)
                    );

                    for (const ensinoPart of ensinoParts) {
                        const thursdayDate = getThursdayFromDate(ensinoPart.date);
                        const weekId = getWeekMondayId(ensinoPart.date);
                        // v8.5: Passar seção para garantir fallback correto (Vida Cristã vs Tesouros)
                        const modalidadeCorreta = getModalidadeFromTipo(tipoEnsino, ensinoPart.section);

                        const checkPubFilters = (p: Publisher) => {
                            const eligResult = checkEligibility(p, modalidadeCorreta as any, EnumFuncao.TITULAR, {
                                date: ensinoPart.date,
                                secao: ensinoPart.section,
                                partTitle: ensinoPart.tituloParte,
                                partDescription: ensinoPart.descricaoParte,
                                partDetails: ensinoPart.detalhesParte,
                            });
                            if (!eligResult.eligible) return false;

                            const avail = p.availability;
                            if (avail.mode === 'always') return !avail.exceptionDates.includes(weekId) && !avail.exceptionDates.includes(thursdayDate);
                            return avail.availableDates.includes(weekId) || avail.availableDates.includes(thursdayDate);
                        };

                        let candidate: Publisher | null = null;
                        const isLeitorEBC = (tipoEnsino === 'Leitor EBC' || tipoEnsino === EnumTipoParte.LEITOR_EBC);

                        // Helper para selecionar o primeiro DISPONÍVEL da lista ranqueada
                        const pickTopRanked = (pubs: Publisher[]) => {
                            // Mesma fonte do painel/agente: filtrar semana corrente + refDate
                            const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                            const historyForRanking = historyRecords.filter(h => h.weekId !== ensinoPart.weekId);
                            const ranked = getRankedCandidates(pubs, tipoEnsino, historyForRanking, undefined, safeThursdayDate);
                            return ranked.find(r =>
                                !namesExcludedInWeek.has(r.publisher.name) &&
                                !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate)
                            )?.publisher || null;
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
                    const weekId = getWeekMondayId(estudantePart.date);
                    const modalidadeCorreta = getModalidadeFromTipo(estudantePart.tipoParte);

                    // Q2 (Titular FSM): bloquear quem foi Titular em parte FSM nas últimas N semanas.
                    const cfgRuntime = getRotationConfig();
                    const alternWeeks = cfgRuntime.ROLE_ALTERNATION_WINDOW_WEEKS ?? 0;
                    const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                    const historyForChecks = historyRecords.filter(h => h.weekId !== estudantePart.weekId);

                    const checkPubFilters = (p: Publisher) => {
                        const eligResult = checkEligibility(p, modalidadeCorreta as any, EnumFuncao.TITULAR, {
                            date: estudantePart.date,
                            secao: estudantePart.section,
                            partTitle: estudantePart.tituloParte,
                            partDescription: estudantePart.descricaoParte,
                            partDetails: estudantePart.detalhesParte,
                        });
                        if (!eligResult.eligible) return false;
                        const avail = p.availability;
                        const availableHere = avail.mode === 'always'
                            ? !avail.exceptionDates.includes(weekId) && !avail.exceptionDates.includes(thursdayDate)
                            : avail.availableDates.includes(weekId) || avail.availableDates.includes(thursdayDate);
                        if (!availableHere) return false;

                        // Q2 bidirecional: se a última participação FSM foi Titular, bloquear novo Titular.
                        if (alternWeeks > 0) {
                            const lastRole = getMostRecentFSMRole(p.name, historyForChecks, safeThursdayDate, alternWeeks);
                            if (lastRole === 'Titular') return false;
                        }
                        return true;
                    };

                    const isDemonstracao = modalidadeCorreta === EnumModalidade.DEMONSTRACAO;
                    let candidate: Publisher | null = null;

                    // Helper para selecionar o primeiro DISPONÍVEL da lista ranqueada
                    const pickTopRanked = (pubs: Publisher[]) => {
                        // Mesma fonte do painel/agente
                        const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                        const historyForRanking = historyRecords.filter(h => h.weekId !== estudantePart.weekId);
                        const ranked = getRankedCandidates(pubs, estudantePart.tipoParte, historyForRanking, undefined, safeThursdayDate);
                        return ranked.find(r =>
                            !namesExcludedInWeek.has(r.publisher.name) &&
                            !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate)
                        )?.publisher || null;
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

                    // Fase H.8 (2026-05-22): partes auto-atribuídas ao Presidente NUNCA
                    // entram em rotação. Se o Presidente já foi designado, a Fase 1.5
                    // (acima) ou o trigger `trg_sync_chairman_derived_parts` (DB) cuidam
                    // de propagar o publisher. Se o Presidente ainda não foi designado,
                    // a derivada PERMANECE pendente (não pegamos um publicador aleatório).
                    if (isAutoAssignedToChairman(part.tipoParte)) continue;

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

                        const specificPreassignment = localNeedsQueue.find((preassignment) => preassignment.targetWeek === part.weekId);
                        const nextFromQueue = localNeedsQueue.find((preassignment) => !preassignment.targetWeek && !usedPreassignmentIds.has(preassignment.id));
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
                    const weekId = getWeekMondayId(part.date);
                    if (funcao === EnumFuncao.AJUDANTE) {
                        let titularGender: 'brother' | 'sister' | undefined = undefined;
                        let titularPublisherId: string | undefined = undefined;
                        let titularSpouseId: string | undefined = undefined;
                        let titularParentIds: string[] = [];
                        let titularChildIds: string[] = [];
                        let titularNameResolved: string | undefined = undefined;
                        // Tentativas de achar titular... (Simplificado para brevidade, mas mantendo lógica principal)
                        const titularPart = weekParts.find(p => p.weekId === part.weekId && p.seq === part.seq && p.funcao === 'Titular') ||
                            weekParts.find(p => p.weekId === part.weekId && p.id !== part.id && p.tipoParte === part.tipoParte && p.funcao === 'Titular'); // Simplificação da busca posicional

                        // Verificar se o titular é uma parte SOLO (sem ajudante)
                        // Ex: Discurso de Estudante, Leitura da Bíblia
                        if (titularPart) {
                            const titularMod = titularPart.modalidade || getModalidadeFromTipo(titularPart.tipoParte, titularPart.section);
                            const soloModalidades = [EnumModalidade.DISCURSO_ESTUDANTE, EnumModalidade.LEITURA_ESTUDANTE];
                            if (soloModalidades.includes(titularMod as any)) {
                                // Parte solo — não designar ajudante, limpar se existente
                                if (part.resolvedPublisherName) {
                                    selectedPublisherByPart.set(part.id, { id: 'CLEANUP', name: '' });
                                }
                                continue;
                            }

                            const titularName = selectedPublisherByPart.get(titularPart.id)?.name || titularPart.resolvedPublisherName || titularPart.rawPublisherName;
                            const titularPub = publishers.find(p => p.name === titularName);
                            if (titularPub) {
                                titularGender = titularPub.gender;
                                titularPublisherId = titularPub.id;
                                titularSpouseId = titularPub.spouseId;
                                titularParentIds = titularPub.parentIds || [];
                                titularChildIds = publishers
                                    .filter(p => (p.parentIds || []).includes(titularPub.id))
                                    .map(p => p.id);
                                titularNameResolved = titularPub.name;
                            }
                        }

                        // Janelas configuráveis (Motor — Q2/Q3)
                        const cfgRuntime = getRotationConfig();
                        const alternWeeks = cfgRuntime.ROLE_ALTERNATION_WINDOW_WEEKS ?? 0;
                        const pairWeeks = cfgRuntime.PAIR_REPETITION_WINDOW_WEEKS ?? 0;
                        const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                        const historyForChecks = historyRecords.filter(h => h.weekId !== part.weekId);

                        const createAjudanteFilter = (forceGender: 'brother' | 'sister' | undefined) => (p: Publisher): boolean => {
                            // Q1: pré-filtro de gênero REMOVIDO — canBeHelper decide com bypass cônjuge/pai-filho.
                            const eligResult = checkEligibility(p, modalidade as any, funcao, {
                                date: part.date,
                                isOracaoInicial,
                                secao: part.section,
                                isPastWeek: isPast,
                                titularGender: forceGender,
                                titularPublisherId,
                                titularSpouseId,
                                titularParentIds,
                                titularChildIds,
                                partTitle: part.tituloParte,
                                partDescription: part.descricaoParte,
                                partDetails: part.detalhesParte,
                            });
                            if (!eligResult.eligible) return false;
                            const avail = p.availability;
                            const availableHere = avail.mode === 'always'
                                ? !avail.exceptionDates.includes(weekId) && !avail.exceptionDates.includes(thursdayDate)
                                : avail.availableDates.includes(weekId) || avail.availableDates.includes(thursdayDate);
                            if (!availableHere) return false;

                            // Q2: alternância Titular↔Ajudante em 4 semanas (escape: isHelperOnly).
                            if (alternWeeks > 0 && !p.isHelperOnly) {
                                const lastRole = getMostRecentFSMRole(p.name, historyForChecks, safeThursdayDate, alternWeeks);
                                if (lastRole === 'Ajudante') return false;
                            }

                            // Q3: não repetir par titular+ajudante em 4 semanas.
                            // Bypass: cônjuge/pai-filho (já permitidos por canBeHelper) ignoram a regra.
                            if (pairWeeks > 0 && titularNameResolved && titularPublisherId) {
                                const isSpouseBypass = !!titularSpouseId && p.id === titularSpouseId;
                                const isParentChildBypass =
                                    titularParentIds.includes(p.id) ||
                                    titularChildIds.includes(p.id) ||
                                    (p.parentIds || []).includes(titularPublisherId);
                                if (!isSpouseBypass && !isParentChildBypass) {
                                    if (wasRecentlyPairedWith(p.name, titularNameResolved, historyForChecks, safeThursdayDate, pairWeeks)) {
                                        return false;
                                    }
                                }
                            }
                            return true;
                        };

                        let selectedPublisher: Publisher | null = null;

                        const pickTopRanked = (pubs: Publisher[], type: string) => {
                            // Mesma fonte do painel/agente
                            const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                            const historyForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
                            const ranked = getRankedCandidates(pubs, type, historyForRanking, undefined, safeThursdayDate);
                            return ranked.find(r =>
                                !namesExcludedInWeek.has(r.publisher.name) &&
                                !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate)
                            )?.publisher || null;
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
                            namesExcludedInWeek.add(selectedPublisher.name);
                        }
                    }
                    // Outras partes
                    else {
                        const isOracaoFinal = part.tipoParte.toLowerCase().includes('oração final') || part.tipoParte.toLowerCase().includes('oracao final');

                        if (isOracaoFinal) {
                            const oracaoFilter = (p: Publisher) => {
                                const r = checkEligibility(p, modalidade as any, funcao, {
                                    date: part.date,
                                    isPastWeek: isPast,
                                    secao: part.section,
                                    partTitle: part.tituloParte,
                                    partDescription: part.descricaoParte,
                                    partDetails: part.detalhesParte,
                                });
                                if (!r.eligible) return false;
                                const avail = p.availability;
                                if (avail.mode === 'always') return !avail.exceptionDates.includes(thursdayDate);
                                return avail.availableDates.includes(thursdayDate);
                            };

                            const eligible = publishers.filter(p => oracaoFilter(p));

                            // v9.3: Lógica de Prioridade para Oração Final
                            // 1. Não-Presidentes SEM outra designação (Ideal)
                            // 2. Não-Presidentes COM outra designação (Aceitável)
                            // 3. Presidente (Último caso)

                            let candidate: Publisher | null = null;

                            // Grupo 1: Livres e não-presidente
                            const group1 = eligible.filter(p =>
                                !namesExcludedInWeek.has(p.name) &&
                                p.name !== presidenteDaSemana
                            );
                            if (group1.length > 0) {
                                // Mesma fonte do painel/agente
                                const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                                const historyForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
                                const ranked = getRankedCandidates(group1, 'Oração Final', historyForRanking, undefined, safeThursdayDate);
                                candidate = ranked.find(r => !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate))?.publisher
                                    || ranked[0]?.publisher || null;
                            }

                            // Grupo 2: Ocupados (2ª parte) e não-presidente
                            if (!candidate) {
                                const group2 = eligible.filter(p =>
                                    namesExcludedInWeek.has(p.name) &&
                                    p.name !== presidenteDaSemana
                                );
                                if (group2.length > 0) {
                                    const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                                    const historyForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
                                    const ranked = getRankedCandidates(group2, 'Oração Final', historyForRanking, undefined, safeThursdayDate);
                                    candidate = ranked.find(r => !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate))?.publisher
                                        || ranked[0]?.publisher || null;
                                }
                            }

                            // Grupo 3: Presidente (Fallback)
                            if (!candidate && presidenteDaSemana) {
                                const group3 = eligible.filter(p => p.name === presidenteDaSemana);
                                if (group3.length > 0) {
                                    candidate = group3[0];
                                }
                            }

                            if (candidate) {
                                selectedPublisherByPart.set(part.id, { id: candidate.id, name: candidate.name });
                                totalWithPublisher++;
                                // Não adicionamos a namesExcludedInWeek pq pode ser segunda parte
                            }
                        } else {
                            // Genérico
                            const eligiblePublishers = publishers.filter(p => {
                                if (namesExcludedInWeek.has(p.name)) return false;
                                const r = checkEligibility(p, modalidade as any, funcao, {
                                    date: part.date,
                                    isPastWeek: isPast,
                                    secao: part.section,
                                    partTitle: part.tituloParte,
                                    partDescription: part.descricaoParte,
                                    partDetails: part.detalhesParte,
                                });
                                return r.eligible;
                            });
                            if (eligiblePublishers.length > 0) {
                                // Mesma fonte do painel/agente: filtrar semana corrente + refDate
                                const safeThursdayDate = new Date(thursdayDate + 'T12:00:00');
                                const historyForRanking = historyRecords.filter(h => h.weekId !== part.weekId);
                                const ranked = getRankedCandidates(eligiblePublishers, part.tipoParte, historyForRanking, undefined, safeThursdayDate);
                                const p = ranked.find(r => !isBlocked(r.publisher.name, historyForRanking, safeThursdayDate))?.publisher
                                    || ranked[0]?.publisher;
                                if (p) {
                                    selectedPublisherByPart.set(part.id, { id: p.id, name: p.name });
                                    namesExcludedInWeek.add(p.name);
                                    totalWithPublisher++;
                                }
                            }
                        }
                    }
                }

                // ===================================
                // INTRA-BATCH HISTORY ACCUMULATION
                // Injeta designações recém-geradas como histórico sintético
                // para que a próxima semana do mesmo batch veja estas atribuições
                // e não repita o mesmo publicador em semanas consecutivas.
                // ===================================
                for (const part of weekParts) {
                    const selected = selectedPublisherByPart.get(part.id);
                    if (selected && selected.name && selected.id !== 'CLEANUP') {
                        historyRecords.push({
                            id: `synth-${part.id}`,
                            weekId: part.weekId,
                            weekDisplay: part.weekDisplay,
                            date: part.date,
                            section: part.section,
                            tipoParte: part.tipoParte,
                            modalidade: part.modalidade || '',
                            tituloParte: part.tituloParte || '',
                            descricaoParte: part.descricaoParte || '',
                            detalhesParte: part.detalhesParte || '',
                            seq: part.seq,
                            funcao: part.funcao as 'Titular' | 'Ajudante',
                            duracao: parseInt(part.duracao) || 0,
                            horaInicio: part.horaInicio || '',
                            horaFim: part.horaFim || '',
                            rawPublisherName: selected.name,
                            resolvedPublisherName: selected.name,
                            status: HistoryStatus.APPROVED,
                            importSource: 'AUTO_INJECTED',
                            importBatchId: '',
                            createdAt: new Date().toISOString(),
                        });
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
                    await generationCommitService.commitGeneratedAssignment({
                        partId,
                        part,
                        publisher: pubInfo,
                        localNeedsTheme,
                        preassignmentId,
                    });
                    savedCount++;
                } catch (e) {
                    console.error(`[GenerationService] Error saving part ${partId}:`, e);
                    warnings.push(`Erro ao salvar parte ${part?.tipoParte}: ${e instanceof Error ? e.message : 'Unknown'}`);
                }
            }

            // Snapshot do motor por semana gerada (auditável; não bloqueia o fluxo)
            if (savedCount > 0) {
                const generatedWeekIds = Object.keys(byWeek);
                const engineSnapshot = {
                    engine_config: getRotationConfig(),
                    eligibility_version: ELIGIBILITY_RULES_VERSION,
                    cooldown_weeks_main: COOLDOWN_WEEKS,
                    cooldown_weeks_helper: COOLDOWN_WEEKS_HELPER,
                    generated_at: new Date().toISOString(),
                    parts_saved: savedCount,
                };
                for (const weekId of generatedWeekIds) {
                    try {
                        await auditService.logAction({
                            table_name: 'workbook_parts',
                            operation: 'SCRIPT_EXEC',
                            record_id: weekId,
                            new_data: engineSnapshot,
                            description: `Snapshot do motor de rotação no momento da geração da semana ${weekId}`,
                        });
                    } catch (auditErr) {
                        console.warn('[GenerationService] Falha ao gravar snapshot do motor no audit_log:', auditErr);
                    }
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
// VALIDAÇÃO (Migrado de linearRotationService)
// ============================================================================

export interface ValidationWarning {
    type: 'MISSING_DURATION' | 'MISSING_TITULAR';
    partId: string;
    weekDisplay: string;
    partTitle: string;
    message: string;
}

/**
 * Lista de tipos de partes que NÃO precisam de duração definida.
 */
export const PARTS_WITHOUT_DURATION: string[] = [
    // Leitura EBC (concomitante)
    'Leitor',
];

export function isPartWithoutDuration(tituloParte: string): boolean {
    const tituloLower = tituloParte.toLowerCase();
    return PARTS_WITHOUT_DURATION.some(type =>
        tituloLower.includes(type.toLowerCase())
    );
}

// v11: Default Durations Fallback
function applyDefaultDurations(parts: any[]): void {
    const defaults: Record<string, number> = {
        'comentários iniciais': 1,
        'comentarios iniciais': 1,
        'comentários finais': 3, // Baseado na observação visual (21:06-21:09)
        'comentarios finais': 3,
        'oração inicial': 5,
        'oracao inicial': 5,
        'oração final': 5,
        'oracao final': 5,
        'cântico': 5,
        'cantico': 5,
        'elogios': 1,
        'conselhos': 1
    };

    parts.forEach(p => {
        // Se já tem duração, não toca
        const dur = typeof p.duracao === 'string' ? parseInt(p.duracao) : p.duracao;
        if (dur && dur > 0) return;

        // Tenta achar default
        const tipo = p.tipoParte.toLowerCase();

        // Match exato ou parcial
        for (const [key, val] of Object.entries(defaults)) {
            if (tipo.includes(key)) {
                // Modifica em memória para passar na validação e cálculo
                // NOTA: Isso não salva no banco, apenas permite a geração prosseguir
                p.duracao = val;
                // Se for string, mantém consistência? O sistema aceita number.
            }
        }
    });
}

export function validatePartsBeforeGeneration(
    parts: Array<{
        id: string;
        funcao: string;
        duracao?: number | string;
        weekDisplay: string;
        tituloParte: string;
        resolvedPublisherName?: string;
        tipoParte: string; // Ensure type is present
    }>
): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Aplicar defaults em memória antes de validar
    applyDefaultDurations(parts);

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
                    message: '\u26A0\uFE0F Parte ' + part.tituloParte + ' (' + part.weekDisplay + ') não tem duração definida'
                });
            }
        }
    });

    return warnings;
}
