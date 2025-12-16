import { supabase } from '../lib/supabase';
import type { Publisher, Participation, MeetingData, Assignment, HistoricalImportRecord } from '../types';

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
        const { error } = await supabase.from('publishers').delete().eq('id', id);
        if (error) throw error;
    },

    // ===== PARTICIPATIONS =====
    async loadParticipations(): Promise<Participation[]> {
        const { data, error } = await supabase
            .from('participations')
            .select('id, data')
            .order('id');

        if (error) {
            console.error('Error loading participations:', error);
            throw error;
        }

        return (data || []).map(row => row.data as Participation);
    },

    async saveParticipations(participations: Participation[]): Promise<void> {
        // Get IDs that should remain
        const keepIds = new Set(participations.map(p => p.id));

        // Get all existing IDs from the database
        const { data: existingRows, error: fetchError } = await supabase
            .from('participations')
            .select('id');

        if (fetchError) {
            console.error('Error fetching existing participations:', fetchError);
            throw fetchError;
        }

        // Find IDs to delete (exist in DB but not in the new array)
        const idsToDelete = (existingRows || [])
            .map(row => row.id)
            .filter(id => !keepIds.has(id));

        // Delete removed participations
        if (idsToDelete.length > 0) {
            console.log(`[SYNC] Deleting ${idsToDelete.length} participations from DB`);
            const { error: deleteError } = await supabase
                .from('participations')
                .delete()
                .in('id', idsToDelete);

            if (deleteError) {
                console.error('Error deleting removed participations:', deleteError);
                throw deleteError;
            }
        }

        // Upsert remaining participations
        if (participations.length > 0) {
            const rows = participations.map(p => ({ id: p.id, data: p }));
            const { error: upsertError } = await supabase
                .from('participations')
                .upsert(rows, { onConflict: 'id' });

            if (upsertError) {
                console.error('Error saving participations:', upsertError);
                throw upsertError;
            }
        }

        console.log(`[SYNC] Saved ${participations.length} participations, deleted ${idsToDelete.length}`);
    },

    // ===== MEETINGS =====
    async loadMeetings(): Promise<MeetingData[]> {
        const { data, error } = await supabase
            .from('meetings')
            .select('id, data')
            .order('id');

        if (error) {
            console.error('Error loading meetings:', error);
            return [];
        }

        return (data || []).map(row => row.data as MeetingData);
    },

    async saveMeeting(meeting: MeetingData): Promise<void> {
        const { error } = await supabase
            .from('meetings')
            .upsert({ id: meeting.id, data: meeting }, { onConflict: 'id' });

        if (error) throw error;
    },

    async deleteMeeting(id: string): Promise<void> {
        const { error } = await supabase.from('meetings').delete().eq('id', id);
        if (error) throw error;
    },

    // ===== ASSIGNMENTS (S-89) =====
    async loadAssignments(): Promise<Assignment[]> {
        const { data, error } = await supabase
            .from('assignments')
            .select('id, data')
            .order('id');

        if (error) {
            console.error('Error loading assignments:', error);
            return [];
        }

        return (data || []).map(row => row.data as Assignment);
    },

    async saveAssignments(assignments: Assignment[]): Promise<void> {
        const rows = assignments.map(a => ({ id: a.id, data: a }));
        const { error } = await supabase
            .from('assignments')
            .upsert(rows, { onConflict: 'id' });

        if (error) throw error;
    },

    // ===== HISTORICAL IMPORTS =====
    async loadHistoricalImports(): Promise<HistoricalImportRecord[]> {
        const { data, error } = await supabase
            .from('historical_imports')
            .select('id, data')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading historical imports:', error);
            return [];
        }

        return (data || []).map(row => row.data as HistoricalImportRecord);
    },

    async saveHistoricalImport(record: HistoricalImportRecord): Promise<void> {
        const { error } = await supabase
            .from('historical_imports')
            .insert({ id: record.id, data: record });

        if (error) throw error;
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

    // ===== DEDUPLICATION =====
    async deduplicateParticipations(): Promise<{ removed: number; kept: number }> {
        // Load all participations
        const allParticipations = await this.loadParticipations();

        // Use a Map to keep only unique by signature (publisherName|week|partTitle)
        const uniqueMap = new Map<string, Participation>();
        const duplicateIds: string[] = [];

        for (const p of allParticipations) {
            const signature = `${p.publisherName}|${p.week}|${p.partTitle}`;

            if (uniqueMap.has(signature)) {
                // This is a duplicate - mark for deletion
                duplicateIds.push(p.id);
            } else {
                uniqueMap.set(signature, p);
            }
        }

        if (duplicateIds.length > 0) {
            // Delete duplicates from database
            for (const id of duplicateIds) {
                await supabase.from('participations').delete().eq('id', id);
            }
            console.log(`Removed ${duplicateIds.length} duplicate participations`);
        }

        return { removed: duplicateIds.length, kept: uniqueMap.size };
    }
};
