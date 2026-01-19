/**
 * Script para comparar backup Excel com Supabase
 * Executa via: npx ts-node scripts/compare-backup.ts
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

const supabase = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'
);

interface Publisher {
    id: string;
    name: string;
}

async function main() {
    const backupPath = path.resolve(process.argv[2] || 'c:/Antigravity - RVM Designações/backup_rvm_2026-01-14.xlsx');

    console.log('\n📊 COMPARAÇÃO: BACKUP vs SUPABASE');
    console.log('='.repeat(60));
    console.log(`📁 Arquivo: ${backupPath}`);
    console.log(`📅 Data análise: ${new Date().toLocaleString('pt-BR')}`);
    console.log('='.repeat(60));

    // Ler backup Excel
    if (!fs.existsSync(backupPath)) {
        console.error('❌ Arquivo não encontrado:', backupPath);
        process.exit(1);
    }

    const workbook = XLSX.read(fs.readFileSync(backupPath), { type: 'buffer' });

    // Ler publishers do backup
    const pubSheet = workbook.Sheets['publishers'];
    const backupPubsRaw = XLSX.utils.sheet_to_json(pubSheet) as any[];
    const backupPubs: Publisher[] = backupPubsRaw.map(row => {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return { id: row.id, name: data?.name || 'N/A' };
    });

    console.log(`\n📋 Backup: ${backupPubs.length} publicadores`);

    // Ler publishers do Supabase
    const { data: supabasePubs, error } = await supabase
        .from('publishers')
        .select('id, data')
        .range(0, 9999);

    if (error) {
        console.error('❌ Erro ao ler Supabase:', error.message);
        process.exit(1);
    }

    const currentPubs: Publisher[] = (supabasePubs || []).map(row => ({
        id: row.id,
        name: (row.data as any)?.name || 'N/A'
    }));

    console.log(`📋 Supabase: ${currentPubs.length} publicadores`);

    // Criar mapas para comparação
    const backupMap = new Map(backupPubs.map(p => [p.id, p.name]));
    const currentMap = new Map(currentPubs.map(p => [p.id, p.name]));

    // Encontrar diferenças
    const onlyInBackup: Publisher[] = [];
    const onlyInSupabase: Publisher[] = [];
    const nameDiffs: { id: string; backupName: string; currentName: string }[] = [];

    // IDs apenas no backup
    for (const [id, name] of backupMap) {
        if (!currentMap.has(id)) {
            onlyInBackup.push({ id, name });
        } else if (currentMap.get(id) !== name) {
            nameDiffs.push({ id, backupName: name, currentName: currentMap.get(id)! });
        }
    }

    // IDs apenas no Supabase
    for (const [id, name] of currentMap) {
        if (!backupMap.has(id)) {
            onlyInSupabase.push({ id, name });
        }
    }

    // Relatório
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTADO DA COMPARAÇÃO');
    console.log('='.repeat(60));

    console.log(`\n✅ IDs iguais: ${backupPubs.length - onlyInBackup.length - nameDiffs.length}`);

    if (onlyInBackup.length > 0) {
        console.log(`\n🔴 APENAS NO BACKUP (${onlyInBackup.length}):`);
        console.log('   (Foram REMOVIDOS do Supabase desde o backup)');
        onlyInBackup.forEach(p => console.log(`   - [${p.id}] ${p.name}`));
    }

    if (onlyInSupabase.length > 0) {
        console.log(`\n🟢 APENAS NO SUPABASE (${onlyInSupabase.length}):`);
        console.log('   (Foram ADICIONADOS após o backup)');
        onlyInSupabase.forEach(p => console.log(`   - [${p.id}] ${p.name}`));
    }

    if (nameDiffs.length > 0) {
        console.log(`\n🟡 NOMES ALTERADOS (${nameDiffs.length}):`);
        nameDiffs.forEach(d => console.log(`   - [${d.id}]: "${d.backupName}" → "${d.currentName}"`));
    }

    // Comparar workbook_parts
    console.log('\n' + '-'.repeat(60));
    console.log('📚 WORKBOOK PARTS');

    const partsSheet = workbook.Sheets['workbook_parts'];
    const backupParts = XLSX.utils.sheet_to_json(partsSheet) as any[];

    const { data: supabaseParts } = await supabase
        .from('workbook_parts')
        .select('id')
        .range(0, 9999);

    console.log(`   Backup: ${backupParts.length} partes`);
    console.log(`   Supabase: ${supabaseParts?.length || 0} partes`);
    console.log(`   Diferença: ${(supabaseParts?.length || 0) - backupParts.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('Fim da comparação');
}

main().catch(console.error);
