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

export const supabase = createClient(resolvedUrl, resolvedAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'rvm-designacoes-auth',
        },
    });
