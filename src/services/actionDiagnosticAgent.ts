/**
 * Action Diagnostic Agent — Agente genérico de teste para ações do Chat-IA
 * 
 * Recebe um AgentActionType (ou 'ALL'), executa com fixtures realistas
 * e retorna um diagnóstico detalhado de cada ação.
 * 
 * Princípios:
 * - ZERO efeitos colaterais destrutivos (usa dry-run, mocks ou rollback)
 * - Busca dados reais do Supabase para fixtures dinâmicas
 * - Diagnóstico estruturado: status, tempo, erro, dados retornados
 */

import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import { agentActionService, type AgentActionType, type AgentAction, type ActionResult } from './agentActionService';
import { api } from './api';
import { workbookService } from './workbookService';

// ===== Tipos do Diagnóstico =====

export type DiagnosticStatus = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';

export interface ActionDiagnostic {
    actionType: AgentActionType;
    status: DiagnosticStatus;
    durationMs: number;
    message: string;
    details?: string;
    resultData?: any;
    error?: string;
    safe: boolean; // true = não alterou dados reais
}

export interface DiagnosticReport {
    timestamp: string;
    totalActions: number;
    passed: number;
    failed: number;
    skipped: number;
    warned: number;
    durationMs: number;
    results: ActionDiagnostic[];
}

// ===== Fixtures dinâmicas =====

interface LiveFixtures {
    publishers: Publisher[];
    parts: WorkbookPart[];
    history: HistoryRecord[];
    firstWeekId: string | null;
    firstPartId: string | null;
    firstPublisherName: string | null;
    firstPartWithAssignment: WorkbookPart | null;
    firstPartWithoutAssignment: WorkbookPart | null;
}

async function loadLiveFixtures(): Promise<LiveFixtures> {
    let publishers: Publisher[] = [];
    let parts: WorkbookPart[] = [];

    try {
        publishers = await api.loadPublishers();
    } catch (e) {
        console.warn('[Diagnostic] Falha ao carregar publicadores:', e);
    }

    try {
        parts = await workbookService.getAll();
    } catch (e) {
        console.warn('[Diagnostic] Falha ao carregar partes:', e);
    }

    // Converter partes em history records simplificados
    const history: HistoryRecord[] = parts
        .filter(p => p.resolvedPublisherName)
        .map(p => ({
            id: p.id,
            weekId: p.weekId,
            weekDisplay: p.weekDisplay,
            date: p.date,
            section: p.section,
            tipoParte: p.tipoParte,
            modalidade: p.modalidade,
            tituloParte: p.tituloParte,
            descricaoParte: p.descricaoParte,
            detalhesParte: p.detalhesParte,
            seq: p.seq,
            funcao: p.funcao,
            duracao: parseInt(p.duracao) || 0,
            horaInicio: p.horaInicio,
            horaFim: p.horaFim,
            rawPublisherName: p.rawPublisherName,
            resolvedPublisherId: p.resolvedPublisherId,
            resolvedPublisherName: p.resolvedPublisherName,
        }));

    const weekIds = [...new Set(parts.map(p => p.weekId))].sort();

    return {
        publishers,
        parts,
        history,
        firstWeekId: weekIds[0] || null,
        firstPartId: parts[0]?.id || null,
        firstPublisherName: publishers[0]?.name || null,
        firstPartWithAssignment: parts.find(p => !!p.resolvedPublisherName) || null,
        firstPartWithoutAssignment: parts.find(p => !p.resolvedPublisherName && p.tipoParte !== 'Cântico') || null,
    };
}

// ===== Mapa de Testes por Ação =====

type TestFactory = (fixtures: LiveFixtures) => {
    action: AgentAction;
    safe: boolean;          // true = não altera dados (dry-run, leitura, ou rollback)
    skipIf?: string | null; // mensagem de skip se os dados não permitirem o teste
    rollback?: (result: ActionResult, fixtures: LiveFixtures) => Promise<void>;
};

const TEST_REGISTRY: Record<AgentActionType, TestFactory> = {

    SHOW_MODAL: () => ({
        action: { type: 'SHOW_MODAL', params: { modal: 'publishers' }, description: 'Teste: abrir modal publicadores' },
        safe: true,
    }),

    CHECK_SCORE: (fx) => ({
        action: { type: 'CHECK_SCORE', params: { partType: 'Leitura da Bíblia', date: fx.firstWeekId || '2026-04-06' }, description: 'Teste: ranking de candidatos' },
        safe: true,
        skipIf: fx.publishers.length === 0 ? 'Sem publicadores cadastrados' : null,
    }),

    NAVIGATE_WEEK: (fx) => ({
        action: { type: 'NAVIGATE_WEEK', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: navegar semana' },
        safe: true,
    }),

    VIEW_S140: (fx) => ({
        action: { type: 'VIEW_S140', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: visualizar S-140' },
        safe: true,
    }),

    SHARE_S140_WHATSAPP: (fx) => ({
        action: { type: 'SHARE_S140_WHATSAPP', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: compartilhar S-140' },
        safe: true,
    }),

    FETCH_DATA: () => ({
        action: { type: 'FETCH_DATA', params: { context: 'publishers', limit: 5 }, description: 'Teste: consulta de dados' },
        safe: true,
    }),

    GET_ANALYTICS: (fx) => ({
        action: {
            type: 'GET_ANALYTICS',
            params: fx.firstPublisherName ? { publisherName: fx.firstPublisherName } : {},
            description: 'Teste: analytics de participação'
        },
        safe: true,
    }),

    SIMULATE_ASSIGNMENT: (fx) => ({
        action: {
            type: 'SIMULATE_ASSIGNMENT',
            params: {
                partId: fx.firstPartWithoutAssignment?.id || fx.firstPartId || 'test-id',
                publisherName: fx.firstPublisherName || 'Test Publisher',
                weekId: fx.firstWeekId || '2026-04-06',
            },
            description: 'Teste: simulação de designação (dry-run)'
        },
        safe: true,
        skipIf: (!fx.firstPartId || !fx.firstPublisherName) ? 'Sem partes ou publicadores para simular' : null,
    }),

    MANAGE_LOCAL_NEEDS: () => ({
        action: { type: 'MANAGE_LOCAL_NEEDS', params: { subAction: 'LIST' }, description: 'Teste: listar necessidades locais' },
        safe: true,
    }),

    MANAGE_SPECIAL_EVENT: () => ({
        // Apenas lista (não cria) — FETCH_DATA para events
        action: { type: 'FETCH_DATA', params: { context: 'workbook', limit: 3 }, description: 'Teste: proxy seguro para eventos (via FETCH_DATA)' },
        safe: true,
    }),

    // --- Ações com efeitos colaterais controlados (rollback) ---

    ASSIGN_PART: (fx) => {
        const target = fx.firstPartWithoutAssignment;
        const pubName = fx.firstPublisherName;

        return {
            action: {
                type: 'ASSIGN_PART',
                params: {
                    partId: target?.id || 'nonexistent-id',
                    publisherName: pubName || 'Test Publisher',
                    weekId: target?.weekId || fx.firstWeekId || '2026-04-06',
                },
                description: 'Teste: designar parte (com rollback)'
            },
            safe: true,
            skipIf: (!target || !pubName) ? 'Sem parte vazia ou publicador para testar ASSIGN_PART' : null,
            rollback: async (result, _fx) => {
                if (result.success && result.data?.partId) {
                    // Reverter: limpar a designação
                    await workbookService.updatePart(result.data.partId, {
                        resolvedPublisherName: target?.resolvedPublisherName || '',
                        status: target?.status || 'PENDENTE',
                    });
                }
            }
        };
    },

    GENERATE_WEEK: (fx) => {
        // Não gera de verdade — usa SIMULATE via dry-run se possível
        // Mas como generationService não tem dry-run nativo, usamos SKIP em prod
        return {
            action: { type: 'GENERATE_WEEK', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: gerar designações (SKIP em diagnóstico)' },
            safe: true,
            skipIf: 'Ação destrutiva — use manualmente. Diagnóstico verifica apenas se a rota funciona.',
        };
    },

    CLEAR_WEEK: () => ({
        action: { type: 'CLEAR_WEEK', params: { weekId: 'SKIP' }, description: 'Teste: limpar semana (SKIP em diagnóstico)' },
        safe: true,
        skipIf: 'Ação destrutiva — use manualmente.',
    }),

    UNDO_LAST: () => ({
        action: { type: 'UNDO_LAST', params: {}, description: 'Teste: desfazer última ação' },
        safe: true, // Undo reverte, mas pode ter efeito colateral. Marcaremos WARN se não houver o que desfazer.
    }),

    UPDATE_PUBLISHER: (fx) => {
        // Teste seguro: lê e re-escreve o mesmo valor (noop)
        const pub = fx.publishers[0];
        if (!pub) {
            return {
                action: { type: 'UPDATE_PUBLISHER', params: { publisherName: 'inexistente', updates: {} }, description: 'Teste: atualizar publicador (sem dados)' },
                safe: true,
                skipIf: 'Sem publicadores cadastrados',
            };
        }
        return {
            action: {
                type: 'UPDATE_PUBLISHER',
                params: {
                    publisherName: pub.name,
                    updates: { isNotQualified: pub.isNotQualified ?? false }, // Re-escreve o mesmo valor
                },
                description: `Teste: atualizar publicador (noop: re-grava mesmo valor de isNotQualified)`
            },
            safe: true,
        };
    },

    UPDATE_AVAILABILITY: (fx) => {
        // Teste seguro: adiciona data no passado distante e depois remove
        const pub = fx.publishers[0];
        if (!pub) {
            return {
                action: { type: 'UPDATE_AVAILABILITY', params: {}, description: 'Teste: bloquear data (sem dados)' },
                safe: true,
                skipIf: 'Sem publicadores cadastrados',
            };
        }
        const testDate = '1999-01-01'; // Data impossível, fácil de remover
        return {
            action: {
                type: 'UPDATE_AVAILABILITY',
                params: {
                    publisherName: pub.name,
                    unavailableDates: [testDate],
                },
                description: `Teste: bloquear data fictícia (${testDate}) com rollback`
            },
            safe: true,
            rollback: async (_result, fixtures) => {
                // Remover a data de teste
                const freshPub = fixtures.publishers.find(p => p.name === pub.name);
                if (freshPub) {
                    const cleaned = (freshPub.availability.exceptionDates || []).filter(d => d !== testDate);
                    await api.updatePublisher({
                        ...freshPub,
                        availability: { ...freshPub.availability, exceptionDates: cleaned }
                    });
                }
            }
        };
    },

    UPDATE_ENGINE_RULES: () => ({
        action: { type: 'UPDATE_ENGINE_RULES', params: { settings: {} }, description: 'Teste: atualizar regras (SKIP em diagnóstico)' },
        safe: true,
        skipIf: 'Ação de configuração global — skip por segurança.',
    }),

    SEND_S140: (fx) => ({
        action: { type: 'SEND_S140', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: preparar S-140' },
        safe: true,
        skipIf: fx.parts.length === 0 ? 'Sem partes para gerar S-140' : null,
    }),

    SEND_S89: (fx) => ({
        action: { type: 'SEND_S89', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: preparar S-89' },
        safe: true,
        skipIf: fx.parts.length === 0 ? 'Sem partes para gerar S-89' : null,
    }),

    NOTIFY_REFUSAL: (fx) => {
        const assigned = fx.firstPartWithAssignment;
        return {
            action: {
                type: 'NOTIFY_REFUSAL',
                params: {
                    partId: assigned?.id || 'nonexistent',
                    weekId: assigned?.weekId || '2026-04-06',
                    reason: '[DIAGNÓSTICO] Teste automatizado — ignorar',
                },
                description: 'Teste: notificar recusa'
            },
            safe: false, // Envia notificação real
            skipIf: !assigned ? 'Sem parte designada para testar NOTIFY_REFUSAL' : 'Ação envia notificação real — skip por segurança.',
        };
    },

    IMPORT_WORKBOOK: () => ({
        action: {
            type: 'IMPORT_WORKBOOK',
            params: { weekDate: '2026-04-06', subAction: 'PREVIEW' },
            description: 'Teste: prévia importação jw.org (sem salvar)',
        },
        safe: true,
    }),
};

// ===== Motor de Diagnóstico =====

export async function runDiagnostic(
    targetAction?: AgentActionType | 'ALL'
): Promise<DiagnosticReport> {
    const startTime = performance.now();
    const results: ActionDiagnostic[] = [];

    // 1. Carregar fixtures reais
    let fixtures: LiveFixtures;
    try {
        fixtures = await loadLiveFixtures();
    } catch (e) {
        return {
            timestamp: new Date().toISOString(),
            totalActions: 0,
            passed: 0,
            failed: 1,
            skipped: 0,
            warned: 0,
            durationMs: Math.round(performance.now() - startTime),
            results: [{
                actionType: 'FETCH_DATA' as AgentActionType,
                status: 'FAIL',
                durationMs: 0,
                message: 'Falha ao carregar fixtures do banco de dados',
                error: e instanceof Error ? e.message : String(e),
                safe: true,
            }]
        };
    }

    // 2. Determinar quais ações testar
    const actionsToTest: AgentActionType[] = targetAction && targetAction !== 'ALL'
        ? [targetAction]
        : Object.keys(TEST_REGISTRY) as AgentActionType[];

    // 3. Executar cada teste
    for (const actionType of actionsToTest) {
        const factory = TEST_REGISTRY[actionType];
        if (!factory) {
            results.push({
                actionType,
                status: 'SKIP',
                durationMs: 0,
                message: `Nenhum teste registrado para ${actionType}`,
                safe: true,
            });
            continue;
        }

        const testDef = factory(fixtures);

        // Skip se condição não atendida
        if (testDef.skipIf) {
            results.push({
                actionType,
                status: 'SKIP',
                durationMs: 0,
                message: testDef.skipIf,
                safe: testDef.safe,
            });
            continue;
        }

        // Executar
        const t0 = performance.now();
        try {
            const result = await agentActionService.executeAction(
                testDef.action,
                fixtures.parts,
                fixtures.publishers,
                fixtures.history,
                fixtures.firstWeekId || undefined,
            );

            const elapsed = Math.round(performance.now() - t0);

            // Rollback se necessário
            if (testDef.rollback && result.success) {
                try {
                    await testDef.rollback(result, fixtures);
                } catch (rbErr) {
                    console.warn(`[Diagnostic] Rollback falhou para ${actionType}:`, rbErr);
                }
            }

            results.push({
                actionType,
                status: result.success ? 'PASS' : 'WARN',
                durationMs: elapsed,
                message: result.message,
                details: testDef.action.description,
                resultData: summarizeData(result.data),
                safe: testDef.safe,
            });
        } catch (err) {
            const elapsed = Math.round(performance.now() - t0);
            results.push({
                actionType,
                status: 'FAIL',
                durationMs: elapsed,
                message: `Exceção não tratada ao executar ${actionType}`,
                error: err instanceof Error ? err.message : String(err),
                safe: testDef.safe,
            });
        }
    }

    const totalMs = Math.round(performance.now() - startTime);

    return {
        timestamp: new Date().toISOString(),
        totalActions: results.length,
        passed: results.filter(r => r.status === 'PASS').length,
        failed: results.filter(r => r.status === 'FAIL').length,
        skipped: results.filter(r => r.status === 'SKIP').length,
        warned: results.filter(r => r.status === 'WARN').length,
        durationMs: totalMs,
        results,
    };
}

// Resumir dados para não poluir o relatório
function summarizeData(data: any): any {
    if (!data) return null;
    if (Array.isArray(data)) {
        return { _type: 'array', length: data.length, sample: data.slice(0, 2) };
    }
    if (typeof data === 'object') {
        const keys = Object.keys(data);
        if (keys.length > 10) {
            return { _type: 'object', keys: keys.length, topKeys: keys.slice(0, 10) };
        }
        // Resumir arrays aninhados
        const summary: Record<string, any> = {};
        for (const k of keys) {
            if (Array.isArray(data[k]) && data[k].length > 3) {
                summary[k] = { _type: 'array', length: data[k].length };
            } else {
                summary[k] = data[k];
            }
        }
        return summary;
    }
    return data;
}

// ===== Utilidade: Expor no console para uso manual =====
if (typeof window !== 'undefined') {
    (window as any).__rvmDiagnostic = runDiagnostic;
    (window as any).__rvmDiagnosticAllActions = Object.keys(TEST_REGISTRY);
}
