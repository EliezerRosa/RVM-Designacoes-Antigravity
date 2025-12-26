
import { createClient } from '@supabase/supabase-js';

// Credentials from migrate_fix_year.ts
const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const SQL = `
-- Add missing columns for Workbook features
ALTER TABLE workbook_parts ADD COLUMN IF NOT EXISTS modalidade TEXT;
ALTER TABLE workbook_parts ADD COLUMN IF NOT EXISTS detalhes_parte TEXT;

-- Verify if we need to rename or alias columns (commented out, we will adapt service code instead)
-- ALTER TABLE workbook_parts RENAME COLUMN part_title TO titulo_parte;
-- ALTER TABLE workbook_parts RENAME COLUMN descricao TO descricao_parte;
`;

async function executeMigration() {
    console.log('🔧 Executing Schema Repair: Add missing columns...\n');

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

    console.log('✅ Schema repair executed successfully!');
}

executeMigration().catch(console.error);
