/**
 * Configuração Geral do Sistema
 * 
 * Centraliza constantes de configuração para garantir consistência
 * entre Backend (Generator/Adapter), Frontend (UI) e Agente (Context).
 */

// Período de Histórico para Cooldown e Elegibilidade (Meses lookback)
// 12 meses garante que tenhamos contexto suficiente para rotação e estatísticas
export const HISTORY_LOOKBACK_MONTHS = 12;


// v9.2.2: Janela de contexto para o Agente IA (semanas futuras)
// Limita o volume de dados enviados ao Gemini para evitar timeouts HTTP 504
export const AGENT_CONTEXT_WEEKS = 12; // Próximas 12 semanas (~3 meses)
export const AGENT_HISTORY_LOOKBACK_WEEKS = 12; // Últimas 12 semanas para referência visual (Grid)
export const AGENT_LIST_LOOKBACK_WEEKS = 16; // Últimas 16 semanas para lista de participações (Lista)

// Versão das Regras (Sincronizada manualmente)
// Usado para auditoria Code x Agent
export const CURRENT_RULES_VERSION = '2024-01-27.01'; // v8.3 - Sync

