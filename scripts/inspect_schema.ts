import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Credentials found in scripts/migrate_fix_year.ts
const supabaseUrl = 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4'; // SERVICE_ROLE_KEY

console.log('Using discovered credentials...');

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log('Inspecting workbook_parts schema...');

    // 1. Get Columns by fetching one row
    const { data: rows, error: rowError } = await supabase
        .from('workbook_batches')
        .select('*')
        .limit(1);

    if (rowError) {
        console.error('Error fetching rows:', rowError);
    } else if (rows && rows.length > 0) {
        console.log('Columns found in live DB:');
        const cols = Object.keys(rows[0]);
        cols.forEach(key => console.log(` - ${key}`));
        fs.writeFileSync('db_columns.txt', cols.join('\n'));
    } else {
        console.log('Table is accessible but empty.');
    }

    // 2. Check Constraints (via insert test)
    // Create duplicate to test constraint
    const testId = '00000000-0000-0000-0000-000000000000';
    const batchId = '00000000-0000-0000-0000-000000000123';

    // Create temp batch
    await supabase.from('workbook_batches').insert({ id: batchId, file_name: 'TEST_CONSTRAINT' });

    const keyData = {
        batch_id: batchId,
        year: 2099,
        week_id: '2099-01-01',
        seq: 999,
        funcao: 'TesteConstraint',
        week_display: 'Teste',
        date: '2099-01-01',
        section: 'TEST',
        tipo_parte: 'TEST_A',  // Part A
        titulo_parte: 'TEST',
        descricao: 'A',
    };

    console.log('Inserting Part A...');
    const { error: err1 } = await supabase.from('workbook_parts').insert(keyData);
    if (err1) console.error('Insert A failed:', err1);

    console.log('Inserting Part B (Duplicate Key, different description)...');
    const keyDataB = { ...keyData, tipo_parte: 'TEST_B', descricao: 'B' }; // Change non-key fields

    // Try INSERT first (should fail if unique constraint exists)
    const { error: err2 } = await supabase.from('workbook_parts').insert(keyDataB);
    if (err2) {
        console.log('Insert Duplicate failed (GOOD! Constraint exists):', err2.message);
    } else {
        console.log('Insert Duplicate SUCCEEDED (BAD! No Constraint!)');
    }

    // Checking Upsert
    console.log('Testing Upsert...');
    const { error: err3 } = await supabase.from('workbook_parts').upsert(keyDataB, { onConflict: 'year,week_id,seq,funcao' });
    if (err3) {
        console.error('Upsert failed:', err3.message);
    } else {
        console.log('Upsert succeeded.');
        // Verify value
        const { data: check } = await supabase.from('workbook_parts').select('tipo_parte,descricao').eq('year', 2099).eq('seq', 999).single();
        console.log('Upsert Result:', check);
    }

    // Cleanup
    await supabase.from('workbook_parts').delete().eq('year', 2099);
    await supabase.from('workbook_batches').delete().eq('id', batchId);
}

inspectSchema();

