/**
 * Fase 2: Migra IDs numéricos legados de publishers para UUID.
 * 
 * A tabela publishers usa doc-store (id + data JSONB).
 * Novos publishers já recebem crypto.randomUUID() no App.tsx,
 * mas os ~123 existentes ainda podem ter IDs numéricos ("3", "23").
 * 
 * Este script:
 * 1. Lê todos os publishers
 * 2. Identifica quais têm ID numérico (não-UUID)
 * 3. Gera UUID para cada um
 * 4. Faz DELETE + INSERT (PK não pode ser alterada com UPDATE)
 * 
 * Uso: npx tsx scripts/migrate_publisher_ids.ts
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

async function migratePublisherIds() {
    console.log('🔄 Fase 2: Migrando IDs numéricos de publishers para UUID...\n');

    // 1. Ler todos os publishers
    const { data: rows, error } = await supabase
        .from('publishers')
        .select('id, data')
        .order('id');

    if (error) {
        console.error('❌ Erro ao ler publishers:', error.message);
        process.exit(1);
    }

    if (!rows || rows.length === 0) {
        console.log('⚠️ Nenhum publisher encontrado.');
        process.exit(0);
    }

    console.log(`📊 Total de publishers: ${rows.length}`);

    // 2. Identificar IDs numéricos
    const toMigrate = rows.filter(r => !isUUID(r.id));
    const alreadyUUID = rows.filter(r => isUUID(r.id));

    console.log(`✅ Já com UUID: ${alreadyUUID.length}`);
    console.log(`🔄 Para migrar: ${toMigrate.length}\n`);

    if (toMigrate.length === 0) {
        console.log('✅ Todos os publishers já têm UUID. Nada a fazer.');
        process.exit(0);
    }

    // 3. Migrar cada publisher
    let successCount = 0;
    let errorCount = 0;
    const migrationLog: { oldId: string; newId: string; name: string }[] = [];

    for (const row of toMigrate) {
        const oldId = row.id;
        const newId = randomUUID();
        const publisherData = row.data as Record<string, unknown>;
        const name = (publisherData?.name as string) || '???';

        // Atualizar o ID dentro do objeto JSONB também
        const updatedData = { ...publisherData, id: newId };

        try {
            // DELETE o registro com ID antigo
            const { error: deleteError } = await supabase
                .from('publishers')
                .delete()
                .eq('id', oldId);

            if (deleteError) {
                console.error(`❌ Erro ao deletar "${name}" (${oldId}):`, deleteError.message);
                errorCount++;
                continue;
            }

            // INSERT com novo UUID
            const { error: insertError } = await supabase
                .from('publishers')
                .insert({ id: newId, data: updatedData });

            if (insertError) {
                console.error(`❌ Erro ao inserir "${name}" (${newId}):`, insertError.message);
                // Tentar restaurar o registro original
                await supabase.from('publishers').insert({ id: oldId, data: row.data });
                errorCount++;
                continue;
            }

            migrationLog.push({ oldId, newId, name });
            successCount++;
            console.log(`  ✅ "${name}": ${oldId} → ${newId}`);
        } catch (err) {
            console.error(`❌ Erro inesperado para "${name}":`, err);
            errorCount++;
        }
    }

    // 4. Resumo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('='.repeat(60));
    console.log(`  Total processados: ${toMigrate.length}`);
    console.log(`  ✅ Migrados com sucesso: ${successCount}`);
    console.log(`  ❌ Erros: ${errorCount}`);
    console.log(`  Já eram UUID: ${alreadyUUID.length}`);

    if (errorCount > 0) {
        console.log('\n⚠️ Houve erros. Verifique os logs acima.');
        process.exit(1);
    }

    console.log('\n✅ Migração concluída com sucesso!');
}

migratePublisherIds();
