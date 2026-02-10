import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkColumn() {
    console.log('Checking if year column exists...');

    // Tenta selecionar a coluna year
    const { data, error } = await supabase
        .from('workbook_parts')
        .select('year')
        .limit(1);

    if (error) {
        console.log('❌ Error selecting year column:', error.message);
        console.log('   (This likely means the column does not exist)');
        process.exit(1);
    } else {
        console.log('✅ Success! Year column exists.');
        process.exit(0);
    }
}

checkColumn();
