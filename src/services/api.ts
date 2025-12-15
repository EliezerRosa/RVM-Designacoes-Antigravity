import type { Publisher, Participation } from '../types';

// Detect if we're running locally (dev) or on GitHub Pages (prod)
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const GATEWAY_URL = IS_LOCAL ? 'http://localhost:8000/api/save' : null;
const RAW_BASE_URL = 'https://raw.githubusercontent.com/EliezerRosa/RVM-Designacoes-Antigravity/main/src/data';

// Track if gateway is available
let gatewayAvailable = IS_LOCAL;

export const api = {
    isReadOnly(): boolean {
        return !gatewayAvailable;
    },

    async loadPublishers(): Promise<Publisher[]> {
        try {
            const response = await fetch(`${RAW_BASE_URL}/publishers.json`, { cache: 'no-store' });
            if (!response.ok) {
                // 404 means file doesn't exist yet, not an error
                if (response.status === 404) {
                    console.warn('publishers.json not found on remote, using local fallback');
                    throw new Error('Not found');
                }
                throw new Error(`Failed to load publishers: ${response.statusText}`);
            }
            return response.json();
        } catch (e) {
            console.warn('API: Failed to load publishers from remote', e);
            throw e; // Let App.tsx handle fallback to local
        }
    },

    async loadParticipations(): Promise<Participation[]> {
        try {
            const response = await fetch(`${RAW_BASE_URL}/participations.json`, { cache: 'no-store' });
            if (!response.ok) {
                if (response.status === 404) return [];
                throw new Error(`Failed to load participations: ${response.statusText}`);
            }
            return response.json();
        } catch (e) {
            console.warn('API: Failed to load participations from remote', e);
            return []; // Return empty on error
        }
    },

    async savePublishers(publishers: Publisher[]): Promise<void> {
        if (!GATEWAY_URL) {
            console.warn('API: Gateway not available (read-only mode)');
            gatewayAvailable = false;
            return; // Silent no-op in production
        }

        try {
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
            gatewayAvailable = true;
        } catch (e) {
            console.warn('API: Gateway unreachable', e);
            gatewayAvailable = false;
            // Don't throw - just warn the user via UI
        }
    },

    async saveParticipations(participations: Participation[]): Promise<void> {
        if (!GATEWAY_URL) {
            console.warn('API: Gateway not available (read-only mode)');
            gatewayAvailable = false;
            return;
        }

        try {
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
            gatewayAvailable = true;
        } catch (e) {
            console.warn('API: Gateway unreachable', e);
            gatewayAvailable = false;
        }
    }
};
