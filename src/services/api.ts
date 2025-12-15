import { supabase } from '../lib/supabase';
import type { Publisher, Participation } from '../types';

export const api = {
    // Check if we're connected to Supabase
    isReadOnly(): boolean {
        return false; // With Supabase, we're never read-only
    },

    async loadPublishers(): Promise<Publisher[]> {
        const { data, error } = await supabase
            .from('publishers')
            .select('*')
            .order('name');

        if (error) {
            console.error('Error loading publishers:', error);
            throw error;
        }

        return data || [];
    },

    async loadParticipations(): Promise<Participation[]> {
        const { data, error } = await supabase
            .from('participations')
            .select('*')
            .order('date', { ascending: false });

        if (error) {
            console.error('Error loading participations:', error);
            throw error;
        }

        return data || [];
    },

    async savePublishers(publishers: Publisher[]): Promise<void> {
        // Upsert all publishers (insert or update based on id)
        const { error } = await supabase
            .from('publishers')
            .upsert(publishers, { onConflict: 'id' });

        if (error) {
            console.error('Error saving publishers:', error);
            throw error;
        }
    },

    async saveParticipations(participations: Participation[]): Promise<void> {
        // Upsert all participations
        const { error } = await supabase
            .from('participations')
            .upsert(participations, { onConflict: 'id' });

        if (error) {
            console.error('Error saving participations:', error);
            throw error;
        }
    },

    // Additional helper methods for individual operations
    async addPublisher(publisher: Publisher): Promise<void> {
        const { error } = await supabase
            .from('publishers')
            .insert(publisher);

        if (error) throw error;
    },

    async updatePublisher(publisher: Publisher): Promise<void> {
        const { error } = await supabase
            .from('publishers')
            .update(publisher)
            .eq('id', publisher.id);

        if (error) throw error;
    },

    async deletePublisher(id: string): Promise<void> {
        const { error } = await supabase
            .from('publishers')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async addParticipation(participation: Participation): Promise<void> {
        const { error } = await supabase
            .from('participations')
            .insert(participation);

        if (error) throw error;
    }
};
