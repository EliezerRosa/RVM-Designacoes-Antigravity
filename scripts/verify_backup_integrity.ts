/**
 * Script para comparar backup JSON com dados atuais do Supabase
 * Executa via: npx tsx scripts/verify_backup_integrity.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
    console.log('📥 Lendo backup JSON...');

    const backupPath = 'c:/Antigravity - RVM Designações/dados_sensiveis/backup_rvm_2026-01-04.json';
    if (!fs.existsSync(backupPath)) {
        console.error(`❌ Arquivo não encontrado: ${backupPath}`);
        return;
    }

    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

    console.log('\n📊 Comparando contagens:');
    console.log('='.repeat(60));
    console.log('| Tabela                      | Backup | Banco Atual | Status |');
    console.log('|-----------------------------|--------|-------------|--------|');

    const tables = ['publishers', 'workbook_parts', 'special_events', 'extraction_history', 'local_needs_preassignments'];

    for (const table of tables) {
        // Contagem Backup
        const backupCount = backupData.tables[table]?.data?.length || 0;

        // Contagem DB
        const { count: dbCount, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.log(`| ${table.padEnd(27)} | ${String(backupCount).padEnd(6)} | ERRO        | ❌     |`);
            continue;
        }

        const diff = dbCount! - backupCount;
        const status = diff === 0 ? '✅ Igual' : diff > 0 ? `⚠️ +${diff}` : `⚠️ ${diff}`;

        console.log(`| ${table.padEnd(27)} | ${String(backupCount).padEnd(6)} | ${String(dbCount).padEnd(11)} | ${status.padEnd(6)} |`);
    }

    console.log('\n🔍 Comparando detalhes (Amostra):');

    // Verificar Publicadores por ID
    if (backupData.tables.publishers?.data?.length > 0) {
        const samplePub = backupData.tables.publishers.data[0];
        const { data: dbPub } = await supabase.from('publishers').select('*').eq('id', samplePub.id).single();

        if (dbPub) {
            console.log(`\n✅ Publicador amostra encontrado no DB: ${samplePub.id}`);
            // Comparar dados (apenas campos principais para não poluir log)
            // Se o backup tem {id, data}, comparar data.name
            const backupName = samplePub.data?.name || samplePub.name; // Suporta formato novo e antigo
            const dbName = dbPub.data?.name;

            console.log(`   Backup Nome: ${backupName}`);
            console.log(`   DB Nome:     ${dbName}`);
            console.log(`   Match?       ${backupName === dbName ? 'Sim' : 'Não'}`);
        } else {
            console.log(`\n❌ Publicador amostra NÃO encontrado no DB: ${samplePub.id}`);
        }
    }
}

main().catch(console.error);
