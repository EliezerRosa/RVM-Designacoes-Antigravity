import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao, HistoryStatus } from '../types';
import { loadCompletedParticipations } from './historyAdapter';
import { checkEligibility } from './eligibilityService';
import { getRotationConfig } from './unifiedRotationService';
import { getRankedEligibleForPart } from './rankedEligibleService';
import { generationCommitService } from './generationCommitService';
import { localNeedsService } from './localNeedsService';

import { getModalidadeFromTipo, isNonDesignatablePart, isCleanablePart, isAutoAssignedToChairman } from '../constants/mappings';

import { COOLDOWN_WEEKS, COOLDOWN_WEEKS_HELPER } from './cooldownService';
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

function parseGenerationDate(dateStr: string): Date {
    if (!dateStr) return new Date(0);
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(dateStr + 'T12:00:00');
    const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
    return new Date(dateStr);
}

export function shouldIncludePartForGeneration(
    part: WorkbookPart,
    publishers: Publisher[],
    today: Date,
    config?: GenerationConfig,
): boolean {
    const normalizedToday = new Date(today);
    normalizedToday.setHours(0, 0, 0, 0);

    const d = parseGenerationDate(part.date);
    if (d < normalizedToday) return false; // Sempre excluir passadas
    if (part.funcao !== 'Titular' && part.funcao !== 'Ajudante') return false;

    // Quando o usuário pede semanas específicas, isso vira fronteira dura
    // inclusive para cleanup de partes não-designáveis. Evita tocar semanas
    // laterais e mantém `generatedWeeks` fiel ao escopo solicitado.
    if (config?.generationWeeks && config.generationWeeks.length > 0 && !config.generationWeeks.includes(part.weekId)) {
        return false;
    }

    // Cânticos, Comentários Iniciais/Finais, Elogios e Conselhos NUNCA recebem designação
    if (isNonDesignatablePart(part.tipoParte)) {
        // v9.1: Se tiver lixo (nome preenchido), incluir para limpar!
        if (part.resolvedPublisherName || part.rawPublisherName) return true;
        return false;
    }

    // Se já foi concluída ou cancelada, nunca reagendar automaticamente
    if (part.status === 'CONCLUIDA' || part.status === 'CANCELADA') return false;

    // Se semanas específicas definidas → incluir TODAS do período que não estejam finalizadas
    if (config?.generationWeeks && config.generationWeeks.length > 0) {
        return config.generationWeeks.includes(part.weekId);
    }

    // Senão → só PENDENTE ou sem publicador
    // OU se tiver publicador, mas for INVÁLIDO (Sanity Check v9.2)
    if (part.status === 'PENDENTE' || !part.resolvedPublisherName) return true;

    // Check if existing assignment is valid
    // Only check if we are forced to re-evaluate or if status is not finalized
    // Mas o usuário quer corrigir "resíduos". Então vamos checar PROPOSTA/DESIGNADA também se estiver no range.
    if (part.status === 'PROPOSTA' || part.status === 'DESIGNADA') {
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
                console.log(`[SanityCheck] Found invalid assignment: ${pubName} for ${part.tipoParte} (${eligibility.reason}). Marking for re-generation.`);
                return true;
            }
        }
    }

    return false;
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

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filter parts needing assignment
        const partsNeedingAssignment = parts.filter(part => shouldIncludePartForGeneration(part, publishers, today, config));

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

            const getFullWeekParts = (weekId: string) =>
                parts.filter(part => part.weekId === weekId);

            const materializeSelectedPublisher = (part: WorkbookPart): WorkbookPart => {
                const selected = selectedPublisherByPart.get(part.id);
                if (!selected) return part;

                if (selected.id === 'CLEANUP') {
                    return {
                        ...part,
                        resolvedPublisherId: undefined,
                        resolvedPublisherName: '',
                        rawPublisherName: '',
                    };
                }

                const resolvedPublisher = publishers.find(pub => pub.id === selected.id || pub.name === selected.name);

                return {
                    ...part,
                    resolvedPublisherId: resolvedPublisher?.id || (selected.id !== 'preassigned' ? selected.id : part.resolvedPublisherId),
                    resolvedPublisherName: selected.name,
                    rawPublisherName: selected.name,
                };
            };

            const buildWorkingWeekParts = (weekId: string): WorkbookPart[] =>
                getFullWeekParts(weekId).map(materializeSelectedPublisher);

            const pickCanonicalCandidate = (targetPart: WorkbookPart): Publisher | null => {
                const rankedResult = getRankedEligibleForPart(
                    targetPart,
                    buildWorkingWeekParts(targetPart.weekId),
                    publishers,
                    historyRecords,
                    {
                        applyEngineRules: true,
                        excludeAssignedInSameWeek: true,
                    },
                );

                // CAMADA 2/3 (modelo 2026-06-05): eligibleCandidates já vem ordenado
                // lexicograficamente (proximidade MAIN ▸ frequência ▸ timeBonus-roteamento ▸
                // esquecimento ▸ nome). O espaçamento é governado pela PROXIMIDADE, não mais
                // pelo cooldown duro (`blocked` é apenas indicador visual). Por isso pegamos
                // diretamente o TOPO da fila — quem está com menor proximidade de parte MAIN.
                // A proteção anti-fome (pools escassos como EBC/Tesouros) é garantida pela
                // ORDEM DE ESCASSEZ das fases (Fase 2 Ensino antes de Fase 3 Estudante / Fase 4).
                return rankedResult.eligibleCandidates[0]?.publisher || null;
            };

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
                const candidate = pickCanonicalCandidate(part);

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
                const weekParts = getFullWeekParts(weekId);

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
            // PROTEÇÃO ANTI-FOME (Camada 3 — roteamento por escassez): as fases são
            // processadas da MENOR para a MAIOR oferta de candidatos elegíveis —
            // Ensino (Tesouros/EBC: pool restrito de anciãos/SMs) ANTES de Estudante
            // (pool largo) ANTES das Demais. Como cada designação marca o publicador
            // como usado na semana, as partes de pool escasso escolhem primeiro e nunca
            // ficam sem candidato por terem sido "puxadas" para uma parte mais aberta.
            for (const [_weekId, weekPartsToAssign] of Object.entries(byWeek)) {
                const weekParts = getFullWeekParts(_weekId);
                weekPartsToAssign.sort((a, b) => a.date.localeCompare(b.date));

                // Presidente designado nesta semana (para Oração Inicial e exclusão)
                const presidentePart = weekParts.find(p => p.tipoParte.toLowerCase().includes('presidente') && p.funcao === 'Titular');
                const presidenteDaSemana = presidentePart ? selectedPublisherByPart.get(presidentePart.id)?.name : undefined;

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
                    const ensinoParts = weekPartsToAssign.filter(p =>
                        p.tipoParte === tipoEnsino &&
                        p.funcao === 'Titular' &&
                        !selectedPublisherByPart.has(p.id)
                    );

                    for (const ensinoPart of ensinoParts) {
                        const candidate = pickCanonicalCandidate(ensinoPart);

                        if (candidate) {
                            selectedPublisherByPart.set(ensinoPart.id, { id: candidate.id, name: candidate.name });
                            totalWithPublisher++;
                        }
                    }
                }

                // --- FASE 3: ESTUDANTE ---
                const estudanteParts = weekPartsToAssign.filter(p => {
                    const mod = getModalidadeFromTipo(p.tipoParte);
                    return p.funcao === 'Titular' && !selectedPublisherByPart.has(p.id) && (
                        mod === EnumModalidade.LEITURA_ESTUDANTE || mod === EnumModalidade.DEMONSTRACAO || mod === EnumModalidade.DISCURSO_ESTUDANTE
                    );
                });

                for (const estudantePart of estudanteParts) {
                    const candidate = pickCanonicalCandidate(estudantePart);

                    if (candidate) {
                        selectedPublisherByPart.set(estudantePart.id, { id: candidate.id, name: candidate.name });
                        totalWithPublisher++;
                    }
                }

                // --- FASE 4: DEMAIS PARTES ---
                for (const part of weekPartsToAssign) {
                    if (selectedPublisherByPart.has(part.id)) continue;

                    // Fase H.8 (2026-05-22): partes auto-atribuídas ao Presidente NUNCA
                    // entram em rotação. Se o Presidente já foi designado, a Fase 1.5
                    // (acima) ou o trigger `trg_sync_chairman_derived_parts` (DB) cuidam
                    // de propagar o publisher. Se o Presidente ainda não foi designado,
                    // a derivada PERMANECE pendente (não pegamos um publicador aleatório).
                    if (isAutoAssignedToChairman(part.tipoParte)) continue;

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

                    if (funcao === EnumFuncao.AJUDANTE) {
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

                        }
                        const selectedPublisher = pickCanonicalCandidate(part);

                        if (selectedPublisher) {
                            selectedPublisherByPart.set(part.id, { id: selectedPublisher.id, name: selectedPublisher.name });
                            totalWithPublisher++;
                        }
                    }
                    // Outras partes
                    else {
                        const selectedPublisher = pickCanonicalCandidate(part);
                        if (selectedPublisher) {
                            selectedPublisherByPart.set(part.id, { id: selectedPublisher.id, name: selectedPublisher.name });
                            totalWithPublisher++;
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

                totalCreated += weekPartsToAssign.length;
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
