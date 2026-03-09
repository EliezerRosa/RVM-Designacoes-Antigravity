import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function seedTerritories() {
    const jsonPath = 'C:/Antigravity - RVM Designações/rvm-designacoes-unified/public/territories/territories_data.json';
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const territories = JSON.parse(rawData);

    // 1. Extract unique neighborhoods
    const uniqueNeighborhoods = [...new Set(territories.map((t: any) => t.neighborhood))];
    console.log(`Found ${uniqueNeighborhoods.length} unique neighborhoods:`, uniqueNeighborhoods);

    const neighborhoodMap: Record<string, string> = {};

    for (const nName of uniqueNeighborhoods) {
        // Check if exists
        const { data: existing } = await supabase
            .from('neighborhoods')
            .select('id')
            .eq('name', nName)
            .single();

        if (existing) {
            neighborhoodMap[nName as string] = existing.id;
        } else {
            console.log(`Inserting neighborhood: ${nName}`);
            const { data: insertData, error } = await supabase
                .from('neighborhoods')
                .insert({ name: nName, city: 'Serra' })
                .select()
                .single();
            if (error) {
                console.error('Error inserting neighborhood', error);
                return;
            }
            neighborhoodMap[nName as string] = insertData.id;
        }
    }

    console.log('Neighborhood mapping:', neighborhoodMap);

    // 2. Insert territories
    for (const t of territories) {
        const nid = neighborhoodMap[t.neighborhood];
        if (!nid) continue;

        // Check if territory already exists
        const { data: existingTerritory } = await supabase
            .from('territories')
            .select('id')
            .eq('number', t.number)
            .eq('neighborhood_id', nid)
            .single();

        if (!existingTerritory) {
            console.log(`Inserting territory ${t.number}...`);
            const { error } = await supabase
                .from('territories')
                .insert({
                    number: t.number,
                    neighborhood_id: nid,
                    description: t.description,
                    map_url: t.google_maps_url,
                    last_worked_at: null // or an old date
                });
            if (error) {
                console.error(`Error inserting territory ${t.number}`, error);
            }
        } else {
            console.log(`Updating territory ${t.number}...`);
            const { error } = await supabase
                .from('territories')
                .update({
                    description: t.description,
                    map_url: t.google_maps_url
                })
                .eq('id', existingTerritory.id);
            if (error) {
                console.error(`Error updating territory ${t.number}`, error);
            }
        }
    }

    console.log('✅ Seeding completed successfully!');
}

seedTerritories().catch(console.error);
