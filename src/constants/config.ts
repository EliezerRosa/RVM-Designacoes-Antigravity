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
export const AGENT_CONTEXT_WEEKS = 6; // Próximas 6 semanas (Reduzido de 12 para eco)
export const AGENT_HISTORY_LOOKBACK_WEEKS = 4; // Últimas 4 semanas (Reduzido de 12)
export const AGENT_LIST_LOOKBACK_WEEKS = 8; // Últimas 8 semanas (Reduzido de 16)

// Versão das Regras (Sincronizada manualmente)
// Usado para auditoria Code x Agent
export const CURRENT_RULES_VERSION = '2024-01-27.01'; // v8.3 - Sync

