import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing supabase env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        const sql = fs.readFileSync('database/add_weekly_limit_trigger.sql', 'utf-8');
        const { data, error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
            console.error("Erro RPC:", error);
        } else {
            console.log("SQL executado com sucesso!", data);
        }
    } catch (e) {
        console.error("Exec:", e);
    }
}

run();
