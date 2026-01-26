
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from parent dir
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function dump() {
    const { data, error } = await supabase
        .from('workbook_parts')
        .select('tipo_parte, date, week_id')
        .gte('date', '2026-02-01')
        .lte('date', '2026-05-31')
        .order('date');

    if (error) {
        console.error(error);
        return;
    }

    const unique = [...new Set(data.map(d => d.tipo_parte))];
    console.log('Unique Part Types (Feb-May 2026):');
    console.log(JSON.stringify(unique, null, 2));

    const total = data.length;
    console.log(`Total parts found: ${total}`);
}

dump();
