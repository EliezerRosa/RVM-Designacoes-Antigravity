/**
 * Execute Special Events Tables Migration
 * Run with: npx ts-node scripts/execute-special-events-migration.ts
 */

import { createClient } from '@supabase/supabase-js';

// Credentials from existing scripts
const supabaseUrl = 'https://pevstuyzlewvjidjkmea.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSpecialEventsMigration() {
    console.log('🚀 Starting Special Events Migration...\n');

    try {
        // 1. Create special_events table
        console.log('1️⃣ Creating special_events table...');
        const { error: createTableError } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS special_events (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    template_id TEXT NOT NULL,
                    week TEXT NOT NULL,
                    theme TEXT,
                    responsible TEXT,
                    duration INTEGER,
                    boletim_year INTEGER,
                    boletim_number INTEGER,
                    guidelines TEXT,
                    observations TEXT,
                    details JSONB DEFAULT '{}',
                    is_applied BOOLEAN DEFAULT FALSE,
                    applied_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ,
                    created_by TEXT
                );
            `
        });

        if (createTableError) {
            // Try direct insert to check if table exists
            console.log('   ⚠️ RPC not available, checking if table exists...');
            const { error: checkError } = await supabase.from('special_events').select('id').limit(1);
            if (checkError && checkError.code === '42P01') {
                console.error('   ❌ Table does not exist. Please run the SQL manually in Supabase Dashboard.');
                console.log('\n📋 Copy the SQL from: scripts/create-special-events-tables.sql');
                console.log('   and paste it in: https://supabase.com/dashboard/project/pevstuyzlewvjidjkmea/sql/new');
                return;
            } else if (!checkError) {
                console.log('   ✅ special_events table already exists!');
            }
        } else {
            console.log('   ✅ special_events table created!');
        }

        // 2. Check and add columns to workbook_parts
        console.log('\n2️⃣ Checking workbook_parts columns...');

        // Try to select the new columns to see if they exist
        const { data: samplePart, error: selectError } = await supabase
            .from('workbook_parts')
            .select('id, cancel_reason, original_duration, affected_by_event_id')
            .limit(1);

        if (selectError && selectError.message.includes('column')) {
            console.log('   ⚠️ Some columns are missing. Please run the SQL manually.');
            console.log('\n📋 Run this SQL in Supabase Dashboard:');
            console.log(`
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'cancel_reason') THEN
        ALTER TABLE workbook_parts ADD COLUMN cancel_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'original_duration') THEN
        ALTER TABLE workbook_parts ADD COLUMN original_duration TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'workbook_parts' AND column_name = 'affected_by_event_id') THEN
        ALTER TABLE workbook_parts ADD COLUMN affected_by_event_id UUID;
    END IF;
END $$;
            `);
        } else {
            console.log('   ✅ workbook_parts columns are ready!');
        }

        // 3. Check RLS and indexes
        console.log('\n3️⃣ Verifying special_events table...');
        const { data, error: verifyError } = await supabase
            .from('special_events')
            .select('*')
            .limit(1);

        if (verifyError) {
            console.log('   ❌ Error accessing special_events:', verifyError.message);
            if (verifyError.message.includes('permission')) {
                console.log('\n📋 Run this SQL to enable RLS:');
                console.log(`
ALTER TABLE special_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on special_events" ON special_events
    FOR ALL USING (true) WITH CHECK (true);
                `);
            }
        } else {
            console.log('   ✅ special_events table is accessible!');
            console.log(`   📊 Current records: ${data?.length || 0}`);
        }

        console.log('\n✅ Migration check complete!');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    }
}

executeSpecialEventsMigration();
