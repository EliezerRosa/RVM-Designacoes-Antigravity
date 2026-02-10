
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
