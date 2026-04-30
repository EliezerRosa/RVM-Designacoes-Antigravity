/**
 * Script para restaurar publicadores do backup de forma controlada
 * 
 * Passos:
 * 1. Excluir TODOS os 140 publicadores atuais
 * 2. Restaurar os 120 do backup
 * 3. Adicionar os que foram criados via UI DEPOIS do backup (IDs UUID novos)
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';

const supabase = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    process.env.VITE_SUPABASE_ANON_KEY || ''
);

interface PublisherRow {
    id: string;
    data: any;
    created_at?: string;
}

async function main() {
    const backupPath = 'c:/Antigravity - RVM Designações/dados_sensiveis/backup_rvm_2026-01-14.xlsx';

    console.log('\n🔧 RESTAURAÇÃO DE PUBLICADORES');
    console.log('='.repeat(60));
    console.log(`📁 Backup: ${backupPath}`);
    console.log(`📅 Execução: ${new Date().toLocaleString('pt-BR')}`);
    console.log('='.repeat(60));

    // ========================================
    // PASSO 0: Ler dados atuais do Supabase para preservar os novos
    // ========================================
    console.log('\n📋 Lendo dados atuais do Supabase...');

    const { data: currentPubs, error: readError } = await supabase
        .from('publishers')
        .select('*')
        .range(0, 9999);

    if (readError) {
        console.error('❌ Erro ao ler Supabase:', readError.message);
        process.exit(1);
    }

    console.log(`   Encontrados: ${currentPubs?.length || 0} publicadores`);

    // ========================================
    // PASSO 1: Ler backup Excel
    // ========================================
    console.log('\n📋 Lendo backup Excel...');

    if (!fs.existsSync(backupPath)) {
        console.error('❌ Arquivo de backup não encontrado!');
        process.exit(1);
    }

    const workbook = XLSX.read(fs.readFileSync(backupPath), { type: 'buffer' });
    const pubSheet = workbook.Sheets['publishers'];
    const backupRaw = XLSX.utils.sheet_to_json(pubSheet) as any[];

    // Parsear dados do backup
    const backupPubs: PublisherRow[] = backupRaw.map(row => ({
        id: row.id,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
        created_at: row.created_at
    }));

    console.log(`   Backup contém: ${backupPubs.length} publicadores`);

    // Criar conjunto de IDs do backup
    const backupIds = new Set(backupPubs.map(p => p.id));

    // ========================================
    // PASSO 2: Identificar publicadores NOVOS (criados via UI após backup)
    // ========================================
    // São os que têm IDs UUID (não numéricos) ou IDs numéricos > 151
    // e NÃO estão no backup

    const newPublishers: PublisherRow[] = [];

    for (const pub of currentPubs || []) {
        const id = pub.id;

        // Se não está no backup E (é UUID ou ID > 151)
        if (!backupIds.has(id)) {
            // Verificar se é UUID (contém letras/hífens) ou ID numérico alto
            const isUUID = /[a-zA-Z-]/.test(id);
            const isHighId = !isNaN(Number(id)) && Number(id) > 151;

            if (isUUID || isHighId) {
                newPublishers.push(pub as PublisherRow);
            }
        }
    }

    console.log(`\n🆕 Publicadores NOVOS (criados via UI após backup): ${newPublishers.length}`);
    newPublishers.forEach(p => {
        const name = (p.data as any)?.name || 'N/A';
        console.log(`   - [${p.id}] ${name}`);
    });

    // ========================================
    // PASSO 3: Confirmar execução
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  RESUMO DA OPERAÇÃO:');
    console.log('='.repeat(60));
    console.log(`   1. EXCLUIR: ${currentPubs?.length || 0} publicadores atuais`);
    console.log(`   2. RESTAURAR: ${backupPubs.length} publicadores do backup`);
    console.log(`   3. ADICIONAR: ${newPublishers.length} publicadores novos (criados após backup)`);
    console.log('\n⏳ Executando em 3 segundos...\n');

    await new Promise(r => setTimeout(r, 3000));

    // ========================================
    // PASSO 4: EXCLUIR todos os publicadores atuais
    // ========================================
    console.log('🗑️  Passo 1: Excluindo publicadores atuais...');

    const { error: deleteError } = await supabase
        .from('publishers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
        console.error('❌ Erro ao excluir:', deleteError.message);
        process.exit(1);
    }
    console.log('   ✅ Publicadores excluídos');

    // ========================================
    // PASSO 5: RESTAURAR publicadores do backup
    // ========================================
    console.log('📥 Passo 2: Restaurando do backup...');

    const { error: insertError } = await supabase
        .from('publishers')
        .insert(backupPubs);

    if (insertError) {
        console.error('❌ Erro ao restaurar:', insertError.message);
        process.exit(1);
    }
    console.log(`   ✅ ${backupPubs.length} publicadores restaurados`);

    // ========================================
    // PASSO 6: ADICIONAR publicadores novos
    // ========================================
    if (newPublishers.length > 0) {
        console.log('➕ Passo 3: Adicionando novos publicadores...');

        const { error: addError } = await supabase
            .from('publishers')
            .insert(newPublishers);

        if (addError) {
            console.error('❌ Erro ao adicionar novos:', addError.message);
            // Não sair, apenas reportar
        } else {
            console.log(`   ✅ ${newPublishers.length} novos publicadores adicionados`);
        }
    }

    // ========================================
    // VERIFICAÇÃO FINAL
    // ========================================
    console.log('\n📊 Verificação final...');

    const { data: finalPubs } = await supabase
        .from('publishers')
        .select('id')
        .range(0, 9999);

    console.log(`   Total no Supabase: ${finalPubs?.length || 0} publicadores`);
    console.log(`   Esperado: ${backupPubs.length + newPublishers.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ RESTAURAÇÃO CONCLUÍDA!');
    console.log('='.repeat(60));
}

main().catch(console.error);
