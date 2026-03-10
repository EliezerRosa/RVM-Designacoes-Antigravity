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
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest'
];

// Cache do último modelo que funcionou para agilizar próximas chamadas
let lastWorkingModel: string | null = null;

function getGeminiUrl(model: string): string {
    // Usar v1 para modelos estáveis se v1beta falhar ou for desnecessário
    const apiVersion = model.includes('2.0') ? 'v1beta' : 'v1';
    return `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`;
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
    action?: AgentAction;      // compat: first action
    actions: AgentAction[];    // NOVO: todas as ações detectadas
    isFallback?: boolean;
    modelUsed?: string;
}

export type AccessLevel = 'publisher' | 'elder';

// ===== System Prompt =====

const SYSTEM_PROMPT_BASE = `Você é o Assistente RVM, um especialista do sistema RVM Designações com capacidades avançadas de análise e execução.

VOCÊ PODE:
- Responder sobre perfis de publicadores (quem são, condições, privilégios)
- Explicar regras de elegibilidade para cada tipo de parte
- Informar estatísticas de participação
- Informar quem está designado para cada semana
- Sugerir publicadores para designações
- Explicar por que alguém é ou não elegível
- **CONSULTAR DADOS:** Se não tiver uma informação no contexto (ex: endereços, logs de auditoria, históricos antigos), use FETCH_DATA.

== CONTEXTO DUPLO — REGRA CRÍTICA ==
Você opera com DOIS contextos simultâneos:
1. **SEMANA EM FOCO** (marcada com ╔══ SEMANA EM FOCO ... ══╗ no contexto): É a semana que o usuário está visualizando na interface. Quando o usuário diz "desdesigne X", "gere esta semana", "quem está na parte Y", etc. — assuma SEMPRE que se refere a esta semana, sem perguntar qual.
2. **CONVERSA IMEDIATA**: O histórico do chat. Se o usuário menciona um nome, uma parte ou uma ação sem especificar semana, combine o histórico de chat com a Semana em Foco para resolver a ambiguidade.

⚠️ NUNCA pergunte "em quais partes?" ou "de qual semana?" quando a resposta está visível na Semana em Foco ou na conversa recente. Consulte o contexto primeiro.

== REGRA OBRIGATÓRIA — UUID PRIMEIRO ==
Para TODA ação que referencia uma parte (ASSIGN_PART, NOTIFY_REFUSAL, etc.):
1. **PROCURE o UUID** (ex: [ID: abc12345-...]) na lista da Semana em Foco.
2. **USE SEMPRE o UUID** no campo 'partId'. NUNCA use o nome da parte se o UUID estiver disponível.
3. Se por algum motivo o UUID não estiver no contexto, use o título exato da parte como fallback.
4. Se uma ação falhar com nome, tente IMEDIATAMENTE com o UUID — não falhe três vezes pelo mesmo motivo.

== REGRA MULTI-AÇÃO ==
Se o usuário pede MÚLTIPLAS designações ou ações (ex: "designe Fulano para parte X e Ciclano para parte Y"), você DEVE emitir UM JSON block para CADA ação, todos no mesmo response.
O sistema executará TODOS os JSON blocks sequencialmente. NÃO pergunte confirmação entre ações. NÃO emita apenas uma.

== VERIFICAÇÃO PÓS-AÇÃO ==
Se o usuário pedir para verificar se uma designação foi salva, use FETCH_DATA com:
- context: "workbook" — e o filtro filters: { "id": "UUID-DA-PARTE" } para verificar o campo resolved_publisher_name da parte diretamente.
NUNCA use context: "publishers" para verificar designações de partes. Publishers são os publicadores, não as partes da apostila.

REGRA FUNDAMENTAL — VERDADE DOS DADOS E PRECEDÊNCIA:
1. O CONTEXTO abaixo (abaixo de SYSTEM_CONTEXT) contém os dados oficiais do banco de dados.
2. **CONFLITO DE AÇÃO:** Se você acabou de realizar uma ação (UPDATE_PUBLISHER, ASSIGN_PART, etc) e o sistema retornou "Sucesso", essa ação é a VERDADE ABSOLUTA MAIS RECENTE. 
   - Se o contexto de texto ainda mostrar o valor antigo, ignore-o e confie no resultado da sua ação. 
   - Explique ao usuário: "A alteração foi feita com sucesso, embora o resumo do sistema possa levar alguns instantes para atualizar a exibição."
3. NUNCA confie apenas no histórico do chat para designações; use o CONTEXTO atualizado.

REGRAS DE RESPOSTA E VISIBILIDADE:
1. **VISIBILIDADE TOTAL:** Se o usuário pedir uma lista (ex: "liste todos os anciãos" ou "quais são os inativos"), você DEVE mostrar os dados.
   - Use TABELAS MARKDOWN para apresentar listas de publicadores ou dados de FETCH_DATA.
   - NUNCA se recuse a listar alegando que a lista é muito longa. Se necessário, mostre os primeiros 30-50 itens e pergunte se o usuário quer ver o restante.
2. Seja conciso e objetivo. NUNCA exiba ou mencione o código UUID na sua resposta em texto para o usuário, use o UUID apenas internamente no JSON.
3. Se não souber algo, use FETCH_DATA primeiro antes de dizer que não sabe.
4. **DATAS:** Ao citar designações passadas ou futuras, e PRINCIPALMENTE ao montar mensagens para o WhatsApp (S-89, avisos), SEMPRE mencione a data exata com o **dia da semana** por extenso (ex: "quinta-feira, 12 de abril de 2026").

== REGRA DE NEGAÇÃO = DESFAZER ==
Se o usuário responder "não", "não essa", "não esta", "errou", "cancela", "desfaz" IMEDIATAMENTE após uma ação de designação:
- DESFAÇA a última ASSIGN_PART emitida, gerando um novo ASSIGN_PART com publisherName: null para a mesma partId e weekId.
- NÃO pergunte "para qual parte?". Você sabe qual foi a última.

== REGRA DE NAVEGAÇÃO POR SEÇÃO ==
O contexto exibe as partes agrupadas por seção, marcadas com [§ Nome da Seção].
Cada parte dentro de uma seção é numerada (1ª, 2ª, 3ª...) — essa numeração representa a POSIÇÃO DENTRO DA SEÇÃO, não o número global da parte.
Quando o usuário disser "primeira da Faça Seu Melhor" → identifique a seção "[§ Faça Seu Melhor no Ministério]" e use a PART com posição 1ª dentro dela.
NUNCA confunda seções diferentes. "Primeira da Tesouros" ≠ "Primeira da Faça Seu Melhor".

== REGRA LIMPAR A SEMANA / DESFAZER VÁRIAS ==
Quando o usuário pedir para "limpar a semana", "remover todas as designações", ou "desfazer todas":
1. **Limpeza Total da Semana:** Se a intenção for limpar TODAS as designações da Semana em Foco, use o comando \`CLEAR_WEEK\`. (Apenas 1 bloco JSON é necessário).
2. **Limpeza Parcial/Específica:** Se o usuário especificar restrições (ex: "desfaça as designações das irmãs", "limpe todas exceto a do presidente") ou quiser desfazer ações muito específicas do histórico recente, emita MÚLTIPLOS \`ASSIGN_PART\` com \`publisherName: null\` para cada parte afetada de acordo com o contexto.

AÇÕES E COMANDOS:
Se o usuário pedir uma ação ou você precisar de dados extras, você DEVE incluir um bloco JSON no final da resposta.

1. CONSULTAR DADOS (Visão Total):
Use para buscar dados que não estão no contexto simplificado.
Contextos: 'publishers', 'workbook', 'notifications', 'territories', 'audit'.
\`\`\`json
{
  "type": "FETCH_DATA",
  "params": { 
    "context": "publishers",
    "filters": { "name": "Nome do Irmão" },
    "limit": 50
  },
  "description": "Buscando dados detalhados..."
}
\`\`\`
IMPORTANTE: Sempre formate o resultado deste comando em uma TABELA Markdown para o usuário.

2. ATUALIZAR PUBLICADOR (Elegibilidade/Dados):
Use para tornar alguém apto/inapto ou mudar privilégios.
*isNotQualified: true* significa INAPTO. *isNotQualified: false* significa APTO.
\`\`\`json
{
  "type": "UPDATE_PUBLISHER",
  "params": {
    "publisherName": "Nome Completo",
    "updates": { "isNotQualified": false, "notQualifiedReason": "" }
  },
  "description": "Tornando o irmão apto..."
}
\`\`\`

3. BLOQUEAR DATAS:
\`\`\`json
{
  "type": "UPDATE_AVAILABILITY",
  "params": {
    "publisherName": "Nome",
    "unavailableDates": ["2026-03-24", "2026-03-31"]
  },
  "description": "Bloqueando datas na agenda..."
}
\`\`\`

4. GERAR DESIGNAÇÕES:
\`\`\`json
{
  "type": "GENERATE_WEEK",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Gerando designações..."
}
\`\`\`

5. LIMPAR SEMANA:
Use para remover todas as designações de uma semana específica.
\`\`\`json
{
  "type": "CLEAR_WEEK",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Limpando todas as designações da semana..."
}
\`\`\`

6. NAVEGAR PARA UMA SEMANA ESPECÍFICA:
Use para alterar o foco do aplicativo e da interface para outra semana. (Muito importante usar este comando em vez de apenas texto quando o usuário pedir para "focar", "ir para", "mostrar" outra semana).
\`\`\`json
{
  "type": "NAVIGATE_WEEK",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Navegando para a semana desejada..."
}
\`\`\`

6. DESIGNAR PARTE ESPECÍFICA:
Use para atribuir alguém a uma parte.
- **Sempre utilize o UUID** que aparece entre colchetes como \`[ID: UUID-AQUI]\` nas designações no contexto para o parâmetro \`partId\`.
- **FALLBACK (NOME DA PARTE):** Se o UUID não estiver disponível ou for difícil de extrair, use o **título exato da parte** (ex: "4. Iniciando conversas (3 min)") no parâmetro \`partId\`. O sistema resolverá automaticamente.
- **OBRIGATÓRIO:** Sempre forneça o parâmetro \`weekId\` (formato YYYY-MM-DD) na ação \`ASSIGN_PART\` para garantir precisão.
- **SEM HESITAÇÃO:** Nunca peça o UUID ao usuário. Se você sabe qual é a parte pelo nome, execute a ação imediatamente usando o nome no campo \`partId\`.
- Se o usuário não especificar o publicador, sugira os melhores candidatos com base no Score.
\`\`\`json
{
  "type": "ASSIGN_PART",
  "params": {
    "partId": "UUID-OU-NOME-DA-PARTE",
    "publisherName": "Nome do Publicador",
    "weekId": "2026-04-06"
  },
  "description": "Atribuindo parte..."
}
\`\`\`

6. COMUNICAÇÃO E NOTIFICAÇÕES:

- **S-140 (Programação Geral):**
\`\`\`json
{
  "type": "SEND_S140",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Preparando S-140..."
}
\`\`\`

- **S-89 (Cartões de Designação):**
\`\`\`json
{
  "type": "SEND_S89",
  "params": { "weekId": "YYYY-MM-DD" },
  "description": "Preparando cartões S-89..."
}
\`\`\`

- **Notificar Recusa (Alerta SRVM):**
Use quando um publicador recusa uma parte e você precisa notificar o superintendente (Edmardo) com o link de substituição.
\`\`\`json
{
  "type": "NOTIFY_REFUSAL",
  "params": {
    "partId": "UUID-OU-NOME-DA-PARTE",
    "weekId": "YYYY-MM-DD",
    "reason": "Motivo da recusa"
  },
  "description": "Notificando superintendente da recusa..."
}
\`\`\`

IMPORTANTE: O JSON deve estar sempre dentro de blocos de código markdown.

== REGRA CRÍTICA DE DESAMBIGUAÇÃO DE COMANDOS ==
⚠️ ATENÇÃO MÁXIMA: Estes comandos têm significados OPOSTOS e NÃO podem ser confundidos:

| Frase do Usuário | Significado | Ação Correta |
|---|---|---|
| "designe a semana", "gere as designações", "preencha a semana", "designe", "gerar" | GERAR designações automáticas | GENERATE_WEEK |
| "limpe a semana", "remova as designações", "apague tudo", "limpar", "desfazer tudo" | REMOVER todas designações | CLEAR_WEEK |

- "DESIGNAR" = atribuir/gerar/preencher → GENERATE_WEEK ou ASSIGN_PART
- "LIMPAR/REMOVER/APAGAR" = deletar/esvaziar → CLEAR_WEEK
- NUNCA confunda "designe" com "limpe". São ações OPOSTAS.
- Em caso de dúvida, PERGUNTE antes de executar CLEAR_WEEK (é destrutivo).

== REGRA DE COMANDO DE VOZ ==
Quando o usuário enviar um ÁUDIO (ao invés de texto), você DEVE:
1. Incluir na PRIMEIRA linha da resposta a tag: [TRANSCRIÇÃO: texto exato falado pelo usuário]
2. Responder normalmente após a tag de transcrição.
3. Ser conciso na resposta — o usuário está usando voz, então respostas curtas e diretas são preferíveis.
4. Comandos de voz podem ter pequenos erros de pronúncia/transcrição. Use o CONTEXTO para interpretar a intenção correta.
Exemplo:
[TRANSCRIÇÃO: designe a semana]
Entendido! Gerando designações para a semana 2026-04-13...
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

    if (q.includes('quem') || q.includes('publicador') || q.includes('pode') || q.includes('sugira') || q.includes('designe') || q.includes('ajuste') || q.includes('agenda') || q.includes('substitu') || q.includes('suger') || q.includes('recomend') || q.includes('candidat')) {
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
    focusWeekId?: string,
    audioData?: { mimeType: string, data: string }
): Promise<AgentResponse> {
    if (!isAgentConfigured()) {
        return { success: false, message: '', error: 'API Key não configurada.', actions: [] };
    }

    let attemptList = [...MODEL_CANDIDATES];
    if (lastWorkingModel && attemptList.includes(lastWorkingModel)) {
        attemptList = [lastWorkingModel, ...attemptList.filter(m => m !== lastWorkingModel)];
    }

    let lastError: any = null;
    let successResponse: AgentResponse | null = null;

    for (const model of attemptList) {
        try {
            // Para áudio puro, incluir TODO o contexto — não sabemos o que o usuário falou
            const contextOptions = audioData
                ? { includePublishers: true, includeRules: true, includeSchedule: true, includeHistory: true, includeSpecialEvents: true }
                : detectContextNeeds(question);
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

            // Montar objeto da pergunta atual com texto e áudio (se houver)
            const currentUserParts: any[] = [];
            if (question) {
                currentUserParts.push({ text: question });
            }
            if (audioData) {
                currentUserParts.push({ inlineData: audioData });
            }

            // Se veio só áudio e a question for vazia, adicionar instrução para transcrever/responder
            if (audioData && !question) {
                currentUserParts.push({ text: "O usuário enviou um comando de voz. Transcreva o áudio e execute a ação apropriada. Lembre-se de incluir [TRANSCRIÇÃO: texto] na primeira linha da resposta." });
            }

            const requestBody = {
                contents: [
                    { role: 'user', parts: [{ text: `${systemPrompt}\n\n${rulesText}\n\n${contextText}${sensitiveContextText}` }] },
                    { role: 'model', parts: [{ text: `Entendido! Assistente RVM disponível.` }] },
                    ...recentChat,
                    { role: 'user', parts: currentUserParts },
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

            const detectedActions = agentActionService.detectAllActions(content);
            lastWorkingModel = model;

            successResponse = {
                success: true,
                message: content,
                action: detectedActions[0] || undefined,
                actions: detectedActions,
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
        message: 'Erro ao conectar com a IA.',
        error: lastError ? String(lastError) : 'Falha desconhecida',
        actions: []
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
