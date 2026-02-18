/**
 * Fase 3A: Backfill de resolved_publisher_id nos workbook_parts existentes.
 * 
 * Após a Fase 2 (migração de IDs para UUID), este script popula
 * resolved_publisher_id para todas as partes que já têm resolved_publisher_name.
 * 
 * Lógica:
 * 1. Carrega todos os publishers (mapa name → id)
 * 2. Busca workbook_parts com resolved_publisher_name IS NOT NULL
 * 3. Para cada parte, resolve o publisher pelo nome e preenche o ID
 * 
 * Uso: npx tsx scripts/backfill_publisher_ids.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function backfillPublisherIds() {
    console.log('🔄 Fase 3A: Backfill de resolved_publisher_id...\n');

    // 1. Carregar todos os publishers (mapa name → id)
    const { data: publishers, error: pubError } = await supabase
        .from('publishers')
        .select('id, data');

    if (pubError || !publishers) {
        console.error('❌ Erro ao carregar publishers:', pubError?.message);
        process.exit(1);
    }

    const nameToId = new Map<string, string>();
    for (const pub of publishers) {
        const pubData = pub.data as Record<string, unknown>;
        const name = (pubData?.name as string) || '';
        if (name) {
            nameToId.set(name.trim(), pub.id);
        }
    }

    console.log(`📊 Publishers carregados: ${nameToId.size} (com nome válido)`);

    // 2. Buscar partes com resolved_publisher_name mas sem resolved_publisher_id
    const { data: parts, error: partsError } = await supabase
        .from('workbook_parts')
        .select('id, resolved_publisher_name, resolved_publisher_id')
        .not('resolved_publisher_name', 'is', null);

    if (partsError || !parts) {
        console.error('❌ Erro ao buscar workbook_parts:', partsError?.message);
        process.exit(1);
    }

    // Filtrar: apenas as que NÃO têm resolved_publisher_id
    const toBackfill = parts.filter(p => !p.resolved_publisher_id);
    const alreadyLinked = parts.filter(p => p.resolved_publisher_id);

    console.log(`\n📊 Partes com publicador designado: ${parts.length}`);
    console.log(`  ✅ Já com resolved_publisher_id: ${alreadyLinked.length}`);
    console.log(`  🔄 Para fazer backfill: ${toBackfill.length}\n`);

    if (toBackfill.length === 0) {
        console.log('✅ Todas as partes já têm resolved_publisher_id. Nada a fazer.');
        process.exit(0);
    }

    // 3. Resolver e atualizar
    let matched = 0;
    let orphaned = 0;
    const orphanedNames = new Set<string>();

    // Processar em lotes de 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < toBackfill.length; i += BATCH_SIZE) {
        const batch = toBackfill.slice(i, i + BATCH_SIZE);

        for (const part of batch) {
            const name = (part.resolved_publisher_name || '').trim();
            const publisherId = nameToId.get(name);

            if (!publisherId) {
                orphaned++;
                orphanedNames.add(name);
                continue;
            }

            const { error: updateError } = await supabase
                .from('workbook_parts')
                .update({ resolved_publisher_id: publisherId })
                .eq('id', part.id);

            if (updateError) {
                console.error(`  ❌ Erro ao atualizar parte ${part.id}: ${updateError.message}`);
                orphaned++;
            } else {
                matched++;
            }
        }

        console.log(`  Processado: ${Math.min(i + BATCH_SIZE, toBackfill.length)}/${toBackfill.length}...`);
    }

    // 4. Resumo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DO BACKFILL');
    console.log('='.repeat(60));
    console.log(`  Total para backfill: ${toBackfill.length}`);
    console.log(`  ✅ Vinculados com sucesso: ${matched}`);
    console.log(`  ⚠️ Órfãos (sem publisher correspondente): ${orphaned}`);

    if (orphanedNames.size > 0) {
        console.log(`\n  Nomes órfãos (sem match na tabela publishers):`);
        for (const name of orphanedNames) {
            console.log(`    - "${name}"`);
        }
    }

    console.log('\n✅ Backfill concluído!');
}

backfillPublisherIds();
