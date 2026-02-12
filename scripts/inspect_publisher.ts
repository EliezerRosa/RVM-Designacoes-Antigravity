
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectPublisher() {
    console.log('🔍 Inspecting publisher "Isabelle Cruz"...');

    const { data: pubs, error } = await supabase
        .from('publishers')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching publisher:', error);
        return;
    }

    if (!pubs || pubs.length === 0) {
        console.log('No publishers found');
        return;
    }

    console.log('First publisher keys:', Object.keys(pubs[0]));

    // Now try to find Isabelle by iterating or guessing if we see the key
    const nameKey = Object.keys(pubs[0]).find(k => k.includes('name')) || 'name';
    console.log(`Using name key: ${nameKey}`);

    const { data: targetPubs } = await supabase
        .from('publishers')
        .select('*')
        .ilike(nameKey, '%Isabelle Cruz%')
        .limit(1);

    if (targetPubs && targetPubs.length > 0) {
        const p = targetPubs[0];
        console.log(`Found Isabelle:`, p);
    } else {
        console.log('Isabelle not found with key', nameKey);
    }
}

inspectPublisher();
