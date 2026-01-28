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
} from './contextBuilder';

// ===== Configuração =====

// A API key deve ser configurada em .env.local como VITE_GEMINI_API_KEY
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// SEGURANÇA: Modelos permitidos no Free Tier
// Se tentar usar um modelo fora desta lista, o sistema bloqueará para evitar cobranças acidentais.
const FREE_TIER_SAFE_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b'
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

// NOVO: Nível de acesso do usuário
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

REGRAS DE RESPOSTA:
1. Seja conciso e objetivo
2. Use português brasileiro
3. Cite nomes de publicadores quando relevante
4. Se não souber algo, diga claramente
5. Se a pergunta for sobre dados que não estão no contexto, explique o que você pode responder

FORMATO:
- Use listas quando apropriado
- Negrite termos importantes com **asteriscos**
- Seja direto ao ponto

AÇÕES E COMANDOS:
Se o usuário pedir para "simular", "alocar", "designar" ou "remover" alguém, você DEVE incluir um bloco JSON no final da resposta com a ação estruturada.

CONTROLE VISUAL (S-140):
Você TEM o controle do painel lateral (Preview S-140).
- Se o usuário pedir para "ver", "exibir", "mostrar" ou "ir para" uma semana específica, você DEVE incluir a data da segunda-feira dessa semana no formato ISO (YYYY-MM-DD) na sua resposta. O sistema detectará isso e atualizará o painel.
- Exemplo: "Certo, exibindo a semana de 2026-02-09..."
- NUNCA diga que não pode exibir ou que não tem interface gráfica. Você controla a interface via texto.

Formato do JSON para Simulação:
\`\`\`json
{
  "type": "SIMULATE_ASSIGNMENT",
  "params": {
    "publisherName": "Nome do Publicador",
    "partId": "ID_da_Parte (se souber, senão omita ou peça confirmação)"
  },
  "description": "Explicação curta do que foi feito"
}
\`\`\`

Formato do JSON para Remoção:
\`\`\`json
{
  "type": "REMOVE_ASSIGNMENT",
  "params": { 
    "partId": "ID_da_Parte"
  },
  "description": "Removendo designação..."
}
\`\`\`

Formato do JSON para Enviar WhatsApp (S-140):
\`\`\`json
{
  "type": "SHARE_S140_WHATSAPP",
  "params": { 
    "weekId": "2024-03-18",
    "targetGroup": "elders"
  },
  "description": "Gerando imagem S-140..."
}
\`\`\`

AÇÕES EM LOTE (v9.2) - ESSENCIAL:
Quando o usuário pedir para "preencher semana", "designar todas as partes", "gerar todas", "preencha todas" ou similar:
**NÃO PEÇA CLARIFICAÇÃO** - execute imediatamente o comando SIMULATE_BATCH.
O sistema irá preencher automaticamente TODAS as partes pendentes da semana usando o motor de rotação.
\`\`\`json
{
  "type": "SIMULATE_BATCH",
  "params": { 
    "weekId": "2024-03-18",
    "strategy": "rotation"
  },
  "description": "Preenchendo todas as partes pendentes da semana..."
}
\`\`\`
- weekId: Use a data da semana mencionada ou a semana atual em formato ISO (YYYY-MM-DD)
- strategy: "rotation" usa o motor de rotação padrão
- Após o JSON, diga apenas: "Gerando designações em lote..."

IMPORTANTE: O JSON deve estar sempre dentro de blocos de código markdown (\`\`\`json ... \`\`\`).

PAGINAÇÃO DE RESPOSTAS LONGAS:
- Limite cada resposta a no máximo 600 palavras
- Se a resposta completa precisar de mais que isso, PARE e termine com exatamente: "[CONTINUA...]"
- Quando o usuário enviar "continue" ou "mais", continue de onde parou
- Lembre-se do contexto anterior para dar continuidade
- Sempre indique qual parte está mostrando (ex: "Parte 2 de 3")
- NUNCA corte uma frase no meio - sempre termine em um ponto lógico`;

const SYSTEM_PROMPT_ELDER_ADDON = `

ACESSO ESPECIAL - ANCIÃOS:
Você tem acesso a informações confidenciais sobre publicadores:
- Quem pediu para não participar e por quê
- Quem não está qualificado e por quê
- Quem está inativo
- Razões detalhadas de bloqueios

Quando perguntarem sobre por que alguém não foi designado, você pode explicar os motivos reais.`;

const SYSTEM_PROMPT_PUBLISHER_ADDON = `

RESTRIÇÕES DE ACESSO - PUBLICADOR:
Você NÃO tem acesso a informações confidenciais sobre publicadores.
Se perguntarem por que alguém não foi designado, responda de forma genérica:
- "Não posso informar detalhes pessoais sobre outros publicadores."
- "Essa informação é confidencial e restrita aos anciãos."
- "O sistema considera vários fatores, mas não posso detalhar para publicadores específicos."

Você pode apenas informar quem ESTÁ designado, não por que alguém NÃO está.`;

// ===== Funções =====

/**
 * Verifica se a API está configurada
 */
export function isAgentConfigured(): boolean {
    // Se tiver chave local configurada, ótimo
    if (!!GEMINI_API_KEY && GEMINI_API_KEY.length > 10) return true;

    // Se não tiver chave, assumimos que pode funcionar via proxy (/api/chat) na Vercel
    // Em localhost sem chave, a chamada ao proxy vai falhar (404 ou 500), mas deixamos tentar
    return true;
}

/**
 * SEGURANÇA: Verifica se o modelo configurado é seguro (Free Tier)
 */
function checkSafetyMode(url: string): void {
    const isSafe = FREE_TIER_SAFE_MODELS.some(model => url.includes(model));
    if (!isSafe) {
        console.warn('🚨 ALERTA DE COBRANÇA: O sistema tentou usar um modelo fora da lista segura (Free Tier).');
        throw new Error('Bloqueio de Segurança: Tentativa de uso de modelo não-verificado (potencialmente pago). Use apenas modelos Flash.');
    }
}

/**
 * Processa uma pergunta do usuário
 */
export async function askAgent(
    question: string,
    publishers: Publisher[],
    parts: WorkbookPart[],
    history: HistoryRecord[] = [],
    chatHistory: ChatMessage[] = [],
    accessLevel: AccessLevel = 'publisher',
    specialEvents: SpecialEventInput[] = [],
    localNeeds: LocalNeedsInput[] = []
): Promise<AgentResponse> {
    if (!isAgentConfigured()) {
        return {
            success: false,
            message: '',
            error: 'API Key do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env.local',
        };
    }

    try {
        // Construir contexto (agora com eventos e necessidades locais)
        const context = buildAgentContext(publishers, parts, history, specialEvents, localNeeds);
        const contextText = formatContextForPrompt(context);
        const rulesText = getEligibilityRulesText();

        // NOVO: Montar system prompt baseado no nível de acesso
        let systemPrompt = SYSTEM_PROMPT_BASE;
        let sensitiveContextText = '';

        if (accessLevel === 'elder') {
            systemPrompt += SYSTEM_PROMPT_ELDER_ADDON;
            // Adicionar contexto sensível para anciãos
            const sensitiveInfo = buildSensitiveContext(publishers);
            sensitiveContextText = formatSensitiveContext(sensitiveInfo);
        } else {
            systemPrompt += SYSTEM_PROMPT_PUBLISHER_ADDON;
        }

        // Montar histórico de chat (últimas 5 mensagens)
        const recentChat = chatHistory.slice(-5).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

        // Montar request
        const requestBody = {
            contents: [
                // System instruction como primeira mensagem
                {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\n${rulesText}\n\n${contextText}${sensitiveContextText}` }],
                },
                {
                    role: 'model',
                    parts: [{ text: `Entendido! Sou o Assistente RVM com acesso de ${accessLevel === 'elder' ? 'Ancião' : 'Publicador'}. Como posso ajudar?` }],
                },
                // Histórico de chat
                ...recentChat,
                // Pergunta atual
                {
                    role: 'user',
                    parts: [{ text: question }],
                },
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,  // Máximo para respostas completas
                topP: 0.95,
            },
        };

        // Decidir se usa Proxy (Vercel) ou Direto (Local)
        let response: Response;

        const hasLocalKey = !!GEMINI_API_KEY && GEMINI_API_KEY.length > 10;

        if (hasLocalKey) {
            // MODO LOCAL: Chama direto com a chave do .env.local

            // 🔒 Safety Check
            checkSafetyMode(GEMINI_API_URL);

            response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
        } else {
            // MODO PRODUÇÃO/VERCEL: Chama o proxy (sem chave na URL)
            response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
        }

        // Check for Fallback Header (Only works in Proxy mode, but safe to check always)
        const isFallback = response.headers.get('X-RVM-Model-Fallback') === 'true';

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));

            // Tratamento especial para erro de chave vazada
            const errorMessage = errorData.error?.message || `Erro HTTP ${response.status}`;
            if (errorMessage.includes('API key not valid') || errorMessage.includes('key was reported as leaked')) {
                throw new Error('A API Key foi invalidada. Por favor, verifique a configuração na Vercel.');
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Extrair resposta
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            throw new Error('Resposta vazia do Gemini');
        }

        const detectedAction = agentActionService.detectAction(content);

        return {
            success: true,
            message: content,
            action: detectedAction || undefined,
            isFallback: isFallback
        };

    } catch (error) {
        console.error('[Agent] Error:', error);
        return {
            success: false,
            message: '',
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        };
    }
}

/**
 * Perguntas sugeridas para o usuário
 */
export function getSuggestedQuestions(): string[] {
    return [
        'Quem são os Anciãos?',
        'Quem pode fazer Leitura da Bíblia?',
        'Por que irmãs não podem fazer oração?',
        'Quantos publicadores estão ativos?',
        'Quem está em cooldown?',
        'Sugira alguém para a próxima Demonstração',
        'Quais são as regras de elegibilidade?',
        'Quem participou mais vezes este mês?',
    ];
}
