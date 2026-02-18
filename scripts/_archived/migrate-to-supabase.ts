// Migration script: Run this once to import initial data to Supabase
// Execute with: npx tsx scripts/migrate-to-supabase.ts

import { createClient } from '@supabase/supabase-js';
import { initialPublishers } from '../src/data/initialPublishers';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function migrate() {
    console.log(`Migrating ${initialPublishers.length} publishers to Supabase...`);

    // Transform data to match Supabase schema
    const publishers = initialPublishers.map(p => ({
        id: crypto.randomUUID(), // Generate proper UUIDs
        name: p.name,
        gender: p.gender === 'brother' ? 'M' : 'F',
        is_anointed: false,
        is_elder: p.condition === 'Ancião',
        is_ministerial_servant: p.condition === 'Servo Ministerial',
        is_regular_pioneer: false,
        can_be_president: p.privileges?.canPreside ?? false,
        can_be_reader: p.privileges?.canReadCBS ?? false,
        can_do_first_speech: p.privileges?.canGiveTalks ?? false,
        can_do_gems: p.privilegesBySection?.canParticipateInTreasures ?? false,
        can_do_living: p.privilegesBySection?.canParticipateInLife ?? false,
        can_do_bible_study: p.privileges?.canConductCBS ?? false,
    }));

    // Insert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < publishers.length; i += batchSize) {
        const batch = publishers.slice(i, i + batchSize);
        const { error } = await supabase.from('publishers').insert(batch);

        if (error) {
            console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
        } else {
            console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
        }
    }

    console.log('Migration complete!');
}

migrate().catch(console.error);
