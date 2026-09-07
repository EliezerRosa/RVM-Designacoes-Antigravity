import { createClient } from '@supabase/supabase-js';

const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
const procEnv = typeof process !== 'undefined' ? process.env : undefined;

const SUPABASE_URL = metaEnv?.VITE_SUPABASE_URL || procEnv?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = metaEnv?.VITE_SUPABASE_ANON_KEY || procEnv?.VITE_SUPABASE_ANON_KEY;
const SUPABASE_MODE = metaEnv?.MODE ?? procEnv?.NODE_ENV ?? 'unknown';
const SUPABASE_BASE = metaEnv?.BASE_URL ?? '/';

console.log('[Supabase] Config check:', JSON.stringify({
    url: SUPABASE_URL ? SUPABASE_URL.substring(0, 15) + '...' : 'UNDEFINED',
    key: SUPABASE_ANON_KEY ? 'PRESENT' : 'MISSING',
    mode: SUPABASE_MODE,
    base: SUPABASE_BASE
}, null, 2));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Supabase] CRITICAL: Environment variables missing. The app will not work properly.');
}

const resolvedUrl = SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const resolvedAnonKey = SUPABASE_ANON_KEY || 'sb_publishable_SObnBXFPKyoPO7-b4ldeqg_i2gpKOrv ';

// CRITICAL FIX: Clean stale/expired or bookmarked OAuth hash from URL BEFORE createClient initializes gotrue-js.
// If a user saved a bookmark containing /#access_token=..., gotrue-js will parse it synchronously on client creation.
// If the token in the hash is stale or expired, gotrue-js triggers an infinite token refresh loop resulting in HTTP 429 Too Many Requests and a forced SIGNED_OUT.
if (typeof window !== 'undefined' && window.location && window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('refresh_token='))) {
    try {
        const rawHash = window.location.hash.replace(/^[\/#]+/, '');
        const hashParams = new URLSearchParams(rawHash);
        const accessToken = hashParams.get('access_token');
        let isExpired = false;

        if (accessToken) {
            try {
                // Decode the JWT payload to get the actual expiration time
                const base64Url = accessToken.split('.')[1];
                if (base64Url) {
                    // Convert Base64Url to Base64
                    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                    const payloadStr = atob(base64);
                    const payload = JSON.parse(payloadStr);
                    if (payload.exp) {
                        const nowInSec = Math.floor(Date.now() / 1000);
                        // Consider it expired if it's past the exp time, or very close to it
                        isExpired = payload.exp <= nowInSec;
                    }
                }
            } catch (e) {
                console.warn('[Supabase] Failed to decode JWT in URL hash', e);
            }
        }

        if (isExpired) {
            console.warn('[Supabase] Stripping stale/expired OAuth hash from URL before client initialization');
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch (e) {
        console.warn('[Supabase] Error checking OAuth hash, stripping URL hash:', e);
        try {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch { /* ignore */ }
    }
}

const getInitialBotToken = (): string | null => {
    if (typeof window === 'undefined') {
        const procEnv = typeof process !== 'undefined' ? process.env : undefined;
        return procEnv?.BOT_TOKEN || procEnv?.VITE_BOT_TOKEN || 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';
    }
    try {
        const searchParams = new URLSearchParams(window.location.search);
        const urlToken = searchParams.get('token');
        if (urlToken) return urlToken;

        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx >= 0) {
            const hashParams = new URLSearchParams(hash.slice(qIdx + 1));
            return hashParams.get('token');
        }
    } catch {
        return null;
    }
    return null;
};

const initialBotToken = getInitialBotToken();

export const supabase = createClient(resolvedUrl, resolvedAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'rvm-designacoes-auth',
    },
    global: {
        headers: initialBotToken ? { 'x-bot-token': initialBotToken } : {},
    },
});
