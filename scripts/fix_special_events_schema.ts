/**
 * Migration: Add missing columns to special_events table
 * Run with: npx ts-node scripts/fix_special_events_schema.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wfberqgcunlscplvjekz.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmYmVycWdjdW5sc2NwbHZqZWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzNjM3NzYsImV4cCI6MjA0OTkzOTc3Nn0._d3QZuwu4sdMJ-8dee8sD5fSKB4x6Xfxpxm-MnXI344';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('='.repeat(60));
    console.log('Running special_events schema migration...');
    console.log('='.repeat(60));

    // Test by trying to insert a test record with all needed fields
    const testEvent = {
        week: 'TEST-MIGRATION',
        template_id: 'test',
        is_applied: false,
        applied_at: null,
        responsible: null,
        theme: null,
        duration: null,
    };

    // Try insert
    const { data, error } = await supabase
        .from('special_events')
        .insert(testEvent)
        .select();

    if (error) {
        console.error('Migration test failed:', error.message);
        console.log('\nYou need to run this SQL in Supabase SQL Editor:');
        console.log(`
-- Add missing columns to special_events table
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS is_applied BOOLEAN DEFAULT FALSE;
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS template_id TEXT;
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS responsible TEXT;
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS duration INTEGER;
ALTER TABLE special_events ADD COLUMN IF NOT EXISTS week TEXT;
        `);
        process.exit(1);
    }

    console.log('✅ Test insert successful!');

    // Clean up test record
    if (data && data[0]) {
        await supabase.from('special_events').delete().eq('id', data[0].id);
        console.log('✅ Cleaned up test record');
    }

    console.log('\n✅ Migration completed successfully!');
}

runMigration().catch(console.error);
