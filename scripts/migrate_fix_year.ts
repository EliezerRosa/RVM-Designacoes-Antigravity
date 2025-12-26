
const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const SQL = `
-- 1. Create Year column
ALTER TABLE workbook_parts ADD COLUMN IF NOT EXISTS year INTEGER;

-- 2. Populate Year column
UPDATE workbook_parts 
SET year = CAST(SPLIT_PART(week_id, '-', 1) AS INTEGER) 
WHERE year IS NULL;

-- 3. Update Unique Constraint
ALTER TABLE workbook_parts DROP CONSTRAINT IF EXISTS workbook_parts_week_id_seq_funcao_key;
ALTER TABLE workbook_parts ADD CONSTRAINT workbook_parts_year_week_id_seq_funcao_key UNIQUE (year, week_id, seq, funcao);
`;

async function executeMigration() {
    console.log('🔧 Executing Migration: Add Year Column...\n');

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: SQL })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.log(`RPC failed with status ${response.status}: ${errorText}`);

        // Try fallback query endpoint if RPC fails
        console.log('RPC failed, trying pg/query...');
        const pgResponse = await fetch(`${SUPABASE_URL}/pg/query`, {
            method: 'POST',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: SQL })
        });

        if (!pgResponse.ok) {
            const text = await pgResponse.text();
            console.error('❌ Migration Failed:', text);
            process.exit(1);
        }
    }

    console.log('✅ Migration executed successfully!');
}

executeMigration().catch(console.error);
