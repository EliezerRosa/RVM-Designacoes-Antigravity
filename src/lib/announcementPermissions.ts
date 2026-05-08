/**
 * Permissões client-side para o workflow de Anúncios/Notificações.
 *
 * Espelham as funções server-side (`is_cs_member`, `can_approve_announcement`,
 * `can_edit_announcement_draft`, `can_dispatch_announcement_whatsapp`) — porém
 * usadas APENAS para gating de UI (mostrar/esconder botões). A autoridade real
 * permanece no Postgres via RPC SECURITY DEFINER.
 *
 * CS = {CCA, SEC, SS}.  SRVM = pode editar rascunho.  CCA/Admin = pode aprovar.
 */

import type { AnnouncementApprovalStatus } from '../types';

export type ProfileRole = 'admin' | 'publicador' | string;
export type Funcao =
    | 'Coordenador do Corpo de Anciãos'
    | 'Secretário'
    | 'Superintendente de Serviço'
    | 'Superintendente da Reunião Vida e Ministério'
    | 'Ajudante do SRVM'
    | string
    | undefined
    | null;

export interface AnnouncementUser {
    role?: ProfileRole | null;
    funcao?: Funcao;
}

const CS_FUNCOES: ReadonlySet<string> = new Set([
    'Coordenador do Corpo de Anciãos',
    'Secretário',
    'Superintendente de Serviço',
]);

export const announcementPermissions = {
    isAdmin(user: AnnouncementUser): boolean {
        return user.role === 'admin';
    },

    isCcA(user: AnnouncementUser): boolean {
        return user.funcao === 'Coordenador do Corpo de Anciãos';
    },

    isCsMember(user: AnnouncementUser): boolean {
        if (this.isAdmin(user)) return true;
        return !!user.funcao && CS_FUNCOES.has(user.funcao);
    },

    isSrvm(user: AnnouncementUser): boolean {
        return user.funcao === 'Superintendente da Reunião Vida e Ministério';
    },

    canEditDraft(user: AnnouncementUser): boolean {
        return this.isCsMember(user) || this.isSrvm(user);
    },

    canApprove(user: AnnouncementUser): boolean {
        return this.isAdmin(user) || this.isCcA(user);
    },

    canDispatchWhatsApp(user: AnnouncementUser): boolean {
        return this.isCsMember(user);
    },

    /** Pode submeter para aprovação (estado precisa permitir + papel precisa permitir). */
    canSubmit(user: AnnouncementUser, status: AnnouncementApprovalStatus | undefined): boolean {
        if (!this.canEditDraft(user)) return false;
        return status === 'DRAFT' || status === 'REJECTED';
    },

    /** CCA pode reverter aprovação (volta para PENDING) — só faz sentido se APPROVED. */
    canRevert(user: AnnouncementUser, status: AnnouncementApprovalStatus | undefined): boolean {
        return this.canApprove(user) && status === 'APPROVED';
    },

    /** CCA pode reeditar texto após aprovação sem voltar para PENDING. */
    canEditAfterApproval(user: AnnouncementUser, status: AnnouncementApprovalStatus | undefined): boolean {
        return this.canApprove(user) && status === 'APPROVED';
    },

    /** Texto do badge de status para a UI. */
    statusLabel(status: AnnouncementApprovalStatus | undefined): string {
        switch (status) {
            case 'DRAFT': return 'Rascunho';
            case 'PENDING': return 'Aguardando aprovação';
            case 'APPROVED': return 'Aprovado';
            case 'REJECTED': return 'Rejeitado';
            case 'REVOKED': return 'Revogado';
            default: return '—';
        }
    },
};
