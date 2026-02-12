/**
 * CLI Full Data Backup - RVM Designações
 * 
 * Realiza backup completo de TODAS as tabelas do Supabase para arquivo JSON local.
 * Uso: npx tsx scripts/full_backup.ts
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc3NzM1NiwiZXhwIjoyMDgxMzUzMzU2fQ.N-vb7L0PVsMoLh1pu495g3XkTY8AqNhgyWuK6U4Awn4';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TABLES = [
    'publishers',
    'workbook_batches',
    'workbook_parts',
    'special_events',
    'extraction_history',
    'local_needs_preassignments',
    'app_settings',
    'backup_history'
];

async function fetchTable(tableName: string): Promise<{ count: number; data: any[] }> {
    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(0, 99999);

    if (error) {
        console.warn(`  ⚠️ ${tableName}: ${error.message} (tabela pode não existir)`);
        return { count: 0, data: [] };
    }

    return { count: data?.length || 0, data: data || [] };
}

async function fullBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    console.log('🔄 Iniciando backup completo...\n');

    const backupData: Record<string, any> = {
        metadata: {
            version: '2.0',
            exportDate: new Date().toISOString(),
            appVersion: '1.0.0',
            source: 'CLI full_backup.ts'
        },
        tables: {}
    };

    let totalRecords = 0;

    for (const table of TABLES) {
        const result = await fetchTable(table);
        backupData.tables[table] = result;
        totalRecords += result.count;
        console.log(`  📦 ${table}: ${result.count} registros`);
    }

    // Salvar arquivo
    const filename = `backup_rvm_COMPLETO_${timestamp}.json`;
    const filepath = path.resolve(__dirname, '..', filename);

    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DO BACKUP');
    console.log('='.repeat(60));
    console.log(`  Total de tabelas: ${TABLES.length}`);
    console.log(`  Total de registros: ${totalRecords}`);
    console.log(`  Arquivo: ${filepath}`);
    console.log(`  Tamanho: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
    console.log('\n✅ Backup completo salvo com sucesso!');
}

fullBackup().catch(err => {
    console.error('❌ Erro no backup:', err);
    process.exit(1);
});
