/**
 * Agent Service - Serviço do Agente IA com Gemini
 * 
 * Processa perguntas do usuário usando contexto do app
 */

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
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
- Seja direto ao ponto`;

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
    return !!GEMINI_API_KEY && GEMINI_API_KEY.length > 10;
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
                maxOutputTokens: 1024,
                topP: 0.95,
            },
        };

        // Chamar API
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Erro HTTP ${response.status}`);
        }

        const data = await response.json();

        // Extrair resposta
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            throw new Error('Resposta vazia do Gemini');
        }

        return {
            success: true,
            message: content,
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
