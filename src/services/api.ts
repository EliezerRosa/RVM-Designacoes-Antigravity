import type { Publisher, Participation } from '../types';

const GATEWAY_URL = 'http://localhost:8000/api/save';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/EliezerRosa/RVM-Designacoes-Antigravity/main/src/data';

export const api = {
    async loadPublishers(): Promise<Publisher[]> {
        const response = await fetch(`${RAW_BASE_URL}/publishers.json`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load publishers: ${response.statusText}`);
        }
        return response.json();
    },

    async loadParticipations(): Promise<Participation[]> {
        const response = await fetch(`${RAW_BASE_URL}/participations.json`, { cache: 'no-store' });
        if (!response.ok) {
            // If 404, return empty array as fallback (first run)
            if (response.status === 404) return [];
            throw new Error(`Failed to load participations: ${response.statusText}`);
        }
        return response.json();
    },

    async savePublishers(publishers: Publisher[]): Promise<void> {
        const response = await fetch(GATEWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                block_id: 'publishers',
                content: publishers
            })
        });
        if (!response.ok) {
            throw new Error('Failed to save publishers to gateway');
        }
    },

    async saveParticipations(participations: Participation[]): Promise<void> {
        const response = await fetch(GATEWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                block_id: 'participations',
                content: participations
            })
        });
        if (!response.ok) {
            throw new Error('Failed to save participations to gateway');
        }
    }
};
