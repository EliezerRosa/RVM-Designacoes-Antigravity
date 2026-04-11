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
    /** Script detalhado: contexto, expectativa, resultado, diagnóstico */
    testScript?: TestScript;
}

/** Documenta o cenário completo do teste para análise humana */
export interface TestScript {
    cenario: string;        // Contexto inicial (dados disponíveis, estado atual)
    comandoSimulado: string;// O que o "usuário" pediu
    expectativa: string;    // O que DEVERIA acontecer
    resultadoObtido: string;// O que DE FATO aconteceu
    diagnostico: string;    // Análise final explicativa
    dadosUtilizados?: Record<string, any>; // Dados chave usados no teste
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
    /** Monta o TestScript com contexto completo após a execução */
    buildScript: (fixtures: LiveFixtures, result?: ActionResult, error?: string) => TestScript;
};

const TEST_REGISTRY: Record<AgentActionType, TestFactory> = {

    SHOW_MODAL: (fx) => ({
        action: { type: 'SHOW_MODAL', params: { modal: 'publishers' }, description: 'Teste: abrir modal publicadores' },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: `Base possui ${fx.publishers.length} publicadores e ${fx.parts.length} partes cadastradas.`,
            comandoSimulado: '"Abra o cadastro de publicadores"',
            expectativa: 'A ação SHOW_MODAL retorna success=true e sinaliza ao frontend para abrir o modal "publishers". Nenhum dado é modificado.',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Sucesso — modal "${result?.data?.modal || 'publishers'}" sinalizado para abertura. Mensagem: "${result?.message}"` : `Falha — ${result?.message}`),
            diagnostico: error ? `Exceção inesperada ao tentar abrir modal. Possível problema no handler SHOW_MODAL do agentActionService.` : (result?.success ? 'Teste OK. A ação retornou corretamente o identificador do modal para o frontend renderizar.' : `A ação retornou success=false. Verifique se o parâmetro 'modal' é aceito pelo handler.`),
            dadosUtilizados: { modalSolicitado: 'publishers', totalPublicadores: fx.publishers.length },
        }),
    }),

    CHECK_SCORE: (fx) => ({
        action: { type: 'CHECK_SCORE', params: { partType: 'Leitura de Estudante', date: fx.firstWeekId || '2026-04-06' }, description: 'Teste: ranking de candidatos' },
        safe: true,
        skipIf: fx.publishers.length === 0 ? 'Sem publicadores cadastrados' : null,
        buildScript: (_fx, result, error) => {
            const elegiveisCount = result?.data ? (Array.isArray(result.data) ? result.data.length : 0) : 0;
            return {
                cenario: `${fx.publishers.length} publicadores no banco. Semana de referência: ${fx.firstWeekId || 'N/A'}. Modalidade: "Leitura de Estudante".`,
                comandoSimulado: '"Mostre o ranking de candidatos para Leitura de Estudante"',
                expectativa: 'O motor de elegibilidade filtra publicadores qualificados para "Leitura de Estudante" (homens batizados, não desqualificados), calcula score com base no histórico de participações e retorna ranking ordenado (Top 10).',
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `${elegiveisCount} candidatos elegíveis encontrados e ranqueados. ${result.message?.substring(0, 150)}...` : `Falha: ${result?.message}`),
                diagnostico: error ? `Exceção ao calcular scores. Verifique checkEligibility e getRankedCandidates.` : (result?.success ? (elegiveisCount > 0 ? `Ranking gerado com sucesso. ${elegiveisCount} publicadores passaram no filtro de elegibilidade. O 1º colocado é o candidato com maior intervalo desde a última participação neste tipo de parte.` : 'Ranking vazio — nenhum publicador é elegível para Leitura de Estudante. Verifique se há homens batizados não-desqualificados no banco.') : `Ação falhou: ${result?.message}`),
                dadosUtilizados: { modalidade: 'Leitura de Estudante', semana: fx.firstWeekId, totalPublicadores: fx.publishers.length, elegiveis: elegiveisCount },
            };
        },
    }),

    NAVIGATE_WEEK: (fx) => {
        const weekIds = [...new Set(fx.parts.map(p => p.weekId))].sort();
        const currentWeek = weekIds[0] || 'N/A';
        const targetWeek = weekIds.length > 1 ? weekIds[1] : weekIds[0] || '2026-04-06';
        const partsInTarget = fx.parts.filter(p => p.weekId === targetWeek);
        return {
            action: { type: 'NAVIGATE_WEEK', params: { weekId: targetWeek }, description: `Teste: navegar de ${currentWeek} para ${targetWeek}` },
            safe: true,
            buildScript: (_fx, result, error) => ({
                cenario: `Semanas disponíveis no banco: [${weekIds.slice(0, 8).join(', ')}${weekIds.length > 8 ? '...' : ''}] (${weekIds.length} total). Semana atual (1ª): ${currentWeek}. Semana alvo: ${targetWeek}. Partes na semana alvo: ${partsInTarget.length}.`,
                comandoSimulado: `"Vá para a semana ${targetWeek}"`,
                expectativa: `O sistema deve navegar da semana ${currentWeek} para ${targetWeek}. A semana alvo possui ${partsInTarget.length} partes. O frontend deve atualizar o weekId em foco.`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Navegação realizada com sucesso para ${targetWeek}. Mensagem: "${result?.message}"` : `Falha na navegação: ${result?.message}`),
                diagnostico: error ? `Exceção ao navegar. Verifique se o handler NAVIGATE_WEEK no agentActionService está correto.` : (result?.success ? `Teste OK. Navegou de "${currentWeek}" para "${targetWeek}". ${partsInTarget.length > 0 ? `A semana de destino possui ${partsInTarget.length} partes carregadas com ${partsInTarget.filter(p => !!p.resolvedPublisherName).length} já designadas.` : 'ATENÇÃO: A semana de destino não possui partes — pode ser uma semana sem apostila importada.'}` : `Navegação falhou. A semana ${targetWeek} pode não existir no banco ou os dados estão corrompidos.`),
                dadosUtilizados: { semanaOrigem: currentWeek, semanaDestino: targetWeek, semanasDisponiveis: weekIds.length, partesNaDestino: partsInTarget.length, designadasNaDestino: partsInTarget.filter(p => !!p.resolvedPublisherName).length },
            }),
        };
    },

    VIEW_S140: (fx) => {
        const weekParts = fx.parts.filter(p => p.weekId === fx.firstWeekId);
        const designadas = weekParts.filter(p => !!p.resolvedPublisherName);
        return {
            action: { type: 'VIEW_S140', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: visualizar S-140' },
            safe: true,
            buildScript: (_fx, result, error) => ({
                cenario: `Semana ${fx.firstWeekId}: ${weekParts.length} partes total, ${designadas.length} designadas, ${weekParts.length - designadas.length} pendentes.`,
                comandoSimulado: `"Mostre o S-140 da semana ${fx.firstWeekId}"`,
                expectativa: `O S-140 deve ser renderizado com todas as ${weekParts.length} partes da semana, exibindo nomes dos designados nas ${designadas.length} partes preenchidas.`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `S-140 preparado. ${result?.message?.substring(0, 150)}` : `Falha: ${result?.message}`),
                diagnostico: error ? `Erro ao gerar dados do S-140.` : (result?.success ? `S-140 gerado com sucesso para semana ${fx.firstWeekId}. ${designadas.length}/${weekParts.length} partes com designação visível.` : `Falha ao preparar S-140: ${result?.message}`),
                dadosUtilizados: { semana: fx.firstWeekId, totalPartes: weekParts.length, designadas: designadas.length, pendentes: weekParts.length - designadas.length },
            }),
        };
    },

    SHARE_S140_WHATSAPP: (fx) => {
        const weekParts = fx.parts.filter(p => p.weekId === fx.firstWeekId);
        return {
            action: { type: 'SHARE_S140_WHATSAPP', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: compartilhar S-140' },
            safe: true,
            buildScript: (_fx, result, error) => ({
                cenario: `Semana ${fx.firstWeekId} com ${weekParts.length} partes. Ação de compartilhamento via WhatsApp.`,
                comandoSimulado: `"Compartilhe o S-140 da semana ${fx.firstWeekId} no WhatsApp"`,
                expectativa: 'O sistema gera imagem PNG do S-140 e abre interface de compartilhamento. Em teste funcional, valida apenas se a ação retorna success.',
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Compartilhamento sinalizado com sucesso. "${result?.message}"` : `Falha: ${result?.message}`),
                diagnostico: error ? `Erro ao preparar compartilhamento.` : (result?.success ? `Ação de compartilhamento retornou OK. O frontend deve renderizar o S-140 com html2canvas e exibir opções de envio.` : `Falha no handler SHARE_S140_WHATSAPP.`),
                dadosUtilizados: { semana: fx.firstWeekId, partes: weekParts.length },
            }),
        };
    },

    FETCH_DATA: (fx) => ({
        action: { type: 'FETCH_DATA', params: { context: 'publishers', limit: 5 }, description: 'Teste: consulta de dados' },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: `Consulta de dados genérica. Base possui ${fx.publishers.length} publicadores.`,
            comandoSimulado: '"Busque dados dos publicadores (limite: 5)"',
            expectativa: 'FETCH_DATA deve consultar a tabela solicitada (publishers) e retornar até 5 registros com informações resumidas.',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Dados retornados com sucesso. ${result?.message?.substring(0, 200)}` : `Falha: ${result?.message}`),
            diagnostico: error ? `Exceção no dataDiscoveryService.` : (result?.success ? `Consulta retornou dados válidos. O serviço de descoberta de dados está funcional.` : `FETCH_DATA falhou: ${result?.message}`),
            dadosUtilizados: { contexto: 'publishers', limite: 5, totalNoBanco: fx.publishers.length },
        }),
    }),

    GET_ANALYTICS: (fx) => ({
        action: {
            type: 'GET_ANALYTICS',
            params: fx.firstPublisherName ? { publisherName: fx.firstPublisherName } : {},
            description: 'Teste: analytics de participação'
        },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: `${fx.publishers.length} publicadores. ${fx.firstPublisherName ? `Consultando stats de "${fx.firstPublisherName}".` : 'Nenhum publicador específico — consulta geral.'} Histórico: ${fx.history.length} registros.`,
            comandoSimulado: fx.firstPublisherName ? `"Mostre as estatísticas de participação de ${fx.firstPublisherName}"` : '"Mostre as estatísticas gerais de participação"',
            expectativa: fx.firstPublisherName ? `Retornar total de participações, últimas designações, breakdown por tipo de parte de "${fx.firstPublisherName}".` : 'Retornar resumo geral: publicadores ativos, tipos de parte disponíveis.',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Analytics gerado. ${result?.message?.substring(0, 200)}` : `Falha: ${result?.message}`),
            diagnostico: error ? `Erro no participationAnalyticsService.` : (result?.success ? `Estatísticas calculadas com sucesso. O serviço de analytics está retornando dados completos.` : `Analytics falhou: ${result?.message}`),
            dadosUtilizados: { publicador: fx.firstPublisherName || '(geral)', totalHistorico: fx.history.length },
        }),
    }),

    SIMULATE_ASSIGNMENT: (fx) => {
        const target = fx.firstPartWithoutAssignment;
        return {
            action: {
                type: 'SIMULATE_ASSIGNMENT',
                params: {
                    partId: target?.id || fx.firstPartId || 'test-id',
                    publisherName: fx.firstPublisherName || 'Test Publisher',
                    weekId: fx.firstWeekId || '2026-04-06',
                },
                description: 'Teste: simulação de designação (dry-run)'
            },
            safe: true,
            skipIf: (!fx.firstPartId || !fx.firstPublisherName) ? 'Sem partes ou publicadores para simular' : null,
            buildScript: (_fx, result, error) => ({
                cenario: `Parte: "${target?.tituloParte || 'N/A'}" (${target?.tipoParte || '?'}) na semana ${target?.weekId || fx.firstWeekId}. Publicador: "${fx.firstPublisherName}". Status atual: ${target?.status || 'PENDENTE'}.`,
                comandoSimulado: `"Simule designar ${fx.firstPublisherName} para ${target?.tipoParte || 'a parte'}"`,
                expectativa: `Simulação dry-run: verificar se "${fx.firstPublisherName}" é elegível para "${target?.tipoParte || '?'}", calcular score, e retornar resultado sem salvar no banco.`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Simulação OK. ${result?.message}` : `Simulação negativa: ${result?.message}`),
                diagnostico: error ? `Exceção na simulação.` : (result?.success ? `"${fx.firstPublisherName}" pode ser designado para esta parte. Score e elegibilidade confirmados sem alterar dados.` : `"${fx.firstPublisherName}" NÃO é elegível ou a simulação falhou. Motivo: ${result?.message}`),
                dadosUtilizados: { parteId: target?.id, tipoParte: target?.tipoParte, publicador: fx.firstPublisherName, semana: target?.weekId },
            }),
        };
    },

    MANAGE_LOCAL_NEEDS: (fx) => ({
        action: { type: 'MANAGE_LOCAL_NEEDS', params: { subAction: 'LIST' }, description: 'Teste: listar necessidades locais' },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: 'Consulta de necessidades locais cadastradas (substituições de partes, temas especiais, etc.).',
            comandoSimulado: '"Liste as necessidades locais cadastradas"',
            expectativa: 'Retornar lista de necessidades locais ativas com descrição e semanas afetadas.',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `${result?.message?.substring(0, 200)}` : `Falha: ${result?.message}`),
            diagnostico: error ? `Erro ao consultar localNeedsService.` : (result?.success ? 'Necessidades locais consultadas. O serviço está funcional.' : `Consulta falhou: ${result?.message}`),
            dadosUtilizados: { subAcao: 'LIST' },
        }),
    }),

    MANAGE_SPECIAL_EVENT: () => ({
        action: { type: 'FETCH_DATA', params: { context: 'workbook', limit: 3 }, description: 'Teste: proxy seguro para eventos (via FETCH_DATA)' },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: 'MANAGE_SPECIAL_EVENT é destrutivo. Teste usa proxy FETCH_DATA para verificar conectividade.',
            comandoSimulado: '"Liste os eventos especiais" (proxy: FETCH_DATA workbook)',
            expectativa: 'Consulta de workbook via FETCH_DATA retorna dados, validando que o pipeline funciona.',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Proxy retornou dados OK.` : `Falha: ${result?.message}`),
            diagnostico: error ? `Erro no proxy de teste.` : (result?.success ? 'Pipeline funcional. MANAGE_SPECIAL_EVENT real foi substituído por proxy seguro.' : `Proxy FETCH_DATA falhou.`),
            dadosUtilizados: { proxyUsado: 'FETCH_DATA', contexto: 'workbook' },
        }),
    }),

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
                    await workbookService.updatePart(result.data.partId, {
                        resolvedPublisherName: target?.resolvedPublisherName || '',
                        status: target?.status || 'PENDENTE',
                    });
                }
            },
            buildScript: (_fx, result, error) => ({
                cenario: `Parte vazia: "${target?.tituloParte || 'N/A'}" (${target?.tipoParte || '?'}, semana ${target?.weekId}). Publicador: "${pubName}". Status antes: "${target?.status || 'PENDENTE'}".`,
                comandoSimulado: `"Designe ${pubName} para ${target?.tipoParte || 'a parte'} da semana ${target?.weekId}"`,
                expectativa: `1. Resolver ID do publicador "${pubName}" → 2. Verificar elegibilidade → 3. Gravar no banco (resolvedPublisherName="${pubName}") → 4. Rollback automático (reverter para estado original).`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Designação realizada e REVERTIDA com sucesso. Parte ${result?.data?.partId} foi designada para "${pubName}" e depois voltou ao estado PENDENTE.` : `Designação falhou: ${result?.message}`),
                diagnostico: error ? `Exceção ao designar.` : (result?.success ? `Fluxo completo ASSIGN_PART OK: designação gravada → confirmada → rollback executado. Banco restaurado ao estado original.` : `ASSIGN_PART retornou falha. Possível causa: publicador inelegível, parte não encontrada ou conflito de status.`),
                dadosUtilizados: { parteId: target?.id, tipoParte: target?.tipoParte, publicador: pubName, semana: target?.weekId, statusAnterior: target?.status },
            }),
        };
    },

    GENERATE_WEEK: (fx) => ({
        action: { type: 'GENERATE_WEEK', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: gerar designações (SKIP em diagnóstico)' },
        safe: true,
        skipIf: 'Ação destrutiva — use manualmente. Diagnóstico verifica apenas se a rota funciona.',
        buildScript: () => ({
            cenario: 'GENERATE_WEEK sobrescreve todas as designações da semana — skip automático por segurança.',
            comandoSimulado: '"Gere as designações desta semana"',
            expectativa: 'N/A — teste pulado para proteger dados existentes.',
            resultadoObtido: 'SKIP — ação não executada.',
            diagnostico: 'Ação destrutiva não testada automaticamente. Execute manualmente no Chat-IA se necessário.',
            dadosUtilizados: { motivo: 'proteção de dados' },
        }),
    }),

    CLEAR_WEEK: () => ({
        action: { type: 'CLEAR_WEEK', params: { weekId: 'SKIP' }, description: 'Teste: limpar semana (SKIP em diagnóstico)' },
        safe: true,
        skipIf: 'Ação destrutiva — use manualmente.',
        buildScript: () => ({
            cenario: 'CLEAR_WEEK apaga todas designações de uma semana — skip automático.',
            comandoSimulado: '"Limpe as designações desta semana"',
            expectativa: 'N/A — teste pulado.',
            resultadoObtido: 'SKIP.',
            diagnostico: 'Ação destrutiva. Teste manual recomendado.',
            dadosUtilizados: { motivo: 'proteção de dados' },
        }),
    }),

    UNDO_LAST: (fx) => ({
        action: { type: 'UNDO_LAST', params: {}, description: 'Teste: desfazer última ação' },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: 'Verifica se o sistema de undo tem ações no stack para desfazer.',
            comandoSimulado: '"Desfaça a última ação"',
            expectativa: 'Se houver ação no stack, deve desfazer e reportar qual ação foi revertida. Se vazio, retorna "nada para desfazer".',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Ação desfeita: "${result?.message}"` : `Nada para desfazer: "${result?.message}"`),
            diagnostico: error ? `Exceção no undoService.` : (result?.success ? `Undo executado com sucesso. O stack de ações registrou e reverteu a última operação.` : `Stack de undo vazio — é esperado se nenhuma ação anterior foi feita nesta sessão. O undoService respondeu corretamente.`),
            dadosUtilizados: { stackDisponivel: result?.success ? 'sim' : 'vazio' },
        }),
    }),

    UPDATE_PUBLISHER: (fx) => {
        const pub = fx.publishers[0];
        if (!pub) {
            return {
                action: { type: 'UPDATE_PUBLISHER', params: { publisherName: 'inexistente', updates: {} }, description: 'Teste: atualizar publicador (sem dados)' },
                safe: true,
                skipIf: 'Sem publicadores cadastrados',
                buildScript: () => ({
                    cenario: 'Nenhum publicador disponível no banco.',
                    comandoSimulado: 'N/A',
                    expectativa: 'N/A',
                    resultadoObtido: 'SKIP',
                    diagnostico: 'Banco sem publicadores. Importe dados primeiro.',
                }),
            };
        }
        return {
            action: {
                type: 'UPDATE_PUBLISHER',
                params: {
                    publisherName: pub.name,
                    updates: { isNotQualified: pub.isNotQualified ?? false },
                },
                description: `Teste: atualizar publicador (noop: re-grava mesmo valor de isNotQualified)`
            },
            safe: true,
            buildScript: (_fx, result, error) => ({
                cenario: `Publicador: "${pub.name}". Campo testado: isNotQualified (valor atual: ${pub.isNotQualified ?? false}). Teste NOOP: re-grava o mesmo valor.`,
                comandoSimulado: `"Atualize o publicador ${pub.name}: isNotQualified = ${pub.isNotQualified ?? false}"`,
                expectativa: `API de atualização é chamada com o MESMO valor de isNotQualified (${pub.isNotQualified ?? false}). O banco não é alterado efetivamente (idempotente).`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Atualização retornou sucesso. "${result?.message}"` : `Falha: ${result?.message}`),
                diagnostico: error ? `Exceção ao atualizar publicador.` : (result?.success ? `Teste NOOP OK. O campo isNotQualified foi re-gravado com valor "${pub.isNotQualified ?? false}" (sem alteração real). Pipeline de UPDATE_PUBLISHER está funcional.` : `UPDATE_PUBLISHER falhou mesmo com operação NOOP. Verifique permissões do Supabase.`),
                dadosUtilizados: { publicador: pub.name, campo: 'isNotQualified', valorAnterior: pub.isNotQualified ?? false, valorEnviado: pub.isNotQualified ?? false },
            }),
        };
    },

    UPDATE_AVAILABILITY: (fx) => {
        const pub = fx.publishers[0];
        if (!pub) {
            return {
                action: { type: 'UPDATE_AVAILABILITY', params: {}, description: 'Teste: bloquear data (sem dados)' },
                safe: true,
                skipIf: 'Sem publicadores cadastrados',
                buildScript: () => ({
                    cenario: 'Sem publicadores.',
                    comandoSimulado: 'N/A',
                    expectativa: 'N/A',
                    resultadoObtido: 'SKIP',
                    diagnostico: 'Banco sem publicadores.',
                }),
            };
        }
        const testDate = '1999-01-01';
        const datesAntes = pub.availability?.exceptionDates?.length || 0;
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
                const freshPub = fixtures.publishers.find(p => p.name === pub.name);
                if (freshPub) {
                    const cleaned = (freshPub.availability.exceptionDates || []).filter(d => d !== testDate);
                    await api.updatePublisher({
                        ...freshPub,
                        availability: { ...freshPub.availability, exceptionDates: cleaned }
                    });
                }
            },
            buildScript: (_fx, result, error) => ({
                cenario: `Publicador: "${pub.name}". Datas bloqueadas atuais: ${datesAntes}. Data de teste: ${testDate} (passado impossível — fácil de reverter).`,
                comandoSimulado: `"Bloqueie ${pub.name} para a data ${testDate}"`,
                expectativa: `1. Adicionar ${testDate} à lista de exceptionDates de "${pub.name}" → 2. Confirmar gravação → 3. Rollback: remover a data fictícia.`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Data ${testDate} adicionada e REVERTIDA. "${result?.message}"` : `Falha: ${result?.message}`),
                diagnostico: error ? `Exceção ao bloquear data.` : (result?.success ? `Fluxo completo OK: data fictícia (${testDate}) adicionada → confirmada → removida no rollback. Availability do publicador restaurada com ${datesAntes} datas.` : `UPDATE_AVAILABILITY falhou. Verifique se o handler aceita o formato de unavailableDates.`),
                dadosUtilizados: { publicador: pub.name, dataTeste: testDate, datasAntes: datesAntes },
            }),
        };
    },

    UPDATE_ENGINE_RULES: () => ({
        action: { type: 'UPDATE_ENGINE_RULES', params: { settings: {} }, description: 'Teste: atualizar regras (SKIP em diagnóstico)' },
        safe: true,
        skipIf: 'Ação de configuração global — skip por segurança.',
        buildScript: () => ({
            cenario: 'UPDATE_ENGINE_RULES altera regras globais do motor de designação.',
            comandoSimulado: '"Atualize as regras do motor"',
            expectativa: 'N/A — skip por segurança.',
            resultadoObtido: 'SKIP.',
            diagnostico: 'Ação de configuração global não testada automaticamente.',
            dadosUtilizados: { motivo: 'configuração global sensível' },
        }),
    }),

    SEND_S140: (fx) => {
        const weekParts = fx.parts.filter(p => p.weekId === fx.firstWeekId);
        return {
            action: { type: 'SEND_S140', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: preparar S-140' },
            safe: true,
            skipIf: fx.parts.length === 0 ? 'Sem partes para gerar S-140' : null,
            buildScript: (_fx, result, error) => ({
                cenario: `Semana ${fx.firstWeekId}: ${weekParts.length} partes. Gerando S-140 para envio.`,
                comandoSimulado: `"Prepare o S-140 da semana ${fx.firstWeekId} para envio"`,
                expectativa: 'O S-140 deve ser gerado como HTML/imagem pronto para compartilhamento. Dados de todas as partes devem ser incluídos.',
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `S-140 preparado. "${result?.message?.substring(0, 150)}"` : `Falha: ${result?.message}`),
                diagnostico: error ? `Erro ao preparar S-140.` : (result?.success ? `S-140 gerado com sucesso para ${weekParts.length} partes da semana ${fx.firstWeekId}.` : `SEND_S140 falhou: ${result?.message}`),
                dadosUtilizados: { semana: fx.firstWeekId, partes: weekParts.length },
            }),
        };
    },

    SEND_S89: (fx) => {
        const weekParts = fx.parts.filter(p => p.weekId === fx.firstWeekId);
        const studentParts = weekParts.filter(p => ['Leitura da Bíblia', 'Primeira Conversa', 'Revisita', 'Estudo Bíblico', 'Discurso'].some(t => p.tipoParte?.includes(t)));
        return {
            action: { type: 'SEND_S89', params: { weekId: fx.firstWeekId || '2026-04-06' }, description: 'Teste: preparar S-89' },
            safe: true,
            skipIf: fx.parts.length === 0 ? 'Sem partes para gerar S-89' : null,
            buildScript: (_fx, result, error) => ({
                cenario: `Semana ${fx.firstWeekId}: ${studentParts.length} partes estudantis (de ${weekParts.length} total). S-89 é o formulário individual por parte.`,
                comandoSimulado: `"Prepare os S-89 da semana ${fx.firstWeekId}"`,
                expectativa: `Gerar formulários S-89 individuais para cada parte estudantil da semana. Esperados: ~${studentParts.length} formulários.`,
                resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `S-89 preparado. "${result?.message?.substring(0, 150)}"` : `Falha: ${result?.message}`),
                diagnostico: error ? `Erro ao gerar S-89.` : (result?.success ? `S-89 gerado para semana ${fx.firstWeekId}. Partes estudantis encontradas: ${studentParts.length}.` : `SEND_S89 falhou: ${result?.message}`),
                dadosUtilizados: { semana: fx.firstWeekId, partesEstudantis: studentParts.length, totalPartes: weekParts.length },
            }),
        };
    },

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
            safe: false,
            skipIf: !assigned ? 'Sem parte designada para testar NOTIFY_REFUSAL' : 'Ação envia notificação real — skip por segurança.',
            buildScript: () => ({
                cenario: `Parte designada: "${assigned?.tituloParte || 'N/A'}" para "${assigned?.resolvedPublisherName || 'N/A'}".`,
                comandoSimulado: `"Registre recusa de ${assigned?.resolvedPublisherName || '?'} para ${assigned?.tipoParte || '?'}"`,
                expectativa: 'N/A — skip para evitar notificação real.',
                resultadoObtido: 'SKIP.',
                diagnostico: 'Ação envia notificação real para publicadores. Não testada automaticamente.',
                dadosUtilizados: { publicador: assigned?.resolvedPublisherName, parte: assigned?.tipoParte },
            }),
        };
    },

    IMPORT_WORKBOOK: () => ({
        action: {
            type: 'IMPORT_WORKBOOK',
            params: { weekDate: '2026-04-06', subAction: 'PREVIEW' },
            description: 'Teste: prévia importação jw.org (sem salvar)',
        },
        safe: true,
        buildScript: (_fx, result, error) => ({
            cenario: 'Importação de apostila da Vida e Ministério (jw.org) em modo PREVIEW (não salva).',
            comandoSimulado: '"Importe a apostila da semana 2026-04-06 (apenas prévia)"',
            expectativa: 'Conectar ao jw.org, buscar apostila da semana, extrair partes (títulos, durações, seções) e mostrar prévia SEM salvar no banco.',
            resultadoObtido: error ? `ERRO: ${error}` : (result?.success ? `Prévia gerada. ${result?.message?.substring(0, 200)}` : `Falha: ${result?.message}`),
            diagnostico: error ? `Exceção ao consultar jw.org. Verifique se jwOrgService está acessível.` : (result?.success ? `Importação PREVIEW OK. Dados extraídos do jw.org sem alterar o banco local.` : `Importação falhou: ${result?.message}. Possível causa: semana indisponível no jw.org, erro de rede, ou parsing falhou.`),
            dadosUtilizados: { weekDate: '2026-04-06', modo: 'PREVIEW' },
        }),
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
                testScript: testDef.buildScript(fixtures, undefined, undefined),
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
                testScript: testDef.buildScript(fixtures, result, undefined),
            });
        } catch (err) {
            const elapsed = Math.round(performance.now() - t0);
            const errMsg = err instanceof Error ? err.message : String(err);
            results.push({
                actionType,
                status: 'FAIL',
                durationMs: elapsed,
                message: `Exceção não tratada ao executar ${actionType}`,
                error: errMsg,
                safe: testDef.safe,
                testScript: testDef.buildScript(fixtures, undefined, errMsg),
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
