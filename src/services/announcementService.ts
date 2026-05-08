/**
 * Announcement Service
 * Wrappers tipados sobre as RPCs SECURITY DEFINER do workflow de aprovação CS.
 * Migration: 20260508000000_announcements_approval_workflow.sql
 */

import { supabase } from '../lib/supabase';
import type { AnnouncementApprovalStatus } from '../types';

export interface AnnouncementHistoryEntry {
    id: number;
    eventId: string;
    action:
        | 'created' | 'edited_draft' | 'submitted' | 'approved' | 'rejected'
        | 'reverted' | 'edited_after_approval' | 'revoked' | 'whatsapp_dispatched'
        | 'auto_cloned_from_template';
    actorId?: string;
    actorLabel: string;
    previousText?: string;
    newText?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

export interface AnnouncementChangeNotification {
    id: number;
    eventId?: string;
    historyId?: number;
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    source: string;
    authorLabel: string;
    dismissedAt?: string;
    dismissedBy?: string;
    createdAt: string;
}

export interface WhatsAppDispatchEntry {
    id: number;
    eventId?: string;
    recipientRole: string;
    recipientPublisherId?: string;
    recipientLabel?: string;
    phoneMasked?: string;
    messageHash?: string;
    dispatchedById?: string;
    dispatchedByLabel?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}

interface RpcOk { success: true; history_id?: number; dispatch_id?: number; }

function unwrap<T>(data: unknown, error: { message: string } | null): T {
    if (error) throw new Error(error.message);
    return data as T;
}

function mapHistoryRow(row: Record<string, unknown>): AnnouncementHistoryEntry {
    return {
        id: row.id as number,
        eventId: row.event_id as string,
        action: row.action as AnnouncementHistoryEntry['action'],
        actorId: (row.actor_id as string) || undefined,
        actorLabel: row.actor_label as string,
        previousText: (row.previous_text as string) || undefined,
        newText: (row.new_text as string) || undefined,
        metadata: (row.metadata as Record<string, unknown>) || undefined,
        createdAt: row.created_at as string,
    };
}

function mapNotifRow(row: Record<string, unknown>): AnnouncementChangeNotification {
    return {
        id: row.id as number,
        eventId: (row.event_id as string) || undefined,
        historyId: (row.history_id as number) || undefined,
        severity: row.severity as AnnouncementChangeNotification['severity'],
        summary: row.summary as string,
        source: row.source as string,
        authorLabel: row.author_label as string,
        dismissedAt: (row.dismissed_at as string) || undefined,
        dismissedBy: (row.dismissed_by as string) || undefined,
        createdAt: row.created_at as string,
    };
}

function mapDispatchRow(row: Record<string, unknown>): WhatsAppDispatchEntry {
    return {
        id: row.id as number,
        eventId: (row.event_id as string) || undefined,
        recipientRole: row.recipient_role as string,
        recipientPublisherId: (row.recipient_publisher_id as string) || undefined,
        recipientLabel: (row.recipient_label as string) || undefined,
        phoneMasked: (row.phone_masked as string) || undefined,
        messageHash: (row.message_hash as string) || undefined,
        dispatchedById: (row.dispatched_by_id as string) || undefined,
        dispatchedByLabel: (row.dispatched_by_label as string) || undefined,
        metadata: (row.metadata as Record<string, unknown>) || undefined,
        createdAt: row.created_at as string,
    };
}

export const announcementService = {
    // ========== Mutations (RPCs) ==========

    async submitForApproval(eventId: string, actorLabel: string): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('submit_announcement_for_approval', {
            p_event_id: eventId, p_actor_label: actorLabel,
        });
        return unwrap<RpcOk>(data, error);
    },

    async approve(eventId: string, actorLabel: string): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('approve_announcement', {
            p_event_id: eventId, p_actor_label: actorLabel,
        });
        return unwrap<RpcOk>(data, error);
    },

    async reject(eventId: string, actorLabel: string, reason: string): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('reject_announcement', {
            p_event_id: eventId, p_actor_label: actorLabel, p_reason: reason,
        });
        return unwrap<RpcOk>(data, error);
    },

    async revertApproval(eventId: string, actorLabel: string, reason: string): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('revert_announcement_approval', {
            p_event_id: eventId, p_actor_label: actorLabel, p_reason: reason,
        });
        return unwrap<RpcOk>(data, error);
    },

    async editApprovedText(
        eventId: string, actorLabel: string,
        newContent: string | null, newReference: string | null, newLinks: string[] | null,
    ): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('edit_approved_announcement_text', {
            p_event_id: eventId,
            p_actor_label: actorLabel,
            p_new_content: newContent,
            p_new_reference: newReference,
            p_new_links: newLinks,
        });
        return unwrap<RpcOk>(data, error);
    },

    async logWhatsAppDispatch(args: {
        eventId: string;
        actorLabel: string;
        recipientRole: string;
        recipientPublisherId?: string | null;
        recipientLabel?: string | null;
        phoneMasked?: string | null;
        messageHash?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('log_whatsapp_dispatch', {
            p_event_id: args.eventId,
            p_actor_label: args.actorLabel,
            p_recipient_role: args.recipientRole,
            p_recipient_publisher_id: args.recipientPublisherId ?? null,
            p_recipient_label: args.recipientLabel ?? null,
            p_phone_masked: args.phoneMasked ?? null,
            p_message_hash: args.messageHash ?? null,
            p_metadata: args.metadata ?? {},
        });
        return unwrap<RpcOk>(data, error);
    },

    async dismissNotification(notificationId: number, actorLabel: string): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('dismiss_announcement_notification', {
            p_id: notificationId, p_actor_label: actorLabel,
        });
        return unwrap<RpcOk>(data, error);
    },

    async recordDraftEvent(args: {
        eventId: string;
        action: 'created' | 'edited_draft' | 'auto_cloned_from_template' | 'revoked';
        actorLabel: string;
        previousText?: string | null;
        newText?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<RpcOk> {
        const { data, error } = await supabase.rpc('record_announcement_draft_event', {
            p_event_id: args.eventId,
            p_action: args.action,
            p_actor_label: args.actorLabel,
            p_previous_text: args.previousText ?? null,
            p_new_text: args.newText ?? null,
            p_metadata: args.metadata ?? {},
        });
        return unwrap<RpcOk>(data, error);
    },

    // ========== Queries ==========

    async getHistory(eventId: string, limit = 100): Promise<AnnouncementHistoryEntry[]> {
        const { data, error } = await supabase
            .from('announcement_history')
            .select('*')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return (data || []).map(r => mapHistoryRow(r as Record<string, unknown>));
    },

    async getPendingNotifications(): Promise<AnnouncementChangeNotification[]> {
        const { data, error } = await supabase
            .from('announcement_change_notifications')
            .select('*')
            .is('dismissed_at', null)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data || []).map(r => mapNotifRow(r as Record<string, unknown>));
    },

    async getDispatchLog(eventId: string): Promise<WhatsAppDispatchEntry[]> {
        const { data, error } = await supabase
            .from('whatsapp_dispatch_log')
            .select('*')
            .eq('event_id', eventId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data || []).map(r => mapDispatchRow(r as Record<string, unknown>));
    },

    /** Conta itens pendentes (PENDING) — útil para badges. */
    async countPending(): Promise<number> {
        const { count, error } = await supabase
            .from('special_events')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', 'PENDING' as AnnouncementApprovalStatus)
            .in('template_id', ['anuncio', 'notificacao']);
        if (error) throw new Error(error.message);
        return count ?? 0;
    },
};
