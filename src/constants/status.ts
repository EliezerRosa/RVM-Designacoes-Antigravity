
// Configuração unificada de Status para a UI (Apostila e Aprovações)
export const STATUS_CONFIG = {
    PENDENTE: { label: 'Pendente', color: '#6b7280', icon: '📝', bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
    PROPOSTA: { label: 'A Aprovar', color: '#f59e0b', icon: '⏳', bg: '#fffbeb', text: '#b45309', border: '#fcd34d' },
    APROVADA: { label: 'Aprovada', color: '#10b981', icon: '✅', bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' },
    DESIGNADA: { label: 'Designada', color: '#059669', icon: '📧', bg: '#ecfdf5', text: '#047857', border: '#34d399' },
    REJEITADA: { label: 'Rejeitada', color: '#ef4444', icon: '❌', bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
    CONCLUIDA: { label: 'Concluída', color: '#3b82f6', icon: '🏆', bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
    CANCELADA: { label: 'Cancelada', color: '#6b7280', icon: '🚫', bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: string) {
    return STATUS_CONFIG[status as StatusKey] || STATUS_CONFIG.PENDENTE;
}
