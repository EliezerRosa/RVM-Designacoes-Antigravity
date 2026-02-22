/**
 * Agent Service - Serviço do Agente IA com Gemini
 * 
 * Processa perguntas do usuário usando contexto do app
 */

import { agentActionService, type AgentAction } from './agentActionService';
import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import {
    buildAgentContext,
    formatContextForPrompt,
    getEligibilityRulesText,
    buildSensitiveContext,
    formatSensitiveContext,
    type SpecialEventInput,
    type LocalNeedsInput,
    type ContextOptions,
} from './contextBuilder';

// ===== Configuração =====

// A API key deve ser configurada em .env.local como VITE_GEMINI_API_KEY
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

const MODEL_CANDIDATES = [
    'gemini-2.0-flash',         // Versão estável 2.0
    'gemini-2.0-flash-lite',    // Versão leve
    'gemini-1.5-flash-latest',  // Fallback seguro 1.5
    'gemini-1.5-pro'            // Caso necessite de mais contexto
];

// Cache do último modelo que funcionou para agilizar próximas chamadas
let lastWorkingModel: string | null = null;

function getGeminiUrl(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// SEGURANÇA: Modelos permitidos no Free Tier
const FREE_TIER_SAFE_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002'
];

// ===== Tipos =====

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface AgentResponse {
    success: boolean;
    message: string;
    error?: string;
    action?: AgentAction;
    isFallback?: boolean;
    modelUsed?: string;
}

export type AccessLevel = 'publisher' | 'elder';

// ===== System Prompt =====

const SYSTEM_PROMPT_BASE = `Você é o Assistente RVM, um especialista do sistema RVM Designações.

VOCÊ PODE:
- Responder sobre perfis de publicadores (quem são, condições, privilégios)
- Explicar regras de elegibilidade para cada tipo de parte
- Informar estatísticas de participação
- Informar quem está designado para cada semana
- Sugerir publicadores para designações
- Explicar por que alguém é ou não elegível

REGRA FUNDAMENTAL — VERDADE DOS DADOS:
O contexto abaixo contém as designações ATUAIS de cada semana, vindas direto do banco de dados.
NUNCA confie no histórico do chat para afirmar que algo "já foi feito". 
SEMPRE verifique no contexto se a designação realmente mudou.
- Se o contexto mostra que uma parte ainda tem um nome designado, ela NÃO foi removida.
- Se o chat anterior diz "removido" mas o contexto mostra um nome, o chat ESTÁ ERRADO.
- Em caso de conflito entre chat e contexto, o CONTEXTO é a fonte de verdade.

REGRAS DE RESPOSTA:
1. Seja conciso e objetivo
2. Use português brasileiro
3. Cite nomes de publicadores quando relevante
4. Se não souber algo, diga claramente
5. Se a pergunta for sobre dados que não estão no contexto, explique o que você pode responder
6. **DATAS:** Ao citar designações passadas ou futuras, SEMPRE mencione a data exata (DD/MM) e não apenas "semana passada" ou "daqui a 2 semanas".

FORMATO:
- Use listas quando apropriado
- Negrite termos importantes com **asteriscos**
- Seja direto ao ponto

REGRAS DE DISPONIBILIDADE:
1. "Indisponível (Geral)" significa que ele não pode, EXCETO se tiver datas na lista "Apenas: [...]".
2. ESCALA POSITIVA: Se aparecer "Apenas: [26/02/2026, ...]", verifique se a DATA DA REUNIÃO coincide com alguma dessas datas.

REGRAS DE ELEGIBILIDADE:
1. Oração Inicial: Só pode ser feita por quem tem o privilégio "Presidir".
2. Ajudantes: Devem ter o MESMO gênero do Titular.
3. Partes de Estudante: Irmãs têm prioridade em partes de "Demonstração".
4. Frequência: Evite quem participou nas últimas 12 semanas.

REGRAS TÉCNICAS:
1. COOLDOWN (Bloqueio):
   - Partes Principais = 3 Semanas.
   - Ajudante = 2 Semanas.
   - Gap Mínimo = 2 Semanas entre qualquer parte.

AÇÕES E COMANDOS:
Se o usuário pedir uma ação, você DEVE incluir um bloco JSON no final da resposta.

1. GERAR DESIGNAÇÕES:
\`\`\`json
{
  "type": "GENERATE_WEEK",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Gerando designações..."
}
\`\`\`

2. DESIGNAR PARTE ESPECÍFICA:
\`\`\`json
{
  "type": "ASSIGN_PART",
  "params": {
    "partId": "ID-DA-PARTE",
    "partName": "Nome da Parte",
    "weekId": "YYYY-MM-DD",
    "publisherName": "Nome do Publicador" 
  },
  "description": "Atribuindo parte..."
}
\`\`\`

3. NAVEGAR PARA SEMANA:
\`\`\`json
{
  "type": "NAVIGATE_WEEK",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Navegando..."
}
\`\`\`

4. DESFAZER (UNDO):
\`\`\`json
{
  "type": "UNDO_LAST",
  "params": {},
  "description": "Desfazendo..."
}
\`\`\`

5. COMUNICAÇÃO - S-140 (GRUPO):
Use quando pedir: "enviar programação", "preparar S-140", "avisar grupo".
\`\`\`json
{
  "type": "SEND_S140",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Preparando mensagem para o grupo..."
}
\`\`\`

6. COMUNICAÇÃO - S-89 (INDIVIDUAL):
Use quando pedir: "enviar cartões", "avisar os designados", "preparar S-89".
\`\`\`json
{
  "type": "SEND_S89",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Gerando notificações individuais..."
}
\`\`\`

IMPORTANTE: O JSON deve estar sempre dentro de blocos de código markdown.
`;

const SYSTEM_PROMPT_ELDER_ADDON = `
ACESSO ESPECIAL - ANCIÃOS:
Você tem acesso a informações confidenciais sobre bloqueios e inatividade. Explique os motivos reais se solicitado.`;

const SYSTEM_PROMPT_PUBLISHER_ADDON = `
RESTRIÇÕES DE ACESSO - PUBLICADOR:
Você NÃO tem acesso a informações confidenciais. Seja genérico sobre motivos de não-elegibilidade.`;

export function isAgentConfigured(): boolean {
    if (!!GEMINI_API_KEY && GEMINI_API_KEY.length > 10) return true;
    return true;
}

function checkSafetyMode(url: string): void {
    const isSafe = FREE_TIER_SAFE_MODELS.some(model => url.includes(model));
    if (!isSafe) {
        throw new Error('Bloqueio de Segurança: Modelo não-verificado.');
    }
}

function detectContextNeeds(question: string): ContextOptions {
    const q = question.toLowerCase();
    const options: ContextOptions = {
        includePublishers: false,
        includeRules: false,
        includeSchedule: true,
        includeHistory: false,
        includeSpecialEvents: true
    };

    if (q.includes('quem') || q.includes('publicador') || q.includes('pode') || q.includes('sugira') || q.includes('designe') || q.includes('ajuste') || q.includes('agenda')) {
        options.includePublishers = true;
    }

    if (q.includes('regras') || q.includes('requisito') || q.includes('por que') || q.includes('gerar') || q.includes('motor') || q.includes('envie') || q.includes('zap') || q.includes('notifique')) {
        options.includeRules = true;
    }

    if (q.includes('histórico') || q.includes('última vez') || q.includes('participou') || q.includes('vezes') || q.includes('frequência')) {
        options.includeHistory = true;
    }

    return options;
}

export async function askAgent(
    question: string,
    publishers: Publisher[],
    parts: WorkbookPart[],
    history: HistoryRecord[] = [],
    chatHistory: ChatMessage[] = [],
    accessLevel: AccessLevel = 'publisher',
    specialEvents: SpecialEventInput[] = [],
    localNeeds: LocalNeedsInput[] = [],
    focusWeekId?: string
): Promise<AgentResponse> {
    if (!isAgentConfigured()) {
        return { success: false, message: '', error: 'API Key não configurada.' };
    }

    let attemptList = [...MODEL_CANDIDATES];
    if (lastWorkingModel && attemptList.includes(lastWorkingModel)) {
        attemptList = [lastWorkingModel, ...attemptList.filter(m => m !== lastWorkingModel)];
    }

    let lastError: any = null;
    let successResponse: AgentResponse | null = null;

    for (const model of attemptList) {
        try {
            const contextOptions = detectContextNeeds(question);
            const context = buildAgentContext(publishers, parts, history, specialEvents, localNeeds, contextOptions, focusWeekId);
            const contextText = formatContextForPrompt(context);
            const rulesText = contextOptions.includeRules ? getEligibilityRulesText() : '';

            let systemPrompt = SYSTEM_PROMPT_BASE;
            let sensitiveContextText = '';

            if (accessLevel === 'elder') {
                systemPrompt += SYSTEM_PROMPT_ELDER_ADDON;
                const sensitiveInfo = buildSensitiveContext(publishers);
                sensitiveContextText = formatSensitiveContext(sensitiveInfo);
            } else {
                systemPrompt += SYSTEM_PROMPT_PUBLISHER_ADDON;
            }

            const recentChat = chatHistory.slice(-5).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
            }));

            const requestBody = {
                contents: [
                    { role: 'user', parts: [{ text: `${systemPrompt} \n\n${rulesText} \n\n${contextText}${sensitiveContextText} ` }] },
                    { role: 'model', parts: [{ text: `Entendido! Assistente RVM disponível.` }] },
                    ...recentChat,
                    { role: 'user', parts: [{ text: question }] },
                ],
                generationConfig: { temperature: 0.7, maxOutputTokens: 8192, topP: 0.95 }
            };

            let response: Response;
            const hasLocalKey = !!GEMINI_API_KEY && GEMINI_API_KEY.length > 10;
            const targetUrl = getGeminiUrl(model);

            if (hasLocalKey) {
                checkSafetyMode(targetUrl);
                response = await fetch(`${targetUrl}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
            } else {
                response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) throw new Error('Falha na resposta.');

            const detectedAction = agentActionService.detectAction(content);
            lastWorkingModel = model;

            successResponse = {
                success: true,
                message: content,
                action: detectedAction || undefined,
                modelUsed: model
            };
            break;

        } catch (error) {
            lastError = error;
        }
    }

    if (successResponse) return successResponse;

    return {
        success: false,
        message: '',
        error: `Falha total. Último erro: ${lastError instanceof Error ? lastError.message : 'Desconhecido'}`,
    };
}

export function getSuggestedQuestions(): string[] {
    return [
        'Quem são os Anciãos?',
        'Quem pode fazer Leitura da Bíblia?',
        'Quem está designado esta semana?',
        'Sugira alguém para a Demonstração',
        'Envie a programação para o grupo'
    ];
}
