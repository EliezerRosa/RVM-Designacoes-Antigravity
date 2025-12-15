// Admin Setup Script - Uses service role key to setup database
// Run with: npx tsx scripts/setup-supabase.ts

import { createClient } from '@supabase/supabase-js';
import { initialPublishers } from '../src/data/initialPublishers';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

// Create admin client with service role
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

async function setupDatabase() {
    console.log('🔧 Setting up Supabase database...\n');

    // Step 1: Drop existing tables (if any data exists, delete it first)
    console.log('1️⃣ Clearing existing data...');
    await supabase.from('participations').delete().neq('id', '');
    await supabase.from('publishers').delete().neq('id', '');
    console.log('   ✅ Existing data cleared\n');

    // Step 2: Insert publishers with full JSON structure
    console.log('2️⃣ Migrating publishers...');

    const publishersToInsert = initialPublishers.map(p => ({
        id: p.id,
        data: p
    }));

    const batchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < publishersToInsert.length; i += batchSize) {
        const batch = publishersToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('publishers').upsert(batch, { onConflict: 'id' });

        if (error) {
            console.error(`   ❌ Error in batch ${Math.floor(i / batchSize) + 1}:`, error.message);
        } else {
            insertedCount += batch.length;
            console.log(`   📦 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records`);
        }
    }

    console.log(`   ✅ Total: ${insertedCount} publishers migrated\n`);

    // Step 3: Verify
    console.log('3️⃣ Verifying...');
    const { count } = await supabase.from('publishers').select('*', { count: 'exact', head: true });
    console.log(`   ✅ ${count} publishers in database\n`);

    console.log('🎉 Setup complete! Database is ready.');
}

setupDatabase().catch(console.error);
