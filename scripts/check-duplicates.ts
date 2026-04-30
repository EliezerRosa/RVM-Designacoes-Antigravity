/**
 * Script para verificar duplicatas no Supabase
 * Execute: npx ts-node scripts/check-duplicates.ts
 */

import { createClient } from '@supabase/supabase-js';

// Usar variáveis de ambiente do sistema
const supabase = createClient(
    process.env.VITE_SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co',
    process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

interface Publisher {
    id: string;
    name: string;
}

async function checkDuplicates() {
    console.log('🔍 Verificando duplicatas no Supabase...\n');

    const { data, error } = await supabase
        .from('publishers')
        .select('id, data');

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    const publishers = (data || []).map(row => ({
        id: row.id,
        ...(row.data as object)
    })) as Publisher[];

    console.log(`📊 Total de publicadores: ${publishers.length}\n`);

    // Verificar duplicatas por nome
    const nameCount = new Map<string, Publisher[]>();
    for (const pub of publishers) {
        const name = pub.name.toLowerCase().trim();
        if (!nameCount.has(name)) {
            nameCount.set(name, []);
        }
        nameCount.get(name)!.push(pub);
    }

    // Listar duplicatas
    const duplicates = Array.from(nameCount.entries())
        .filter(([, pubs]) => pubs.length > 1);

    if (duplicates.length === 0) {
        console.log('✅ Nenhuma duplicata encontrada!');
    } else {
        console.log(`⚠️ ${duplicates.length} nomes duplicados:\n`);
        for (const [name, pubs] of duplicates) {
            console.log(`  "${name}":`);
            for (const pub of pubs) {
                console.log(`    - ID: ${pub.id}`);
            }
        }
    }
}

checkDuplicates().catch(console.error);
