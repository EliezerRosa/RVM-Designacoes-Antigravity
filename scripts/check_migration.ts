
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

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
