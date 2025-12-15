// Execute SQL DDL commands via Supabase REST API
// Run with: npx tsx scripts/recreate-tables.ts

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const SQL = `
-- Drop existing tables
DROP TABLE IF EXISTS participations CASCADE;
DROP TABLE IF EXISTS publishers CASCADE;

-- Create publishers table with JSONB
CREATE TABLE publishers (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create participations table with JSONB
CREATE TABLE participations (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE participations ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
CREATE POLICY "Allow all for publishers" ON publishers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for participations" ON participations FOR ALL USING (true) WITH CHECK (true);
`;

async function executeSQL() {
    console.log('🔧 Executing SQL to recreate tables...\n');

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
        // Try alternative method - Supabase SQL endpoint
        console.log('Trying via postgres endpoint...');

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
            console.log('❌ Alternative also failed:', text);
            console.log('\n⚠️ Please execute the SQL manually in Supabase Dashboard.');
            console.log('The SQL commands are printed below:\n');
            console.log(SQL);
            return;
        }
    }

    console.log('✅ Tables recreated successfully!');
}

executeSQL().catch(console.error);
