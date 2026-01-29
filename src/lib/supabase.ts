import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/['"]/g, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.replace(/['"]/g, '');

console.log('[Supabase] Config check:', JSON.stringify({
    url: SUPABASE_URL ? SUPABASE_URL.substring(0, 15) + '...' : 'UNDEFINED',
    key: SUPABASE_ANON_KEY ? 'PRESENT' : 'MISSING',
    mode: import.meta.env.MODE,
    base: import.meta.env.BASE_URL
}, null, 2));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Supabase] CRITICAL: Environment variables missing. The app will not work properly.');
}

// Prevent crash if URL is missing (Dummy client or null)
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : (() => { throw new Error('Supabase not configured'); })();
