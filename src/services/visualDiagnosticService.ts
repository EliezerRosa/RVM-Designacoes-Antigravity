/**
 * Visual Diagnostic Service — Testes visuais com captura de tela e validação Gemini Vision
 *
 * Para ações do Chat-IA que produzem resultado visual (S-140, rankings, analytics),
 * este serviço:
 *   1. Simula comandos reais do usuário (em português)
 *   2. Renderiza o resultado visual em HTML off-screen
 *   3. Captura screenshot via html2canvas
 *   4. Envia a imagem ao Gemini Vision para validação automática
 */

import html2canvas from 'html2canvas';
import { prepareS140UnifiedData, renderS140ToElement } from './s140GeneratorUnified';
import { agentActionService, type AgentActionType, type ActionResult } from './agentActionService';
import { api } from './api';
import { workbookService } from './workbookService';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';

// ===== Configuração =====

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// ===== Tipos =====

export interface VisualTestResult {
    actionType: AgentActionType;
    mockCommand: string;
    mockDescription: string;
    screenshotBase64?: string;
    geminiAnalysis?: string;
    validationPassed: boolean;
    validationDetails: string;
    durationMs: number;
    error?: string;
    /** Script detalhado do teste visual */
    testScript?: VisualTestScript;
}

/** Documenta o cenário completo do teste visual */
export interface VisualTestScript {
    cenario: string;
    comandoSimulado: string;
    expectativaVisual: string;
    acaoExecutada: string;
    capturaRealizada: string;
    analiseGemini: string;
    diagnosticoFinal: string;
    dadosUtilizados?: Record<string, any>;
}

export interface VisualDiagnosticReport {
    timestamp: string;
    totalTests: number;
    passed: number;
    failed: number;
    durationMs: number;
    results: VisualTestResult[];
}

// ===== Mapa de comandos mockados por ação visual =====

interface VisualMock {
    command: string;          // Comando que o usuário digitaria no Chat-IA
    description: string;      // Descrição do que o teste valida
    renderType: 's140' | 'data-table' | 'text-report';
    geminiPrompt: string;     // Prompt específico para o Gemini analisar a captura
    buildAction: (weekId: string, publisherName?: string) => { type: AgentActionType; params: Record<string, any>; description: string };
    /** Monta o VisualTestScript com contexto completo */
    buildScript: (ctx: VisualScriptContext) => VisualTestScript;
}

interface VisualScriptContext {
    weekIds: string[];
    firstWeekId: string;
    publisherCount: number;
    partsInWeek: number;
    designadasInWeek: number;
    firstPubName?: string;
    actionSuccess: boolean;
    actionMessage: string;
    hadScreenshot: boolean;
    geminiSummary: string;
    validationPassed: boolean;
    error?: string;
}

const VISUAL_TEST_MAP: Record<string, VisualMock> = {
    VIEW_S140: {
        command: 'Mostre o S-140 desta semana',
        description: 'Renderiza o formulário S-140 completo e valida layout visual',
        renderType: 's140',
        geminiPrompt: `Analise esta imagem do formulário S-140 (programa de reunião semanal de uma congregação).
Avalie em português do Brasil:
1. **Layout**: O formulário está bem formatado? Cabeçalho, seções e rodapé visíveis?
2. **Seções**: Identifique as seções presentes (TESOUROS DA PALAVRA DE DEUS, FAÇA SEU MELHOR NO MINISTÉRIO, NOSSA VIDA CRISTÃ, cânticos, orações).
3. **Designações**: Há nomes de pessoas atribuídos às partes? Estão legíveis?
4. **Problemas visuais**: Texto cortado, sobreposição, cores ilegíveis, colunas desalinhadas?
5. **Veredito final**: Responda APROVADO ou REPROVADO com justificativa curta.`,
        buildAction: (weekId) => ({
            type: 'VIEW_S140',
            params: { weekId },
            description: `Mock: visualizar S-140 semana ${weekId}`,
        }),
        buildScript: (ctx) => ({
            cenario: `Semana ${ctx.firstWeekId}: ${ctx.partsInWeek} partes, ${ctx.designadasInWeek} designadas. ${ctx.publisherCount} publicadores no banco.`,
            comandoSimulado: `"Mostre o S-140 da semana ${ctx.firstWeekId}"`,
            expectativaVisual: `O S-140 deve exibir formulário completo com cabeçalho (congregação, semana), 3 seções coloridas (Tesouros, Ministério, Vida Cristã), cânticos, orações, e ${ctx.designadasInWeek} nomes de designados visíveis.`,
            acaoExecutada: ctx.error ? `ERRO ao executar VIEW_S140: ${ctx.error}` : (ctx.actionSuccess ? `Ação VIEW_S140 retornou sucesso. "${ctx.actionMessage.substring(0, 100)}"` : `Ação falhou: ${ctx.actionMessage}`),
            capturaRealizada: ctx.hadScreenshot ? `Screenshot capturado via html2canvas (escala 2x) de ${ctx.partsInWeek} partes renderizadas off-screen.` : 'Screenshot NÃO capturado — sem partes na semana ou erro no render.',
            analiseGemini: ctx.geminiSummary || 'Não analisado pelo Gemini Vision.',
            diagnosticoFinal: ctx.error ? `Falha técnica ao visualizar S-140.` : (!ctx.hadScreenshot ? 'Sem captura visual — impossível validar.' : (ctx.validationPassed ? `S-140 da semana ${ctx.firstWeekId} renderizado e APROVADO pelo Gemini Vision. Layout, seções e designações estão corretos.` : `S-140 da semana ${ctx.firstWeekId} REPROVADO pelo Gemini Vision. Verifique a análise acima para detalhes.`)),
            dadosUtilizados: { semana: ctx.firstWeekId, partes: ctx.partsInWeek, designadas: ctx.designadasInWeek },
        }),
    },

    SEND_S140: {
        command: 'Prepare a programação S-140 para envio',
        description: 'Gera S-140 para exportação e valida conteúdo',
        renderType: 's140',
        geminiPrompt: `Esta imagem é a programação S-140 gerada para envio. Valide em português:
1. A programação está completa com todas as seções?
2. Os nomes dos designados estão visíveis e legíveis?
3. Há informação de data/semana no cabeçalho?
4. O layout seria adequado para compartilhamento (WhatsApp/impressão)?
5. Veredito: APROVADO ou REPROVADO.`,
        buildAction: (weekId) => ({
            type: 'SEND_S140',
            params: { weekId },
            description: `Mock: preparar S-140 semana ${weekId}`,
        }),
        buildScript: (ctx) => ({
            cenario: `Preparação de S-140 para envio externo. Semana ${ctx.firstWeekId}: ${ctx.partsInWeek} partes.`,
            comandoSimulado: `"Prepare a programação S-140 da semana ${ctx.firstWeekId} para envio"`,
            expectativaVisual: `S-140 gerado como imagem de alta resolução, adequado para impressão e WhatsApp. Todos os campos preenchidos devem estar legíveis.`,
            acaoExecutada: ctx.error ? `ERRO: ${ctx.error}` : (ctx.actionSuccess ? `SEND_S140 OK. "${ctx.actionMessage.substring(0, 100)}"` : `Falha: ${ctx.actionMessage}`),
            capturaRealizada: ctx.hadScreenshot ? 'Screenshot capturado em alta resolução (2x).' : 'Sem captura.',
            analiseGemini: ctx.geminiSummary || 'Não analisado.',
            diagnosticoFinal: ctx.validationPassed ? `S-140 pronto para envio — qualidade visual aprovada.` : `S-140 reprovado ou não capturado. ${ctx.error || ctx.actionMessage}`,
            dadosUtilizados: { semana: ctx.firstWeekId, partes: ctx.partsInWeek },
        }),
    },

    SHARE_S140_WHATSAPP: {
        command: 'Compartilhe o S-140 no WhatsApp',
        description: 'Captura S-140 como PNG para compartilhamento',
        renderType: 's140',
        geminiPrompt: `Esta imagem do S-140 será compartilhada via WhatsApp. Valide:
1. A imagem é nítida e legível em tela de celular?
2. O texto é grande o suficiente para leitura?
3. As cores têm contraste adequado?
4. A programação completa está visível sem cortes?
5. Veredito: APROVADO ou REPROVADO para envio via WhatsApp.`,
        buildAction: (weekId) => ({
            type: 'SHARE_S140_WHATSAPP',
            params: { weekId },
            description: `Mock: compartilhar S-140 via WhatsApp semana ${weekId}`,
        }),
        buildScript: (ctx) => ({
            cenario: `Compartilhamento via WhatsApp do S-140 da semana ${ctx.firstWeekId}.`,
            comandoSimulado: `"Compartilhe o S-140 da semana ${ctx.firstWeekId} no WhatsApp"`,
            expectativaVisual: 'Imagem PNG nítida e legível em tela de celular. Texto grande o suficiente, cores com bom contraste, sem cortes.',
            acaoExecutada: ctx.error ? `ERRO: ${ctx.error}` : (ctx.actionSuccess ? `Compartilhamento sinalizado. "${ctx.actionMessage.substring(0, 100)}"` : `Falha: ${ctx.actionMessage}`),
            capturaRealizada: ctx.hadScreenshot ? 'PNG capturado em resolução 2x para WhatsApp.' : 'Sem captura.',
            analiseGemini: ctx.geminiSummary || 'Não analisado.',
            diagnosticoFinal: ctx.validationPassed ? 'Imagem aprovada para envio via WhatsApp — legível e completa.' : `Imagem reprovada para WhatsApp. ${ctx.error || 'Verifique análise do Gemini.'}`,
            dadosUtilizados: { semana: ctx.firstWeekId, partes: ctx.partsInWeek },
        }),
    },

    NAVIGATE_WEEK: {
        command: 'Vá para a próxima semana',
        description: 'Renderiza S-140 da semana alvo para validar navegação',
        renderType: 's140',
        geminiPrompt: `O usuário pediu para navegar para outra semana. Esta é a visualização S-140 da semana de destino.
1. A imagem mostra uma programação S-140 válida?
2. Há indicação de data/semana no conteúdo?
3. O conteúdo é diferente de uma página em branco?
4. Veredito: APROVADO (navegação trouxe conteúdo) ou REPROVADO.`,
        buildAction: (weekId) => ({
            type: 'NAVIGATE_WEEK',
            params: { weekId },
            description: `Mock: navegar para semana ${weekId}`,
        }),
        buildScript: (ctx) => {
            const nextWeek = ctx.weekIds.length > 1 ? ctx.weekIds[1] : ctx.firstWeekId;
            return {
                cenario: `Semanas disponíveis: [${ctx.weekIds.slice(0, 5).join(', ')}${ctx.weekIds.length > 5 ? '...' : ''}] (${ctx.weekIds.length} total). Navegando para ${ctx.firstWeekId}. Partes na semana: ${ctx.partsInWeek}.`,
                comandoSimulado: `"Vá para a semana ${ctx.firstWeekId}"`,
                expectativaVisual: `Após navegar, o S-140 da semana ${ctx.firstWeekId} deve ser renderizado com suas ${ctx.partsInWeek} partes. Deve exibir cabeçalho com data correta e conteúdo válido (não vazio).`,
                acaoExecutada: ctx.error ? `ERRO: ${ctx.error}` : (ctx.actionSuccess ? `Navegação para ${ctx.firstWeekId} OK. "${ctx.actionMessage.substring(0, 100)}"` : `Navegação falhou: ${ctx.actionMessage}`),
                capturaRealizada: ctx.hadScreenshot ? `Screenshot do S-140 da semana de destino (${ctx.firstWeekId}) capturado.` : 'Sem captura — semana pode estar vazia.',
                analiseGemini: ctx.geminiSummary || 'Não analisado.',
                diagnosticoFinal: ctx.error ? `Erro na navegação.` : (!ctx.hadScreenshot ? `Semana ${ctx.firstWeekId} não tem partes — página vazia. Importe a apostila primeiro.` : (ctx.validationPassed ? `Navegação para ${ctx.firstWeekId} validada visualmente. O S-140 exibe ${ctx.partsInWeek} partes (${ctx.designadasInWeek} designadas). Gemini confirmou conteúdo válido.` : `Navegação realizou-se mas o S-140 foi reprovado visualmente. Verifique se a semana ${ctx.firstWeekId} tem dados corretos.`)),
                dadosUtilizados: { semanaDestino: ctx.firstWeekId, proximaSemana: nextWeek, totalSemanas: ctx.weekIds.length, partes: ctx.partsInWeek, designadas: ctx.designadasInWeek },
            };
        },
    },

    CHECK_SCORE: {
        command: 'Mostre o ranking de candidatos para Leitura de Estudante',
        description: 'Gera tabela de elegibilidade/ranking e valida com Gemini',
        renderType: 'data-table',
        geminiPrompt: `Esta imagem mostra o ranking de candidatos elegíveis para uma designação. Valide:
1. A tabela mostra posição (#), nome e pontuação?
2. A classificação está em ordem (do melhor ao pior)?
3. As informações são legíveis e bem organizadas?
4. Há pelo menos alguns candidatos listados?
5. Veredito: APROVADO ou REPROVADO.`,
        buildAction: (weekId) => ({
            type: 'CHECK_SCORE',
            params: { partType: 'Leitura de Estudante', date: weekId },
            description: 'Mock: ranking de elegibilidade para Leitura',
        }),
        buildScript: (ctx) => ({
            cenario: `${ctx.publisherCount} publicadores. Ranking para "Leitura de Estudante" na semana ${ctx.firstWeekId}.`,
            comandoSimulado: '"Mostre o ranking de candidatos para Leitura de Estudante"',
            expectativaVisual: 'Tabela com posição (#), nome do publicador, score e métricas. Ordenada do melhor candidato ao pior. Pelo menos 1 candidato visível.',
            acaoExecutada: ctx.error ? `ERRO: ${ctx.error}` : (ctx.actionSuccess ? `Ranking gerado. "${ctx.actionMessage.substring(0, 100)}"` : `Falha: ${ctx.actionMessage}`),
            capturaRealizada: ctx.hadScreenshot ? 'Tabela de ranking capturada como imagem.' : 'Sem captura — ranking vazio ou ação falhou.',
            analiseGemini: ctx.geminiSummary || 'Não analisado.',
            diagnosticoFinal: ctx.validationPassed ? `Ranking de elegibilidade gerado e validado visualmente. Tabela legível com candidatos ordenados.` : `Ranking reprovado ou não gerado. ${ctx.error || ctx.actionMessage}`,
            dadosUtilizados: { modalidade: 'Leitura de Estudante', semana: ctx.firstWeekId, publicadores: ctx.publisherCount },
        }),
    },

    GET_ANALYTICS: {
        command: 'Mostre as estatísticas de participação',
        description: 'Gera relatório de analytics e valida visualização',
        renderType: 'data-table',
        geminiPrompt: `Esta imagem mostra estatísticas de participação do sistema. Valide:
1. Há dados numéricos visíveis (totais, contagens, datas)?
2. A organização facilita a compreensão rápida?
3. As informações estão legíveis?
4. Veredito: APROVADO ou REPROVADO.`,
        buildAction: () => ({
            type: 'GET_ANALYTICS',
            params: {},
            description: 'Mock: estatísticas gerais de participação',
        }),
        buildScript: (ctx) => ({
            cenario: `${ctx.publisherCount} publicadores. Consulta geral de analytics de participação.`,
            comandoSimulado: '"Mostre as estatísticas gerais de participação"',
            expectativaVisual: 'Relatório com dados numéricos (total de participações, publicadores ativos, tipos de parte) formatado e legível.',
            acaoExecutada: ctx.error ? `ERRO: ${ctx.error}` : (ctx.actionSuccess ? `Analytics gerado. "${ctx.actionMessage.substring(0, 100)}"` : `Falha: ${ctx.actionMessage}`),
            capturaRealizada: ctx.hadScreenshot ? 'Relatório de analytics capturado como imagem.' : 'Sem captura.',
            analiseGemini: ctx.geminiSummary || 'Não analisado.',
            diagnosticoFinal: ctx.validationPassed ? 'Relatório de analytics validado — dados numéricos legíveis e bem organizados.' : `Analytics reprovado. ${ctx.error || ctx.actionMessage}`,
            dadosUtilizados: { publicadores: ctx.publisherCount },
        }),
    },

    SHOW_MODAL: {
        command: 'Abra o cadastro de publicadores',
        description: 'Valida que a ação SHOW_MODAL retorna dados corretos para o modal',
        renderType: 'text-report',
        geminiPrompt: `Esta imagem mostra o resultado textual de uma ação SHOW_MODAL. Valide:
1. O relatório indica qual modal seria aberto?
2. Há informações coerentes sobre a entidade (publicadores/apostila)?
3. Veredito: APROVADO ou REPROVADO.`,
        buildAction: () => ({
            type: 'SHOW_MODAL',
            params: { modal: 'publishers' },
            description: 'Mock: abrir modal de publicadores',
        }),
        buildScript: (ctx) => ({
            cenario: `Solicitação de abertura do modal "publishers". ${ctx.publisherCount} publicadores no banco.`,
            comandoSimulado: '"Abra o cadastro de publicadores"',
            expectativaVisual: 'Relatório textual confirmando qual modal seria aberto e que a ação foi processada corretamente.',
            acaoExecutada: ctx.error ? `ERRO: ${ctx.error}` : (ctx.actionSuccess ? `SHOW_MODAL retornou sucesso. "${ctx.actionMessage.substring(0, 100)}"` : `Falha: ${ctx.actionMessage}`),
            capturaRealizada: ctx.hadScreenshot ? 'Relatório textual capturado.' : 'Sem captura.',
            analiseGemini: ctx.geminiSummary || 'Não analisado.',
            diagnosticoFinal: ctx.validationPassed ? 'Modal "publishers" sinalizado corretamente e aprovado pelo Gemini.' : `SHOW_MODAL reprovado. ${ctx.error || ctx.actionMessage}`,
            dadosUtilizados: { modal: 'publishers', publicadores: ctx.publisherCount },
        }),
    },
};

// ===== Utilitários de captura =====

/** Renderiza S-140 off-screen e captura como PNG base64 */
async function captureS140(weekParts: WorkbookPart[], publishers: Publisher[]): Promise<string> {
    const weekData = await prepareS140UnifiedData(weekParts, publishers);
    const element = renderS140ToElement(weekData);

    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(container);
    container.appendChild(element);

    try {
        const canvas = await html2canvas(element, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
        });
        return canvas.toDataURL('image/png');
    } finally {
        document.body.removeChild(container);
    }
}

/** Renderiza dados textuais/tabulares como HTML off-screen e captura */
async function captureDataAsImage(title: string, content: string): Promise<string> {
    const el = document.createElement('div');
    el.style.cssText = `
        width: 600px; padding: 24px; background: #ffffff; font-family: 'Segoe UI', sans-serif;
        color: #1a1a2e; font-size: 14px; line-height: 1.6;
    `;
    el.innerHTML = `
        <div style="border-bottom: 2px solid #3B82F6; padding-bottom: 8px; margin-bottom: 16px;">
            <h2 style="margin: 0; font-size: 16px; color: #1E293B;">${escapeHtml(title)}</h2>
            <p style="margin: 4px 0 0; font-size: 11px; color: #64748B;">Diagnóstico Visual — RVM Designações</p>
        </div>
        <div style="white-space: pre-wrap; font-size: 13px;">${formatMarkdownToHtml(content)}</div>
    `;

    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(container);
    container.appendChild(el);

    try {
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
        return canvas.toDataURL('image/png');
    } finally {
        document.body.removeChild(container);
    }
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMarkdownToHtml(md: string): string {
    return escapeHtml(md)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/\| /g, '<span style="color:#64748B">│ </span>');
}

// ===== Gemini Vision API =====

async function analyzeWithGeminiVision(imageBase64: string, prompt: string): Promise<string> {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType: 'image/png', data: base64Data } },
                { text: prompt },
            ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    };

    const hasLocalKey = !!GEMINI_API_KEY && GEMINI_API_KEY.length > 10;
    let response: Response;

    if (hasLocalKey) {
        // Dev local: chama Gemini diretamente com a key
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
    } else {
        // Produção (Vercel): usa o proxy /api/chat que injeta a key server-side
        response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini Vision HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '[Sem resposta do Gemini Vision]';
}

// ===== Motor principal de testes visuais =====

export async function runVisualDiagnostic(
    targetAction?: AgentActionType | 'ALL'
): Promise<VisualDiagnosticReport> {
    const startTime = performance.now();
    const results: VisualTestResult[] = [];

    // Carregar dados reais
    let publishers: Publisher[] = [];
    let parts: WorkbookPart[] = [];

    try {
        [publishers, parts] = await Promise.all([
            api.loadPublishers(),
            workbookService.getAll(),
        ]);
    } catch (e) {
        return {
            timestamp: new Date().toISOString(),
            totalTests: 0,
            passed: 0,
            failed: 0,
            durationMs: Math.round(performance.now() - startTime),
            results: [{
                actionType: 'FETCH_DATA',
                mockCommand: '',
                mockDescription: 'Carregamento de fixtures',
                validationPassed: false,
                validationDetails: `Erro ao carregar dados: ${e instanceof Error ? e.message : String(e)}`,
                durationMs: 0,
            }],
        };
    }

    const history: HistoryRecord[] = parts
        .filter(p => p.resolvedPublisherName)
        .map(p => ({
            id: p.id, weekId: p.weekId, weekDisplay: p.weekDisplay, date: p.date,
            section: p.section, tipoParte: p.tipoParte, modalidade: p.modalidade,
            tituloParte: p.tituloParte, descricaoParte: p.descricaoParte,
            detalhesParte: p.detalhesParte, seq: p.seq, funcao: p.funcao,
            duracao: parseInt(p.duracao) || 0, horaInicio: p.horaInicio, horaFim: p.horaFim,
            rawPublisherName: p.rawPublisherName, resolvedPublisherId: p.resolvedPublisherId,
            resolvedPublisherName: p.resolvedPublisherName,
        }));

    const weekIds = [...new Set(parts.map(p => p.weekId))].sort();
    const firstWeekId = weekIds[0] || '2026-04-06';
    const firstPubName = publishers[0]?.name;

    // Determinar quais ações testar
    const visualActionTypes = Object.keys(VISUAL_TEST_MAP) as AgentActionType[];
    const actionsToTest = targetAction && targetAction !== 'ALL'
        ? (VISUAL_TEST_MAP[targetAction] ? [targetAction] : [])
        : visualActionTypes;

    if (actionsToTest.length === 0 && targetAction && targetAction !== 'ALL') {
        results.push({
            actionType: targetAction,
            mockCommand: '',
            mockDescription: '',
            validationPassed: false,
            validationDetails: `Ação ${targetAction} não possui teste visual definido`,
            durationMs: 0,
        });
    }

    // Dados auxiliares para scripts visuais
    const weekPartsAll = parts.filter(p => p.weekId === firstWeekId);
    const designadasAll = weekPartsAll.filter(p => p.resolvedPublisherName);

    // Executar cada teste visual
    for (const actionType of actionsToTest) {
        const mock = VISUAL_TEST_MAP[actionType];
        const t0 = performance.now();

        try {
            // 1. Executar a ação real para obter dados
            const builtAction = mock.buildAction(firstWeekId, firstPubName);
            const actionResult: ActionResult = await agentActionService.executeAction(
                { type: builtAction.type, params: builtAction.params, description: builtAction.description },
                parts, publishers, history, firstWeekId,
            );

            // 2. Capturar screenshot baseado no tipo de renderização
            let screenshotBase64: string | undefined;
            const weekParts = parts.filter(p => p.weekId === firstWeekId);

            if (mock.renderType === 's140' && weekParts.length > 0) {
                screenshotBase64 = await captureS140(weekParts, publishers);
            } else if (mock.renderType === 'data-table' && actionResult.message) {
                screenshotBase64 = await captureDataAsImage(
                    `${actionType} — ${mock.command}`,
                    actionResult.message,
                );
            } else if (mock.renderType === 'text-report') {
                const reportContent = actionResult.message || `Modal: ${builtAction.params?.modal || 'desconhecido'}\nStatus: ${actionResult.success ? 'OK' : 'Falha'}`;
                screenshotBase64 = await captureDataAsImage(
                    `${actionType} — ${mock.command}`,
                    reportContent,
                );
            }

            // 3. Enviar ao Gemini Vision para análise
            let geminiAnalysis: string | undefined;
            let validationPassed = actionResult.success;

            if (screenshotBase64) {
                geminiAnalysis = await analyzeWithGeminiVision(screenshotBase64, mock.geminiPrompt);
                // Veredito: verificar se Gemini disse APROVADO
                const lower = geminiAnalysis.toLowerCase();
                validationPassed = lower.includes('aprovado') && !lower.includes('reprovado');
            }

            // 4. Construir script detalhado
            const scriptCtx: VisualScriptContext = {
                weekIds,
                firstWeekId,
                publisherCount: publishers.length,
                partsInWeek: weekPartsAll.length,
                designadasInWeek: designadasAll.length,
                firstPubName,
                actionSuccess: actionResult.success,
                actionMessage: actionResult.message || '',
                hadScreenshot: !!screenshotBase64,
                geminiSummary: geminiAnalysis || '',
                validationPassed,
            };
            const testScript = mock.buildScript(scriptCtx);
            console.log(`[VisualDiag] ${actionType} testScript:`, testScript?.cenario?.substring(0, 80), '| fields:', Object.keys(testScript || {}).length);

            results.push({
                actionType,
                mockCommand: mock.command,
                mockDescription: mock.description,
                screenshotBase64,
                geminiAnalysis,
                validationPassed,
                validationDetails: geminiAnalysis
                    ? (validationPassed ? 'Gemini Vision aprovou o resultado visual' : 'Gemini Vision reprovou — veja análise')
                    : (actionResult.success ? 'Ação executada sem captura visual' : `Ação falhou: ${actionResult.message}`),
                durationMs: Math.round(performance.now() - t0),
                testScript,
            });

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            // Script detalhado para falha
            const scriptCtx: VisualScriptContext = {
                weekIds,
                firstWeekId,
                publisherCount: publishers.length,
                partsInWeek: weekPartsAll.length,
                designadasInWeek: designadasAll.length,
                firstPubName,
                actionSuccess: false,
                actionMessage: errMsg,
                hadScreenshot: false,
                geminiSummary: '',
                validationPassed: false,
                error: errMsg,
            };
            const testScript = mock.buildScript(scriptCtx);

            results.push({
                actionType,
                mockCommand: mock.command,
                mockDescription: mock.description,
                validationPassed: false,
                validationDetails: `Exceção: ${errMsg}`,
                durationMs: Math.round(performance.now() - t0),
                error: errMsg,
                testScript,
            });
        }
    }

    const totalMs = Math.round(performance.now() - startTime);

    return {
        timestamp: new Date().toISOString(),
        totalTests: results.length,
        passed: results.filter(r => r.validationPassed).length,
        failed: results.filter(r => !r.validationPassed).length,
        durationMs: totalMs,
        results,
    };
}

// ===== Listar ações visuais disponíveis =====

export function getVisualActionTypes(): AgentActionType[] {
    return Object.keys(VISUAL_TEST_MAP) as AgentActionType[];
}

export function getVisualMockCommand(actionType: string): string | null {
    return VISUAL_TEST_MAP[actionType]?.command || null;
}

// ===== Expor no console =====
if (typeof window !== 'undefined') {
    (window as any).__rvmVisualDiagnostic = runVisualDiagnostic;
    (window as any).__rvmVisualActions = Object.keys(VISUAL_TEST_MAP);
}
