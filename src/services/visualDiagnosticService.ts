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
    },

    CHECK_SCORE: {
        command: 'Mostre o ranking de candidatos para Leitura da Bíblia',
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
            params: { partType: 'Leitura da Bíblia', date: weekId },
            description: 'Mock: ranking de elegibilidade para Leitura',
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
            });

        } catch (err) {
            results.push({
                actionType,
                mockCommand: mock.command,
                mockDescription: mock.description,
                validationPassed: false,
                validationDetails: `Exceção: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: Math.round(performance.now() - t0),
                error: String(err),
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
