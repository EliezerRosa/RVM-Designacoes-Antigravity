/**
 * Script para importar publishers do backup JSON diretamente no Supabase
 * Executa via: npx tsx scripts/import_publishers_only.ts
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
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

    const publishers = backupData.tables.publishers.data;
    console.log(`📊 Encontrados ${publishers.length} publicadores no backup`);

    // Limpar publicadores existentes primeiro
    console.log('🗑️ Removendo publicadores existentes...');
    const { error: deleteError } = await supabase
        .from('publishers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
        console.error('❌ Erro ao deletar:', deleteError.message);
        return;
    }

    // Inserir publicadores do backup
    console.log('📤 Inserindo publicadores do backup...');

    // O backup já tem a estrutura correta: {id, data, created_at}
    const { error: insertError, count } = await supabase
        .from('publishers')
        .upsert(publishers, { onConflict: 'id' });

    if (insertError) {
        console.error('❌ Erro ao inserir:', insertError.message);
        return;
    }

    console.log(`✅ ${publishers.length} publicadores importados com sucesso!`);

    // Verificar
    const { count: finalCount } = await supabase
        .from('publishers')
        .select('*', { count: 'exact', head: true });

    console.log(`🔍 Verificação: ${finalCount} publicadores no banco`);
}

main().catch(console.error);
