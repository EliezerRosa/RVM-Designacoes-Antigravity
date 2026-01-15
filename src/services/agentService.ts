/**
 * Agent Service - Serviço do Agente IA com Gemini
 * 
 * Processa perguntas do usuário usando contexto do app
 */

import type { Publisher, WorkbookPart, HistoryRecord } from '../types';
import {
    buildAgentContext,
    formatContextForPrompt,
    getEligibilityRulesText
} from './contextBuilder';

// ===== Configuração =====

// A API key deve ser configurada em .env.local como VITE_GEMINI_API_KEY
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';

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

// ===== System Prompt =====

const SYSTEM_PROMPT = `Você é o Assistente RVM, um especialista do sistema RVM Designações.

VOCÊ PODE:
- Responder sobre perfis de publicadores (quem são, condições, privilégios)
- Explicar regras de elegibilidade para cada tipo de parte
- Informar estatísticas de participação
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
    chatHistory: ChatMessage[] = []
): Promise<AgentResponse> {
    if (!isAgentConfigured()) {
        return {
            success: false,
            message: '',
            error: 'API Key do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env.local',
        };
    }

    try {
        // Construir contexto
        const context = buildAgentContext(publishers, parts, history);
        const contextText = formatContextForPrompt(context);
        const rulesText = getEligibilityRulesText();

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
                    parts: [{ text: `${SYSTEM_PROMPT}\n\n${rulesText}\n\n${contextText}` }],
                },
                {
                    role: 'model',
                    parts: [{ text: 'Entendido! Estou pronto para responder perguntas sobre o sistema RVM Designações. Como posso ajudar?' }],
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
