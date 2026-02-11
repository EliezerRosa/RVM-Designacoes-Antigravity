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
    type ContextOptions, // Importado
} from './contextBuilder';

// ===== Configuração =====

// A API key deve ser configurada em .env.local como VITE_GEMINI_API_KEY
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// LISTA DE ELITE: Prioridade de modelos para tentar
const MODEL_CANDIDATES = [
    'gemini-2.5-flash',         // Modelo mais recente (fevereiro 2026)
    'gemini-2.0-flash',         // Versão estável 2.0
    'gemini-flash-latest',      // Alias para o mais atual
    'gemini-2.0-flash-lite',    // Versão leve
    'gemini-1.5-flash'          // Fallback legado (caso volte)
];

// Cache do último modelo que funcionou para agilizar próximas chamadas
let lastWorkingModel: string | null = null;

function getGeminiUrl(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// SEGURANÇA: Modelos permitidos no Free Tier
// Se tentar usar um modelo fora desta lista, o sistema bloqueará para evitar cobranças acidentais.
const FREE_TIER_SAFE_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-1.5-flash',
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

REGRA FUNDAMENTAL — VERDADE DOS DADOS:
O contexto abaixo contém as designações ATUAIS de cada semana, vindas direto do banco de dados.
NUNCA confie no histórico do chat para afirmar que algo "já foi feito". 
SEMPRE verifique no contexto se a designação realmente mudou.
- Se o contexto mostra que uma parte ainda tem um nome designado, ela NÃO foi removida.
- Se o chat anterior diz "removido" mas o contexto mostra um nome, o chat ESTÁ ERRADO.
- Em caso de conflito entre chat e contexto, o CONTEXTO é a fonte de verdade.
Exemplo: Se o usuário pede "limpe a semana X" e o contexto mostra partes com nomes nessa semana,
você DEVE emitir o comando CLEAR_WEEK, mesmo que o chat anterior diga que já foi feito.

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


REGRAS DE DISPONIBILIDADE (IMPORTANTE):
1. "Indisponível (Geral)" significa que ele não pode, EXCETO se tiver datas na lista "Apenas: [...]".
2. ESCALA POSITIVA: Se aparecer "Apenas: [26/02/2026, ...]", verifique se a DATA DA REUNIÃO da semana solicitada coincide com alguma dessas datas.
   - Exemplo: Semana de 23/02/2026 (Segunda). Reunião de meio de semana é Quinta (26/02). Se 26/02 está na lista "Apenas", ele ESTÁ DISPONÍVEL.
   - Ignore o "Indisponível (Geral)" nesse caso específico.

REGRAS DE ELEGIBILIDADE (OCULTAS):
1. Oração Inicial: Só pode ser feita por quem tem o privilégio "Presidir" (Anciãos/SM qualificadíssimos). "Orar" não basta.

2. Ajudantes: Devem ter o MESMO gênero do Titular (Irmão ajuda Irmão, Irmã ajuda Irmã).
3. Partes de Estudante: Irmãs têm prioridade em partes de "Demonstração".
4. Frequência: Evite quem participou nas últimas 12 semanas (penalidade alta). Prefira quem está "frio".

REGRAS TÉCNICAS (BANCADA DE DADOS):
1. COOLDOWN (Bloqueio):
   - Partes Principais = 3 Semanas de bloqueio.
   - Ajudante = 2 Semanas de bloqueio.
   - Gap Mínimo = 2 Semanas entre qualquer parte.
2. CATEGORIAS DE PEÇAS:
   - "Ignored" (Não geram bloqueio): Orações, Cânticos, Leitura da Bíblia (às vezes).
   - "Main" (Geram bloqueio): Presidentes, Discursos, Jóias, Vida Cristã.
3. SELEÇÃO MANUAL:
   - Se um humano selecionou manualmente (dropdown), o sistema registra e evita re-selecionar na próxima automação para não repetir.

AÇÕES E COMANDOS:
Se o usuário pedir uma ação (gerar, designar, remover, navegar), você DEVE incluir um bloco JSON no final da resposta.

1. GERAR DESIGNAÇÕES (Gera/Preenche a semana toda):
Use quando usuário pedir: "gerar semana", "preencher designações", "completar semana X".
\`\`\`json
{
  "type": "GENERATE_WEEK",
  "params": {
    "weekId": "2024-03-01" // Data da segunda-feira da semana (YYYY-MM-DD)
  },
  "description": "Gerando designações para a semana..."
}
\`\`\`



2. DESIGNAR PARTE ESPECÍFICA:
Use quando usuário pedir: "Coloque o João na Leitura da semana X", "Mude o presidente para José".
PROTOCOLO RÍGIDO DE IDs:
1. O Contexto lista as partes assim: "• Presidente... [ID: 123-abc]"
2. VOCÊ DEVE COPIAR ESSE ID. É a única forma segura.
3. Se não encontrar o ID na lista, só então use o fallback (Name + Week).
4. NUNCA invente IDs (não use "...").

\`\`\`json
{
  "type": "ASSIGN_PART",
  "params": {
    "partId": "123-abc", // COPIADO EXATAMENTE da lista [ID: ...]
    "partName": "Presidente", // Obrigatório (backup)
    "weekId": "2024-03-01",   // Obrigatório (backup)
    "publisherName": "Nome do Publicador" // Para REMOVER: envie string vazia ""
  },
  "description": "Atribuindo parte..."
}
\`\`\`

== PROTOCOLO DE REMOÇÃO / LIMPEZA ==
Para REMOVER um designado, envie 'publisherName: ""' (string vazia).

== PROTOCOLO DE TROCA (SWAP) ==
Para trocar A por B (A sai, B entra na parte de A):
1. Apenas designe B para a parte de A. O sistema substituirá automaticamente.

Para trocar A com B (A vai pra parte de B, B vai pra parte de A):
Envie dois blocos JSON separados (um após o outro ou array se possível, mas preferencialmente sequencial).

3. NAVEGAR PARA SEMANA:
Use quando usuário pedir: "vá para semana X", "mostre a semana Y".
\`\`\`json
{
  "type": "NAVIGATE_WEEK",
  "params": {
    "weekId": "2024-03-01"
  },
  "description": "Navegando..."
}
\`\`\`

4. DESFAZER (UNDO):
Use quando pedir: "desfaça", "volte atrás".
\`\`\`json
{
  "type": "UNDO_LAST",
  "params": {},
  "description": "Desfazendo última ação..."
}
\`\`\`

5. VISUALIZAR S-140 (APENAS VER):
Use quando usuário pedir: "mostre o S-140", "visualizar quadro", "ver como ficou".
\`\`\`json
{
  "type": "VIEW_S140",
  "params": { 
    "weekId": "2024-03-18"
  },
  "description": "Visualizando S-140..."
}
\`\`\`

6. WHATSAPP / COMPARTILHAR (ENVIAR):
Use quando usuário pedir: "mande pro zap", "compartilhar", "enviar para grupo".
\`\`\`json
{
  "type": "SHARE_S140_WHATSAPP",
  "params": { 
    "weekId": "2024-03-18",
    "targetGroup": "elders"
  },
  "description": "Preparando envio WhatsApp..."
}
\`\`\`

7. LIMPAR SEMANA (CLEAR_WEEK):
Use quando usuário pedir: "limpe a semana", "remova todas as designações da semana X", "zere a semana".
Esta ação remove TODAS as designações de uma semana de uma vez (muito mais eficiente que remover parte por parte).
\`\`\`json
{
  "type": "CLEAR_WEEK",
  "params": {
    "weekId": "2024-03-01"
  },
  "description": "Limpando todas as designações da semana..."
}
\`\`\`

IMPORTANTE: O JSON deve estar sempre dentro de blocos de código markdown (\`\`\`json ... \`\`\`).
`;



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
 * HEURÍSTICA: Detecta o que o usuário precisa para economizar tokens
 */
function detectContextNeeds(question: string): ContextOptions {
    const q = question.toLowerCase();

    // Default: Minimal safe context
    const options: ContextOptions = {
        includePublishers: false,
        includeRules: false,
        includeSchedule: true, // Schedule is almost always needed
        includeHistory: false,
        includeSpecialEvents: true
    };

    // 1. Precisa de Publicadores?
    if (
        q.includes('quem') ||
        q.includes('publicador') ||
        q.includes('irmão') ||
        q.includes('irmã') ||
        q.includes('ancião') ||
        q.includes('servo') ||
        q.includes('pode') || // pode fazer tal coisa?
        q.includes('sugira') ||
        q.includes('qualificado') ||
        // Action verbs (assignment)
        q.includes('designe') ||
        q.includes('coloque') ||
        q.includes('mude') ||
        q.includes('troque') ||
        q.includes('ponha') ||
        q.includes('defina') ||
        q.includes('atribua') ||
        // Availability
        q.includes('disponível') ||
        q.includes('disponibilidade')
    ) {
        options.includePublishers = true;
    }

    // 2. Precisa de Regras?
    if (
        q.includes('regra') ||
        q.includes('pode') ||
        q.includes('requisito') ||
        q.includes('qualificado') ||
        q.includes('como funciona') ||
        q.includes('qualificado') ||
        q.includes('como funciona') ||
        q.includes('por que') ||
        // Generator needs rules to know who is eligible
        q.includes('gere') ||
        q.includes('gerar') ||
        q.includes('preencha') ||
        q.includes('complete') ||
        q.includes('sugira') // Suggestions need rules + roster
    ) {
        options.includeRules = true;
    }

    // 3. Precisa de Histórico?
    if (
        q.includes('histórico') ||
        q.includes('vezes') ||
        q.includes('frequência') ||
        q.includes('última vez') ||
        q.includes('participou') ||
        q.includes('participações') || // PLURAL
        q.includes('top') ||
        q.includes('rank') ||
        q.includes('quais') || // Genérico, mas em contexto de lista ajuda
        // Load analysis
        q.includes('sobrecarregado') ||
        q.includes('frequência') ||
        q.includes('muito usado') ||
        q.includes('trabalhando muito') ||
        q.includes('descanso')
    ) {
        options.includeHistory = true;
    }

    // Fallback para perguntas muito curtas (pode ser qualquer coisa)
    if (q.length < 10) {
        options.includePublishers = true;
    }

    return options;
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
    localNeeds: LocalNeedsInput[] = [],
    focusWeekId?: string // New Param
): Promise<AgentResponse> {
    if (!isAgentConfigured()) {
        return {
            success: false,
            message: '',
            error: 'API Key do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env.local',
        };
    }

    // 1. Preparar lista de modelos para tentar
    // Se já temos um que funcionou antes, ele vai pro topo da lista
    let attemptList = [...MODEL_CANDIDATES];
    if (lastWorkingModel && attemptList.includes(lastWorkingModel)) {
        attemptList = [lastWorkingModel, ...attemptList.filter(m => m !== lastWorkingModel)];
    }

    let lastError: any = null;
    let successResponse: AgentResponse | null = null;

    // 2. Loop de Tentativas (Smart Fallback)
    for (const model of attemptList) {
        try {
            console.log(`[Agent] Tentando modelo: ${model}...`);

            // Construir contexto (OTIMIZADO)
            const contextOptions = detectContextNeeds(question);
            console.log(`[Agent] Context Strategy: `, contextOptions);

            const context = buildAgentContext(
                publishers,
                parts,
                history,
                specialEvents,
                localNeeds,
                contextOptions,
                focusWeekId // Pass new param
            );
            const contextText = formatContextForPrompt(context);

            // Regras também são opcionais agora
            const rulesText = contextOptions.includeRules ? getEligibilityRulesText() : '';

            // Montar system prompt
            let systemPrompt = SYSTEM_PROMPT_BASE;
            let sensitiveContextText = '';

            if (accessLevel === 'elder') {
                systemPrompt += SYSTEM_PROMPT_ELDER_ADDON;
                const sensitiveInfo = buildSensitiveContext(publishers);
                sensitiveContextText = formatSensitiveContext(sensitiveInfo);
            } else {
                systemPrompt += SYSTEM_PROMPT_PUBLISHER_ADDON;
            }

            // Histórico
            const recentChat = chatHistory.slice(-5).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
            }));

            // Request Body
            const requestBody = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${systemPrompt} \n\n${rulesText} \n\n${contextText}${sensitiveContextText} ` }],
                    },
                    {
                        role: 'model',
                        parts: [{ text: `Entendido! Sou o Assistente RVM(${model}) com acesso de ${accessLevel === 'elder' ? 'Ancião' : 'Publicador'}.` }],
                    },
                    ...recentChat,
                    {
                        role: 'user',
                        parts: [{ text: question }],
                    },
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                    topP: 0.95,
                },
            };

            // Chamada API
            let response: Response;
            const hasLocalKey = !!GEMINI_API_KEY && GEMINI_API_KEY.length > 10;
            const targetUrl = getGeminiUrl(model);

            if (hasLocalKey) {
                checkSafetyMode(targetUrl);
                response = await fetch(`${targetUrl}?key = ${GEMINI_API_KEY} `, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
            } else {
                // No modo Proxy (Vercel), podemos futuramente passar o modelo via header.
                // Por enquanto mantemos compatibilidade simples.
                response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });
            }

            const isFallback = response.headers.get('X-RVM-Model-Fallback') === 'true';

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `Erro HTTP ${response.status} `;

                // Se for erro de chave invalida, aborta imediatamente
                if (errorMessage.includes('API key not valid') || errorMessage.includes('key was reported as leaked')) {
                    throw new Error('A API Key foi invalidada. Por favor, verifique a configuração na Vercel.');
                }

                // Se for outro erro (ex: 404 Model Not Found), lança para cair no catch e tentar o próximo loop
                throw new Error(`Falha no modelo ${model}: ${errorMessage} `);
            }

            const data = await response.json();
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!content) {
                throw new Error('Resposta vazia do Gemini');
            }

            const detectedAction = agentActionService.detectAction(content);

            // SUCESSO!
            console.log(`[Agent] SUCESSO com modelo: ${model} `);
            lastWorkingModel = model; // Memorizar

            successResponse = {
                success: true,
                message: content,
                action: detectedAction || undefined,
                isFallback: isFallback,
                modelUsed: model
            };

            // Sair do loop
            break;

        } catch (error) {
            console.warn(`[Agent] Erro ao tentar modelo ${model}: `, error);
            lastError = error;
            // Continua para o próximo modelo...
        }
    }

    // Retorna o sucesso se tiver
    if (successResponse) {
        return successResponse;
    }

    // Se chegou aqui, todos falharam
    let finalErrorMessage = lastError instanceof Error ? lastError.message : 'Erro desconhecido';

    if (finalErrorMessage.includes('Failed to fetch')) {
        finalErrorMessage = 'Erro de conexão com a IA (Failed to fetch). Verifique sua internet.';
    }

    return {
        success: false,
        message: '',
        error: `Todas as tentativas falharam.Último erro: ${finalErrorMessage} (Tentados: ${attemptList.join(', ')})`,
    };
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
