import { supabase } from '../lib/supabase';
import type { Publisher } from '../types';

// ============================================================================
// API Service - Full Supabase Persistence
// ============================================================================

export const api = {
    isReadOnly(): boolean {
        return false;
    },

    // ===== PUBLISHERS =====
    async loadPublishers(): Promise<Publisher[]> {
        const { data, error } = await supabase
            .from('publishers')
            .select('id, data')
            .order('id');

        if (error) {
            console.error('Error loading publishers:', error);
            throw error;
        }

        return (data || []).map(row => row.data as Publisher);
    },

    async savePublishers(publishers: Publisher[]): Promise<void> {
        // Get IDs that should remain
        const keepIds = new Set(publishers.map(p => p.id));

        // Get all existing IDs from the database
        const { data: existingRows, error: fetchError } = await supabase
            .from('publishers')
            .select('id');

        if (fetchError) {
            console.error('Error fetching existing publishers:', fetchError);
            throw fetchError;
        }

        // Find IDs to delete (exist in DB but not in the new array)
        const idsToDelete = (existingRows || [])
            .map(row => row.id)
            .filter(id => !keepIds.has(id));

        // Delete removed publishers
        if (idsToDelete.length > 0) {
            console.log(`[SYNC] Deleting ${idsToDelete.length} publishers from DB`);
            const { error: deleteError } = await supabase
                .from('publishers')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) {
                console.error('Error deleting removed publishers:', deleteError);
                throw deleteError;
            }
        }

        // Upsert remaining publishers
        if (publishers.length > 0) {
            const rows = publishers.map(p => ({ id: p.id, data: p }));
            const { error: upsertError } = await supabase
                .from('publishers')
                .upsert(rows, { onConflict: 'id' });

            if (upsertError) {
                console.error('Error saving publishers:', upsertError);
                throw upsertError;
            }
        }

        console.log(`[SYNC] Saved ${publishers.length} publishers, deleted ${idsToDelete.length}`);
    },

    async deletePublisher(id: string): Promise<void> {
        console.log(`[API] Deleting publisher ${id}`);
        const { error } = await supabase.from('publishers').delete().eq('id', id);
        if (error) {
            console.error('Error deleting publisher:', error);
            throw error;
        }
        console.log(`[API] Publisher ${id} deleted successfully`);
    },

    async createPublisher(publisher: Publisher): Promise<Publisher> {
        console.log(`[API] Creating publisher: ${publisher.name}`);
        const row = { id: publisher.id, data: publisher };
        const { error } = await supabase
            .from('publishers')
            .insert(row);

        if (error) {
            console.error('Error creating publisher:', error);
            throw error;
        }
        console.log(`[API] Publisher ${publisher.name} created with id ${publisher.id}`);
        return publisher;
    },

    async updatePublisher(publisher: Publisher): Promise<Publisher> {
        console.log(`[API] Updating publisher: ${publisher.name}`);
        const row = { id: publisher.id, data: publisher };
        const { error } = await supabase
            .from('publishers')
            .upsert(row, { onConflict: 'id' });

        if (error) {
            console.error('Error updating publisher:', error);
            throw error;
        }
        console.log(`[API] Publisher ${publisher.name} updated successfully`);
        return publisher;
    },

    /**
     * Submit availability changes from the public portal using a token-based RPC.
     * Bypasses RLS via SECURITY DEFINER function in Supabase, which validates the
     * token against app_settings.availability_tokens before writing to publishers.
     */
    async submitPublisherAvailability(
        token: string,
        availability: Publisher['availability']
    ): Promise<{ success: boolean; error?: string; publisherId?: string }> {
        const { data, error } = await supabase.rpc('submit_publisher_availability', {
            p_token: token,
            p_availability: availability ?? {},
        });

        if (error) {
            console.error('[API] submitPublisherAvailability RPC error:', error);
            return { success: false, error: error.message };
        }

        const result = (data ?? {}) as { success?: boolean; error?: string; publisherId?: string };
        if (!result.success) {
            console.warn('[API] submitPublisherAvailability rejected:', result.error);
        }
        return {
            success: !!result.success,
            error: result.error,
            publisherId: result.publisherId,
        };
    },

    /**
     * Loads a single publisher fresh from DB by id (no cache). Used by the
     * availability portal to confirm persistence after save and to always show
     * the most recent server state on link open.
     */
    async loadPublisherById(publisherId: string): Promise<Publisher | null> {
        const { data, error } = await supabase
            .from('publishers')
            .select('id, data')
            .eq('id', publisherId)
            .maybeSingle();

        if (error) {
            console.error('[API] loadPublisherById error:', error);
            return null;
        }
        return (data?.data as Publisher) ?? null;
    },

    // ===== REALTIME SUBSCRIPTIONS =====
    subscribeToPublishers(onUpdate: (publishers: Publisher[]) => void): () => void {
        console.log('[REALTIME] Subscribing to publishers changes...');

        // Debounce para evitar loop infinito de reloads
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let isProcessing = false;

        const channel = supabase
            .channel('publishers-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'publishers' },
                async () => {
                    // Ignorar se já estiver processando
                    if (isProcessing) return;

                    // Debounce de 1 segundo para agrupar múltiplas mudanças
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        try {
                            isProcessing = true;
                            console.log('[REALTIME] Publishers changed, reloading...');
                            const publishers = await this.loadPublishers();
                            onUpdate(publishers);
                        } catch (err) {
                            console.warn('[REALTIME] Failed to reload publishers:', err);
                        } finally {
                            isProcessing = false;
                        }
                    }, 1000);
                }
            )
            .subscribe();

        // Return unsubscribe function
        return () => {
            console.log('[REALTIME] Unsubscribing from publishers...');
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
        };
    },

    // ===== APP SETTINGS (Key-Value Store) =====
    async getSetting<T>(key: string, defaultValue: T): Promise<T> {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();

        if (error || !data) {
            return defaultValue;
        }

        return data.value as T;
    },

    async setSetting<T>(key: string, value: T): Promise<void> {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

        if (error) throw error;
    },

    /**
     * Loads workbook parts assigned to a specific publisher from today onwards.
     * Used by the availability portal to detect impediments before saving.
     */
    async loadFutureWorkbookParts(publisherName: string, todayDate: string): Promise<import('../types').WorkbookPart[]> {
        const { data, error } = await supabase
            .from('workbook_parts')
            .select('id, week_id, date, tipo_parte, part_title, modalidade, section, funcao, resolved_publisher_name, raw_publisher_name, status, seq, is_manual_override')
            .gte('date', todayDate)
            .ilike('resolved_publisher_name', publisherName)
            .not('status', 'in', '(CONCLUIDA,CANCELADA)');

        if (error) {
            console.error('[API] loadFutureWorkbookParts error:', error);
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            weekId: row.week_id,
            date: row.date,
            tipoParte: row.tipo_parte,
            partTitle: row.part_title,
            modalidade: row.modalidade,
            section: row.section,
            funcao: row.funcao,
            resolvedPublisherName: row.resolved_publisher_name,
            rawPublisherName: row.raw_publisher_name,
            status: row.status,
            seq: row.seq,
            isManualOverride: row.is_manual_override,
        }));
    },
};

