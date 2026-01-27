/**
 * Configuração Geral do Sistema
 * 
 * Centraliza constantes de configuração para garantir consistência
 * entre Backend (Generator/Adapter), Frontend (UI) e Agente (Context).
 */

// Período de Histórico para Cooldown e Elegibilidade (Meses lookback)
// 12 meses garante que tenhamos contexto suficiente para rotação e estatísticas
export const HISTORY_LOOKBACK_MONTHS = 12;

// Versão das Regras (Sincronizada manualmente)
// Usado para auditoria Code x Agent
export const CURRENT_RULES_VERSION = '2024-01-27.01'; // v8.3 - Sync
