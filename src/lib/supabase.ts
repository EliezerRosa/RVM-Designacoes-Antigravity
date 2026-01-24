import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[Supabase] Config check:', {
    url: SUPABASE_URL ? SUPABASE_URL.substring(0, 15) + '...' : 'UNDEFINED',
    key: SUPABASE_ANON_KEY ? 'PRESENT' : 'MISSING'
});

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
