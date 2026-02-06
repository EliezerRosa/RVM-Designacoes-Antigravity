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
            .single();

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
};

