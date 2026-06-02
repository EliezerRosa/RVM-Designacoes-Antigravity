/**
 * myAssignmentsPortalService — Token management for the "Minhas Designações" portal.
 *
 * Portal URL: ?portal=my-assignments&publisher_id=<id>&token=<tok>
 * - Each publisher gets one active token, auto-generated on creation.
 * - Token is bound to the first Google email used (on first access).
 * - Admin can block per-publisher or globally.
 * - Admin can regenerate (invalidates old token + bound email).
 */

import { supabase } from '../lib/supabase';

export interface PublisherPortalTokenRow {
    publisher_id:   string;
    publisher_name: string;
    token_row_id:   string | null;
    token:          string | null;
    bound_email:    string | null;
    is_active:      boolean;
    is_blocked:     boolean;
    block_reason:   string | null;
    created_at:     string | null;
    updated_at:     string | null;
}

export interface PortalAuthResult {
    authorized:     boolean;
    reason?:        'invalid_token' | 'global_block' | 'publisher_blocked' | 'email_mismatch' | string;
    first_access?:  boolean;
    publisher_id?:  string;
    publisher_name?: string;
    bound_email?:   string;
    is_admin?:      boolean;
    is_blocked?:    boolean;
    global_blocked?: boolean;
}

// ── URL helper ────────────────────────────────────────────────────────────────

export function buildMyAssignmentsPortalUrl(publisherId: string, token: string): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}?portal=my-assignments&publisher_id=${encodeURIComponent(publisherId)}&token=${encodeURIComponent(token)}`;
}

// ── Authorization (called from portal component, authenticated user) ──────────

export async function authorizeMyAssignmentsPortal(
    publisherId: string,
    token: string
): Promise<PortalAuthResult> {
    const { data, error } = await supabase.rpc('authorize_my_assignments_portal', {
        p_publisher_id: publisherId,
        p_token:        token,
    });

    if (error) {
        console.error('[myAssignmentsPortalService] authorize error:', error);
        return { authorized: false, reason: 'invalid_token' };
    }

    return (data as PortalAuthResult) ?? { authorized: false, reason: 'invalid_token' };
}

// ── Admin: get or create token ────────────────────────────────────────────────

export async function getOrCreatePortalToken(
    publisherId: string
): Promise<{ token: string; bound_email: string | null; is_blocked: boolean } | null> {
    const { data, error } = await supabase.rpc('get_or_create_my_assignments_portal_token', {
        p_publisher_id: publisherId,
    });

    if (error || !data) {
        console.error('[myAssignmentsPortalService] getOrCreate error:', error);
        return null;
    }

    const d = data as { token?: string; bound_email?: string | null; is_blocked?: boolean; error?: string };
    if (d.error) return null;
    return { token: d.token!, bound_email: d.bound_email ?? null, is_blocked: d.is_blocked ?? false };
}

// ── Admin: regenerate token ───────────────────────────────────────────────────

export async function regeneratePortalToken(
    publisherId: string
): Promise<string | null> {
    const { data, error } = await supabase.rpc('regenerate_my_assignments_portal_token', {
        p_publisher_id: publisherId,
    });

    if (error || !data) {
        console.error('[myAssignmentsPortalService] regenerate error:', error);
        return null;
    }

    const d = data as { token?: string; error?: string };
    return d.error ? null : (d.token ?? null);
}

// ── Admin: bulk generate ──────────────────────────────────────────────────────

export async function bulkGeneratePortalTokens(): Promise<number> {
    const { data, error } = await supabase.rpc('bulk_generate_my_assignments_portal_tokens');

    if (error) {
        console.error('[myAssignmentsPortalService] bulkGenerate error:', error);
        return 0;
    }

    return (data as { created?: number })?.created ?? 0;
}

// ── Admin: block / unblock publisher ─────────────────────────────────────────

export async function setPublisherPortalBlock(
    publisherId: string,
    blocked: boolean,
    reason?: string
): Promise<boolean> {
    const { data, error } = await supabase.rpc('admin_set_publisher_portal_block', {
        p_publisher_id: publisherId,
        p_blocked:      blocked,
        p_reason:       reason ?? null,
    });

    if (error) {
        console.error('[myAssignmentsPortalService] block error:', error);
        return false;
    }

    return !(data as { error?: string })?.error;
}

// ── Admin: global block ───────────────────────────────────────────────────────

export async function setGlobalPortalBlock(blocked: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc('admin_set_global_portal_block', {
        p_blocked: blocked,
    });

    if (error) {
        console.error('[myAssignmentsPortalService] globalBlock error:', error);
        return false;
    }

    return !(data as { error?: string })?.error;
}

// ── Admin: list all publishers + token status ─────────────────────────────────

export async function listPublisherPortalTokens(): Promise<PublisherPortalTokenRow[]> {
    const { data, error } = await supabase.rpc('admin_list_publisher_portal_tokens');

    if (error) {
        console.error('[myAssignmentsPortalService] list error:', error);
        return [];
    }

    return (data as PublisherPortalTokenRow[]) ?? [];
}
