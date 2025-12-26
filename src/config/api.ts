/**
 * API Configuration
 * Configura URLs base para APIs externas baseado no ambiente
 */

// URL do Backend Python (FastAPI)
// - Em desenvolvimento: localhost:8000
// - Em produção: deve ser configurado via VITE_BACKEND_URL
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Endpoints
export const API_ENDPOINTS = {
    // Extração de PDF da Apostila (Vercel Serverless)
    EXTRACT_PDF: '/api/extract-pdf',

    // Histórico
    PARSE_HISTORY: `${BACKEND_URL}/api/history/parse`,

    // Publicadores
    PUBLISHERS: `${BACKEND_URL}/api/publishers`,

    // Designações
    ASSIGNMENTS: `${BACKEND_URL}/api/assignments`,
};

/**
 * Helper para fazer fetch com a URL correta
 */
export async function fetchBackend(
    endpoint: string,
    options?: RequestInit
): Promise<Response> {
    const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
}
