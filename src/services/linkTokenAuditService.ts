/**
 * linkTokenAuditService — registra eventos de ciclo de vida de tokens de portal.
 *
 * Caso 3 da reforma link-actions-audit. Cobre PublisherFormLinkManager (domain=
 * 'publisher_form') e AvailabilityLinkManager (domain='availability'). RPC é
 * SECURITY DEFINER + exige is_admin(); é fail-soft (log no console).
 */

import { supabase } from '../lib/supabase';

export type LinkTokenDomain = 'publisher_form' | 'availability' | 'confirmation';
export type LinkTokenAction =
    | 'created'
    | 'revoked'
    | 'reactivated'
    | 'regenerated'
    | 'deleted'
    | 'expired';

export interface LinkTokenEvent {
    domain: LinkTokenDomain;
    token: string;
    action: LinkTokenAction;
    actorLabel: string;
    label?: string | null;
    role?: string | null;
    publisherId?: string | null;
    publisherName?: string | null;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
}

export async function recordLinkTokenEvent(evt: LinkTokenEvent): Promise<void> {
    try {
        const { error } = await supabase.rpc('record_link_token_event', {
            p_domain: evt.domain,
            p_token: evt.token,
            p_action: evt.action,
            p_actor_label: evt.actorLabel,
            p_label: evt.label ?? null,
            p_role: evt.role ?? null,
            p_publisher_id: evt.publisherId ?? null,
            p_publisher_name: evt.publisherName ?? null,
            p_actor_id: evt.actorId ?? null,
            p_metadata: (evt.metadata ?? {}) as object,
        });
        if (error) {
            console.warn('[linkTokenAudit] RPC error:', error.message);
        }
    } catch (e) {
        console.warn('[linkTokenAudit] unexpected:', e);
    }
}
