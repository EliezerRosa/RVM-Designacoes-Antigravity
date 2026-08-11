import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_MODE = import.meta.env.MODE ?? 'unknown';
const SUPABASE_BASE = import.meta.env.BASE_URL ?? '/';

console.log('[Supabase] Config check:', JSON.stringify({
    url: SUPABASE_URL ? SUPABASE_URL.substring(0, 15) + '...' : 'UNDEFINED',
    key: SUPABASE_ANON_KEY ? 'PRESENT' : 'MISSING',
    mode: SUPABASE_MODE,
    base: SUPABASE_BASE
}, null, 2));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Supabase] CRITICAL: Environment variables missing. The app will not work properly.');
}

const resolvedUrl = SUPABASE_URL || 'http://127.0.0.1:54321';
const resolvedAnonKey = SUPABASE_ANON_KEY || 'test-anon-key';

// CRITICAL FIX: Clean stale/expired OAuth hash from URL BEFORE createClient initializes gotrue-js.
// If a user saved a bookmark containing /#access_token=..., gotrue-js will parse it synchronously on client creation.
// If the token in the hash is expired, gotrue-js triggers an infinite token refresh loop resulting in HTTP 429 Too Many Requests and a forced SIGNED_OUT.
if (typeof window !== 'undefined' && window.location && window.location.hash && window.location.hash.includes('access_token=')) {
    try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const expiresAt = parseInt(hashParams.get('expires_at') || '0', 10);
        const nowInSec = Math.floor(Date.now() / 1000);
        if (expiresAt === 0 || expiresAt <= nowInSec) {
            console.warn('[Supabase] Stripping stale/expired OAuth hash from URL before client initialization');
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    } catch {
        try {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch { /* ignore */ }
    }
}

export const supabase = createClient(resolvedUrl, resolvedAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'rvm-designacoes-auth',
        },
    });
